"""Independent static verification of source maps and retained logs; no project execution."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-player-functional-fresh')
OUT = Path(__file__).resolve().parent
INITIAL = ROOT / 'docs/engineering/evidence/player-capture-functional-2026-11-20'
ORIGINAL = ROOT / 'docs/engineering/evidence/redaction-acceptance-2026-11-20'
EXPECTED = 'f081881d4979e4385f255163660258784e27a264'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def load(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tap_counts(raw):
    return {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw.decode(), re.M)}


assert git('rev-parse', 'HEAD') == EXPECTED
sources, records, all_objects, initial_objects = {}, {}, set(), set()
for label in ['audio-context', 'audio-prefix-context', 'usage-node', 'player-focused-initial', 'player-smoke', 'fresh-full-suite']:
    is_fresh = label == 'fresh-full-suite'
    directory = OUT if is_fresh else INITIAL / label
    metadata = load(directory / ('full-suite.json' if is_fresh else 'result.json'))
    before = load(directory / 'tracked-before.json')
    after = load(directory / 'tracked-after.json')
    assert before == after and len(before) == metadata['tracked_file_count'], label
    assert metadata['tracked_hash_maps_equal'] and not metadata['status_before'] and not metadata['status_after'], label
    assert metadata['source_commit'] == metadata['head_after'] and metadata['source_tree'] == metadata['tree_after'], label
    source = metadata['source_commit']
    if source not in sources:
        assert git('rev-parse', source + '^{tree}') == metadata['source_tree'], label
        files = {}
        entries = subprocess.check_output(['git', 'ls-tree', '-rz', source], cwd=ROOT).split(b'\0')
        for entry in filter(None, entries):
            info, name = entry.split(b'\t', 1)
            mode, kind, oid = info.decode().split()
            assert kind == 'blob' and mode in ['100644', '100755'], (mode, kind, name)
            files[name.decode()] = oid
        sources[source] = files
    files = sources[source]
    assert set(before) == set(files), label
    all_objects.update(files.values())
    if not is_fresh:
        initial_objects.update(files.values())
    log_path = directory / ('full-suite.tap' if is_fresh else 'ui-smoke.log' if label == 'player-smoke' else 'run.tap')
    raw = log_path.read_bytes()
    assert len(raw) == metadata['tap_bytes'] and hashlib.sha256(raw).hexdigest() == metadata['tap_sha256'], label
    assert tap_counts(raw) == metadata['tap_counts'], label
    assert metadata['node_version'] == 'v24.22.3', label
    records[label] = {'metadata': metadata, 'before': before, 'log_path': str(log_path), 'raw': raw}

ordered = sorted(all_objects)
data = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=ROOT, input=('\n'.join(ordered) + '\n').encode())
offset, hashes = 0, {}
for expected_oid in ordered:
    end = data.index(b'\n', offset)
    oid, kind, size = data[offset:end].decode().split()
    assert oid == expected_oid and kind == 'blob'
    size = int(size)
    start = end + 1
    hashes[oid] = hashlib.sha256(data[start:start + size]).hexdigest()
    assert data[start + size:start + size + 1] == b'\n'
    offset = start + size + 1
assert offset == len(data)

result = {
    'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'method': 'Independent static Git tree/blob hashing and retained JSON/TAP/log comparison; no project execution.',
    'combined_freeze_commit': EXPECTED,
    'combined_freeze_tree': git('rev-parse', EXPECTED + '^{tree}'),
    'distinct_initial_git_blobs_hashed': len(initial_objects),
    'distinct_git_blobs_hashed_across_all_six_runs': len(hashes),
    'runs': {},
}
for label, record in records.items():
    metadata, before = record['metadata'], record['before']
    assert all(hashes[sources[metadata['source_commit']][name]] == digest for name, digest in before.items()), label
    result['runs'][label] = {
        'source_commit': metadata['source_commit'], 'source_tree': metadata['source_tree'],
        'tracked_entries': len(before), 'before_after_equal': True,
        'all_entries_match_immutable_git_blobs': True, 'log_hash_and_length_match': True,
        'tap_counts_match': True, 'exit_code': metadata['exit_code'],
        'tap_sha256': metadata['tap_sha256'], 'tap_bytes': metadata['tap_bytes'],
    }

ledger = []
for line in (INITIAL / 'SHA256SUMS').read_text().splitlines():
    expected_hash, relative = line.split('  ', 1)
    assert sha(INITIAL / relative) == expected_hash, relative
    ledger.append(relative)
result['initial_evidence_ledger'] = {'entries_verified': len(ledger), 'paths': ledger, 'all_match': True}

reports = {
    'PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md': '2a6e33d47d1ff69d6bc914a7be82dd7664194166f653ed65f9484ae173f106a4',
    'PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md': 'c952dbd270e1e8c22d3267856c3fa432ba6792cb561caa50e31217e6d4e940a0',
    'PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md': '9079f6cf1a2d7fa627372df0cfc00958e3bcd52555fa2058b91e79f08acc1c9e',
}
for filename, digest in reports.items():
    assert sha(ROOT / 'docs/engineering' / filename) == digest, filename
result['initial_report_sha256'] = reports
result['initial_handoff_sha256'] = sha(ROOT / 'docs/engineering/PLAYER_CAPTURE_INITIAL_HANDOFF_2026-11-20.md')

comparisons = [
    ('production_matches_reviewed_freeze', 'aabcd886667ed4116fecb725c532eabcc7d485d6', ['app', 'src-tauri', 'database', '.github']),
    ('maintained_tests_tools_match_final_initial_source', '2cb1aec7b1bdd4169b08aed57689eb7e937173c3', ['tests', 'tools']),
    ('usage_matches_exact_candidate', 'b8dfc126c2480f303df105abd3759fedae49a192', ['app/usage-hours.js', 'tests/usage-hours.test.mjs']),
    ('audio_production_and_fixture_unchanged_from_original_failed_source', '6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6', ['app/audio-quality.js', 'tests/audio-quality.test.mjs']),
]
result['source_comparisons'] = {}
for label, source, paths in comparisons:
    changed = git('diff', '--name-only', source, EXPECTED, '--', *paths).splitlines()
    assert not changed, (label, changed)
    result['source_comparisons'][label] = {'compared_commit': source, 'pathspecs': paths, 'changed_paths': changed}

original_records = {}
for label, metadata_path, log_path, expected_hash in [
    ('original_failed_full_suite', ORIGINAL / 'full-suite.json', ORIGINAL / 'full-suite.tap', '39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197'),
    ('separate_authorized_narrow_rerun', ORIGINAL / 'audio-quality-rerun/audio-quality-rerun.json', ORIGINAL / 'audio-quality-rerun/audio-quality-rerun.tap', 'c8ee666590df3f24c0bb0eff784e71e0305b1247b4d1dac90d233c213847b06e'),
]:
    metadata = load(metadata_path)
    raw = log_path.read_bytes()
    actual_hash = hashlib.sha256(raw).hexdigest()
    assert actual_hash == expected_hash == metadata['tap_sha256'], label
    assert len(raw) == metadata['tap_bytes'], label
    assert tap_counts(raw) == metadata['tap_counts'], label
    original_records[label] = {
        'source_commit': metadata['source_commit'], 'source_tree': metadata['source_tree'],
        'exit_code': metadata['exit_code'], 'tap_counts': metadata['tap_counts'],
        'tap_bytes': len(raw), 'tap_sha256': actual_hash,
        'failure_lines': [line for line in raw.decode().splitlines() if line.lstrip().startswith('not ok')],
        'immutable_in_combined_freeze': sha(log_path) == hashes[sources[EXPECTED][log_path.relative_to(ROOT).as_posix()]],
    }
    assert original_records[label]['immutable_in_combined_freeze'], label
result['original_audio_evidence'] = original_records

smoke = records['player-smoke']
assert not smoke['metadata']['screenshots'] and not smoke['metadata']['ui_check_summaries']
assert b'socket() failed: Operation not permitted (1)' in smoke['raw']
result['prior_browser_launch'] = {'exit_code': smoke['metadata']['exit_code'], 'socket_eperm_in_raw_log': True, 'screenshots': [], 'ui_check_summaries': [], 'fresh_worker_retried_browser': False}

fresh = records['fresh-full-suite']['metadata']
assert fresh['source_commit'] == EXPECTED
expected_tests = sorted(p for p in sources[EXPECTED] if re.fullmatch(r'tests/[^/]+\.test\.mjs', p))
assert fresh['argv'][4:] == expected_tests and len(expected_tests) == fresh['test_file_count']
assert fresh['argv'][1:4] == ['--test', '--test-concurrency=1', '--test-reporter=tap']
assert fresh['argv'][0] == '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
assert fresh['driver_sha256'] == sha(OUT / 'execution-driver.py')
result['fresh_full_suite_selection'] = {'all_sorted_tracked_top_level_tests_selected': True, 'test_file_count': len(expected_tests), 'driver_sha256_matches': True}
(OUT / 'evidence-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'distinct_initial_blobs': len(initial_objects), 'distinct_all_six_runs_blobs': len(hashes), 'runs_verified': len(records), 'initial_ledger_entries': len(ledger), 'fresh_test_file_count': len(expected_tests), 'all_maps_and_logs_verified': True, 'original_audio_evidence_retained': True}))
