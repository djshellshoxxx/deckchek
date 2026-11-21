"""Retain one separately authorized Quick Check shell-layout smoke syntax check; no browser execution."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import signal
import subprocess
import time

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-quick-layout-functional')
OUT = Path('/workspace/scratch/6f2247f2f463/deckchek-quick-layout-round8-syntax-raw')
FULL_GATE = Path('/workspace/scratch/6f2247f2f463/deckchek-quick-layout-round8-raw')
COMMIT = 'e5614ff1b8f7691e8193283a9b6ba01d5a7072ed'
TREE = 'b650f03ed07bbce442b3616357e0d04086f7f1d4'
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
SOURCE = 'tools/smoke/shell-layout.mjs'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args, binary=False):
    raw = subprocess.check_output(['git', *args], cwd=ROOT)
    return raw if binary else raw.decode().strip()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

def tracked_names():
    return sorted(n for n in git('ls-files', '-z', binary=True).decode().split('\0') if n)

def snapshot(names):
    return {name: sha((ROOT / name).read_bytes()) for name in names}

assert not OUT.exists(), 'First syntax outcome already exists; no rerun permitted'
assert not OUT.is_relative_to(ROOT)
assert git('rev-parse', 'HEAD') == COMMIT and git('rev-parse', 'HEAD^{tree}') == TREE
assert not git('status', '--porcelain=v1', '--untracked-files=all')
assert not any(k == 'NODE_OPTIONS' or k == 'DECKCHEK_AUDIO_CONTEXT_PATH' or k.startswith('DECKCHEK_AUDIO_FIT_') for k in os.environ)
full_raw = (FULL_GATE / 'result.json').read_bytes()
full = json.loads(full_raw)
assert full['source_commit'] == COMMIT and full['source_tree'] == TREE
assert full['node_version'] == 'v24.22.3'
names = tracked_names()
assert len(names) == 2280 and SOURCE in names
before = snapshot(names)
assert before == json.loads((FULL_GATE / 'tracked-after.json').read_text())
source_raw = (ROOT / SOURCE).read_bytes()
OUT.mkdir(mode=0o700)
save('tracked-before.json', before)
(OUT / 'syntax-recorder.py').write_bytes(Path(__file__).read_bytes())
(OUT / 'checked-shell-layout.mjs').write_bytes(source_raw)
argv = [NODE, '--check', SOURCE]
meta = {
    'schema': 'deckchek.quick-layout-smoke-syntax.v1',
    'source_commit': COMMIT, 'source_tree': TREE, 'cwd': str(ROOT),
    'source_path': SOURCE, 'source_bytes': len(source_raw), 'source_sha256_before': sha(source_raw),
    'argv': argv, 'node_version_from_full_gate_record': full['node_version'],
    'full_gate_result_sha256': sha(full_raw),
    'node_options': None, 'diagnostic_variables_present': [],
    'driver_sha256': sha(Path(__file__).read_bytes()),
    'execution_budget_seconds': 30, 'termination_signal_after_seconds': 25, 'termination_grace_seconds': 5,
    'started_at_utc': utc(), 'status_before': '', 'tracked_file_count': len(names),
    'scope': 'One syntax parse only; no module evaluation, browser/native launch, complete suite or diagnostic collector.',
}
save('running.json', meta)
start = time.monotonic()
timed_out = False
with (OUT / 'syntax.stdout').open('wb') as stdout, (OUT / 'syntax.stderr').open('wb') as stderr:
    proc = subprocess.Popen(argv, cwd=ROOT, stdout=stdout, stderr=stderr, start_new_session=True)
    try:
        code = proc.wait(timeout=max(0, 25 - (time.monotonic() - start)))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            code = proc.wait(timeout=max(0, 30 - (time.monotonic() - start)))
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            code = proc.wait()
elapsed = time.monotonic() - start
after = snapshot(names)
save('tracked-after.json', after)
meta.update({
    'completed_at_utc': utc(), 'execution_elapsed_seconds': elapsed,
    'exit_code': code, 'timed_out': timed_out,
    'source_sha256_after': sha((ROOT / SOURCE).read_bytes()),
    'head_after': git('rev-parse', 'HEAD'), 'tree_after': git('rev-parse', 'HEAD^{tree}'),
    'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
    'tracked_hash_maps_equal': before == after, 'tracked_file_inventory_equal': names == tracked_names(),
    'changed_tracked_paths': [name for name in names if before[name] != after[name]],
})
for stream in ['stdout', 'stderr']:
    raw = (OUT / f'syntax.{stream}').read_bytes()
    meta[f'{stream}_bytes'] = len(raw)
    meta[f'{stream}_sha256'] = sha(raw)
save('result.json', meta)
print(json.dumps(meta), flush=True)
assert before == after and meta['tracked_file_inventory_equal']
assert meta['source_sha256_before'] == meta['source_sha256_after']
assert meta['head_after'] == COMMIT and meta['tree_after'] == TREE and not meta['status_after']
raise SystemExit(0 if code == 0 else 1)
