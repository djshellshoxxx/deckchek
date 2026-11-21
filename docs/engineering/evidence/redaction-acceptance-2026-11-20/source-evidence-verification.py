from pathlib import Path
import datetime, hashlib, json, re, shutil, subprocess
ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-redaction-functional-fresh')
OUT = Path(__file__).resolve().parent
FROZEN = '6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6'
FROZEN_TREE = '7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a'
AUTHOR = '7743813078381bbff713bf4609d5bb403188f269'
AUTHOR_TREE = '0f695d9f92adca65edf9a7652770051b63dbd0af'
BASE = '6cd827b0204bc450b8fc6236a179c7383dd52911'
PRELIMINARY = '7a5d13717d9c978141bea5e87d9c3108df06e9be'
EVIDENCE = ROOT/'docs/engineering/evidence/redaction-functional-2026-11-20'
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)
def git_text(*args):
    return git(*args).decode().strip()
def sha(data):
    return hashlib.sha256(data).hexdigest()
def blob(commit, path):
    return git('show', f'{commit}:{path}')
def parse_tap(data):
    text = data.decode()
    return {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]+)$', text, re.M)}
assert git_text('rev-parse', 'HEAD') == FROZEN
assert git_text('rev-parse', 'HEAD^{tree}') == FROZEN_TREE
assert git_text('rev-parse', AUTHOR+'^{tree}') == AUTHOR_TREE
freeze = json.loads((EVIDENCE/'source-freeze.json').read_text())
changed = git_text('diff', '--name-only', BASE, AUTHOR).splitlines()
assert changed == freeze['changed_paths']
source_hashes = {}
for path in changed:
    author_hash, frozen_hash, working_hash = sha(blob(AUTHOR, path)), sha(blob(FROZEN, path)), sha((ROOT/path).read_bytes())
    assert author_hash == frozen_hash == working_hash == freeze['changed_sha256'][path]
    source_hashes[path] = {'author_sha256': author_hash, 'frozen_sha256': frozen_hash, 'working_sha256': working_hash}
author_to_frozen = git_text('diff', '--name-only', AUTHOR, FROZEN).splitlines()
assert all(p.startswith('docs/') for p in author_to_frozen)
comment_diff = git_text('diff', '--numstat', PRELIMINARY, AUTHOR).splitlines()
assert comment_diff == ['1\t1\tapp/diagnostics-bundle.js', '1\t1\tsrc-tauri/src/diagnostics.rs']
vector_path = 'tests/fixtures/redaction-vectors.json'
original_vectors = json.loads(blob(BASE, vector_path))
vectors = json.loads(blob(FROZEN, vector_path))
assert len(original_vectors) == 19 and len(vectors) == 47
assert vectors[:len(original_vectors)] == original_vectors
assert len({v['name'] for v in vectors}) == len(vectors)
checksums = []
for line in (EVIDENCE/'SHA256SUMS').read_text().splitlines():
    expected, name = line.split('  ', 1)
    actual = sha((EVIDENCE/name).read_bytes())
    assert expected == actual
    checksums.append({'path': name, 'sha256': actual})
focused = json.loads((EVIDENCE/'focused.json').read_text())
focused_tap = (EVIDENCE/'focused.tap').read_bytes()
counts = parse_tap(focused_tap)
assert counts == focused['tap_counts'] == {'tests':60,'suites':0,'pass':60,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert sha(focused_tap) == focused['tap_sha256'] == '0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96'
assert len(focused_tap) == focused['tap_bytes'] == 11311
before = json.loads((EVIDENCE/'tracked-before.json').read_text())
after = json.loads((EVIDENCE/'tracked-after.json').read_text())
assert before == after and len(before) == 1817
names_at_author = set(git('ls-tree','-rz','--name-only',AUTHOR).decode().split('\0')) - {''}
assert set(before) == names_at_author
assert focused['source_commit'] == focused['head_after'] == AUTHOR
assert focused['source_tree'] == focused['tree_after'] == AUTHOR_TREE
assert focused['status_before'] == focused['status_after'] == ''
assert focused['tracked_hash_maps_equal'] and focused['exit_code'] == 0 and not focused['timed_out']
assert focused['node_version'] == 'v24.22.3'
assert all(before[p] == values['author_sha256'] for p,values in source_hashes.items())
ac6_prefix = '- AC-6 '
def ac6(commit):
    return next(line for line in blob(commit,'docs/specs/02-diagnostics-bundle.md').decode().splitlines() if line.startswith(ac6_prefix))
assert ac6(BASE) == ac6(FROZEN)
reports = ['REDACTION_CODE_AUDIT_2026-11-20.md','REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md','REDACTION_SECURITY_AUDIT_2026-11-20.md','ACQUISITION_QUALIFIED_MERGE_2026-11-20.md']
result = {
    'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'method': 'Static Git object comparison, JSON parsing, retained TAP parsing and SHA-256 hashing; no application execution by this script.',
    'source_commit': FROZEN, 'source_tree': FROZEN_TREE,
    'author_source_commit': AUTHOR, 'author_source_tree': AUTHOR_TREE,
    'assigned_prior_base': BASE,
    'author_changed_paths': changed, 'changed_source_hashes': source_hashes,
    'author_to_frozen_changed_paths': author_to_frozen,
    'all_author_to_frozen_differences_are_documentation_or_evidence': True,
    'preliminary_to_author_numstat': comment_diff,
    'vectors': {'original_count': len(original_vectors), 'total_count': len(vectors), 'added_count': len(vectors)-len(original_vectors), 'original_objects_unchanged_and_in_order': True, 'unique_names': True, 'added_names': [v['name'] for v in vectors[len(original_vectors):]]},
    'author_evidence_sha256_inventory_verified': checksums,
    'author_focused_result': {'source_commit': AUTHOR, 'source_tree': AUTHOR_TREE, 'node_version': focused['node_version'], 'tap_counts': counts, 'tap_bytes': len(focused_tap), 'tap_sha256': sha(focused_tap), 'exit_code': focused['exit_code'], 'timed_out': focused['timed_out'], 'tracked_hash_maps_equal': True, 'tracked_hash_map_count': len(before), 'map_keys_equal_author_tracked_paths': True, 'changed_paths_match_author_map': True, 'clean_boundaries_reported': True, 'attribution': 'Retained author execution; independently verified static records, not rerun by fresh acceptance.'},
    'ac6_unchanged_from_prior_base': True, 'ac6': ac6(FROZEN),
    'prior_reports_sha256': {name:sha((ROOT/'docs/engineering'/name).read_bytes()) for name in reports},
    'native_tool_lookup': {name:shutil.which(name) for name in ('rustc','cargo','rustfmt')},
    'native_execution': False, 'native_format_check': False,
    'limits': ['Source parity is static; native compile and runtime parity require exact-source CI.', 'Wrapped paths remain a syntactic heuristic; bare/raw JSON values and ambiguous wrapped prose retain issue #69 scope.', 'AC-6 remains unchanged and this narrow slice does not establish complete satisfaction.']
}
(OUT/'source-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'source': FROZEN,'changed_paths':len(changed),'vectors':result['vectors']['total_count'],'author_tests':counts,'author_tracked_count':len(before),'all_author_to_frozen_differences_are_documentation_or_evidence':True,'ac6_unchanged':True,'native_tool_lookup':result['native_tool_lookup']}))
