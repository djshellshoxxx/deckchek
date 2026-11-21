"""Record the one separately authorized syntax check; no browser or native run."""
from pathlib import Path
import datetime, hashlib, json, os, signal, subprocess, time
ROOT=Path('/workspace/scratch/6f2247f2f463/deckchek-inventory-functional')
OUT=Path('/workspace/scratch/6f2247f2f463/deckchek-inventory-round5-raw')
COMMIT='bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0'
TREE='c897840779dcf999ccfde6815cf8cf82062fed59'
NODE='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
SOURCE='tools/smoke/inventory-history.mjs'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
utc=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
assert OUT.is_dir() and not (OUT/'smoke-syntax-result.json').exists()
assert not (OUT/'smoke-syntax.stdout').exists() and not (OUT/'smoke-syntax.stderr').exists()
assert git('rev-parse','HEAD')==COMMIT and git('rev-parse','HEAD^{tree}')==TREE
assert not git('status','--porcelain=v1','--untracked-files=all')
assert not any(k=='NODE_OPTIONS' or k=='DECKCHEK_AUDIO_CONTEXT_PATH' or k.startswith('DECKCHEK_AUDIO_FIT_') for k in os.environ)
raw=(ROOT/SOURCE).read_bytes()
meta={'schema':'deckchek.inventory-history-smoke-syntax.v1','source_commit':COMMIT,'source_tree':TREE,'source_path':SOURCE,'source_bytes':len(raw),'source_sha256_before':sha(raw),'argv':[NODE,'--check',SOURCE],'cwd':str(ROOT),'node_options':None,'diagnostic_variables_present':[],'driver_sha256':sha(Path(__file__).read_bytes()),'execution_budget_seconds':30,'termination_signal_after_seconds':25,'termination_grace_seconds':5,'started_at_utc':utc(),'status_before':''}
(OUT/'smoke-syntax-running.json').write_text(json.dumps(meta,indent=2)+'\n')
start=time.monotonic();timed_out=False
with (OUT/'smoke-syntax.stdout').open('wb') as stdout,(OUT/'smoke-syntax.stderr').open('wb') as stderr:
 p=subprocess.Popen(meta['argv'],cwd=ROOT,stdout=stdout,stderr=stderr,start_new_session=True)
 try:code=p.wait(timeout=max(0,25-(time.monotonic()-start)))
 except subprocess.TimeoutExpired:
  timed_out=True;os.killpg(p.pid,signal.SIGTERM)
  try:code=p.wait(timeout=max(0,30-(time.monotonic()-start)))
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
meta.update({'completed_at_utc':utc(),'execution_elapsed_seconds':time.monotonic()-start,'exit_code':code,'timed_out':timed_out,'source_sha256_after':sha((ROOT/SOURCE).read_bytes()),'head_after':git('rev-parse','HEAD'),'tree_after':git('rev-parse','HEAD^{tree}'),'status_after':git('status','--porcelain=v1','--untracked-files=all')})
for name in ['stdout','stderr']:
 data=(OUT/f'smoke-syntax.{name}').read_bytes();meta[f'{name}_bytes']=len(data);meta[f'{name}_sha256']=sha(data)
before=json.loads((OUT/'tracked-before.json').read_text());after={name:sha((ROOT/name).read_bytes()) for name in before}
(OUT/'tracked-after-syntax.json').write_text(json.dumps(after,indent=2)+'\n')
meta.update({'tracked_file_count':len(after),'tracked_hash_maps_equal':before==after})
(OUT/'smoke-syntax-result.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta))
assert before==after and meta['source_sha256_before']==meta['source_sha256_after'] and meta['head_after']==COMMIT and meta['tree_after']==TREE and not meta['status_after']
raise SystemExit(0 if code==0 else 1)
