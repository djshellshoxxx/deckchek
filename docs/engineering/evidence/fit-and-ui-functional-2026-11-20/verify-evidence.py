"""Verify retained evidence bytes and relationships without project imports or runtime tests."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
load = lambda name: json.loads((root / name).read_text())
manifest = load('manifest.json')
files = manifest['files']
actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name != 'manifest.json'}
assert actual == set(files), (actual - set(files), set(files) - actual)
for name, record in files.items():
    path = Path(name)
    assert not path.is_absolute() and '..' not in path.parts
    raw = (root / path).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], name

for name in ('focused', 'syntax-shell-layout', 'syntax-player-capture', 'syntax-fit-recorder', 'syntax-instrumented-copy'):
    before = load(name + '/tracked-before.json')
    after = load(name + '/tracked-after.json')
    result = load(name + '/result.json')
    assert before == after and len(before) == result['tracked_file_count']
    assert result['source_commit'] == result['head_after'] and result['source_tree'] == result['tree_after']
    assert not result['status_before'] and not result['status_after'] and result['node_options'] is None
    assert result['exit_code'] == 0 and result['stderr_bytes'] == 0
    assert sha((root / name / 'run.tap').read_bytes()) == result['tap_sha256']

source_before = load('preparation/source-before.json')
assert len(source_before) == 2039 and source_before == load('preparation/source-after.json') == load('preparation/copy-before.json')
prepared_copy = load('preparation/copy-prepared.json')
assert [name for name in source_before if source_before[name] != prepared_copy[name]] == ['app/audio-quality.js']
for kind in ('source', 'copy'):
    before, after = load('trace/' + kind + '-before.json'), load('trace/' + kind + '-after.json')
    assert before == after and len(before) == 2039
    assert before == (source_before if kind == 'source' else prepared_copy)
preparation = load('preparation/preparation.json')
original = (root / 'preparation/audio-quality.original.js').read_text()
instrumented = (root / 'preparation/audio-quality.instrumented.js').read_text()
assert sha(original.encode()) == preparation['original_sha256']
assert sha(instrumented.encode()) == preparation['instrumented_sha256']
reversed_text = instrumented
for edit in reversed(load('preparation/transformation.json')):
    assert reversed_text.count(edit['anchor'] + edit['addition']) == 1
    reversed_text = reversed_text.replace(edit['anchor'] + edit['addition'], edit['anchor'], 1)
assert reversed_text == original
reviews = load('trace-reviews.json')
assert reviews == load('trace/reviews.json')
assert all(reviews[key]['approved'] for key in ('code_review', 'security_review', 'root_review'))
assert reviews['instrumented_sha256'] == preparation['instrumented_sha256']
for name, digest in reviews['tools_sha256'].items():
    assert sha((root / 'tooling' / name).read_bytes()) == digest

result = load('trace/result.json')
assert result['source_commit'] == preparation['source_commit'] == result['source_head_after']
assert result['source_tree'] == preparation['source_tree'] == result['source_tree_after']
assert result['tap_counts'] == {'tests': 33, 'suites': 0, 'pass': 33, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert result['exit_code'] == 0 and not result['timed_out'] and result['execution_elapsed_seconds'] < 180
assert result['copy_inventory_equal'] and not result['copy_extra_files'] and not result['source_status_after']
assert result['node_options'] is None and result['node_version'] == 'v24.22.3'
assert result['argv'] == ['/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node', '--test', '--test-concurrency=1', '--test-reporter=tap', 'tests/audio-quality.test.mjs', 'tests/audio-runner-lifecycle.test.mjs']
assert sha((root / 'trace/run.tap').read_bytes()) == result['tap_sha256']
assert sha((root / 'trace/contexts.json').read_bytes()) == result['context_sha256']
for item in result['traces']:
    raw = (root / 'trace/traces' / item['file']).read_bytes()
    assert sha(raw) == item['sha256'] and len(raw) == item['bytes']
    trace = json.loads(raw)
    assert trace['recordCount'] == len(trace['records']) and not trace['truncated'] and not trace['dropped'] and not trace['errors']

retention = load('retention-proof.json')
assert retention['file_count'] == 62 and retention['all_bytes_equal']
for name, expected in retention['files'].items():
    assert files[name] == expected
print(json.dumps({'verified_evidence_files': len(files), 'original_files_preserved': retention['file_count'],
                  'focused_pass': load('focused/spec-summary.json')['counts']['pass'],
                  'audio_pass': result['tap_counts']['pass'], 'source_and_copy_map_entries': len(source_before),
                  'project_execution_performed': False}))
