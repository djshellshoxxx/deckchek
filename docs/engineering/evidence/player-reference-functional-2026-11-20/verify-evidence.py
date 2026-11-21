"""Static source/evidence checks only; imports no application or test code."""
from pathlib import Path
import hashlib, json, re, subprocess

base=Path(__file__).resolve().parent
root=base.parents[3]
def git(*args):
    return subprocess.check_output(['git',*args],cwd=root)
def digest(raw):
    return hashlib.sha256(raw).hexdigest()
def read(name):
    return json.loads((base/name).read_text())
cache={}
results={}
for name in ['pdf-original','combined-focused','player-smoke-syntax','pdf-smoke-syntax']:
    meta=read(name+'/result.json')
    commit=meta['source_commit']
    assert git('rev-parse',commit+'^{tree}').decode().strip()==meta['source_tree']
    entries={}
    for entry in git('ls-tree','-r','-z',commit).split(b'\0'):
        if not entry: continue
        info,path=entry.split(b'\t',1)
        mode,kind,sha=info.decode().split()
        assert kind=='blob'
        entries[path.decode()]=sha
    before=read(name+'/tracked-before.json')
    after=read(name+'/tracked-after.json')
    assert before==after and set(before)==set(entries)
    assert len(before)==meta['tracked_file_count']
    for path,sha in entries.items():
        if sha not in cache: cache[sha]=digest(git('cat-file','blob',sha))
        assert before[path]==cache[sha],(name,path)
    assert meta['head_after']==commit and meta['tree_after']==meta['source_tree']
    assert meta['status_before']==meta['status_after']=='' and meta['tracked_hash_maps_equal']
    raw=(base/name/'run.tap').read_bytes()
    counts={key:int(value) for key,value in re.findall(rb'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',raw,re.M)}
    counts={key.decode():value for key,value in counts.items()}
    assert counts==meta['tap_counts']
    assert len(raw)==meta['tap_bytes'] and digest(raw)==meta['tap_sha256']
    assert meta['node_version']=='v24.22.3' and meta['exit_code']==0 and not meta['timed_out']
    if name=='pdf-original': assert counts['tests']==counts['pass']==28 and counts['fail']==0
    elif name=='combined-focused': assert counts['tests']==counts['pass']==132 and counts['fail']==0
    else: assert not counts and not raw and '--check' in meta['argv']
    results[name]={'source':commit,'tree':meta['source_tree'],'tracked_files':len(before),
        'counts':counts,'log_bytes':len(raw),'log_sha256':digest(raw),'unchanged_and_immutable':True}

test_source=read('combined-focused/result.json')['source_commit']
production_source='447019568d6a0cc0ce0fe16412e9ac99c204f604'
subprocess.run(['git','diff','--quiet',production_source,test_source,'--','app','src-tauri','database','.github'],cwd=root,check=True)
initial='e280dac39b435d2ce8175b558c71a69d1a3e5182'
changed=git('diff','--name-only',initial,production_source).decode().splitlines()
assert changed==['app/report-pdf.js','app/ui/screens/player-capture.js']
assert git('show',test_source+':docs/SPEC-10-CDJ-media-player-diagnostics.md')==git('show',initial+':docs/SPEC-10-CDJ-media-player-diagnostics.md')
original_diff=git('diff','--name-only','099c99c055322ef668be23e6ae50a2968614cc6d','5cc916eefbeb3e174edf9bdbcd6c731d6776e56d').decode().splitlines()
assert original_diff==['app/report-pdf.js','tests/report-pdf.test.mjs']
audio_path=root/'docs/engineering/evidence/redaction-acceptance-2026-11-20/full-suite.tap'
assert digest(audio_path.read_bytes())=='39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197'
out={'method':'Static Git tree/blob and retained byte checks only; no project execution.',
    'results':results,'distinct_git_blobs_verified':len(cache),'production_source':production_source,
    'production_equal':True,'coordinated_source_changes':changed,'original_pdf_candidate_paths':original_diff,
    'spec10_unchanged':True,'original_audio_failure_unchanged':True,
    'driver_sha256':digest((base/'run-command.py').read_bytes())}
print(json.dumps(out,indent=2))
