"""One full serial source-bound run; all execution output starts outside checkout."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import platform
import re
import signal
import subprocess
import time

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-player-functional-fresh')
OUT = Path(__file__).resolve().parent
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
EXPECTED_COMMIT = 'f081881d4979e4385f255163660258784e27a264'
EXPECTED_TREE = '39d4351da05fc1fc65f555874824555d96df5cd3'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def dump(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def snapshot():
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths if p}


assert not OUT.is_relative_to(ROOT), OUT
assert not (OUT / 'full-suite.tap').exists(), 'Preserve the first full run; refusing overwrite.'
head, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
assert head == EXPECTED_COMMIT, head
assert tree == EXPECTED_TREE, tree
status_before = git('status', '--porcelain=v1', '--untracked-files=all')
assert not status_before, status_before
before = snapshot()
dump('tracked-before.json', before)
files = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'tests').glob('*.test.mjs') if p.is_file())
assert files and all(p in before for p in files)
argv = [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap', *files]
env = dict(os.environ)
env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
version = subprocess.check_output([NODE, '--version'], cwd=ROOT, env=env, text=True).strip()
assert version == 'v24.22.3', version
runtime = json.loads(subprocess.check_output([NODE, '-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})'], cwd=ROOT, env=env, text=True))
started, begin = utc(), time.monotonic()
metadata = {
    'source_commit': head, 'source_tree': tree, 'working_directory': str(ROOT),
    'branch': git('branch', '--show-current'), 'node_executable': NODE,
    'node_version': version, 'runtime': runtime,
    'python_version': platform.python_version(), 'host': platform.platform(),
    'serial': True, 'argv': argv, 'test_file_count': len(files),
    'test_file_selection': 'Lexically sorted regular top-level tests/*.test.mjs files discovered on disk; all tracked.',
    'started_at_utc': started, 'status_before': status_before,
    'tracked_file_count': len(before), 'timeout_seconds': 1800,
    'log_outside_checkout': True, 'node_directory_first_in_child_path': True,
    'external_application_inputs': {},
    'driver_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
dump('full-suite-running.json', metadata)
print(json.dumps({'started_at_utc': started, 'source': head, 'tree': tree, 'files': len(files), 'tracked': len(before), 'node': version}), flush=True)
timed_out = False
with (OUT / 'full-suite.tap').open('xb') as log:
    process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        code = process.wait(timeout=1800)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            code = process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            code = process.wait()
elapsed, completed = time.monotonic() - begin, utc()
after = snapshot()
dump('tracked-after.json', after)
raw = (OUT / 'full-suite.tap').read_bytes()
tap = raw.decode()
counts = {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]+)$', tap, re.M)}
duration = re.findall(r'^# duration_ms ([0-9.]+)$', tap, re.M)
metadata.update({
    'completed_at_utc': completed, 'elapsed_seconds': elapsed,
    'exit_code': code, 'timed_out': timed_out, 'tap_counts': counts,
    'tap_duration_ms': float(duration[-1]) if duration else None,
    'tap_bytes': len(raw), 'tap_sha256': hashlib.sha256(raw).hexdigest(),
    'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
    'tracked_hash_maps_equal': before == after,
    'head_after': git('rev-parse', 'HEAD'), 'tree_after': git('rev-parse', 'HEAD^{tree}'),
    'skipped_lines': [line for line in tap.splitlines() if '# SKIP' in line],
    'failure_lines': [line for line in tap.splitlines() if line.lstrip().startswith('not ok')],
})
dump('full-suite.json', metadata)
print(json.dumps({key: metadata[key] for key in ['exit_code', 'timed_out', 'tap_counts', 'elapsed_seconds', 'tracked_hash_maps_equal', 'status_after', 'tap_sha256', 'failure_lines']}), flush=True)
assert before == after and head == metadata['head_after'] and tree == metadata['tree_after'] and not metadata['status_after'], 'Source changed during run; see full retained result.'
