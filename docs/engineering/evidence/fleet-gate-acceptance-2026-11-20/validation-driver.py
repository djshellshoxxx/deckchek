import ast
import contextlib
import copy
import difflib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
import yaml

TOOLING = Path('/workspace/scratch/6f2247f2f463/deckchek-fleet-gate-fresh-functional')
BASELINE = Path('/workspace/scratch/6f2247f2f463/deckchek-fleet-gate-baseline-source')
TOOLING_COMMIT = 'f1172b87902aa05c93c452619c7ed1e359f939e6'
TOOLING_TREE = '41031b09d19dfd1ca90dd95173872aaeb280e3f6'
BASELINE_COMMIT = '5702a450d9a7faa3efb80c5b67de69386ae07540'
BASELINE_TREE = 'a2e4f571ac3a9c7d976db911a5fed3f910c3ea26'
RUSTC = Path('/workspace/scratch/6f2247f2f463/rust-measurement-toolchain/rustup/toolchains/nightly-2026-11-20-x86_64-unknown-linux-gnu/bin/rustc')
OUT = Path(tempfile.mkdtemp(prefix='deckchek-fleet-fresh-functional-'))
COMMANDS = []
CHECKS = []


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    CHECKS.append(name)


def manifest(root):
    names = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
    return {name: sha((root / name).read_bytes()) for name in names if name}


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def invoke(name, argv, *, data=None, stdout_discard=False):
    start = time.monotonic()
    result = subprocess.run(list(map(str, argv)), input=data,
                            stdout=subprocess.DEVNULL if stdout_discard else subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, timeout=30, cwd=TOOLING)
    (OUT / f'{name}.stderr').write_text(result.stderr)
    if not stdout_discard:
        (OUT / f'{name}.stdout').write_text(result.stdout)
    COMMANDS.append({'name': name, 'argv': list(map(str, argv)), 'cwd': str(TOOLING),
                     'exitCode': result.returncode, 'elapsedSeconds': time.monotonic() - start,
                     'stdoutSha256': None if stdout_discard else sha(result.stdout.encode()),
                     'stdoutScope': 'discarded AST only' if stdout_discard else 'complete',
                     'stderrSha256': sha(result.stderr.encode())})
    return result


def main():
    started = time.monotonic()
    print(str(OUT), flush=True)
    for label, root, commit, tree in [('tooling', TOOLING, TOOLING_COMMIT, TOOLING_TREE),
                                      ('baseline', BASELINE, BASELINE_COMMIT, BASELINE_TREE)]:
        check(label + ' exact commit', git(root, 'rev-parse', 'HEAD') == commit)
        check(label + ' exact tree', git(root, 'rev-parse', 'HEAD^{tree}') == tree)
        check(label + ' starts clean', git(root, 'status', '--porcelain') == '')
    before = {name: manifest(root) for name, root in [('tooling', TOOLING), ('baseline', BASELINE)]}
    for name, files in before.items():
        save_json(OUT / f'{name}-tracked-before.json', files)

    generator = TOOLING / 'tools/fleet-gate-diagnostic.py'
    proposal = TOOLING / 'docs/engineering/proposals/fleet-gate-diagnostic.yml'
    check('generator exact initial freeze', sha(generator.read_bytes()) == '3faac5ab1c48b38363a6305d5f382dba23c8d51586a313a887e9ed9343e257c2')
    check('proposal exact initial freeze', sha(proposal.read_bytes()) == 'c5c9aa39aee40eacd9fb5058237d5ff316e22120bb5b12535afa270e8e6dccef')
    ast.parse(generator.read_text(), filename=str(generator))
    CHECKS.append('generator Python AST')
    workflow = yaml.load(proposal.read_text(), Loader=yaml.BaseLoader)
    check('inert proposal authority and trigger', workflow['permissions'] == {'contents': 'read'}
          and workflow['on']['push']['branches'] == ['diagnostic/fleet-gate-context-20261121']
          and set(workflow['on']) == {'push', 'workflow_dispatch'})
    job = workflow['jobs']['native-context']
    steps = job['steps']
    check('aggregate timeout leaves finalization margin', sum(int(x['timeout-minutes']) for x in steps) == 69
          and int(job['timeout-minutes']) == 75)
    embedded = []
    shell_count = 0
    for index, step in enumerate(steps):
        if 'run' not in step:
            continue
        shell_count += 1
        result = invoke(f'shell-{index}', ['bash', '-n'], data=step['run'])
        check(f'shell syntax {index}', result.returncode == 0)
        for block in re.findall(r"(?:python3 -|cat[^\n]*) <<'PY'\n(.*?)\nPY(?:\n|$)", step['run'], re.S):
            ast.parse(block)
            embedded.append(block)
    check('expected embedded bodies parsed', shell_count == 7 and len(embedded) == 3)

    generated = OUT / 'generated'
    command = [sys.executable, generator, '--source', BASELINE, '--expected-commit', BASELINE_COMMIT,
               '--expected-tree', BASELINE_TREE, generated]
    result = invoke('generate-exact-failed-merge', command)
    check('generation succeeded', result.returncode == 0)
    proof = json.loads((generated / 'source-proof.json').read_text())
    overlay_bytes = (generated / 'fleet.rs').read_bytes()
    check('overlay equals independently reviewed bytes', sha(overlay_bytes) == '0ee2fcc60232cf25f554986ae43bc9a13dcd7ff2bbeafb92253e6ca9282e9dcf')
    check('fresh proof names actual failed merge', proof['sourceCommit'] == BASELINE_COMMIT and proof['sourceTree'] == BASELINE_TREE)
    original = (BASELINE / 'src-tauri/src/fleet.rs').read_text()
    prefix, module = overlay_bytes.decode().split('\n// Generated diagnostic only; never install as a production change.\n')
    diff = list(difflib.SequenceMatcher(a=original.splitlines(keepends=True), b=prefix.splitlines(keepends=True), autojunk=False).get_opcodes())
    changes = [(tag, prefix.splitlines(keepends=True)[j:k]) for tag, _, _, j, k in diff if tag != 'equal']
    check('original file differs by two outside-timer insertions only', changes == [
        ('insert', ['        #[cfg(target_os = "linux")]\n', '        let fleet_gate_scheduler_before = super::fleet_gate_diagnostic::scheduler_snapshot();\n']),
        ('insert', ['        #[cfg(target_os = "linux")]\n', '        super::fleet_gate_diagnostic::print_gate(elapsed.as_nanos(), fleet_gate_scheduler_before);\n'])])
    start = original.index('pub fn reminders(')
    function = original[start:original.index('#[derive(Debug, Deserialize)]', start)]
    start = module.index('    fn measured_reminders(')
    measured = textwrap.dedent(module[start:module.index('    #[test]\n    #[ignore', start)])
    measured = measured.replace('fn measured_reminders(conn: &Connection, asset: Option<&str>, phases: &mut Vec<Value>)',
                                'pub fn reminders(conn: &Connection, asset: Option<&str>)', 1)
    probe_lines = {'    let mut mark = Mark::now();\n'} | {
        f'    record_phase("{phase}", &mut mark, phases);\n'
        for phase in ['completionQueryAndMap', 'usageQueryAndMap', 'reminderQueryAndJson', 'enrichment']}
    check('exactly five phase probe lines', all(measured.splitlines(keepends=True).count(line) == 1 for line in probe_lines))
    restored = ''.join(line for line in measured.splitlines(keepends=True) if line not in probe_lines)
    check('phase copy restores original function', restored == function)
    start = original.index('    fn regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget()')
    regression = original[start:original.index('    #[test]\n    fn reminder_read_preserves_optional_fields', start)]
    fixture = regression.split('{\n', 1)[1].split('        let started = std::time::Instant::now();', 1)[0]
    actual_fixture = module.split('    fn bounded_phase_measurements() {\n', 1)[1].split('\n        // Four pairs', 1)[0]
    check('exact regression fixture', actual_fixture == fixture)
    for key, data in [('originalFleetSha256', original.encode()), ('overlaySha256', overlay_bytes),
                      ('generatorSha256', generator.read_bytes()), ('originalFunctionSha256', function.encode()),
                      ('originalRegressionSha256', regression.encode()), ('fixtureSha256', fixture.encode()),
                      ('manifestSha256', (BASELINE / 'src-tauri/Cargo.toml').read_bytes()),
                      ('lockSha256', (BASELINE / 'src-tauri/Cargo.lock').read_bytes())]:
        check('proof ' + key, proof[key] == sha(data))
    migrations = {p.name: sha(p.read_bytes()) for p in sorted((BASELINE / 'database/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql'))}
    check('all25 migrations and native trees', len(migrations) == 25 and proof['migrationSha256'] == migrations
          and all(proof[key] == git(BASELINE, 'rev-parse', f'HEAD:{path}') for key, path in
                  [('nativeTree', 'src-tauri'), ('migrationTree', 'database/migrations'), ('vendorTree', 'vendor')]))
    check('gate and trial bounds unchanged', proof['unchangedBudgetMs'] == 200 and proof['boundedPairs'] == 4)
    proof_before = (generated / 'source-proof.json').read_bytes()
    repeated = invoke('preserve-existing-output', command)
    check('existing output preserved', repeated.returncode != 0 and 'Existing diagnostic output is preserved' in repeated.stderr
          and (generated / 'fleet.rs').read_bytes() == overlay_bytes and (generated / 'source-proof.json').read_bytes() == proof_before)
    wrong = list(command); wrong[wrong.index('--expected-tree') + 1] = '0' * 40; wrong[-1] = OUT / 'wrong-tree'
    rejected = invoke('reject-wrong-tree', wrong)
    check('wrong tree rejected before output', rejected.returncode != 0 and not (OUT / 'wrong-tree').exists())
    version = invoke('rust-parser-version', [RUSTC, '--version', '--verbose'])
    parsed = invoke('rust-ast-only', [RUSTC, '-Zunpretty=ast-tree', '--edition=2021', '--crate-type=lib', generated / 'fleet.rs'], stdout_discard=True)
    check('emitted Rust AST parses', parsed.returncode == 0)

    # Exercise the workflow's own extracted log classifier without invoking cargo.
    runner = embedded[1]
    nodes = ast.parse(runner).body
    begin = next(i for i, n in enumerate(nodes) if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'matches')
    end = next(i for i, n in enumerate(nodes) if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'binaries')
    classifier = compile(ast.Module(body=nodes[begin:end], type_ignores=[]), '<frozen-workflow-log-classifier>', 'exec')
    def classify(stage, text):
        env = {'re': re, 'json': json, 'stage': stage, 'text': text}
        exec(classifier, env)
        return {'complete': env['complete'], 'counts': env['counts']}
    def summary(passed, failed, ignored, filtered=0):
        return f'test result: {"FAILED" if failed else "ok"}. {passed} passed; {failed} failed; {ignored} ignored; 0 measured; {filtered} filtered out;\n'
    gate = 'FLEET_GATE_CONTEXT ' + json.dumps({'budgetMs': 200, 'wallNs': 100}) + '\n'
    samples = ''.join('FLEET_PHASE_SAMPLE ' + json.dumps({'pair': i, 'rows': 2000, 'allRowsEqual': True, 'phases': [{}, {}, {}, {}]}) + '\n' for i in range(4))
    sql = 'FLEET_SQL_CONTEXT ' + json.dumps({'migrations': 25, 'queryPlans': [{}, {}, {}, {}, {}, {}]}) + '\n'
    log_cases = [
        ('retained failed baseline reaches complete suite', 'baseline', (TOOLING / 'docs/engineering/evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.log').read_text(), True),
        ('instrumented full suite with marker', 'instrumented', gate + summary(767, 0, 9), True),
        ('instrumented missing marker', 'instrumented', summary(767, 0, 9), False),
        ('instrumented duplicate marker', 'instrumented', gate + gate + summary(767, 0, 9), False),
        ('complete four-pair phase records', 'phases', samples + sql + summary(1, 0, 0, 775), True),
        ('zero-match phase selection', 'phases', summary(0, 0, 0, 776), False),
        ('missing phase pair', 'phases', '\n'.join(samples.splitlines()[:-1]) + '\n' + sql + summary(1, 0, 0, 775), False),
        ('duplicate result summaries', 'baseline', summary(767, 0, 8) * 2, False),
    ]
    classification = []
    for name, stage, text, expected in log_cases:
        result = classify(stage, text)
        check(name, result['complete'] is expected)
        classification.append({'case': name, 'stage': stage, 'expectedComplete': expected, 'actual': result})
    save_json(OUT / 'log-classifier-cases.json', classification)

    # Exercise the unchanged finalizer with ordinary controlled evidence records.
    sandbox = OUT / 'finalizer-fixture' / 'fleet-gate-context'; sandbox.mkdir(parents=True)
    for name in ['Cargo.toml', 'Cargo.lock']:
        (sandbox / name).write_bytes((BASELINE / 'src-tauri' / name).read_bytes())
    (sandbox / 'overlay').mkdir(); save_json(sandbox / 'overlay/source-proof.json', proof)
    clean = {stage: {'exitCode': 0, 'evidenceComplete': True, 'trackedStatus': '' if stage == 'baseline' else ' M src-tauri/src/fleet.rs\n',
        'fleetSha256': proof['originalFleetSha256'] if stage == 'baseline' else proof['overlaySha256'],
        'manifestSha256': proof['manifestSha256'], 'lockSha256': proof['lockSha256'],
        'migrationSha256': migrations, 'binaries': [{'path': 'synthetic-test-binary', 'sha256': 'fixture-only'}]}
        for stage in ['baseline', 'instrumented', 'phases']}
    final_code = compile(embedded[2], '<frozen-workflow-finalizer>', 'exec')
    final_cases = [('complete diagnostic records', None, None, None, 0),
        ('failed baseline cannot be masked', 'baseline', 'exitCode', 101, 1),
        ('incomplete phase evidence', 'phases', 'evidenceComplete', False, 1),
        ('unexpected baseline source state', 'baseline', 'trackedStatus', ' M src-tauri/src/fleet.rs\n', 1),
        ('changed lock identity', 'instrumented', 'lockSha256', 'wrong', 1),
        ('missing binary evidence', 'baseline', 'binaries', [], 1),
        ('wrong overlay identity', 'phases', 'fleetSha256', 'wrong', 1),
        ('changed migration evidence', 'phases', 'migrationSha256', {}, 1),
        ('missing stage record', 'phases', None, None, 1)]
    final_results = []
    previous = os.environ.get('RUNNER_TEMP')
    try:
        os.environ['RUNNER_TEMP'] = str(sandbox.parent)
        for name, stage, key, value, expected in final_cases:
            records = copy.deepcopy(clean)
            if stage and key: records[stage][key] = value
            for label, record in records.items(): save_json(sandbox / (label + '.json'), record)
            if stage and key is None: (sandbox / (stage + '.json')).unlink()
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream):
                try:
                    exec(final_code, {})
                except SystemExit as error:
                    exit_code = int(error.code)
                else:
                    raise AssertionError('finalizer did not exit')
            check(name, exit_code == expected)
            final_results.append({'case': name, 'expectedExit': expected, 'actualExit': exit_code,
                                  'record': json.loads(stream.getvalue())})
    finally:
        if previous is None: os.environ.pop('RUNNER_TEMP', None)
        else: os.environ['RUNNER_TEMP'] = previous
    save_json(OUT / 'finalizer-cases.json', final_results)
    shutil.rmtree(sandbox.parent)

    after = {name: manifest(root) for name, root in [('tooling', TOOLING), ('baseline', BASELINE)]}
    for name, root in [('tooling', TOOLING), ('baseline', BASELINE)]:
        save_json(OUT / f'{name}-tracked-after.json', after[name])
        check(name + ' all tracked hashes unchanged', before[name] == after[name])
        check(name + ' ends clean', git(root, 'status', '--porcelain') == '')
    record = {'toolingCommit': TOOLING_COMMIT, 'toolingTree': TOOLING_TREE,
        'baselineCommit': BASELINE_COMMIT, 'baselineTree': BASELINE_TREE,
        'python': sys.version, 'yamlVersion': yaml.__version__, 'rustParser': version.stdout.strip(),
        'elapsedSeconds': time.monotonic() - started, 'commands': COMMANDS, 'checks': CHECKS,
        'checkCount': len(CHECKS), 'trackedFiles': {name: len(files) for name, files in before.items()},
        'allTrackedHashesUnchanged': True, 'overlaySha256': sha(overlay_bytes),
        'sourceProofSha256': sha(proof_before), 'nativeCompilationAttempted': False,
        'projectTestsExecuted': False, 'performanceMeasurements': None,
        'scope': 'Fresh actual-failed-merge generation, parser and ordinary evidence-logic checks only; no native execution or qualification.'}
    save_json(OUT / 'validation.json', record)
    shutil.copyfile(__file__, OUT / 'validation-driver.py')
    save_json(OUT / 'artifact-index.json', {str(p.relative_to(OUT)): {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
        for p in sorted(OUT.rglob('*')) if p.is_file()})
    print(json.dumps({'evidence': str(OUT), 'checks': len(CHECKS), 'elapsedSeconds': record['elapsedSeconds'],
        'trackedFiles': record['trackedFiles'], 'overlaySha256': record['overlaySha256'],
        'sourceProofSha256': record['sourceProofSha256'], 'nativeCompilationAttempted': False}))


if __name__ == '__main__':
    main()
