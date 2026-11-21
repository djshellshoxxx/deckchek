"""Retain one authorized link-smoke syntax check; no module evaluation or browser launch."""
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

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-link-consent-functional')
OUT = Path('/workspace/scratch/6f2247f2f463/deckchek-link-consent-round10-syntax-raw')
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
assert len(sys.argv) == 2
CONFIG = Path(sys.argv[1]).resolve(strict=True)
driver_path = Path(__file__).resolve(strict=True)
driver_raw = driver_path.read_bytes()
config_raw = CONFIG.read_bytes()
config = json.loads(config_raw)
assert config['schema'] == 'deckchek.link-consent-syntax-selection.v1'
COMMIT, TREE = config['source_commit'], config['source_tree']
SOURCE = config['source_path']
assert SOURCE == 'tools/smoke/links.mjs'
assert config['execution_budget_seconds'] == 30
assert re.fullmatch('[0-9a-f]{40}', COMMIT) and re.fullmatch('[0-9a-f]{40}', TREE)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args, binary=False):
    raw = subprocess.check_output(['git', *args], cwd=ROOT)
    return raw if binary else raw.decode().strip()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

def inventory():
    return sorted(n for n in git('ls-files', '-z', binary=True).decode().split('\0') if n)

def snapshot(names):
    return {name: sha((ROOT / name).read_bytes()) for name in names}

assert not OUT.exists() and not OUT.is_symlink(), 'First syntax outcome already exists; no rerun permitted'
assert not OUT.is_relative_to(ROOT)
assert not CONFIG.is_relative_to(ROOT) and not driver_path.is_relative_to(ROOT)
assert git('branch', '--show-current') == config['source_branch']
assert git('rev-parse', 'HEAD') == COMMIT and git('rev-parse', 'HEAD^{tree}') == TREE
assert not git('status', '--porcelain=v1', '--untracked-files=all')
for key in os.environ:
    assert key != 'NODE_OPTIONS' and key != 'DECKCHEK_AUDIO_CONTEXT_PATH' and not key.startswith('DECKCHEK_AUDIO_FIT_'), key
assert 'MIXXX_CONTROLLERS_DIR' not in os.environ
names = inventory()
assert len(names) == config['expected_tracked_file_count'] == 2345 and SOURCE in names
actual_tests = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'tests').glob('*.test.mjs') if p.is_file())
tracked_tests = sorted(name for name in names if re.fullmatch(r'tests/[^/]+\.test\.mjs', name))
assert actual_tests == tracked_tests and len(tracked_tests) == config['expected_all_top_level_test_count'] == 202
before = snapshot(names)
source_raw = (ROOT / SOURCE).read_bytes()
assert sha(source_raw) == config['expected_source_sha256']
assert len(source_raw) == config['expected_source_bytes']
OUT.mkdir(mode=0o700)
save('tracked-before.json', before)
save('tracked-inventory-before.json', names)
save('all-top-level-test-files.json', actual_tests)
(OUT / 'authorized-syntax.json').write_bytes(config_raw)
(OUT / 'syntax-recorder.py').write_bytes(driver_raw)
(OUT / 'checked-links.mjs').write_bytes(source_raw)
env = dict(os.environ)
env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')

def runtime_call(label, args):
    result = subprocess.run([NODE, *args], cwd=ROOT, env=env, capture_output=True, timeout=10)
    (OUT / f'{label}.stdout').write_bytes(result.stdout)
    (OUT / f'{label}.stderr').write_bytes(result.stderr)
    result.check_returncode()
    return result.stdout

version = runtime_call('node-version', ['--version']).decode().strip()
runtime = json.loads(runtime_call('node-runtime', ['-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})']))
assert version == config['expected_node_version'] == 'v24.22.3'
assert runtime['execPath'] == NODE and runtime['versions']['node'] == '24.22.3'
argv = [NODE, '--check', SOURCE]
meta = {
    'schema': 'deckchek.link-consent-smoke-syntax.v1',
    'source_commit': COMMIT, 'source_tree': TREE, 'cwd': str(ROOT),
    'source_branch': config['source_branch'],
    'source_path': SOURCE, 'source_bytes': len(source_raw), 'source_sha256_before': sha(source_raw),
    'argv': argv, 'node_version': version, 'runtime': runtime, 'python_version': platform.python_version(),
    'driver_original_path': str(driver_path), 'config_original_path': str(CONFIG), 'output_original_path': str(OUT),
    'driver_sha256': sha(driver_raw), 'config_sha256': sha(config_raw),
    'node_options': None, 'diagnostic_variables_present': [], 'optional_external_corpus_present': False,
    'environment_changes': {'PATH_prefix': str(Path(NODE).parent)},
    'execution_budget_seconds': 30, 'termination_signal_after_seconds': 25, 'termination_grace_seconds': 5,
    'started_at_utc': utc(), 'status_before': '', 'tracked_file_count': len(names),
    'all_top_level_test_file_count': len(actual_tests),
    'scope': 'One syntax parse only of tools/smoke/links.mjs; no module evaluation, browser/native launch, full suite or diagnostic collector.',
}
save('running.json', meta)
start = time.monotonic()
timed_out = False
with (OUT / 'syntax.stdout').open('wb') as stdout, (OUT / 'syntax.stderr').open('wb') as stderr:
    proc = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
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
names_after = inventory()
save('tracked-after.json', after)
save('tracked-inventory-after.json', names_after)
meta.update({
    'completed_at_utc': utc(), 'execution_elapsed_seconds': elapsed,
    'exit_code': code, 'timed_out': timed_out,
    'source_sha256_after': sha((ROOT / SOURCE).read_bytes()),
    'head_after': git('rev-parse', 'HEAD'), 'tree_after': git('rev-parse', 'HEAD^{tree}'),
    'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
    'tracked_hash_maps_equal': before == after, 'tracked_file_inventory_equal': names == names_after,
    'changed_tracked_paths': [name for name in names if before[name] != after[name]],
})
for stream in ['stdout', 'stderr']:
    raw = (OUT / f'syntax.{stream}').read_bytes()
    meta[f'{stream}_bytes'] = len(raw)
    meta[f'{stream}_sha256'] = sha(raw)
save('result.json', meta)
print(json.dumps({key: meta[key] for key in ['source_commit', 'source_tree', 'source_path', 'exit_code', 'timed_out', 'execution_elapsed_seconds', 'tracked_file_count', 'tracked_hash_maps_equal', 'tracked_file_inventory_equal', 'status_after', 'source_sha256_before', 'stdout_bytes', 'stderr_bytes']}), flush=True)
assert before == after and meta['tracked_file_inventory_equal']
assert meta['source_sha256_before'] == meta['source_sha256_after']
assert meta['head_after'] == COMMIT and meta['tree_after'] == TREE and not meta['status_after']
raise SystemExit(0 if code == 0 and not timed_out else 1)
