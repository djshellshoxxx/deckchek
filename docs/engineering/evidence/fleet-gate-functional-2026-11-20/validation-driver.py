import ast
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import textwrap
import time
import yaml

repo = pathlib.Path.cwd()
root = pathlib.Path(tempfile.mkdtemp(prefix='deckchek-fleet-gate-functional-20261121-'))
expected_commit = '9796f80b7b9ec7dfbff26b47a9935ce4b44441e5'
expected_tree = '73cba12d57c6c5ba256cdcd45b9bad9a9822a8f4'
rustc = pathlib.Path('/workspace/scratch/6f2247f2f463/rust-measurement-toolchain/rustup/toolchains/nightly-2026-11-20-x86_64-unknown-linux-gnu/bin/rustc')
commands = []


def h(value):
    return hashlib.sha256(value).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def tracked():
    files = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    return {p: h((repo / p).read_bytes()) for p in files if p}


def run(name, argv, **kw):
    start = time.monotonic()
    result = subprocess.run(argv, capture_output=True, text=True, timeout=30, **kw)
    (root / (name + '.stdout')).write_text(result.stdout)
    (root / (name + '.stderr')).write_text(result.stderr)
    commands.append({'name': name, 'argv': list(map(str, argv)), 'exitCode': result.returncode,
                     'elapsedSeconds': time.monotonic() - start,
                     'stdoutSha256': h(result.stdout.encode()), 'stderrSha256': h(result.stderr.encode())})
    return result


print('Evidence directory: ' + str(root), flush=True)
assert git('rev-parse', 'HEAD') == expected_commit
assert git('rev-parse', 'HEAD^{tree}') == expected_tree
assert git('status', '--porcelain') == ''
before = tracked()
(root / 'source-freeze.json').write_text(json.dumps({
    'sourceCommit': expected_commit, 'sourceTree': expected_tree, 'trackedSha256': before
}, indent=2) + '\n')
identity = run('native-identity', ['git', 'diff', '--exit-code',
    '5702a450d9a7faa3efb80c5b67de69386ae07540', 'HEAD', '--', 'src-tauri',
    'database/migrations', 'vendor', '.github/workflows', 'tests/contracts',
    'tests/fixtures', 'app/population-metrics.json'])
assert identity.returncode == 0
source = (repo / 'tools/fleet-gate-diagnostic.py').read_text()
ast.parse(source)
proposal = (repo / 'docs/engineering/proposals/fleet-gate-diagnostic.yml').read_text()
workflow = yaml.load(proposal, Loader=yaml.BaseLoader)
assert workflow['permissions'] == {'contents': 'read'}
assert set(workflow['on']) == {'workflow_dispatch', 'push'}
steps = workflow['jobs']['native-context']['steps']
step_minutes = sum(int(step['timeout-minutes']) for step in steps)
assert step_minutes == 69 and int(workflow['jobs']['native-context']['timeout-minutes']) == 75
embedded = []
shell_syntax = []
for i, step in enumerate(steps):
    if 'run' not in step:
        continue
    body = step['run']
    result = run(f'shell-syntax-{i}', ['bash', '-n'], input=body)
    assert result.returncode == 0, result.stderr
    shell_syntax.append(step['name'])
    for n, block in enumerate(re.findall(r"(?:python3 -|cat[^\n]*) <<'PY'\n(.*?)\nPY(?:\n|$)", body, re.S)):
        ast.parse(block, filename=f'workflow:{i}:{n}')
        embedded.append({'step': step['name'], 'sha256': h(block.encode())})
assert len(embedded) == 3, embedded
out = root / 'generated'
argv = [sys.executable, str(repo / 'tools/fleet-gate-diagnostic.py'), '--source', str(repo),
        '--expected-commit', expected_commit, '--expected-tree', expected_tree, str(out)]
generation = run('generation', argv)
assert generation.returncode == 0, generation.stderr
original = (repo / 'src-tauri/src/fleet.rs').read_text()
overlay = (out / 'fleet.rs').read_text()
proof = json.loads((out / 'source-proof.json').read_text())
marker = '\n// Generated diagnostic only; never install as a production change.\n'
assert overlay.count(marker) == 1
prefix, module = overlay.split(marker, 1)
before_probe = '        #[cfg(target_os = "linux")]\n        let fleet_gate_scheduler_before = super::fleet_gate_diagnostic::scheduler_snapshot();\n'
after_probe = '\n        #[cfg(target_os = "linux")]\n        super::fleet_gate_diagnostic::print_gate(elapsed.as_nanos(), fleet_gate_scheduler_before);'
assert prefix.count(before_probe) == prefix.count(after_probe) == 1
assert prefix.replace(before_probe, '', 1).replace(after_probe, '', 1) == original
start = original.index('pub fn reminders(')
function = original[start:original.index('#[derive(Debug, Deserialize)]', start)]
start = module.index('    fn measured_reminders(')
measured = textwrap.dedent(module[start:module.index('    #[test]\n    #[ignore', start)])
measured = measured.replace(
    'fn measured_reminders(conn: &Connection, asset: Option<&str>, phases: &mut Vec<Value>)',
    'pub fn reminders(conn: &Connection, asset: Option<&str>)', 1)
measured = measured.replace('    let mut mark = Mark::now();\n', '', 1)
for name in ['completionQueryAndMap', 'usageQueryAndMap', 'reminderQueryAndJson', 'enrichment']:
    probe = f'    record_phase("{name}", &mut mark, phases);\n'
    assert measured.count(probe) == 1
    measured = measured.replace(probe, '', 1)
assert measured == function
start = original.index('    fn regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget()')
regression = original[start:original.index('    #[test]\n    fn reminder_read_preserves_optional_fields', start)]
fixture = regression.split('{\n', 1)[1].split('        let started = std::time::Instant::now();', 1)[0]
actual_fixture = module.split('    fn bounded_phase_measurements() {\n', 1)[1].split('\n        // Four pairs', 1)[0]
assert actual_fixture == fixture
assert proof['originalFunctionSha256'] == h(function.encode())
assert proof['originalRegressionSha256'] == h(regression.encode())
assert proof['fixtureSha256'] == h(fixture.encode())
assert proof['originalFleetSha256'] == h(original.encode())
assert proof['overlaySha256'] == h(overlay.encode())
assert proof['generatorSha256'] == h(source.encode())
assert proof['manifestSha256'] == h((repo / 'src-tauri/Cargo.toml').read_bytes())
assert proof['lockSha256'] == h((repo / 'src-tauri/Cargo.lock').read_bytes())
assert proof['sourceCommit'] == expected_commit and proof['sourceTree'] == expected_tree
assert proof['unchangedBudgetMs'] == 200 and proof['boundedPairs'] == 4
migrations = {p.name: h(p.read_bytes()) for p in sorted(
    (repo / 'database/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql'))}
assert len(migrations) == 25 and proof['migrationSha256'] == migrations
files = {p.name: h(p.read_bytes()) for p in out.iterdir()}
repeat = run('preserve-existing-output', argv)
assert repeat.returncode != 0 and 'Existing diagnostic output is preserved' in repeat.stderr
assert {p.name: h(p.read_bytes()) for p in out.iterdir()} == files
wrong = list(argv)
wrong[wrong.index('--expected-commit') + 1] = '0' * 40
wrong[-1] = str(root / 'wrong-identity')
reject = run('reject-wrong-source', wrong)
assert reject.returncode != 0 and not (root / 'wrong-identity').exists()
runtime = run('rustc-version', [str(rustc), '--version', '--verbose'])
# AST output only: no dependency resolution, code generation, linking or tests.
parser_start = time.monotonic()
with (root / 'rust-parse.stderr').open('wb') as stderr:
    parse = subprocess.run([str(rustc), '-Zunpretty=ast-tree', '--edition=2021',
                            '--crate-type=lib', str(out / 'fleet.rs')],
                           stdout=subprocess.DEVNULL, stderr=stderr, timeout=30)
commands.append({'name': 'rust-parse-only', 'argv': [str(rustc), '-Zunpretty=ast-tree',
    '--edition=2021', '--crate-type=lib', str(out / 'fleet.rs')], 'exitCode': parse.returncode,
    'elapsedSeconds': time.monotonic() - parser_start, 'stdout': 'discarded AST tree',
    'stderrSha256': h((root / 'rust-parse.stderr').read_bytes())})
assert parse.returncode == 0, (root / 'rust-parse.stderr').read_text()
run('filesystem', ['df', '-h', str(repo), '/tmp'])
run('native-sdk-presence', ['pkg-config', '--modversion', 'gtk+-3.0', 'webkit2gtk-4.1',
                          'alsa', 'ayatana-appindicator3-0.1'])
after = tracked()
changed = [p for p in before if before[p] != after.get(p)]
assert before == after and git('status', '--porcelain') == ''
record = {'sourceCommit': expected_commit, 'sourceTree': expected_tree, 'python': sys.version,
    'yamlVersion': yaml.__version__, 'toolchain': runtime.stdout.strip(), 'commands': commands,
    'checks': {'nativeInputsMatchFailedMerge': True, 'generatorPythonSyntax': True,
        'workflowYamlSyntax': True, 'workflowEmbeddedPythonBlocks': embedded,
        'workflowShellSyntaxSteps': shell_syntax, 'stepTimeoutMinutes': step_minutes,
        'workflowJobTimeoutMinutes': 75,
        'exactOriginalFileAfterRemovingOnlyOutsideTimerProbes': True,
        'exactMeasuredFunctionAfterRemovingOnlyProbes': True, 'exactDiagnosticFixture': True,
        'sourceProofHashes': True, 'migrationHashesMatched': 25, 'outputPreservedOnRepeat': True,
        'wrongExpectedSourceRejectedBeforeOutput': True, 'rustSyntaxOnly': True,
        'trackedFiles': len(before), 'changedTrackedFiles': changed, 'gitStatusAfter': ''},
    'artifacts': {'generatorSha256': h(source.encode()), 'proposalSha256': h(proposal.encode()),
        'overlaySha256': h(overlay.encode()), 'sourceProofSha256': h((out / 'source-proof.json').read_bytes())},
    'runtimeMeasurements': None, 'nativeCompilationAttempted': False,
    'scope': 'Frozen tooling generation, identity and parser validation only; no native test, Cargo build, SQLite query-plan execution or hosted result.'}
(root / 'validation.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'evidence': str(root), 'trackedFiles': len(before), 'checks': 'passed',
    'nativeCompilationAttempted': False, 'overlaySha256': h(overlay.encode()),
    'sourceProofSha256': h((out / 'source-proof.json').read_bytes())}))
