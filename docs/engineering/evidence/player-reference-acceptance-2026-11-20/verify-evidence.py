"""Static evidence verification only: Git blobs, hashes, JSON and retained TAP."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import subprocess

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-reference-functional-fresh')
OUT = Path(__file__).resolve().parent
SOURCE = 'ded34d2dccfcf0ae51c78fa1492a57c161d32a1d'
TREE = '9030b4d9eeb307f27c0d794dccf4a37895c2a602'
DURABLE = 'b8bf6ea10791b05a2188d176ae8b996528a10f08'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_json(path):
    return json.loads(path.read_text())

def tap_counts(raw):
    return {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw.decode(), re.M)}

r = read_json(OUT / 'full-suite.json')
assert r['source_commit'] == r['head_after'] == SOURCE
assert r['source_tree'] == r['tree_after'] == TREE
assert git('rev-parse', SOURCE + '^{tree}').decode().strip() == TREE
assert git('rev-parse', DURABLE + '^{tree}').decode().strip() == TREE
assert git('show', '-s', '--format=%P', DURABLE).decode().strip().split() == ['78403038c530a981b732d5ac0210539edf37fc77', '5cc916eefbeb3e174edf9bdbcd6c731d6776e56d']
assert not r['status_before'] and not r['status_after']
before = read_json(OUT / 'tracked-before.json')
after = read_json(OUT / 'tracked-after.json')
assert before == after and len(before) == r['tracked_file_count']
inventory = {}
for entry in git('ls-tree', '-r', '-z', SOURCE).split(b'\0'):
    if not entry:
        continue
    fields, path = entry.split(b'\t', 1)
    mode, kind, object_id = fields.decode().split()
    assert kind == 'blob', path
    inventory[path.decode()] = object_id
assert set(inventory) == set(before)
objects = sorted(set(inventory.values()))
batch = subprocess.run(['git', 'cat-file', '--batch'], cwd=ROOT,
                       input=('\n'.join(objects) + '\n').encode(),
                       stdout=subprocess.PIPE, check=True).stdout
hashes, pos = {}, 0
for expected in objects:
    end = batch.index(b'\n', pos)
    actual, kind, size = batch[pos:end].decode().split()
    assert actual == expected and kind == 'blob'
    pos = end + 1
    raw = batch[pos:pos + int(size)]
    assert len(raw) == int(size)
    hashes[expected] = sha(raw)
    pos += int(size)
    assert batch[pos:pos + 1] == b'\n'
    pos += 1
assert pos == len(batch)
for path, object_id in inventory.items():
    assert before[path] == hashes[object_id], path

raw = (OUT / 'full-suite.tap').read_bytes()
assert len(raw) == r['tap_bytes'] and sha(raw) == r['tap_sha256']
assert tap_counts(raw) == r['tap_counts']
failures = [line for line in raw.decode().splitlines() if line.lstrip().startswith('not ok')]
assert failures == r['failure_lines']
assert len(r['argv'][4:]) == r['test_file_count']
assert r['argv'][1:4] == ['--test', '--test-concurrency=1', '--test-reporter=tap']
assert sorted(p for p in inventory if p.startswith('tests/') and p.count('/') == 1 and p.endswith('.test.mjs')) == r['argv'][4:]
assert sha((OUT / 'execution-driver.py').read_bytes()) == r['driver_sha256']

initial = ROOT / 'docs/engineering/evidence/player-reference-functional-2026-11-20'
ledger_entries = 0
for line in (initial / 'SHA256SUMS').read_text().splitlines():
    expected, rel = line.split(maxsplit=1)
    assert sha((initial / rel.lstrip('*')).read_bytes()) == expected, rel
    ledger_entries += 1
initial_results = []
for name in ['pdf-original', 'combined-focused', 'player-smoke-syntax', 'pdf-smoke-syntax']:
    old = read_json(initial / name / 'result.json')
    log = (initial / name / 'run.tap').read_bytes()
    assert sha(log) == old['tap_sha256'] and len(log) == old['tap_bytes']
    assert tap_counts(log) == old['tap_counts']
    assert git('rev-parse', old['source_commit'] + '^{tree}').decode().strip() == old['source_tree']
    initial_results.append({k: old[k] for k in ['source_commit', 'source_tree', 'exit_code', 'tap_counts', 'tap_bytes', 'tap_sha256']})

focused_names = Counter(re.findall(r'^ok \d+ - (.*)$', (initial / 'combined-focused/run.tap').read_text(), re.M))
full_passed_names = Counter(re.findall(r'^ok \d+ - (.*)$', raw.decode(), re.M))
assert not (focused_names - full_passed_names), 'An initial focused case did not pass in the full result.'

runtime_paths = ['app', 'src-tauri', 'database', '.github']
subprocess.run(['git', 'diff', '--quiet', '447019568d6a0cc0ce0fe16412e9ac99c204f604', SOURCE, '--', *runtime_paths], cwd=ROOT, check=True)
subprocess.run(['git', 'diff', '--quiet', 'dd11f41dc41e102ddd8bf7f34e87153afa994f59', SOURCE, '--', 'tests', 'tools'], cwd=ROOT, check=True)
audio_paths = ['app/audio-quality.js', 'app/ui/devices/audio-runner.js', 'tests/audio-quality.test.mjs', 'tests/audio-runner-lifecycle.test.mjs']
for old in ['6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6', 'f081881d4979e4385f255163660258784e27a264']:
    subprocess.run(['git', 'diff', '--quiet', old, SOURCE, '--', *audio_paths], cwd=ROOT, check=True)
original_tap = ROOT / 'docs/engineering/evidence/redaction-acceptance-2026-11-20/full-suite.tap'
assert sha(original_tap.read_bytes()) == '39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197'

out = {
    'scope': 'Static verification only; no app, test, browser or native code imported or executed.',
    'source_commit': SOURCE, 'source_tree': TREE,
    'durable_equivalent_commit': DURABLE,
    'durable_tree_and_ordered_parents_verified_locally': True,
    'fresh_tracked_paths': len(inventory), 'fresh_distinct_git_blobs': len(objects),
    'before_after_maps_equal_and_bound_to_git_blobs': True,
    'full_suite': {k: r[k] for k in ['exit_code', 'timed_out', 'tap_counts', 'tap_bytes', 'tap_sha256', 'failure_lines']},
    'initial_ledger_entries_verified': ledger_entries,
    'initial_results_verified': initial_results,
    'initial_focused_pass_names_present_in_full_passes': sum(focused_names.values()),
    'production_equals_corrected_4470195': True,
    'tests_tools_equal_dd11f41': True,
    'audio_paths_unchanged_from_original_failed_and_prior_passed_freezes': audio_paths,
    'original_failed_audio_tap_sha256': sha(original_tap.read_bytes()),
}
(OUT / 'evidence-verification.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps(out))
