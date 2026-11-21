"""Retain one explicitly authorized Mobile export build and its generated-only delta."""
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

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-mobile-export-functional')
OUT = Path('/workspace/scratch/6f2247f2f463/deckchek-mobile-export-functional-round7-build-raw')
CONFIG = Path(sys.argv[1])
config_raw = CONFIG.read_bytes()
config = json.loads(config_raw)
COMMIT, TREE = config['source_commit'], config['source_tree']
budget = config['execution_budget_seconds']
assert config['schema'] == 'deckchek.mobile-export-build.authorization.v1'
assert isinstance(config['expected_tracked_file_count'], int) and config['expected_tracked_file_count'] > 0
assert isinstance(budget, int) and 10 <= budget <= 30
assert re.fullmatch('[0-9a-f]{40}', COMMIT) and re.fullmatch('[0-9a-f]{40}', TREE)
assert config['allowed_changes'] == ['mobile/sw.js']
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

def tracked_names():
    return sorted(n for n in git('ls-files', '-z', binary=True).decode().split('\0') if n)

def snapshot(names):
    return {name: sha((ROOT / name).read_bytes()) for name in names}

assert not OUT.exists(), 'First build output already exists; no rerun permitted'
assert not OUT.is_relative_to(ROOT)
assert git('rev-parse', 'HEAD') == COMMIT and git('rev-parse', 'HEAD^{tree}') == TREE
assert not git('status', '--porcelain=v1', '--untracked-files=all')
for key in os.environ:
    assert key != 'NODE_OPTIONS' and key != 'DECKCHEK_AUDIO_CONTEXT_PATH' and not key.startswith('DECKCHEK_AUDIO_FIT_'), key
names = tracked_names()
assert len(names) == config['expected_tracked_file_count']
argv = [NODE, 'tools/build-mobile.mjs']
OUT.mkdir(mode=0o700)
before = snapshot(names)
save('tracked-before.json', before)
(OUT / 'authorized-build.json').write_bytes(config_raw)
(OUT / 'build-recorder.py').write_bytes(Path(__file__).read_bytes())
(OUT / 'mobile-sw-before.js').write_bytes((ROOT / 'mobile/sw.js').read_bytes())
env = dict(os.environ)
env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
version = subprocess.check_output([NODE, '--version'], cwd=ROOT, env=env, text=True).strip()
runtime = json.loads(subprocess.check_output([NODE, '-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})'], cwd=ROOT, env=env, text=True))
assert version == 'v24.22.3', version
started, start = utc(), time.monotonic()
meta = {
    'schema': 'deckchek.mobile-export-build.v1',
    'source_commit': COMMIT, 'source_tree': TREE, 'cwd': str(ROOT), 'argv': argv,
    'node_version': version, 'runtime': runtime, 'python_version': platform.python_version(),
    'node_options': None, 'diagnostic_variables_present': [],
    'environment_changes': {'PATH_prefix': str(Path(NODE).parent)},
    'started_at_utc': started, 'execution_budget_seconds': budget,
    'termination_signal_after_seconds': budget - 5, 'termination_grace_seconds': 5,
    'tracked_file_count': len(before), 'status_before': '',
    'driver_sha256': sha(Path(__file__).read_bytes()), 'config_sha256': sha(config_raw),
    'allowed_changes': ['mobile/sw.js'],
    'scope': 'One normal official Mobile export cache build; no tests, browser/native launch or numerical diagnostic execution.',
}
save('running.json', meta)
timed_out = False
with (OUT / 'build.stdout').open('wb') as stdout, (OUT / 'build.stderr').open('wb') as stderr:
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
elapsed = time.monotonic() - start
after = snapshot(names)
save('tracked-after.json', after)
(OUT / 'mobile-sw-after.js').write_bytes((ROOT / 'mobile/sw.js').read_bytes())
(OUT / 'generated.patch').write_bytes(git('diff', '--binary', binary=True))
stdout, stderr = (OUT / 'build.stdout').read_bytes(), (OUT / 'build.stderr').read_bytes()
changed = [name for name in names if before[name] != after[name]]
meta.update({
    'completed_at_utc': utc(), 'execution_elapsed_seconds': elapsed,
    'exit_code': code, 'timed_out': timed_out,
    'head_after': git('rev-parse', 'HEAD'), 'tree_after': git('rev-parse', 'HEAD^{tree}'),
    'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
    'tracked_file_inventory_equal': names == tracked_names(),
    'changed_tracked_paths': changed,
    'staged_paths_after': git('diff', '--cached', '--name-only').splitlines(),
    'untracked_paths_after': git('ls-files', '--others', '--exclude-standard').splitlines(),
    'stdout_bytes': len(stdout), 'stdout_sha256': sha(stdout),
    'stderr_bytes': len(stderr), 'stderr_sha256': sha(stderr),
})
save('result.json', meta)
print(json.dumps({key: meta[key] for key in ['source_commit', 'source_tree', 'exit_code', 'timed_out', 'execution_elapsed_seconds', 'tracked_file_count', 'changed_tracked_paths', 'tracked_file_inventory_equal', 'status_after', 'stdout_bytes', 'stderr_bytes']}), flush=True)
assert meta['head_after'] == COMMIT and meta['tree_after'] == TREE and meta['tracked_file_inventory_equal']
assert not meta['staged_paths_after'] and not meta['untracked_paths_after']
assert changed == ['mobile/sw.js'], 'Unexpected generated delta: preserve outcome and ask root; never rerun'
sys.exit(0 if code == 0 else 1)
