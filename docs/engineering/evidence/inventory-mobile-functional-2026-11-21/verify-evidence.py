"""Read retained data and immutable Git blobs only; never execute project modules."""
from pathlib import Path
import hashlib
import io
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sha = lambda raw: hashlib.sha256(raw).hexdigest()
read = lambda name: json.loads((HERE / name).read_text())
git = lambda *args: subprocess.check_output(['git', *args], cwd=ROOT)
manifest = read('manifest.json')
files = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p != HERE / 'manifest.json'}
assert set(manifest['files']) == files and len(files) == manifest['file_count'] == 35
for name, item in manifest['files'].items():
    raw = (HERE / name).read_bytes()
    assert len(raw) == item['bytes'] and sha(raw) == item['sha256'], name

result, syntax = read('result.json'), read('smoke-syntax-result.json')
config = read('authorized-selection.json')
commit, tree = manifest['source_commit'], manifest['source_tree']
assert commit == '09c9afc7cfb2857f354feccb65e46a54ca8cfe62'
assert tree == 'b650eeac53af1395d6d0792f3639f02cf317490f'
assert git('rev-parse', commit + '^{tree}').decode().strip() == tree
for record in [result, syntax, config]:
    assert record['source_commit'] == commit and record['source_tree'] == tree
for record in [result, syntax]:
    assert record['timed_out'] is False and record['node_options'] is None
    assert not record['diagnostic_variables_present']
    assert record['head_after'] == commit and record['tree_after'] == tree
    assert record['status_before'] == record['status_after'] == ''
    assert record['tracked_file_count'] == 2177 and record['tracked_hash_maps_equal'] is True
assert result['exit_code'] == 1 and syntax['exit_code'] == 0
assert result['tracked_file_inventory_equal'] is True
assert result['execution_budget_seconds'] == config['execution_budget_seconds'] == 600
assert result['execution_elapsed_seconds'] < 600
before = read('tracked-before.json')
assert before == read('tracked-after.json') == read('tracked-after-syntax.json') and len(before) == 2177
entries = {}
for entry in git('ls-tree', '-r', '-z', commit).split(b'\0'):
    if not entry:
        continue
    meta, name = entry.split(b'\t', 1)
    mode, kind, oid = meta.split()
    assert kind == b'blob'
    entries[name.decode()] = oid.decode()
assert set(entries) == set(before)
oids = sorted(set(entries.values()))
stream = io.BytesIO(subprocess.check_output(['git', 'cat-file', '--batch'], input=('\n'.join(oids) + '\n').encode(), cwd=ROOT))
digests = {}
for oid in oids:
    actual, kind, size = stream.readline().split()
    assert actual.decode() == oid and kind == b'blob'
    raw = stream.read(int(size))
    assert stream.read(1) == b'\n'
    digests[oid] = sha(raw)
assert not stream.read()
assert {name: digests[oid] for name, oid in entries.items()} == before

names = read('test-files.json')
assert names == sorted(set(names)) == config['test_files'] and len(names) == result['test_file_count'] == 198
assert names == sorted(name for name in entries if re.fullmatch(r'tests/[^/]+\.test\.mjs', name))
node = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
assert result['argv'] == [node, '--test', '--test-concurrency=1', '--test-reporter=tap', *names]
assert result['node_version'] == 'v24.22.3' and result['runtime']['execPath'] == node
assert sha((HERE / 'run-full-node.py').read_bytes()) == result['driver_sha256']
assert sha((HERE / 'authorized-selection.json').read_bytes()) == result['config_sha256']
raw = (HERE / 'run.tap').read_bytes()
assert len(raw) == result['tap_bytes'] == 556814
assert sha(raw) == result['tap_sha256'] == 'bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa'
text = raw.decode()
counts = {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
assert counts == result['tap_counts'] == {'tests': 2391, 'suites': 0, 'pass': 2388, 'fail': 2, 'cancelled': 0, 'skipped': 1, 'todo': 0}
assert text.startswith('TAP version 13\n') and re.search(r'^1\.\.2391$', text, re.M)
cases = [{'number': int(n), 'status': status, 'title': title} for status, n, title in re.findall(r'^(ok|not ok) (\d+) - (.*)$', text, re.M)]
assert [case['number'] for case in cases] == list(range(1, 2392))
observed = read('observed-summary.json')
assert cases == observed['observed_cases'] and observed['full_gate_disposition'] == 'held'
assert [case for case in cases if case['status'] == 'not ok'] == observed['failing_cases']
assert [case['number'] for case in observed['failing_cases']] == [37, 53]
assert len(observed['predecessor_focused_cases_passed_here']) == 130
assert len(observed['additional_route_and_empty_error_cases']) == 7
assert all(case in cases and case['status'] == 'ok' for key in ['predecessor_focused_cases_passed_here', 'additional_route_and_empty_error_cases'] for case in observed[key])
assert observed['cubic_case'] in cases and observed['cubic_case']['status'] == 'ok'
assert (HERE / 'stderr.log').read_bytes() == b'' and result['stderr_bytes'] == 0

assert syntax['argv'] == [node, '--check', 'tools/smoke/mobile-pwa.mjs']
assert syntax['source_sha256_before'] == syntax['source_sha256_after'] == before[syntax['source_path']]
assert syntax['execution_budget_seconds'] == 30 and syntax['execution_elapsed_seconds'] < 30
assert syntax['stdout_bytes'] == syntax['stderr_bytes'] == 0
assert (HERE / 'smoke-syntax.stdout').read_bytes() == (HERE / 'smoke-syntax.stderr').read_bytes() == b''
assert sha((HERE / 'run-smoke-syntax.py').read_bytes()) == syntax['driver_sha256']

build, build_config, generated = read('build/result.json'), read('build/authorized-build.json'), read('build/generated-commit.json')
prep = '67fd2d664b8a4847fe2066c47f64682eef796c3b'
assert build['source_commit'] == build_config['source_commit'] == generated['parent'] == prep
assert build['source_tree'] == build_config['source_tree'] == '5c469cca519d4139dc47196ab6bf015c5247caf6'
assert build['argv'] == [node, 'tools/build-mobile.mjs'] and build['exit_code'] == 0 and build['timed_out'] is False
assert build['changed_tracked_paths'] == build_config['allowed_changes'] == ['mobile/sw.js']
assert build['tracked_file_inventory_equal'] is True and not build['staged_paths_after'] and not build['untracked_paths_after']
assert build['execution_budget_seconds'] == build_config['execution_budget_seconds'] == 30 and build['execution_elapsed_seconds'] < 30
assert generated['commit'] == commit and generated['tree'] == tree and generated['status_after_commit'] == ''
assert read('build/tracked-after.json') == before
old = read('build/tracked-before.json')
assert set(old) == set(before) and [name for name in old if old[name] != before[name]] == ['mobile/sw.js']
assert (HERE / 'build/mobile-sw-before.js').read_bytes() == git('show', prep + ':mobile/sw.js')
assert (HERE / 'build/mobile-sw-after.js').read_bytes() == git('show', commit + ':mobile/sw.js')
assert (HERE / 'build/generated.patch').read_bytes() == git('diff', '--binary', prep, commit)
assert (HERE / 'build/build.stdout').read_bytes() == b'updated: sw.js\n'
assert (HERE / 'build/build.stderr').read_bytes() == b''
assert sha((HERE / 'build/run-mobile-build.py').read_bytes()) == build['driver_sha256']
assert sha((HERE / 'build/authorized-build.json').read_bytes()) == build['config_sha256']

preflight = read('preflight/result.json')
original = (HERE / 'preflight/original-recorder.py').read_text()
corrected = (HERE / 'run-full-node.py').read_text()
assert preflight['exit_code'] == 1 and preflight['node_or_project_process_started'] is False and preflight['raw_directory_exists'] is False
assert preflight['source_status_after'] == '' and preflight['source_commit'] == commit and preflight['source_tree'] == tree
assert preflight['rejected_files'] == ['tests/monitor.property.test.mjs', 'tests/scratch.property.test.mjs']
assert sha(original.encode()) == preflight['original_driver_sha256'] and sha(corrected.encode()) == preflight['corrected_driver_sha256']
assert corrected == original.replace("re.fullmatch(r'tests/[a-z0-9-]+\\.test\\.mjs', name)", "re.fullmatch(r'tests/[^/]+\\.test\\.mjs', name)")
assert (HERE / 'preflight/authorized-selection.json').read_bytes() == (HERE / 'authorized-selection.json').read_bytes()

comparison = read('source-comparison.json')
assert len(comparison['changed_code_paths']) == 15 and len(comparison['unchanged_audio_paths']) == 7
for item in comparison['changed_code_paths']:
    assert before[item['path']] == item['source_sha256']
for name, hashes in comparison['unchanged_audio_paths'].items():
    assert len(set(hashes.values())) == 1 and before[name] == hashes[commit]
    for ref, digest in hashes.items():
        assert sha(git('show', ref + ':' + name)) == digest
proof = read('retention-proof.json')
assert len(proof['retained_files']) == 31 and proof['all_byte_equal'] is True
originals_present = 0
for item in proof['retained_files']:
    raw = (HERE / item['copy']).read_bytes()
    assert len(raw) == item['bytes'] and sha(raw) == item['sha256'] and item['byte_equal'] is True
    source = Path(item['source'])
    if source.exists():
        assert source.read_bytes() == raw
        originals_present += 1
print(json.dumps({'verified': True, 'manifest_files': len(files), 'immutable_tracked_hashes': len(before), 'test_files': len(names), 'tap_counts': counts, 'original_copies_compared': originals_present, 'full_gate_disposition': 'held', 'build_exit': build['exit_code'], 'smoke_syntax_exit': syntax['exit_code']}))
