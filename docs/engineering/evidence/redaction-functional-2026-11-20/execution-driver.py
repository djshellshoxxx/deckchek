from pathlib import Path
import datetime, hashlib, json, os, platform, re, shutil, subprocess, time

ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-redaction-functional')
OUT = Path(__file__).resolve().parent
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
SOURCE = '7743813078381bbff713bf4609d5bb403188f269'
BASE = '6cd827b0204bc450b8fc6236a179c7383dd52911'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def hashes():
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().strip('\0').split('\0')
    return {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in names}

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

assert git('rev-parse', 'HEAD') == SOURCE and git('status', '--porcelain') == ''
before = hashes()
save('tracked-before.json', before)
paths = git('diff', '--name-only', BASE, SOURCE).splitlines()
old = json.loads(git('show', BASE + ':tests/fixtures/redaction-vectors.json'))
new = json.loads((ROOT / 'tests/fixtures/redaction-vectors.json').read_text())
assert new[:len(old)] == old
freeze = {'base': BASE, 'base_tree': git('rev-parse', BASE + '^{tree}'),
          'source': SOURCE, 'source_tree': git('rev-parse', SOURCE + '^{tree}'),
          'changed_paths': paths, 'changed_sha256': {p: before[p] for p in paths},
          'original_vectors_preserved': len(old), 'added_vectors': len(new)-len(old), 'total_vectors': len(new),
          'original_vector_values_unchanged': True, 'native_execution': False, 'native_format_check': False,
          'compiler_paths_discovered': {t: shutil.which(t) for t in ('rustc', 'cargo', 'rustfmt')},
          'limits': 'Wrapper-only ASCII-space hardening; bare/raw structured values and unsupported forms remain conservative. No baseline privacy reproduction or native execution.'}
save('source-freeze.json', freeze)
argv = [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap',
        'tests/browser-bundle.test.mjs', 'tests/diagnostics-bundle.test.mjs']
record = {'source_commit': SOURCE, 'source_tree': freeze['source_tree'], 'node_executable': NODE,
          'node_version': subprocess.check_output([NODE, '--version'], text=True).strip(),
          'python_version': platform.python_version(), 'host': platform.platform(), 'argv': argv,
          'test_file_count': 2, 'serial': True, 'tracked_file_count': len(before), 'status_before': '',
          'started_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'timeout_seconds': 120, 'log_outside_checkout': True}
env = dict(os.environ)
env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
started = time.monotonic()
timed_out = False
with (OUT / 'focused.tap').open('wb') as log:
    try:
        result = subprocess.run(argv, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=120)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        exit_code = None
record.update({'completed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'elapsed_seconds': time.monotonic()-started, 'exit_code': exit_code, 'timed_out': timed_out})
after = hashes()
save('tracked-after.json', after)
raw = (OUT / 'focused.tap').read_bytes()
tap = raw.decode()
counts = {}
for key in ('tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
    values = re.findall(r'^# '+key+r' (\d+)$', tap, re.MULTILINE)
    counts[key] = int(values[-1]) if values else None
durations = re.findall(r'^# duration_ms ([0-9.]+)$', tap, re.MULTILINE)
record.update({'tap_counts': counts, 'tap_duration_ms': float(durations[-1]) if durations else None,
               'tap_sha256': hashlib.sha256(raw).hexdigest(), 'tap_bytes': len(raw),
               'tracked_hash_maps_equal': before == after, 'head_after': git('rev-parse', 'HEAD'),
               'tree_after': git('rev-parse', 'HEAD^{tree}'), 'status_after': git('status', '--porcelain')})
save('focused.json', record)
print(json.dumps(record, indent=2))
assert before == after and record['head_after'] == SOURCE and record['tree_after'] == freeze['source_tree']
assert record['status_after'] == '' and exit_code == 0 and not timed_out
assert all(counts[k] == 0 for k in ('fail', 'cancelled', 'skipped', 'todo'))
