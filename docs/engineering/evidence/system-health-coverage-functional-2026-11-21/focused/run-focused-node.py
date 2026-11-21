#!/usr/bin/env python3
"""Unexecuted R18 single-FIRST recorder; execution requires separate exact-byte authorization."""
import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import signal
import stat
import subprocess
import sys
import time
import traceback

BASE = pathlib.Path('/workspace/scratch/6f2247f2f463')
ROOT = BASE / 'deckchek-system-health-functional'
OUT = BASE / 'deckchek-system-health-round18-focused-raw'
DRIVER = BASE / 'deckchek-system-health-round18-focused-recorder.py'
CONFIG = BASE / 'deckchek-system-health-round18-focused-selection.json'
LAUNCHER = BASE / 'deckchek-system-health-round18-authorized-launcher.py'
COMMAND = BASE / 'deckchek-system-health-round18-authorized-command.txt'
NODE = pathlib.Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
PYTHON = pathlib.Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3')
GIT = pathlib.Path('/usr/bin/git')
COMMIT = '2a807525c70712332e84cecbaf29dd876b5e03cd'
TREE = '00c536bad160a5f81fbbc8cea1b7fe62594e2c7a'
BRANCH = 'review/deckchek-system-health-functional-20261121'
PARENTS = ['b7f3031a185e14a502c7e7e86c6495ea3601d73a']
MAP_SHA256 = '11f639792299bf8b5aaf9035e94459138fd2d9ab02ce51f2c2c5f584e51765fa'
CONFIG_SHA256 = 'ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a'
SOURCES = [
    'tests/pre-gig.test.mjs',
    'tests/pregig-storage-screen.test.mjs',
    'tests/report-pdf.test.mjs',
    'tests/service-panel-lifecycle.test.mjs',
    'tests/setup-wizard-model.test.mjs',
    'tests/support-dialog.test.mjs',
    'tests/system-check.test.mjs',
    'tests/system-health-coverage.test.mjs',
    'tests/system-health-screen.test.mjs',
]
BUDGET = 60
TERM_AFTER = 55
IDENTITY_BUDGET = 10
REAP_BUDGET = 5
COMMAND_BYTES = (str(PYTHON) + ' -I ' + str(LAUNCHER) + '\n').encode()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write_bytes(name, data):
    with (OUT / name).open('xb') as handle:
        handle.write(data)


def save(name, value, compact=False):
    raw = canonical(value) if compact else json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode()
    write_bytes(name, raw + b'\n')


def identity(path):
    path = pathlib.Path(path)
    require(stat.S_ISREG(path.stat().st_mode), 'Not a regular file: ' + str(path))
    raw = path.read_bytes()
    return {'path': str(path), 'resolved_path': str(path.resolve()), 'bytes': len(raw),
            'sha256': sha(raw), 'mode': format(stat.S_IMODE(path.stat().st_mode), '04o'),
            'is_symlink': path.is_symlink()}


def pin_identity(pin):
    actual = identity(pin['path'])
    require(actual == pin, 'File identity differs: ' + pin['path'])
    return actual


def git(args, data=None):
    git_env = os.environ.copy()
    git_env['GIT_OPTIONAL_LOCKS'] = '0'
    git_env['GIT_TERMINAL_PROMPT'] = '0'
    result = subprocess.run([str(GIT), '--no-optional-locks', '-c', 'core.fsmonitor=false', *args],
                            cwd=ROOT, env=git_env, input=data, capture_output=True, timeout=30)
    require(result.returncode == 0, 'Read-only git failed: ' + repr(args) + '\n' + result.stderr.decode(errors='replace'))
    return result.stdout


def zero_paths(raw):
    return [p.decode('utf-8') for p in raw.split(b'\0') if p]


def source_state():
    return {'head': git(['rev-parse', 'HEAD']).decode().strip(),
            'tree': git(['rev-parse', 'HEAD^{tree}']).decode().strip(),
            'branch': git(['symbolic-ref', '--short', 'HEAD']).decode().strip(),
            'parents': git(['show', '-s', '--format=%P', 'HEAD']).decode().strip().split(),
            'status_porcelain': git(['status', '--porcelain=v1', '--untracked-files=all']).decode()}


def require_frozen(state):
    require(state == {'head': COMMIT, 'tree': TREE, 'branch': BRANCH, 'parents': PARENTS,
                      'status_porcelain': ''}, 'Frozen commit/tree/branch/parents/clean status differ')


def source_custody(label, expected, index_pin):
    state = source_state()
    save('source-state-' + label + '.json', state)
    require_frozen(state)
    index_path = pathlib.Path(git(['rev-parse', '--git-path', 'index']).decode().strip())
    if not index_path.is_absolute():
        index_path = ROOT / index_path
    require(str(index_path) == index_pin['path'], 'Raw worktree index path differs')
    index_file = pin_identity(index_pin)
    write_bytes('raw-index-' + label + '.bin', index_path.read_bytes())
    entries = []
    for item in git(['ls-tree', '-rz', '--full-tree', COMMIT]).split(b'\0'):
        if not item:
            continue
        description, name = item.split(b'\t', 1)
        mode, kind, oid = description.decode().split()
        require(kind == 'blob' and mode in ('100644', '100755'), 'Unexpected tracked object or mode')
        entries.append({'path': name.decode('utf-8'), 'mode': mode, 'oid': oid})
    entries.sort(key=lambda row: row['path'])
    require(entries == [{k: row[k] for k in ('path', 'mode', 'oid')} for row in expected], 'Immutable tree inventory differs')
    save('source-tree-' + label + '.json', entries, compact=True)
    names = [row['path'] for row in expected]
    tracked = sorted(zero_paths(git(['ls-files', '-z'])))
    save('tracked-files-' + label + '.json', tracked)
    require(tracked == names, 'Tracked path inventory differs')
    index = []
    for item in git(['ls-files', '--stage', '-z']).split(b'\0'):
        if item:
            description, name = item.split(b'\t', 1)
            mode, oid, stage = description.decode().split()
            index.append({'path': name.decode('utf-8'), 'mode': mode, 'oid': oid, 'stage': int(stage)})
    index.sort(key=lambda row: (row['path'], row['stage']))
    save('index-' + label + '.json', index, compact=True)
    require(index == [dict(row, stage=0) for row in entries], 'Stage-zero index bytes/modes/inventory differ')
    flags = sorted(zero_paths(git(['ls-files', '-v', '-z'])))
    save('index-flags-' + label + '.json', flags)
    require(flags == ['H ' + name for name in names], 'Index has skip-worktree, assume-unchanged or unexpected flags')
    untracked = sorted(zero_paths(git(['ls-files', '--others', '--exclude-standard', '-z'])))
    ignored = sorted(zero_paths(git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])))
    save('untracked-files-' + label + '.json', untracked)
    save('ignored-files-' + label + '.json', ignored)
    require(not untracked and not ignored, 'Untracked or ignored working files exist')
    physical = []
    for directory, dirs, files in os.walk(ROOT, followlinks=False):
        parent = pathlib.Path(directory)
        if parent == ROOT:
            dirs[:] = [name for name in dirs if name != '.git']
            files = [name for name in files if name != '.git']
        for name in dirs:
            require(not (parent / name).is_symlink(), 'Working directory symlink exists')
        for name in files:
            path = parent / name
            require(stat.S_ISREG(path.lstat().st_mode), 'Working non-regular file exists')
            physical.append(path.relative_to(ROOT).as_posix())
    physical.sort()
    save('physical-files-' + label + '.json', physical)
    require(physical == names, 'Complete physical working file inventory differs')
    actual_tests = sorted(path.relative_to(ROOT).as_posix() for path in (ROOT / 'tests').glob('*.test.mjs'))
    tracked_tests = [name for name in names if re.fullmatch(r'tests/[^/]+\.test\.mjs', name)]
    save('top-level-tests-' + label + '.json', {'actual': actual_tests, 'tracked': tracked_tests})
    require(actual_tests == tracked_tests and len(actual_tests) == 209, '209-test inventory differs')
    oids = sorted({row['oid'] for row in entries})
    require(len(oids) == 2317, 'Distinct immutable blob count differs')
    batch = git(['cat-file', '--batch'], ''.join(oid + '\n' for oid in oids).encode())
    offset = 0
    blobs = {}
    for oid in oids:
        boundary = batch.index(b'\n', offset)
        actual_oid, kind, size_text = batch[offset:boundary].decode().split()
        size = int(size_text)
        start = boundary + 1
        raw = batch[start:start + size]
        require(actual_oid == oid and kind == 'blob' and len(raw) == size and batch[start + size:start + size + 1] == b'\n',
                'Immutable git blob response differs')
        require(hashlib.sha1(b'blob ' + str(size).encode() + b'\0' + raw).hexdigest() == oid,
                'Immutable git blob SHA-1 differs')
        blobs[oid] = raw
        offset = start + size + 1
    require(offset == len(batch), 'Unexpected trailing immutable blob response')
    rows = []
    for item in entries:
        path = ROOT / item['path']
        expected_mode = 0o755 if item['mode'] == '100755' else 0o644
        require(stat.S_IMODE(path.lstat().st_mode) == expected_mode, 'Working file mode differs: ' + item['path'])
        raw = blobs[item['oid']]
        require(path.read_bytes() == raw, 'Working bytes differ from immutable blob: ' + item['path'])
        rows.append(dict(item, bytes=len(raw), sha256=sha(raw)))
    save('full-source-' + label + '.json', rows, compact=True)
    require(rows == expected and len(rows) == 2586 and sum(row['bytes'] for row in rows) == 91604989,
            'Complete frozen source map/count/byte total differs')
    digest = sha(canonical(rows))
    require(digest == MAP_SHA256, 'Canonical frozen source map hash differs')
    require(pin_identity(index_pin) == index_file, 'Raw worktree index changed during custody check')
    return {'path_count': len(rows), 'distinct_blob_count': len(oids), 'bytes': sum(row['bytes'] for row in rows),
            'source_map_sha256': digest, 'physical_files_sha256': sha(canonical(physical)),
            'index_sha256': sha(canonical(index)), 'test_inventory_sha256': sha(canonical(actual_tests)),
            'index_file': index_file, 'state': state}


def signal_group(proc, sig, entry):
    event = {'signal': signal.Signals(sig).name, 'at_utc': utc()}
    try:
        os.killpg(proc.pid, sig)
        event['sent'] = True
    except ProcessLookupError:
        event['sent'] = False
        event['reason'] = 'process group no longer exists'
    entry.setdefault('signals', []).append(event)


def bounded_reap(proc, entry):
    try:
        proc.wait(timeout=REAP_BUDGET)
    except subprocess.TimeoutExpired:
        entry['reap_timeout'] = True
    entry['returncode'] = proc.poll()


def runtime_call(label, arguments, env, meta):
    entry = {'label': label, 'argv': [str(NODE), *arguments], 'budget_seconds': IDENTITY_BUDGET,
             'started_utc': utc(), 'timed_out': False, 'reap_timeout': False}
    meta['runtime_identity_calls'].append(entry)
    started = time.monotonic()
    proc = None
    stdout_path, stderr_path = OUT / (label + '.stdout'), OUT / (label + '.stderr')
    try:
        with stdout_path.open('xb') as stdout, stderr_path.open('xb') as stderr:
            proc = subprocess.Popen(entry['argv'], cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
            entry['pid'] = proc.pid
            try:
                proc.wait(timeout=max(0, IDENTITY_BUDGET - (time.monotonic() - started)))
            except subprocess.TimeoutExpired:
                entry['timed_out'] = True
                signal_group(proc, signal.SIGKILL, entry)
                bounded_reap(proc, entry)
    except Exception:
        if proc is not None and proc.poll() is None:
            signal_group(proc, signal.SIGKILL, entry)
            bounded_reap(proc, entry)
        raise
    finally:
        entry['finished_utc'] = utc()
        entry['elapsed_seconds'] = time.monotonic() - started
        entry['returncode'] = proc.poll() if proc else None
        for stream, path in (('stdout', stdout_path), ('stderr', stderr_path)):
            if path.exists():
                raw = path.read_bytes()
                entry[stream] = {'file': path.name, 'bytes': len(raw), 'sha256': sha(raw)}
    require(not entry['timed_out'] and not entry['reap_timeout'] and entry['returncode'] == 0,
            'Runtime identity call failed: ' + label)
    return stdout_path.read_bytes()


require(len(sys.argv) == 4, 'Use only the separately authorized exact launcher')
require(pathlib.Path(__file__).resolve() == DRIVER and pathlib.Path(sys.argv[1]) == CONFIG, 'Recorder/config path differs')
require(all(re.fullmatch('[0-9a-f]{64}', item) for item in sys.argv[2:]), 'Launcher identity arguments are invalid')
require(pathlib.Path.cwd() == ROOT, 'Invocation working directory differs')
require(not OUT.exists() and not OUT.is_symlink(), 'Refusing an existing raw output directory')
require(not OUT.is_relative_to(ROOT), 'Raw output directory must remain outside the worktree')
OUT.mkdir(mode=0o700)
meta = {'schema': 'deckchek-system-health-coverage-focused-result-v1', 'started_utc': utc(),
        'execution_scope': 'One authorized original-file FIRST; no rerun or scope expansion',
        'source_commit': COMMIT, 'source_tree': TREE, 'source_branch': BRANCH, 'source_parents': PARENTS,
        'cwd': str(ROOT), 'output_directory': str(OUT), 'project_started': False, 'project_launch_attempted': False,
        'runtime_identity_calls': [], 'project': {'budget_seconds': BUDGET, 'term_after_seconds': TERM_AFTER,
        'post_kill_reap_seconds': REAP_BUDGET, 'timed_out': False, 'reap_timeout': False},
        'python': {'version': platform.python_version(), 'executable': sys.executable},
        'authorized_launcher_argv': [str(PYTHON), '-I', str(LAUNCHER)], 'recorder_argv': sys.argv,
        'test_files': SOURCES, 'expected_cases': 208, 'older_cases': 173, 'new_cases': 35}
stage = 'control-preflight'
before = None
expected_map = None
config = None
proc = None
control_before = {}
runtime_before = {}
expected_names = []
try:
    control_paths = {'run-focused-node.py': DRIVER, 'authorized-selection.json': CONFIG,
                     'authorized-launcher.py': LAUNCHER, 'authorized-command.txt': COMMAND,
                     'independent-source-identity.json': BASE / 'system-health-functional-round18-source-identity.json',
                     'independent-case-inventory.json': BASE / 'system-health-functional-round18-case-inventory.json'}
    for retained_name, path in control_paths.items():
        control_before[retained_name] = identity(path)
        require(not path.is_symlink(), 'External control is a symlink: ' + str(path))
        write_bytes(retained_name, path.read_bytes())
    meta['controls_before'] = control_before
    require(control_before['run-focused-node.py']['sha256'] == sys.argv[2], 'Recorder bytes differ from launcher pin')
    require(control_before['authorized-launcher.py']['sha256'] == sys.argv[3], 'Launcher bytes differ from launch snapshot')
    require(control_before['authorized-selection.json']['sha256'] == CONFIG_SHA256, 'Configuration bytes differ')
    require(COMMAND.read_bytes() == COMMAND_BYTES, 'Exact authorized command differs')
    config = json.loads(CONFIG.read_bytes())
    require(config['schema'] == 'deckchek-system-health-coverage-focused-selection-v1', 'Configuration schema differs')
    require((config['source_root'], config['source_commit'], config['source_tree'], config['source_branch'], config['source_parents']) ==
            (str(ROOT), COMMIT, TREE, BRANCH, PARENTS), 'Configuration frozen source differs')
    require((config['expected_tracked_file_count'], config['expected_distinct_blob_count'], config['expected_total_source_bytes'],
             config['expected_all_top_level_test_count'], config['expected_source_map_sha256']) ==
            (2586, 2317, 91604989, 209, MAP_SHA256), 'Configuration source inventory differs')
    require((config['execution_budget_seconds'], config['termination_signal_after_seconds'], config['identity_budget_seconds'],
             config['post_kill_reap_seconds']) == (BUDGET, TERM_AFTER, IDENTITY_BUDGET, REAP_BUDGET), 'Execution budgets differ')
    require(config['raw_output_directory'] == str(OUT), 'Configuration raw output differs')
    require(config['environment_rejection'] == {'present_names': ['NODE_OPTIONS', 'UPDATE_FIXTURES', 'MIXXX_CONTROLLERS_DIR'],
                                               'present_prefixes': ['DECKCHEK_AUDIO_']}, 'Environment guard differs')
    require(config['source_paths'] == SOURCES == sorted(SOURCES) and config['expected_test_file_count'] == 9, 'Source selection differs')
    require((config['expected_case_count'], config['older_case_count'], config['new_case_count']) == (208, 173, 35), 'Case counts differ')
    pin_identity(config['source_identity_file'])
    pin_identity(config['case_inventory_file'])
    expected_map = json.loads(pathlib.Path(config['source_identity_file']['path']).read_bytes())
    require(sha(canonical(expected_map)) == MAP_SHA256, 'Pinned independent source map differs')
    inventory = json.loads(pathlib.Path(config['case_inventory_file']['path']).read_bytes())
    require((inventory['freeze'], inventory['cases'], inventory['older_cases'], inventory['added_cases']) ==
            (COMMIT, 208, 173, 35), 'Independent case inventory counts differ')
    ordered = inventory['ordered_cases']
    expected_names = [row['name'] for row in ordered]
    require(len(ordered) == len(set(expected_names)) == 208 and [row['ordinal'] for row in ordered] == list(range(1, 209)),
            'Independent ordered case inventory differs')
    file_names = [{k: row[k] for k in ('file', 'name')} for row in ordered]
    records = [{k: row[k] for k in ('ordinal', 'file', 'line', 'name')} for row in ordered]
    require(sha(canonical(expected_names)) == config['expected_ordered_names_sha256'] and
            sha(canonical(file_names)) == config['expected_ordered_file_names_sha256'] and
            sha(canonical(records)) == config['expected_ordered_source_records_sha256'], 'Ordered inventory hash differs')
    require({name: [row['name'] for row in ordered if row['file'] == name] for name in SOURCES} == config['expected_case_names_by_file'],
            'Ordered file/name mappings differ')
    require([row['file'] for row in ordered] == [name for name in SOURCES for _ in config['expected_case_names_by_file'][name]],
            'Lexical original-file case order differs')
    require({name: len(config['expected_case_names_by_file'][name]) for name in SOURCES} == config['case_count_by_file'],
            'Per-file case counts differ')
    map_by_path = {row['path']: row for row in expected_map}
    require({name: {key: map_by_path[name][key] for key in ('bytes', 'sha256', 'mode', 'oid')} for name in SOURCES} == config['expected_sources'],
            'Selected original file identities differ')
    save('expected-case-names.json', expected_names)
    save('selected-source-identities.json', config['expected_sources'])
    stage = 'environment-and-runtime-file-preflight'
    meta['blocked_environment_names'] = sorted(name for name in os.environ if name in
        ('NODE_OPTIONS', 'UPDATE_FIXTURES', 'MIXXX_CONTROLLERS_DIR') or name.startswith('DECKCHEK_AUDIO_'))
    require(not meta['blocked_environment_names'], 'A forbidden environment variable is present, including an empty value')
    for name in ('node_binary', 'python_binary', 'git_binary'):
        runtime_before[name] = pin_identity(config[name])
    require(config['node_binary']['path'] == str(NODE) and config['python_binary']['path'] == str(PYTHON) and
            config['git_binary']['path'] == str(GIT), 'Runtime paths differ')
    require(pathlib.Path(sys.executable).resolve() == PYTHON.resolve(), 'Launcher Python runtime differs')
    meta['runtime_files_before'] = runtime_before
    stage = 'full-source-preflight'
    before = source_custody('before', expected_map, config['index_file'])
    meta['source_before'] = before
    child_env = os.environ.copy()
    child_env['PATH'] = str(NODE.parent) + os.pathsep + child_env.get('PATH', '')
    meta['child_environment'] = {'inherited_except_node_path_prefix': True, 'node_path_prefix': str(NODE.parent),
                                 'forbidden_variables_present': False, 'fixture_update_permitted': False}
    stage = 'two-authorized-runtime-identities'
    version = runtime_call('node-version', ['--version'], child_env, meta)
    require(version.decode().strip() == config['expected_node_version'] == 'v24.22.3', 'Node version differs')
    runtime_json = runtime_call('node-runtime', ['-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch,execArgv:process.execArgv})'], child_env, meta)
    runtime = json.loads(runtime_json)
    require(runtime['versions']['node'] == '24.22.3' and runtime['execPath'] == str(NODE), 'Node runtime identity differs')
    meta['node_runtime'] = runtime
    require_frozen(source_state())
    require(identity(DRIVER) == control_before['run-focused-node.py'] and identity(CONFIG) == control_before['authorized-selection.json'],
            'Recorder or configuration changed before project launch')
    stage = 'single-original-project-invocation'
    argv = [str(NODE), '--test', '--test-concurrency=1', '--test-reporter=tap', *SOURCES]
    meta['project']['argv'] = argv
    meta['project_launch_attempted'] = True
    meta['project']['started_utc'] = utc()
    save('running.json', meta)
    started = time.monotonic()
    with (OUT / 'run.tap').open('xb') as stdout, (OUT / 'stderr.log').open('xb') as stderr:
        proc = subprocess.Popen(argv, cwd=ROOT, env=child_env, stdout=stdout, stderr=stderr, start_new_session=True)
        meta['project_started'] = True
        meta['project']['pid'] = proc.pid
        try:
            proc.wait(timeout=max(0, TERM_AFTER - (time.monotonic() - started)))
        except subprocess.TimeoutExpired:
            meta['project']['timed_out'] = True
            signal_group(proc, signal.SIGTERM, meta['project'])
            try:
                proc.wait(timeout=max(0, BUDGET - (time.monotonic() - started)))
            except subprocess.TimeoutExpired:
                signal_group(proc, signal.SIGKILL, meta['project'])
                bounded_reap(proc, meta['project'])
    meta['project']['finished_utc'] = utc()
    meta['project']['elapsed_seconds'] = time.monotonic() - started
    meta['project']['returncode'] = proc.poll()
except Exception as error:
    meta['recorder_error'] = {'stage': stage, 'type': type(error).__name__, 'message': str(error)}
    write_bytes('recorder-error.txt', traceback.format_exc().encode())
    if proc is not None and proc.poll() is None:
        signal_group(proc, signal.SIGKILL, meta['project'])
        bounded_reap(proc, meta['project'])
finally:
    postflight_errors = []
    if expected_map is not None:
        try:
            after = source_custody('after', expected_map, config['index_file'])
            meta['source_after'] = after
            require(before is not None and after == before, 'Before/after complete source custody differs')
            meta['source_unchanged'] = True
        except Exception:
            postflight_errors.append(traceback.format_exc())
    try:
        control_after = {name: identity(path) for name, path in control_paths.items()}
        meta['controls_after'] = control_after
        require(control_before == control_after, 'Exact external control bytes or modes changed')
        meta['controls_unchanged'] = True
    except Exception:
        postflight_errors.append(traceback.format_exc())
    if config is not None:
        try:
            runtime_after = {name: pin_identity(config[name]) for name in ('node_binary', 'python_binary', 'git_binary')}
            meta['runtime_files_after'] = runtime_after
            require(runtime_before == runtime_after, 'Runtime file bytes, modes or locations changed')
            meta['runtime_files_unchanged'] = True
        except Exception:
            postflight_errors.append(traceback.format_exc())
    if postflight_errors:
        meta['postflight_error_count'] = len(postflight_errors)
        write_bytes('postflight-error.txt', '\n'.join(postflight_errors).encode())

stage = 'original-tap-data-validation'
try:
    for stream, name in (('stdout', 'run.tap'), ('stderr', 'stderr.log')):
        path = OUT / name
        if path.exists():
            raw = path.read_bytes()
            meta['project'][stream] = {'file': name, 'bytes': len(raw), 'sha256': sha(raw)}
    raw_tap = (OUT / 'run.tap').read_bytes() if (OUT / 'run.tap').exists() else b''
    tap = raw_tap.decode('utf-8')
    outcomes = []
    for match in re.finditer(r'^(ok|not ok) (\d+) - (.*?)(?: # (SKIP|TODO)(?: (.*))?)?$', tap, re.MULTILINE):
        outcomes.append({'outcome': match[1], 'ordinal': int(match[2]), 'name': match[3],
                         'directive': match[4], 'directive_reason': match[5]})
    save('ordered-outcomes.json', outcomes)
    counts = {}
    for name in ('tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        matches = re.findall(r'^# ' + name + r' (\d+)$', tap, re.MULTILINE)
        counts[name] = int(matches[0]) if len(matches) == 1 else None
    durations = re.findall(r'^# duration_ms (\d+(?:\.\d+)?)$', tap, re.MULTILINE)
    plans = re.findall(r'^1\.\.(\d+)$', tap, re.MULTILINE)
    meta['tap_counts'] = counts
    meta['tap_duration_ms'] = durations[0] if len(durations) == 1 else None
    meta['tap_plan'] = int(plans[0]) if len(plans) == 1 else None
    meta['runtime_names_match_ordered_source'] = [row['name'] for row in outcomes] == expected_names and len(outcomes) == 208
    meta['runtime_ordinals_match'] = [row['ordinal'] for row in outcomes] == list(range(1, 209))
    meta['all_original_outcomes_passed'] = len(outcomes) == 208 and all(row['outcome'] == 'ok' and row['directive'] is None for row in outcomes)
    meta['exact_footer_matches'] = counts == {'tests': 208, 'suites': 0, 'pass': 208, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
except Exception:
    meta['tap_validation_error'] = True
    write_bytes('tap-validation-error.txt', traceback.format_exc().encode())
meta['finished_utc'] = utc()
meta['success'] = bool(meta['project_started'] and len(meta['runtime_identity_calls']) == 2 and
    meta['project'].get('returncode') == 0 and not meta['project']['timed_out'] and not meta['project']['reap_timeout'] and
    not meta.get('recorder_error') and not meta.get('postflight_error_count') and not meta.get('tap_validation_error') and
    meta.get('source_unchanged') and meta.get('controls_unchanged') and meta.get('runtime_files_unchanged') and
    meta.get('runtime_names_match_ordered_source') and meta.get('runtime_ordinals_match') and
    meta.get('all_original_outcomes_passed') and meta.get('exact_footer_matches') and meta.get('tap_plan') == 208 and
    meta.get('tap_duration_ms') is not None)
save('result.json', meta)
print(json.dumps({'success': meta['success'], 'output_directory': str(OUT), 'project_started': meta['project_started'],
                  'project_returncode': meta['project'].get('returncode'), 'tap_counts': meta.get('tap_counts')}, sort_keys=True))
sys.exit(0 if meta['success'] else 1)
