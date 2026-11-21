"""Record one authorized complete Inventory/Mobile serial Node gate."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import platform
import re
import signal
import subprocess
import sys
import time

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-inventory-mobile-functional')
OUT = Path('/workspace/scratch/6f2247f2f463/deckchek-inventory-mobile-round6-raw')
CONFIG = Path(sys.argv[1])
config_raw = CONFIG.read_bytes()
config = json.loads(config_raw)
COMMIT, TREE = config['source_commit'], config['source_tree']
budget = config['execution_budget_seconds']
assert isinstance(budget, int) and 10 <= budget <= 600
assert re.fullmatch('[0-9a-f]{40}', COMMIT) and re.fullmatch('[0-9a-f]{40}', TREE)
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args, binary=False):
    raw = subprocess.check_output(['git', *args], cwd=ROOT)
    return raw if binary else raw.decode().strip()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

def snapshot(names):
    return {name: sha((ROOT / name).read_bytes()) for name in names}

assert not OUT.exists(), 'First-outcome directory already exists; no rerun permitted'
assert not OUT.is_relative_to(ROOT)
assert git('rev-parse', 'HEAD') == COMMIT
assert git('rev-parse', 'HEAD^{tree}') == TREE
assert not git('status', '--porcelain=v1', '--untracked-files=all')
for key in os.environ:
    assert key != 'NODE_OPTIONS' and key != 'DECKCHEK_AUDIO_CONTEXT_PATH' and not key.startswith('DECKCHEK_AUDIO_FIT_'), key
names = sorted(n for n in git('ls-files', '-z', binary=True).decode().split('\0') if n)
test_files = config['test_files']
assert test_files == sorted(set(test_files)) and test_files
assert all(re.fullmatch(r'tests/[a-z0-9-]+\.test\.mjs', name) and name in names and (ROOT / name).is_file() for name in test_files)
actual_tests = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'tests').glob('*.test.mjs') if p.is_file())
tracked_tests = sorted(name for name in names if re.fullmatch(r'tests/[^/]+\.test\.mjs', name))
assert test_files == actual_tests == tracked_tests, 'Full gate must include every actual and tracked top-level test file'
argv = [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap', *test_files]
OUT.mkdir(mode=0o700)
before = snapshot(names)
save('tracked-before.json', before)
save('test-files.json', test_files)
(OUT / 'authorized-selection.json').write_bytes(config_raw)
env = dict(os.environ)
env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
version = subprocess.check_output([NODE, '--version'], cwd=ROOT, env=env, text=True).strip()
runtime = json.loads(subprocess.check_output([NODE, '-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})'], cwd=ROOT, env=env, text=True))
assert version == 'v24.22.3', version
started, start = utc(), time.monotonic()
meta = {
    'schema': 'deckchek.inventory-mobile-full-node-gate.v1',
    'source_commit': COMMIT, 'source_tree': TREE, 'cwd': str(ROOT),
    'argv': argv, 'test_file_count': len(test_files),
    'node_version': version, 'runtime': runtime, 'python_version': platform.python_version(),
    'node_options': None, 'diagnostic_variables_present': [],
    'environment_changes': {'PATH_prefix': str(Path(NODE).parent)},
    'started_at_utc': started, 'execution_budget_seconds': budget,
    'termination_signal_after_seconds': budget - 5, 'termination_grace_seconds': 5,
    'tracked_file_count': len(before), 'status_before': '',
    'driver_sha256': sha(Path(__file__).read_bytes()),
    'config_sha256': sha(config_raw),
    'scope': 'One unchanged complete top-level test selection, serial TAP; no browser/native launch or numerical diagnostic collector.',
}
save('running.json', meta)
timed_out = False
with (OUT / 'run.tap').open('wb') as stdout, (OUT / 'stderr.log').open('wb') as stderr:
    proc = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
    try:
        code = proc.wait(timeout=max(0, budget - 5 - (time.monotonic() - start)))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            code = proc.wait(timeout=max(0, budget - (time.monotonic() - start)))
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            code = proc.wait()
execution_elapsed = time.monotonic() - start
after = snapshot(names)
save('tracked-after.json', after)
raw, stderr = (OUT / 'run.tap').read_bytes(), (OUT / 'stderr.log').read_bytes()
text = raw.decode()
meta.update({
    'completed_at_utc': utc(), 'execution_elapsed_seconds': execution_elapsed,
    'exit_code': code, 'timed_out': timed_out,
    'head_after': git('rev-parse', 'HEAD'), 'tree_after': git('rev-parse', 'HEAD^{tree}'),
    'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
    'tracked_hash_maps_equal': before == after,
    'tracked_file_inventory_equal': names == sorted(n for n in git('ls-files', '-z', binary=True).decode().split('\0') if n),
    'changed_tracked_paths': [n for n in names if before[n] != after[n]],
    'tap_counts': {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)},
    'tap_bytes': len(raw), 'tap_sha256': sha(raw),
    'stderr_bytes': len(stderr), 'stderr_sha256': sha(stderr),
})
save('result.json', meta)
print(json.dumps({key: meta[key] for key in ['source_commit', 'source_tree', 'test_file_count', 'exit_code', 'timed_out', 'tap_counts', 'execution_elapsed_seconds', 'tracked_file_count', 'tracked_hash_maps_equal', 'status_after', 'tap_bytes', 'tap_sha256', 'stderr_bytes']}), flush=True)
assert before == after and meta['tracked_file_inventory_equal'] and meta['head_after'] == COMMIT and meta['tree_after'] == TREE and not meta['status_after']
sys.exit(0 if code == 0 else 1)
