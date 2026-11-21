"""Verify retained data and immutable Git blobs without executing project modules."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PREP = '58485ad53793733869af490c7e0da58a4090a1a1'
FROZEN = 'd3aa9ca25bd8fec352cbb628ddfcca90beabcdd4'
TREE = 'c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5'
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
TEST_FILES = [
    'tests/mobile-build.test.mjs', 'tests/mobile-export.test.mjs',
    'tests/mobile-results-details.test.mjs', 'tests/mobile-router.test.mjs',
    'tests/phone-run.test.mjs', 'tests/qr.test.mjs',
]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def data(name):
    return (HERE / name).read_bytes()

def record(name):
    return json.loads(data(name))

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def text_git(*args):
    return git(*args).decode().strip()

def tree_blobs(commit):
    entries = []
    for entry in git('ls-tree', '-r', '-z', commit).split(b'\0'):
        if not entry:
            continue
        header, path = entry.split(b'\t', 1)
        mode, kind, oid = header.split()
        assert kind == b'blob', (path, kind)
        entries.append((path.decode(), oid))
    unique = list(dict.fromkeys(oid for _, oid in entries))
    raw = subprocess.check_output(['git', 'cat-file', '--batch'], input=b'\n'.join(unique) + b'\n', cwd=ROOT)
    objects, offset = {}, 0
    for expected_oid in unique:
        end = raw.index(b'\n', offset)
        oid, kind, size = raw[offset:end].split()
        assert oid == expected_oid and kind == b'blob'
        size, offset = int(size), end + 1
        objects[oid] = raw[offset:offset + size]
        assert raw[offset + size:offset + size + 1] == b'\n'
        offset += size + 1
    assert offset == len(raw)
    return {path: objects[oid] for path, oid in entries}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--require-originals', action='store_true', help='Require every external first-outcome source to remain available.')
args = parser.parse_args()

manifest = record('manifest.json')
assert manifest['schema'] == 'deckchek.mobile-export-functional-evidence-manifest.v1'
assert manifest['source_commit'] == FROZEN and manifest['source_tree'] == TREE
actual = sorted(str(path.relative_to(HERE)) for path in HERE.rglob('*') if path.is_file() and path.name != 'manifest.json')
assert actual == sorted(manifest['files']) and len(actual) == manifest['file_count'] == 33
for name, expected in manifest['files'].items():
    raw = data(name)
    assert len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], name

retention = record('retention-proof.json')
assert retention['unique_retained_original_files'] == 29
assert retention['original_bindings'] == len(retention['bindings']) == 34
assert len({entry['retained_path'] for entry in retention['bindings']}) == 29
available_originals = 0
for entry in retention['bindings']:
    raw = data(entry['retained_path'])
    assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256']
    original = Path(entry['original_path'])
    if original.is_file():
        assert original.read_bytes() == raw, str(original)
        available_originals += 1
    else:
        assert not args.require_originals, str(original)

assert text_git('rev-parse', FROZEN + '^{tree}') == TREE
assert text_git('rev-parse', FROZEN + '^') == PREP
assert text_git('diff', '--name-only', PREP, FROZEN).splitlines() == ['mobile/sw.js']
blobs = tree_blobs(FROZEN)
assert len(blobs) == 2235
frozen_hashes = {name: sha(raw) for name, raw in blobs.items()}
before_sw = git('show', PREP + ':mobile/sw.js')
prep_hashes = {**frozen_hashes, 'mobile/sw.js': sha(before_sw)}
assert record('build/tracked-before.json') == prep_hashes
assert record('build/tracked-after.json') == frozen_hashes
for name in ['focused/tracked-before.json', 'focused/tracked-after.json', 'syntax/tracked-before.json', 'syntax/tracked-after.json']:
    assert record(name) == frozen_hashes, name

build, focused, syntax = [record(stage + '/result.json') for stage in ['build', 'focused', 'syntax']]
for result, budget in [(build, 30), (focused, 120), (syntax, 30)]:
    assert result['exit_code'] == 0 and result['timed_out'] is False
    assert result['execution_budget_seconds'] == budget
    assert 0 <= result['execution_elapsed_seconds'] < budget
    assert result['tracked_file_count'] == 2235 and result['tracked_file_inventory_equal'] is True
    assert result['node_options'] is None and result['diagnostic_variables_present'] == []
    assert result['status_before'] == ''
assert build['source_commit'] == build['head_after'] == PREP
assert build['source_tree'] == build['tree_after'] == text_git('rev-parse', PREP + '^{tree}')
assert build['changed_tracked_paths'] == ['mobile/sw.js'] and build['status_after'] == 'M mobile/sw.js'
assert build['staged_paths_after'] == build['untracked_paths_after'] == []
assert build['argv'] == [NODE, 'tools/build-mobile.mjs']
assert data('build/build.stdout') == b'updated: sw.js\n' and data('build/build.stderr') == b''
assert build['stdout_sha256'] == sha(data('build/build.stdout')) and build['stdout_bytes'] == 15
assert build['stderr_sha256'] == sha(b'') and build['stderr_bytes'] == 0
assert data('build/mobile-sw-before.js') == before_sw
assert data('build/mobile-sw-after.js') == blobs['mobile/sw.js']
assert data('build/generated.patch') == git('diff', '--binary', PREP, FROZEN)
assert build['driver_sha256'] == sha(data('build/build-recorder.py')) == '4b17d0b1c951c7f694948611736a94e83181647de3256c5c163b6ad3a73ab153'
assert build['config_sha256'] == sha(data('build/authorized-build.json')) == '8ddcbc4bbe32c3c69563155f651c3bb8067b5850663ece699542ffb36a0db84a'
build_config = record('build/authorized-build.json')
assert build_config['source_commit'] == PREP and build_config['source_tree'] == build['source_tree']
assert build_config['expected_tracked_file_count'] == 2235 and build_config['execution_budget_seconds'] == 30
assert build_config['allowed_changes'] == ['mobile/sw.js']
generated = record('build/generated-commit.json')
assert generated['commit'] == FROZEN and generated['tree'] == TREE and generated['parent'] == PREP
assert generated['changed_paths'] == ['mobile/sw.js'] and generated['status'] == ''
assert generated['service_worker_sha256'] == frozen_hashes['mobile/sw.js'] == '07b2a1c77959bcc55f825f4d6db6ada92762ea494959a0938d749569978d77cd'
assert generated['build_result_sha256'] == sha(data('build/result.json'))

shared = ['core.js', 'advanced.js', 'calibration.js', 'canonical-json.js', 'sha256.js', 'phone-run.js', 'vendor/qr.js']
for name in shared:
    assert blobs['app/' + name] == blobs['mobile/vendor/' + Path(name).name]
version = '# Copied unchanged from app/ by tools/build-mobile.mjs. Run it again after changing a shared file.\n'
version += ''.join(f"{frozen_hashes['app/' + name]}  {Path(name).name}\n" for name in shared)
assert blobs['mobile/vendor/VERSION'].decode() == version
mobile_files = sorted(name[7:] for name in blobs if name.startswith('mobile/') and name != 'mobile/sw.js' and not name.lower().endswith('.md') and all(not part.startswith('.') for part in name[7:].split('/')))
stamp = sha('\n'.join(f"{name}:{frozen_hashes['mobile/' + name]}" for name in mobile_files).encode())[:12]
sw = blobs['mobile/sw.js'].decode()
assert re.search(r"const BUILD = '([^']+)';", sw).group(1) == stamp == generated['build_stamp'] == '8f12f05a2c38'
precache = json.loads(re.search(r'const PRECACHE = (\[[\s\S]*?\]);', sw).group(1))
assert precache == ['./', *['./' + name for name in mobile_files if name != 'index.html'], './index.html']
assert len(precache) == generated['precache_entries'] == 33

for result in [focused, syntax]:
    assert result['source_commit'] == result['head_after'] == FROZEN
    assert result['source_tree'] == result['tree_after'] == TREE
    assert result['tracked_hash_maps_equal'] is True
    assert result['changed_tracked_paths'] == [] and result['status_after'] == ''
assert focused['node_version'] == build['node_version'] == 'v24.22.3'
assert focused['runtime']['execPath'] == build['runtime']['execPath'] == NODE
assert focused['argv'] == [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap', *TEST_FILES]
assert focused['test_file_count'] == 6 and record('focused/test-files.json') == TEST_FILES
assert focused['test_file_sha256'] == {name: frozen_hashes[name] for name in TEST_FILES}
assert focused['driver_sha256'] == sha(data('focused/focused-recorder.py')) == '5e28829a3d57a5b14da7a249fbf74e82509a1e036b7cb34ed4c01ce54a1cb34e'
assert focused['config_sha256'] == sha(data('focused/authorized-selection.json')) == '244a3e5e4718829ea57ccd1b3fb59ef8b6df51937efdf097266fee2c70a79bf1'
selection = record('focused/authorized-selection.json')
assert selection['source_commit'] == FROZEN and selection['source_tree'] == TREE and selection['test_files'] == TEST_FILES
assert selection['expected_tracked_file_count'] == 2235 and selection['execution_budget_seconds'] == 120
tap = data('focused/run.tap')
assert len(tap) == focused['tap_bytes'] == 10439
assert sha(tap) == focused['tap_sha256'] == '7f29e94be18c528ad18b620b875a9f74986bd6819cc39c452077f58cbff3e4db'
assert data('focused/stderr.log') == b'' and focused['stderr_bytes'] == 0 and focused['stderr_sha256'] == sha(b'')
tap_text = tap.decode()
counts = {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', tap_text, re.M)}
assert counts == focused['tap_counts'] == {'tests': 45, 'suites': 0, 'pass': 45, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert re.findall(r'^1\.\.(\d+)$', tap_text, re.M) == ['45']
outcomes = [{'number': int(number), 'status': status, 'name': name} for status, number, name in re.findall(r'^(ok|not ok) (\d+) - (.+)$', tap_text, re.M)]
assert [item['number'] for item in outcomes] == list(range(1, 46)) and all(item['status'] == 'ok' for item in outcomes)
assert [item['name'] for item in outcomes[15:19]] == [
    'Mobile edited export details reach text, file, share and clipboard with the same current checksum',
    'Mobile explicit blanks omit saved hints and editing retires the visible QR until it is regenerated',
    'Mobile blank visible export fields are authoritative and change-only edits also refresh the panel',
    'Mobile current export details and redaction survive denied preference writes over readable old settings',
]
summary = record('observed-summary.json')
assert summary['source_commit'] == FROZEN and summary['source_tree'] == TREE
assert summary['focused']['outcomes'] == outcomes and summary['focused']['tap_counts'] == counts
position = 0
for name, coverage in zip(TEST_FILES, summary['focused']['coverage'], strict=True):
    count = len(re.findall(r'^test\(', blobs[name].decode(), re.M))
    assert coverage == {'path': name, 'case_count': count, 'first_case': position + 1, 'last_case': position + count, 'sha256': frozen_hashes[name]}
    position += count
assert position == 45

source = 'tools/smoke/mobile-pwa.mjs'
assert syntax['argv'] == [NODE, '--check', source] and syntax['source_path'] == source
assert syntax['node_version_from_focused_record'] == 'v24.22.3'
assert syntax['focused_result_sha256'] == sha(data('focused/result.json'))
assert syntax['driver_sha256'] == sha(data('syntax/syntax-recorder.py')) == '17dce012b3804fe19f25b893ad1d8c71fca285fe7660f1815010271c8e4f6056'
assert syntax['source_sha256_before'] == syntax['source_sha256_after'] == frozen_hashes[source] == 'ead9aadcad653e51c2ce908dabc4e6a45234cbf40f7ea9ff6efea97ee357de44'
assert syntax['source_bytes'] == len(blobs[source]) == 14849 and data('syntax/checked-mobile-pwa.mjs') == blobs[source]
for stream in ['stdout', 'stderr']:
    assert data('syntax/syntax.' + stream) == b''
    assert syntax[stream + '_bytes'] == 0 and syntax[stream + '_sha256'] == sha(b'')

comparison = record('source-comparison.json')
assert comparison['source_commit'] == FROZEN and comparison['source_tree'] == TREE
assert comparison['preparation_commit'] == PREP and comparison['preparation_tree'] == build['source_tree']
assert comparison['generated_changes_from_preparation'] == ['mobile/sw.js']
prior = comparison['predecessor_complete_gate_commit']
fixed = comparison['fixed_pr79_commit']
for key, base in [('code_changes_from_predecessor', prior), ('code_changes_from_fixed_pr79', fixed)]:
    assert comparison[key] == text_git('diff', '--name-only', base, FROZEN, '--', 'app', 'mobile', 'tests', 'tools').splitlines()
assert comparison['frozen_code_sha256'] == {name: frozen_hashes[name] for name in comparison['code_changes_from_predecessor']}
for name, hashes in comparison['unchanged_audio_sha256_by_source'].items():
    assert hashes == {commit: sha(git('show', commit + ':' + name)) for commit in [fixed, prior, FROZEN]}
    assert len(set(hashes.values())) == 1
prior_record = comparison['predecessor_complete_gate']
prior_raw = (ROOT / prior_record['result_path']).read_bytes()
assert sha(prior_raw) == prior_record['result_sha256']
prior_result = json.loads(prior_raw)
assert prior_result['source_commit'] == prior_record['source_commit'] == prior
assert prior_result['source_tree'] == prior_record['source_tree']
assert prior_result['exit_code'] == prior_record['exit_code'] == 1
assert prior_result['tap_counts'] == prior_record['tap_counts'] == {'tests': 2391, 'suites': 0, 'pass': 2388, 'fail': 2, 'cancelled': 0, 'skipped': 1, 'todo': 0}
assert prior_record['qualification'] == 'HELD'
prior_tap = (ROOT / Path(prior_record['result_path']).parent / 'run.tap').read_bytes()
assert sha(prior_tap) == prior_record['tap_sha256'] == prior_result['tap_sha256']
assert re.findall(r'^not ok (\d+) - ', prior_tap.decode(), re.M) == ['37', '53']

print(json.dumps({'manifest_files': len(actual), 'retained_original_files': 29, 'available_original_bindings': available_originals, 'source_commit': FROZEN, 'source_tree': TREE, 'tracked_files': len(blobs), 'verified_snapshot_maps': 6, 'focused_tests': 45, 'focused_pass': 45, 'build_stamp': stamp, 'predecessor_complete_gate': 'HELD', 'project_modules_executed': 0}, indent=2))
