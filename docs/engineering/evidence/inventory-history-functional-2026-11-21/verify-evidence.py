"""Read retained data and immutable Git blobs only; never execute the app or tests."""
from pathlib import Path
import hashlib, io, json, re, subprocess
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda name:json.loads((HERE/name).read_text())
manifest=read('manifest.json')
assert len(manifest['files'])==manifest['file_count']
assert set(manifest['files'])=={p.name for p in HERE.iterdir() if p.is_file() and p.name!='manifest.json'}
for name,item in manifest['files'].items():
 data=(HERE/name).read_bytes();assert len(data)==item['bytes'] and sha(data)==item['sha256'],name
r=read('result.json');s=read('smoke-syntax-result.json');config=read('authorized-selection.json')
commit=manifest['source_commit'];tree=manifest['source_tree']
assert r['source_commit']==s['source_commit']==config['source_commit']==commit
assert r['source_tree']==s['source_tree']==config['source_tree']==tree
assert subprocess.check_output(['git','rev-parse',commit+'^{tree}'],cwd=ROOT,text=True).strip()==tree
names=read('test-files.json');assert names==sorted(set(names))==config['test_files'] and len(names)==r['test_file_count']==16
node='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
assert r['argv']==[node,'--test','--test-concurrency=1','--test-reporter=tap',*names]
assert r['node_version']=='v24.22.3' and r['runtime']['execPath']==node
assert r['execution_budget_seconds']==config['execution_budget_seconds']==120
for record in [r,s]:
 assert record['exit_code']==0 and record['timed_out'] is False
 assert record['node_options'] is None and not record['diagnostic_variables_present']
 assert record['head_after']==commit and record['tree_after']==tree
 assert record['status_before']==record['status_after']==''
 assert record['tracked_file_count']==2147 and record['tracked_hash_maps_equal'] is True
before=read('tracked-before.json');assert before==read('tracked-after.json')==read('tracked-after-syntax.json') and len(before)==2147
entries={}
for entry in subprocess.check_output(['git','ls-tree','-r','-z',commit],cwd=ROOT).split(b'\0'):
 if not entry:continue
 meta,name=entry.split(b'\t',1);mode,kind,oid=meta.split()
 assert kind==b'blob'
 entries[name.decode()]=oid.decode()
assert set(entries)==set(before)
oids=sorted(set(entries.values()))
stream=io.BytesIO(subprocess.check_output(['git','cat-file','--batch'],input=('\n'.join(oids)+'\n').encode(),cwd=ROOT))
digests={}
for oid in oids:
 actual,kind,length=stream.readline().split();assert actual.decode()==oid and kind==b'blob'
 data=stream.read(int(length));assert stream.read(1)==b'\n';digests[oid]=sha(data)
assert not stream.read()
assert {name:digests[oid] for name,oid in entries.items()}==before
raw=(HERE/'run.tap').read_bytes();text=raw.decode()
assert len(raw)==r['tap_bytes']==30894 and sha(raw)==r['tap_sha256']=='fbbe75bc702bd34678a6590051982b79c1a8a72ca8b4625b1f7d2bbfe104d0fd'
counts={k:int(v) for k,v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
assert counts==r['tap_counts']=={'tests':130,'suites':0,'pass':130,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert text.startswith('TAP version 13\n') and re.search(r'^1\.\.130$',text,re.M) and not re.search(r'^not ok ',text,re.M)
cases=[{'number':int(n),'title':title} for n,title in re.findall(r'^ok (\d+) - (.*)$',text,re.M)]
assert [case['number'] for case in cases]==list(range(1,131))
assert cases==read('observed-summary.json')['observed_cases']
assert (HERE/'stderr.log').read_bytes()==b'' and r['stderr_bytes']==0
assert sha((HERE/'run-focused-node.py').read_bytes())==r['driver_sha256']
assert sha((HERE/'authorized-selection.json').read_bytes())==r['config_sha256']
assert s['argv']==[node,'--check','tools/smoke/inventory-history.mjs']
assert s['source_sha256_before']==s['source_sha256_after']==before[s['source_path']]
assert s['execution_budget_seconds']==30 and s['execution_elapsed_seconds']<30
assert s['stdout_bytes']==s['stderr_bytes']==0
assert (HERE/'smoke-syntax.stdout').read_bytes()==(HERE/'smoke-syntax.stderr').read_bytes()==b''
assert sha((HERE/'run-smoke-syntax.py').read_bytes())==s['driver_sha256']
proof=read('retention-proof.json');assert len(proof['retained_files'])==15 and proof['all_byte_equal'] is True
originals_present=0
for item in proof['retained_files']:
 data=(HERE/item['copy']).read_bytes();assert len(data)==item['bytes'] and sha(data)==item['sha256'] and item['byte_equal'] is True
 source=Path(item['source'])
 if source.exists():assert source.read_bytes()==data;originals_present+=1
comparison=read('changed-source-comparison.json')
assert len(comparison['files'])==11
for item in comparison['files']:assert before[item['path']]==item['source_sha256']
print(json.dumps({'verified':True,'manifest_files':len(manifest['files']),'immutable_tracked_hashes':len(before),'test_files':len(names),'passed_cases':len(cases),'original_copies_compared':originals_present,'smoke_syntax_exit':s['exit_code']}))
