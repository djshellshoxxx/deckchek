from pathlib import Path
import datetime, hashlib, json, os, platform, re, signal, subprocess, sys, time

root = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
out = Path(sys.argv[3]).resolve()
argv = sys.argv[4:]
assert argv[0] == '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
out.mkdir(parents=True, exist_ok=False)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def snapshot():
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names if name}

def save(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n')

head, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
assert head == expected, (head, expected)
status_before = git('status', '--porcelain=v1', '--untracked-files=all')
assert not status_before, status_before
before = snapshot()
save('tracked-before.json', before)
env = dict(os.environ)
assert env.get('NODE_OPTIONS') is None, 'Unexpected NODE_OPTIONS changes the fixed runtime contract'
env['DECKCHEK_AUDIO_CONTEXT_PATH'] = str(out / 'contexts.json')
env['PATH'] = str(Path(argv[0]).parent) + os.pathsep + env.get('PATH', '')
version = subprocess.check_output([argv[0], '--version'], cwd=root, env=env, text=True).strip()
runtime = json.loads(subprocess.check_output([argv[0], '-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})'], cwd=root, env=env, text=True))
assert version == 'v24.22.3', version
started, start = utc(), time.monotonic()
meta = {'source_commit': head, 'source_tree': tree, 'cwd': str(root), 'argv': argv,
        'node_version': version, 'runtime': runtime, 'python_version': platform.python_version(),
        'started_at_utc': started, 'status_before': status_before, 'tracked_file_count': len(before),
        'timeout_seconds': 180, 'node_options': env.get('NODE_OPTIONS'),
        'driver_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'diagnostic_environment': {'DECKCHEK_AUDIO_CONTEXT_PATH': env['DECKCHEK_AUDIO_CONTEXT_PATH']}}
save('running.json', meta)
timeout = False
with (out / 'run.tap').open('wb') as stdout, (out / 'stderr.log').open('wb') as stderr:
    proc = subprocess.Popen(argv, cwd=root, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
    try:
        code = proc.wait(timeout=180)
    except subprocess.TimeoutExpired:
        timeout = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            code = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            code = proc.wait()
after = snapshot()
save('tracked-after.json', after)
raw = (out / 'run.tap').read_bytes()
stderr = (out / 'stderr.log').read_bytes()
tap = raw.decode()
meta.update({'completed_at_utc': utc(), 'elapsed_seconds': time.monotonic() - start,
             'exit_code': code, 'timed_out': timeout, 'head_after': git('rev-parse', 'HEAD'),
             'tree_after': git('rev-parse', 'HEAD^{tree}'),
             'status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
             'tracked_hash_maps_equal': before == after,
             'tap_counts': {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', tap, re.M)},
             'tap_bytes': len(raw), 'tap_sha256': hashlib.sha256(raw).hexdigest(),
             'stderr_bytes': len(stderr), 'stderr_sha256': hashlib.sha256(stderr).hexdigest()})
context_path = out / 'contexts.json'
if context_path.exists():
    context_raw = context_path.read_bytes()
    meta['context_bytes'] = len(context_raw)
    meta['context_sha256'] = hashlib.sha256(context_raw).hexdigest()
    try:
        context = json.loads(context_raw)
        meta['context_results'] = len(context['results'])
        meta['context_json_valid'] = True
    except (ValueError, KeyError, TypeError) as error:
        meta['context_json_valid'] = False
        meta['context_parse_error'] = str(error)
else:
    meta['context_file_missing'] = True
save('result.json', meta)
print(json.dumps({key: meta[key] for key in ['source_commit', 'source_tree', 'exit_code', 'timed_out', 'tap_counts', 'elapsed_seconds', 'tracked_file_count', 'tracked_hash_maps_equal', 'status_after', 'tap_bytes', 'tap_sha256', 'stderr_bytes', 'diagnostic_environment']}))
assert before == after and head == meta['head_after'] and tree == meta['tree_after'] and not meta['status_after']
