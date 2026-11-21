"""Static evidence verification only. Does not import or run application code."""
from pathlib import Path
import datetime, hashlib, json, subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
LABELS = ['audio-context', 'audio-prefix-context', 'usage-node', 'player-focused-initial', 'player-smoke']
sources, records, objects = {}, {}, set()
for label in LABELS:
    directory = OUT / label
    metadata = json.loads((directory / 'result.json').read_text())
    before = json.loads((directory / 'tracked-before.json').read_text())
    after = json.loads((directory / 'tracked-after.json').read_text())
    assert before == after and len(before) == metadata['tracked_file_count'], label
    assert metadata['tracked_hash_maps_equal'] and not metadata['status_before'] and not metadata['status_after'], label
    assert metadata['source_commit'] == metadata['head_after'] and metadata['source_tree'] == metadata['tree_after'], label
    source = metadata['source_commit']
    if source not in sources:
        tree = subprocess.check_output(['git', 'rev-parse', source + '^{tree}'], cwd=ROOT, text=True).strip()
        assert tree == metadata['source_tree'], label
        entries = subprocess.check_output(['git', 'ls-tree', '-rz', source], cwd=ROOT).split(b'\0')
        files = {}
        for entry in filter(None, entries):
            info, name = entry.split(b'\t', 1)
            mode, kind, oid = info.decode().split()
            assert kind == 'blob' and mode in ['100644', '100755'], (mode, kind, name)
            files[name.decode()] = oid
        sources[source] = files
        objects.update(files.values())
    assert set(before) == set(sources[source]), label
    log = directory / ('ui-smoke.log' if label == 'player-smoke' else 'run.tap')
    raw = log.read_bytes()
    assert len(raw) == metadata['tap_bytes'] and hashlib.sha256(raw).hexdigest() == metadata['tap_sha256'], label
    records[label] = {'metadata': metadata, 'before': before}

ordered = sorted(objects)
process = subprocess.run(['git', 'cat-file', '--batch'], cwd=ROOT, input=('\n'.join(ordered) + '\n').encode(), stdout=subprocess.PIPE, check=True)
data = process.stdout
offset, hashes = 0, {}
for expected in ordered:
    end = data.index(b'\n', offset)
    oid, kind, size = data[offset:end].decode().split()
    assert oid == expected and kind == 'blob'
    size = int(size); start = end + 1
    hashes[oid] = hashlib.sha256(data[start:start + size]).hexdigest()
    assert data[start + size:start + size + 1] == b'\n'
    offset = start + size + 1
assert offset == len(data)

result = {'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'method': 'Static Git tree/blob hashing and retained JSON/log comparison; no project execution.',
          'distinct_git_blobs_hashed': len(hashes), 'runs': {}}
for label, record in records.items():
    metadata, before = record['metadata'], record['before']
    files = sources[metadata['source_commit']]
    assert all(hashes[files[name]] == digest for name, digest in before.items()), label
    result['runs'][label] = {'source_commit': metadata['source_commit'], 'source_tree': metadata['source_tree'],
                            'tracked_entries': len(before), 'before_after_equal': True,
                            'all_entries_match_immutable_git_blobs': True, 'log_hash_and_length_match': True}
(OUT / 'source-map-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
