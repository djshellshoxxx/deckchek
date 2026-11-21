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
bindings=[]
for name,commit,n,passed,failed,exit_code,length,digest,driver in [
 ('runner-message','5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3',18,18,0,0,4592,'0f06673c12933ab9707110356c3d073cf895ce9adc73a8584a91c5c87ef2ebf7','run-command.py'),
 ('two-file-aggregate','f26c247a44a70dd1e19f08ee1bee6dad7fe2f864',33,31,2,1,17250,'a0e332853ada66bfb42194b0a7aaabf552df5464c4023d538a9d0cd0787e3802','run-aggregate.py')]:
 folder=here/name;meta=read(folder/'result.json');entries=inventory(commit)
 before,after=read(folder/'tracked-before.json'),read(folder/'tracked-after.json')
 assert before==after and set(before)==set(entries) and len(before)==meta['tracked_file_count']
 assert all(before[path]==blob_hash(oid) for path,oid in entries.items())
 assert meta['source_commit']==meta['head_after']==commit
 assert meta['source_tree']==meta['tree_after']==git('rev-parse',commit+'^{tree}').decode().strip()
 assert meta['status_before']==meta['status_after']=='' and not meta['timed_out'] and meta['tracked_hash_maps_equal']
 assert meta['node_version']=='v24.22.3' and meta['node_options'] is None
 raw=(folder/'run.tap').read_bytes();err=(folder/'stderr.log').read_bytes()
 expected=dict(tests=n,suites=0,**{'pass':passed},fail=failed,cancelled=0,skipped=0,todo=0)
 assert len(raw)==meta['tap_bytes']==length and sha(raw)==meta['tap_sha256']==digest
 assert counts(raw)==meta['tap_counts']==expected and meta['exit_code']==exit_code
 assert len(err)==meta['stderr_bytes']==0 and sha(err)==meta['stderr_sha256']
 assert sha((here/driver).read_bytes())==meta['driver_sha256']
 assert re.findall(r'^# Subtest: (.*)$',raw.decode(),re.M)==read(folder/'actual-execution-order.json')['subtests']
 bindings.append(dict(run=name,commit=commit,tree=meta['source_tree'],tracked_files=len(before),distinct_blobs=len(set(entries.values())),all_tracked_bytes_match_git=True,original_case_order_verified=True,counts=expected))
prior_order=[case['name'] for case in read(here.parent/'audio-numerical-functional-2026-11-20/unchanged-selection/actual-execution-order.json')['cases']]
assert len(prior_order)==33
assert read(here/'runner-message/actual-execution-order.json')['subtests']==prior_order[15:]
assert read(here/'two-file-aggregate/actual-execution-order.json')['subtests']==prior_order
base='8dbef3a91f4d88d01ec5a570265258443fd7f3cc';msg='5b340667e21c2d7d5bf25ed7116ed1b21cc3acb3';agg='f26c247a44a70dd1e19f08ee1bee6dad7fe2f864'
for name,commit,path in [('original-audio-runner-lifecycle.test.mjs',base,'tests/audio-runner-lifecycle.test.mjs'),('message-instrumented-test.mjs',msg,'tests/audio-runner-lifecycle.test.mjs'),('aggregate-instrumented-test.mjs',agg,'tests/audio-runner-lifecycle.test.mjs'),('aggregate-serializer.mjs',agg,'tools/diagnostics/audio-context-serialize.mjs')]: assert (here/name).read_bytes()==git('show',commit+':'+path)
assert (here/'retry-message.patch').read_bytes()==git('diff',base,msg,'--','tests/audio-runner-lifecycle.test.mjs')
assert (here/'aggregate-test.patch').read_bytes()==git('diff',msg,agg,'--','tests/audio-runner-lifecycle.test.mjs','tools/diagnostics/audio-context-serialize.mjs')
production={}
for path in ['app/audio-quality.js','app/calibration.js','app/core.js','app/devices/audio-session.js','app/ui/devices/audio-runner.js','tests/audio-quality.test.mjs']:
 hashes={commit:sha(git('show',commit+':'+path)) for commit in [base,msg,agg]};assert len(set(hashes.values()))==1;production[path]=hashes
original=(here/'original-audio-runner-lifecycle.test.mjs').read_bytes();final=(here/'aggregate-instrumented-test.mjs').read_bytes()
assert re.findall(rb'^test\((.+)$',original,re.M)==re.findall(rb'^test\((.+)$',final,re.M)
assert len(re.findall(rb'^test\(',final,re.M))==18 and len(re.findall(rb'\bassert\.',original))==len(re.findall(rb'\bassert\.',final))==118
folder=here/'two-file-aggregate';meta=read(folder/'result.json');raw=(folder/'contexts.json').read_bytes()
assert len(raw)==meta['context_bytes']==144256 and sha(raw)==meta['context_sha256']=='872571803365a4bcfbd23ed31c921902d614c248ad34f1ec3ab07e2626521a6a'
c=json.loads(raw);rows=c['results'];live=[r for r in rows if r['source']=='live'];files=[r for r in rows if r['source']=='file']
assert len(rows)==10 and len(live)==8 and len(files)==2
assert all(r['input']==live[0]['input'] and r['playback'][-1]==live[0]['playback'][-1] for r in live)
assert all(r['input'] is None and r['captureOptions'] is None for r in files)
assert [r['result']['status'] for r in rows[:3]]==['pass','pass','fail'] and [r['fixtureAttemptAtFinish'] for r in rows[:3]]==[1,1,2]
assert all(r['playback'][-1]['options']['levelDbfs']==-12 for r in live)
retry=rows[2]['result'];metrics={m['metricId']:m['value'] for m in retry['measurements']}
for key,value in {'aq_gain_db':-110,'aq_balance_db':-220,'aq_response_flatness_db':220,'aq_polarity_inverted':1,'aq_thd_percent':6935867070.3903,'aq_clock_offset_ppm':0,'aq_latency_ms':4.4}.items(): assert metrics[key]==value
assert all(r['devLeftDb']==220 and r['devRightDb']==0 for r in retry['extra']['response'])
assert any(f['id']=='aq-channel_dead' and 'left' in f['title'] for f in retry['findings'])
tap=(folder/'run.tap').read_text();lines=[line for line in tap.splitlines() if '[AQ-RETRY-CONTEXT]' in line];assert len(lines)==1
message=json.loads(lines[0].split('[AQ-RETRY-CONTEXT] ',1)[1]);assert message==read(folder/'extracted-retry-message.json') and message['result']==retry and message['calls']==rows[2]['callsAtFinish']
assert '16972224339301138 vs 4.347826086956522' in tap
assert '[AQ-RETRY-CONTEXT]' not in (here/'runner-message/run.tap').read_text()
historical=[]
for relative,length,digest in [('redaction-acceptance-2026-11-20/full-suite.tap',530581,'39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197'),('player-reference-acceptance-2026-11-20/full-suite.tap',541141,'29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4'),('audio-numerical-functional-2026-11-20/unchanged-selection/run.tap',8482,'72372175dab192c8e851037de477f6084b11beeed8b4dda8a726f5c1040dfc69')]:
 raw=(here.parent/relative).read_bytes();assert len(raw)==length and sha(raw)==digest;historical.append(dict(path=relative,bytes=length,sha256=digest,counts=counts(raw)))
cat.stdin.close();assert cat.wait()==0
result={'verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Retained-byte and Git-blob verification only; no project import, test rerun or analyzer call.','source_bindings':bindings,'distinct_git_blobs_hashed':len(cache),'unchanged_production_and_quality_test':production,'runner_case_declarations_identical':True,'runner_assertion_call_count':118,'historical_complete_logs':historical,'observations':{'finish_results':10,'live_results':8,'file_results':2,'all_live_post_suite_input_identities_equal':True,'all_live_last_playback_identity_and_options_equal':True,'retry_immediate_message_matches_final_result':True,'file_inputs_explicitly_unobserved':True},'project_runtime_invocations_in_round':2,'third_runtime_invocation':'Not executed or queued.','qualification':'Both failures reproduced; no cause, raw-fit observation, pre-analysis input identity proof or production repair established.','result':'verified'}
(here/'evidence-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['result','source_bindings','distinct_git_blobs_hashed','observations']}))
