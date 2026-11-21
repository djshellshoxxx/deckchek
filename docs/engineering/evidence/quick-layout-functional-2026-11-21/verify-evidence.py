"""Verify retained records and immutable Git bytes; execute no project modules."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
FROZEN = 'e5614ff1b8f7691e8193283a9b6ba01d5a7072ed'
TREE = 'b650f03ed07bbce442b3616357e0d04086f7f1d4'
PREP = '6b854265b92e70e8e95729b8e6da39c3f7619115'
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'


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


def outcomes(raw):
    return [{'number': int(number), 'status': status, 'name': name}
            for status, number, name in re.findall(r'^(ok|not ok) (\d+) - (.+)$', raw.decode(), re.M)]


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--require-originals', action='store_true', help='Require every external retained source to remain available.')
args = parser.parse_args()
manifest = record('manifest.json')
assert manifest['schema'] == 'deckchek.quick-layout-functional-evidence-manifest.v1'
assert manifest['source_commit'] == FROZEN and manifest['source_tree'] == TREE
actual = sorted(str(path.relative_to(HERE)) for path in HERE.rglob('*') if path.is_file() and path.name != 'manifest.json')
assert actual == sorted(manifest['files']) and len(actual) == manifest['file_count'] == 22
for name, expected in manifest['files'].items():
    raw = data(name)
    assert len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], name

retention = record('retention-proof.json')
assert retention['unique_retained_original_files'] == 18
assert retention['original_bindings'] == len(retention['bindings']) == 21
assert len({entry['retained_path'] for entry in retention['bindings']}) == 18
available_originals = 0
for entry in retention['bindings']:
    raw = data(entry['retained_path'])
    assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], entry['retained_path']
    original = Path(entry['original_path'])
    if original.is_file():
        assert original.read_bytes() == raw, str(original)
        available_originals += 1
    else:
        assert not args.require_originals, str(original)

assert text_git('rev-parse', FROZEN + '^{tree}') == TREE
assert text_git('rev-parse', FROZEN + '^') == PREP
blobs = tree_blobs(FROZEN)
assert len(blobs) == 2280
frozen_hashes = {name: sha(raw) for name, raw in blobs.items()}
for name in ['full/tracked-before.json', 'full/tracked-after.json', 'syntax/tracked-before.json', 'syntax/tracked-after.json']:
    assert record(name) == frozen_hashes, name
full, syntax = record('full/result.json'), record('syntax/result.json')
for result, budget, stage in [(full, 600, 'full'), (syntax, 30, 'syntax')]:
    assert result['source_commit'] == result['head_after'] == FROZEN
    assert result['source_tree'] == result['tree_after'] == TREE
    assert result['timed_out'] is False and 0 <= result['execution_elapsed_seconds'] < budget
    assert result['execution_budget_seconds'] == budget
    assert result['termination_signal_after_seconds'] == budget - 5 and result['termination_grace_seconds'] == 5
    assert result['tracked_file_count'] == 2280 and result['tracked_file_inventory_equal'] is True
    assert result['tracked_hash_maps_equal'] is True and result['changed_tracked_paths'] == []
    assert result['node_options'] is None and result['diagnostic_variables_present'] == []
    assert result['status_before'] == result['status_after'] == ''
    assert all(result[key] == value for key, value in record(stage + '/running.json').items())

selection = record('full/authorized-selection.json')
tests = sorted(name for name in blobs if re.fullmatch(r'tests/[^/]+\.test\.mjs', name))
assert selection['source_commit'] == FROZEN and selection['source_tree'] == TREE
assert selection['execution_budget_seconds'] == 600 and selection['expected_tracked_file_count'] == 2280
assert len(tests) == selection['expected_test_file_count'] == full['test_file_count'] == 199
assert tests == selection['test_files'] == record('full/test-files.json')
assert full['argv'] == [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap', *tests]
assert full['node_version'] == 'v24.22.3' and full['runtime']['execPath'] == NODE
assert full['runtime']['platform'] == 'linux' and full['runtime']['arch'] == 'x64'
assert full['environment_changes'] == {'PATH_prefix': str(Path(NODE).parent)}
assert full['driver_sha256'] == sha(data('full/run-full-node.py')) == '281e043de5ebc64a612bbe1e8883805c810ea3592536702258da1cb4f1547b3c'
assert full['config_sha256'] == sha(data('full/authorized-selection.json')) == '63edeb575e417f56587d0fbf428044ab04f3ea67f9a7367dcd4dc283bfaeb9ff'
original = record('preparation/unexecuted-selection.json')
assert original['source_commit'] == PREP and original['source_tree'] == text_git('rev-parse', PREP + '^{tree}')
assert sorted(key for key in original if original[key] != selection[key]) == ['source_commit', 'source_tree']
assert sha(data('preparation/unexecuted-selection.json')) == '6a3b8dc57f3122e0bb3473600f00ee5afe2a7b374837e3bdef521c03d6732766'

tap = data('full/run.tap')
assert len(tap) == full['tap_bytes'] and sha(tap) == full['tap_sha256']
assert data('full/stderr.log') == b'' and full['stderr_bytes'] == 0 and full['stderr_sha256'] == sha(b'')
counts = {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', tap.decode(), re.M)}
assert counts == full['tap_counts']
assert re.findall(r'^1\.\.(\d+)$', tap.decode(), re.M) == [str(counts['tests'])]
observed = outcomes(tap)
assert [item['number'] for item in observed] == list(range(1, counts['tests'] + 1))
assert sum(item['status'] == 'not ok' for item in observed) == counts['fail']
assert sum(' # SKIP' in item['name'] for item in observed) == counts['skipped']
assert counts['pass'] + counts['fail'] + counts['skipped'] == counts['tests']
assert counts['cancelled'] == counts['todo'] == counts['suites'] == 0
assert full['exit_code'] == (1 if counts['fail'] else 0)
summary = record('observed-summary.json')
assert summary['source_commit'] == FROZEN and summary['source_tree'] == TREE
assert summary['full']['outcomes'] == observed and summary['full']['tap_counts'] == counts
assert summary['full']['failures'] == [item for item in observed if item['status'] == 'not ok']
assert summary['full']['skips'] == [item for item in observed if ' # SKIP' in item['name']]
assert summary['full']['result_sha256'] == sha(data('full/result.json'))
assert summary['full']['tap_sha256'] == sha(tap)
assert summary['disposition'] == ('held' if counts['fail'] else 'node-gate-passed')
round7_raw = blobs['docs/engineering/evidence/mobile-export-functional-2026-11-21/focused/run.tap']
round7_names = [item['name'] for item in outcomes(round7_raw)]
current_by_name = {}
for item in observed:
    current_by_name.setdefault(item['name'], []).append(item)
matched = []
for name in round7_names:
    assert len(current_by_name[name]) == 1
    matched.append(current_by_name[name][0])
assert len(matched) == 45 and summary['prior_mobile_focused_coverage'] == matched
assert summary['new_mobile_screen_cases'] == matched[15:19]

source = 'tools/smoke/shell-layout.mjs'
assert syntax['argv'] == [NODE, '--check', source] and syntax['source_path'] == source
assert syntax['exit_code'] == 0
assert syntax['node_version_from_full_gate_record'] == 'v24.22.3'
assert syntax['full_gate_result_sha256'] == sha(data('full/result.json'))
assert syntax['driver_sha256'] == sha(data('syntax/syntax-recorder.py'))
assert syntax['source_sha256_before'] == syntax['source_sha256_after'] == frozen_hashes[source]
assert syntax['source_bytes'] == len(blobs[source]) and data('syntax/checked-shell-layout.mjs') == blobs[source]
for stream in ['stdout', 'stderr']:
    assert data('syntax/syntax.' + stream) == b''
    assert syntax[stream + '_bytes'] == 0 and syntax[stream + '_sha256'] == sha(b'')
assert summary['syntax']['result_sha256'] == sha(data('syntax/result.json'))
assert summary['syntax']['source_sha256'] == frozen_hashes[source]

comparison = record('source-comparison.json')
assert comparison['source_commit'] == FROZEN and comparison['source_tree'] == TREE
assert comparison['original_preparation_commit'] == PREP and comparison['original_preparation_executed'] is False
assert comparison['original_preparation_tree'] == original['source_tree']
assert comparison['pre_freeze_correction_changed_paths'] == text_git('diff', '--name-only', PREP, FROZEN).splitlines()
assert comparison['code_changes_from_round7_integration'] == text_git('diff', '--name-only', comparison['completed_round7_integration'], FROZEN, '--', 'app', 'mobile', 'tests', 'tools').splitlines()
assert comparison['frozen_changed_code_sha256'] == {name: frozen_hashes[name] for name in comparison['code_changes_from_round7_integration']}
for name, hashes in comparison['unchanged_audio_sha256_by_source'].items():
    assert hashes == {commit: sha(git('show', commit + ':' + name)) for commit in hashes}
    assert len(set(hashes.values())) == 1
assert len(comparison['unchanged_audio_sha256_by_source']) == 6
assertion = comparison['audio_session_assertion_change']
audio_old = git('show', comparison['predecessor_complete_gate_commit'] + ':' + assertion['path'])
audio_new = blobs[assertion['path']]
assert sha(audio_old) == assertion['old_sha256'] and sha(audio_new) == assertion['new_sha256']
assert audio_old.count(assertion['original_line'].encode()) == 1
assert audio_old.replace(assertion['original_line'].encode(), assertion['only_change_is_original_line_replaced_with'].encode()) == audio_new
assert assertion['fixture_condition_threshold_unchanged'] is True
mobile = comparison['mobile']
mobile_names = sorted(name for name in blobs if name.startswith('mobile/'))
assert len(mobile_names) == mobile['tracked_file_count'] == 34
assert mobile['sha256'] == {name: frozen_hashes[name] for name in mobile_names}
assert mobile['same_as_round7'] is True and mobile['separate_official_build_executed_this_round'] is False
assert all(git('show', comparison['round7_frozen_commit'] + ':' + name) == blobs[name] for name in mobile_names)
shared = ['core.js', 'advanced.js', 'calibration.js', 'canonical-json.js', 'sha256.js', 'phone-run.js', 'vendor/qr.js']
assert mobile['shared_vendor_pairs'] == len(shared) == 7
assert mobile['shared_sha256'] == {name: frozen_hashes['app/' + name] for name in shared}
assert all(blobs['app/' + name] == blobs['mobile/vendor/' + Path(name).name] for name in shared)
version = '# Copied unchanged from app/ by tools/build-mobile.mjs. Run it again after changing a shared file.\n'
version += ''.join(f"{frozen_hashes['app/' + name]}  {Path(name).name}\n" for name in shared)
assert blobs['mobile/vendor/VERSION'].decode() == version
candidates = sorted(name[7:] for name in mobile_names if name != 'mobile/sw.js' and not name.lower().endswith('.md') and all(not part.startswith('.') for part in name[7:].split('/')))
stamp = sha('\n'.join(f"{name}:{frozen_hashes['mobile/' + name]}" for name in candidates).encode())[:12]
sw = blobs['mobile/sw.js'].decode()
assert re.search(r"const BUILD = '([^']+)';", sw).group(1) == stamp == mobile['independently_derived_build_stamp'] == '8f12f05a2c38'
precache = json.loads(re.search(r'const PRECACHE = (\[[\s\S]*?\]);', sw).group(1))
assert precache == mobile['precache_entries'] == ['./', *['./' + name for name in candidates if name != 'index.html'], './index.html']
assert len(precache) == 33
for key in ['predecessor_complete_gate', 'round7_focused_gate']:
    earlier = comparison[key]
    raw = blobs[earlier['result_path']]
    result = json.loads(raw)
    assert sha(raw) == earlier['result_sha256']
    for field in ['source_commit', 'source_tree', 'tap_sha256', 'tap_counts', 'exit_code']:
        assert earlier[field] == result[field]
assert comparison['predecessor_complete_gate']['tap_counts'] == {'tests': 2391, 'suites': 0, 'pass': 2388, 'fail': 2, 'cancelled': 0, 'skipped': 1, 'todo': 0}
assert comparison['round7_focused_gate']['tap_counts'] == {'tests': 45, 'suites': 0, 'pass': 45, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
print(json.dumps({'manifest_files': len(actual), 'original_bindings': len(retention['bindings']), 'available_originals': available_originals, 'retained_original_files': 18, 'immutable_source_files': len(blobs), 'verified_source_maps': 4, 'ordered_outcomes': len(observed), 'tap_counts': counts, 'source_commit': FROZEN, 'source_tree': TREE, 'mobile_unchanged_files': len(mobile_names), 'mobile_shared_pairs': len(shared), 'mobile_build_stamp': stamp, 'precache_entries': len(precache)}))
