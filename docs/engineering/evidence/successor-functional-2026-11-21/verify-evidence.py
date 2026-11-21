"""Verify retained metadata/bytes only; never import or execute project modules."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
assert len(manifest['files']) == manifest['file_count']
for name, item in manifest['files'].items():
    path = root / name
    assert path.resolve().is_relative_to(root)
    raw = path.read_bytes()
    assert len(raw) == item['bytes'] and hashlib.sha256(raw).hexdigest() == item['sha256'], name
result = json.loads((root / 'result.json').read_text())
before = json.loads((root / 'tracked-before.json').read_text())
after = json.loads((root / 'tracked-after.json').read_text())
files = json.loads((root / 'test-files.json').read_text())
assert before == after and len(before) == result['tracked_file_count'] == 2125
assert files == sorted(files) and len(files) == result['test_file_count'] == 193
assert all(name in before and name.startswith('tests/') and name.count('/') == 1 and name.endswith('.test.mjs') for name in files)
assert files == sorted(name for name in before if name.startswith('tests/') and name.count('/') == 1 and name.endswith('.test.mjs'))
assert result['source_commit'] == result['head_after'] == 'fb81960b417ad16c155b7793814cbb4a7545d41e'
assert result['source_tree'] == result['tree_after'] == '724274fae453a867e4adf5009deef7b0cf4b190c'
assert not result['status_before'] and not result['status_after'] and result['tracked_hash_maps_equal']
assert result['exit_code'] == 0 and not result['timed_out'] and not result['changed_tracked_paths']
assert result['node_version'] == 'v24.22.3' and result['node_options'] is None
assert result['diagnostic_variables_present'] == []
assert result['argv'] == ['/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node', '--test', '--test-concurrency=1', '--test-reporter=tap', *files]
tap, stderr = (root / 'run.tap').read_bytes(), (root / 'stderr.log').read_bytes()
assert len(tap) == result['tap_bytes'] and hashlib.sha256(tap).hexdigest() == result['tap_sha256']
assert len(stderr) == result['stderr_bytes'] == 0 and hashlib.sha256(stderr).hexdigest() == result['stderr_sha256']
counts = {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', tap.decode(), re.M)}
assert counts == result['tap_counts'] == {'tests': 2359, 'suites': 0, 'pass': 2358, 'fail': 0, 'cancelled': 0, 'skipped': 1, 'todo': 0}
assert re.findall(r'^1\.\.\d+$', tap.decode(), re.M) == ['1..2359']
summary = json.loads((root / 'observed-summary.json').read_text())
assert summary['counts'] == counts and not summary['failed_cases'] and len(summary['skipped_cases']) == 1
assert all(item['status'] == 'ok' for item in summary['selected_passed_cases'])
retention = json.loads((root / 'retention-proof.json').read_text())
assert retention['copied_verbatim_file_count'] == len(retention['files']) == 9
for name, item in retention['files'].items():
    raw = (root / name).read_bytes()
    assert len(raw) == item['bytes'] and hashlib.sha256(raw).hexdigest() == item['sha256'], name
driver = (root / 'run-full-node.py').read_bytes()
assert hashlib.sha256(driver).hexdigest() == result['driver_sha256']
print(json.dumps({'verified_files': manifest['file_count'], 'verbatim_retained_files': retention['copied_verbatim_file_count'], 'counts': counts, 'tracked_files': len(before), 'test_files': len(files), 'project_execution': False}))
