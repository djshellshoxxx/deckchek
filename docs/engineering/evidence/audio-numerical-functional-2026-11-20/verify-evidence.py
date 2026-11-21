"""Read-only evidence/Git verification; imports no app/test and executes no analyzer."""
from pathlib import Path
import datetime, hashlib, json, re, subprocess
here = Path(__file__).resolve().parent
root = here.parents[3]
def sha(raw): return hashlib.sha256(raw).hexdigest()
def read(path): return json.loads(path.read_text())
def git(*args): return subprocess.check_output(['git', *args], cwd=root)
def counts(raw):
    return {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw.decode(), re.M)}
def inventory(commit):
    entries = {}
    for record in git('ls-tree', '-rz', '--full-tree', commit).split(b'\0'):
        if not record: continue
        spec, name = record.split(b'\t', 1)
        mode, kind, oid = spec.decode().split()
        assert kind == 'blob'
        entries[name.decode()] = oid
    return entries
cat = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
cache = {}
def blob_hash(oid):
    if oid not in cache:
        cat.stdin.write((oid + '\n').encode()); cat.stdin.flush()
        header = cat.stdout.readline().decode().split()
        assert header[0] == oid and header[1] == 'blob'
        raw = cat.stdout.read(int(header[2])); assert cat.stdout.read(1) == b'\n'
        cache[oid] = sha(raw)
    return cache[oid]
bindings = []
for name in ['unchanged-selection', 'diagnostic-1-default']:
    folder = here / name
    meta = read(folder / 'result.json')
    before, after = read(folder / 'tracked-before.json'), read(folder / 'tracked-after.json')
    commit = meta['source_commit']; entries = inventory(commit)
    assert before == after and set(before) == set(entries)
    assert len(before) == meta['tracked_file_count']
    assert all(before[path] == blob_hash(oid) for path, oid in entries.items())
    assert git('rev-parse', commit + '^{tree}').decode().strip() == meta['source_tree']
    assert meta['head_after'] == commit and meta['tree_after'] == meta['source_tree']
    assert meta['status_before'] == meta['status_after'] == ''
    assert meta['tracked_hash_maps_equal'] is True and meta['timed_out'] is False
    assert meta['node_version'] == 'v24.22.3' and meta['node_options'] is None
    if name == 'unchanged-selection':
        raw = (folder / 'run.tap').read_bytes()
        assert sha(raw) == meta['tap_sha256'] == '72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69'
        assert len(raw) == meta['tap_bytes'] == 8482
        assert counts(raw) == meta['tap_counts'] == dict(tests=33, suites=0, **{'pass':32}, fail=1, cancelled=0, skipped=0, todo=0)
        assert meta['exit_code'] == 1
        assert '3 of 9 checks failed: balance, response, polarity.' in raw.decode()
        actual_names = re.findall(r'^# Subtest: (.*)$', raw.decode(), re.M)
        assert actual_names == [c['name'] for c in read(folder / 'actual-execution-order.json')['cases']]
        assert len(actual_names) == 33
    else:
        raw = (folder / 'output.json').read_bytes()
        assert sha(raw) == meta['output_sha256'] == '50536744fd47b60e21fb173db9cc5a8f944d48bf55e8a79a03f5a35576b5ed62'
        assert len(raw) == meta['output_bytes'] == 139002
        assert meta['exit_code'] == 0 and meta['analyzer_calls'] == 6
        stderr = (folder / 'stderr.log').read_bytes()
        assert len(stderr) == meta['stderr_bytes'] == 0 and sha(stderr) == meta['stderr_sha256']
        assert sha((here / 'run-diagnostic.py').read_bytes()) == meta['driver_sha256']
        assert sha((folder / 'tool-source.mjs').read_bytes()) == before['tools/diagnostics/audio-numerical-context.mjs']
    bindings.append(dict(run=name, commit=commit, tree=meta['source_tree'], tracked_files=len(entries), distinct_blobs=len(set(entries.values())), all_tracked_bytes_match_git=True))
diagnostic = read(here / 'diagnostic-1-default/output.json')
assert diagnostic['sequence'] == ['clean', 'cubic', 'runner', 'clean', 'cubic', 'runner']
assert diagnostic['analyzerCalls'] == 6
assert diagnostic['inputBefore'] == diagnostic['inputAfter'] and diagnostic['inputUnchanged'] is True
outputs, comparisons = diagnostic['pipelineOutputs'], diagnostic['comparisons']
assert len(outputs) == len(comparisons) == 6
repeat_equal = [outputs[i]['snapshot'] == outputs[i+3]['snapshot'] and outputs[i]['snapshotSha256'] == outputs[i+3]['snapshotSha256'] for i in range(3)]
assert all(repeat_equal)
assert all(c['slice']['channelsByteEqual'] and c['left']['sampleSha256'] == c['right']['sampleSha256'] for c in comparisons)
assert all(p['snapshot']['analysis']['channels']['L']['fit'] == p['snapshot']['analysis']['channels']['R']['fit'] for p in outputs)
max_coefficient_difference = max(abs(a-b) for c in comparisons for ch in ['left','right'] for a,b in zip(c[ch]['returnedCoefficients'],c[ch]['independentCoefficients']))
max_normal_residual = max(abs(v) for c in comparisons for ch in ['left','right'] for v in c[ch]['normalResidual'])
max_direct_correlation = max(abs(v) for c in comparisons for ch in ['left','right'] for v in c[ch]['residualCorrelations'])
source_files = ['app/audio-quality.js','app/calibration.js','tests/audio-quality.test.mjs','tests/audio-runner-lifecycle.test.mjs']
source_commits = ['6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6','f081881d4979e4385f255163660258784e27a264','ded34d2dccfcf0ae51c78fa1492a57c161d32a1d','c67bd2a5d2bbe37ce0e97e0e8db4962a14c706ce','c64d6b88c98f33a2ff42529f4e9235f005a047ee']
source_equality = {}
for name in source_files:
    hashes = {commit: sha(git('show', commit+':'+name)) for commit in source_commits}
    assert len(set(hashes.values())) == 1
    assert next(iter(hashes.values())) == diagnostic['sourceHashes'][name]
    source_equality[name] = hashes
historical = []
for relative, length, digest, expected in [
    ('redaction-acceptance-2026-11-20/full-suite.tap',530581,'39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197',{'tests':2314,'pass':2312,'fail':1,'skipped':1}),
    ('player-reference-acceptance-2026-11-20/full-suite.tap',541141,'29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4',{'tests':2357,'pass':2354,'fail':2,'skipped':1})]:
    raw = (here.parent/relative).read_bytes()
    assert len(raw) == length and sha(raw) == digest
    observed = counts(raw); assert all(observed[k] == v for k,v in expected.items())
    historical.append(dict(path=relative,bytes=length,sha256=digest,counts=observed))
prefix_raw = (here.parent/'player-capture-functional-2026-11-20/audio-prefix-context/run.tap').read_bytes()
prefix_names = re.findall(r'^# Subtest: (.*)$',prefix_raw.decode(),re.M)
assert prefix_names[:15] == actual_names[:15] and len(prefix_names) == 33
cat.stdin.close(); assert cat.wait() == 0
result = {
    'verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope':'Retained-byte and Git-blob verification only; no project import, test rerun or new analyzer call.',
    'source_bindings':bindings,'distinct_git_blobs_hashed':len(cache),'source_equality':source_equality,
    'historical_complete_taps':historical,
    'earlier_prefix_context':{'sha256':sha(prefix_raw),'counts':counts(prefix_raw),'first_15_case_names_match_audio_quality':True,'limitation':'Earlier argv predecessor selection did not establish original full-suite predecessor execution order.'},
    'diagnostic_observations':{'input_batches_unchanged':True,'repeat_snapshots_equal':repeat_equal,'tone_channel_bytes_equal':True,'returned_channel_fits_equal':True,'max_returned_vs_independent_coefficient_difference':max_coefficient_difference,'max_normal_equation_residual':max_normal_residual,'max_direct_residual_correlation':max_direct_correlation},
    'project_runtime_invocations_in_round':2,
    'conditional_diagnostic_2':'Not executed; numerical-inconsistency condition was not met.',
    'result':'verified'}
(here/'evidence-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['result','source_bindings','distinct_git_blobs_hashed','diagnostic_observations']}))
