"""Retain one FIRST authorized Pre-gig recovery focused outcome; never rerun."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import platform
import re
import signal
import stat
import subprocess
import sys
import time
import traceback

MODE = 'focused'
OUT = Path('/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-round17-focused-raw')
BUDGET = 60
TERM_AFTER = 55
SOURCES = ['tests/pre-gig.test.mjs',
 'tests/pregig-storage-screen.test.mjs',
 'tests/pregig-storage.test.mjs',
 'tests/pregig-ui.test.mjs',
 'tests/text-file-boundary.test.mjs']
SOURCE_PINS = {'tests/pre-gig.test.mjs': {'bytes': 50840,
                            'sha256': 'f813fa152e82998fa67ea49a2d78a7fa2d0cf214f600ab92b86bc94384c76d12'},
 'tests/pregig-storage-screen.test.mjs': {'bytes': 23899,
                                          'sha256': '2779ff267b814db961bd250612093cb4875cc51f1683fd7ec162f46e7ecad5ad'},
 'tests/pregig-storage.test.mjs': {'bytes': 9582,
                                   'sha256': '0fc88abc7554c9785a9e0f5dae8cdfdcc8b46f0be84d0a9710ec6d30cc6d6b4f'},
 'tests/pregig-ui.test.mjs': {'bytes': 14311,
                              'sha256': 'c18d29747b125d940ce273ec9744954b74f913a8343b32d9c082d7c7d9b6be55'},
 'tests/text-file-boundary.test.mjs': {'bytes': 7893,
                                       'sha256': '7e63b3bc04fd1da8a66b15ef20d5956072bec7dca238dece64d7355f2a2f1b23'}}
CONFIG_SCHEMA = 'deckchek.pregig-recovery-focused-selection.v1'
RESULT_SCHEMA = 'deckchek.pregig-recovery-focused-gate.v1'
DRIVER_COPY = 'run-focused-node.py'
CONFIG_COPY = 'authorized-selection.json'
STDOUT_NAME = 'run.tap'
STDERR_NAME = 'stderr.log'
SCOPE = ('One explicit five-file focused serial TAP selection, 132 source-derived cases. Original '
 'cumulative Pre-gig adapter, controller and screen, actual strict-text and PDF/DOM consumers and '
 'unchanged bounded synthetic DSP cases in the original core test file. The PDF case uses the real '
 'JavaScript adapter with a fake native command boundary. No full suite, build/verifier, '
 'browser/native app launch, physical-audio collector, scanner/probe, extracted implementation, '
 'separate project command, rerun or additional instrumentation.')
ROOT = Path('/workspace/scratch/6f2247f2f463/deckchek-pregig-recovery-functional')
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
COMMIT = '2ac0cf4dc25cb17471149ba64c83b3855c319d45'
TREE = '285b665343d91b6cabebc0f0210fa661865d7305'
BRANCH = 'review/deckchek-pregig-recovery-functional-20261121'
PARENTS = ['f4d727cb9243b60594dc0df73da3d0808d698b81']
SOURCE_MAP_SHA256 = 'e02518433215984d516ed73d2f104acc93ed1f80a428ebf6b07ad61b3af32c5d'
CONFIG_SHA256 = '12ce92d9bd00c35365569dcecbad678c94b44ee20b48bcd5693f1e43a0a96df2'
NODE_PIN = {'bytes': 126951512,
 'sha256': 'acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa',
 'resolved_path': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'}

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def git(*args, binary=False):
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Git read failed: ' + repr(args) + '\n' +
                           result.stdout.decode(errors='replace') + result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode().strip()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

def inventory():
    return sorted(name for name in git('ls-files', '-z', binary=True).decode().split('\0') if name)

def tests_on_disk():
    return sorted(str(path.relative_to(ROOT)) for path in (ROOT / 'tests').glob('*.test.mjs') if path.is_file())

def tracked_tests(names):
    return sorted(name for name in names if re.fullmatch(r'tests/[^/]+\.test\.mjs', name))

def snapshot(names):
    return {name: sha((ROOT / name).read_bytes()) for name in names}

def source_state():
    return {
        'branch': git('branch', '--show-current'),
        'commit': git('rev-parse', 'HEAD'),
        'tree': git('rev-parse', 'HEAD^{tree}'),
        'parents': git('show', '-s', '--format=%P', 'HEAD').split(),
        'status': git('status', '--porcelain=v1', '--untracked-files=all'),
    }

def require_frozen(state):
    require(state['branch'] == BRANCH, 'Source branch differs from the reviewed branch')
    require(state['commit'] == COMMIT and state['tree'] == TREE, 'Source commit/tree differs from the reviewed freeze')
    require(state['parents'] == PARENTS, 'Source parents differ from the reviewed freeze')
    require(not state['status'], 'Source checkout is not clean')

def immutable_tree_entries():
    entries = {}
    for item in git('ls-tree', '-r', '-z', COMMIT, binary=True).split(b'\0'):
        if not item:
            continue
        header, name = item.split(b'\t', 1)
        mode, kind, oid = header.decode().split()
        require(kind == 'blob', 'Reviewed source has a non-blob entry')
        entries[name.decode()] = {'mode': mode, 'object_type': kind, 'git_blob_oid': oid}
    return dict(sorted(entries.items()))

def full_source_custody():
    # Read immutable objects and working bytes/modes independently, in Git tree order.
    rows, blobs = [], {}
    for item in git('ls-tree', '-r', '-z', COMMIT, binary=True).split(b'\0'):
        if not item:
            continue
        header, raw_name = item.split(b'\t', 1)
        mode, kind, oid = header.decode().split()
        name = raw_name.decode()
        require(kind == 'blob' and mode in ['100644', '100755'], 'Unexpected source kind/mode: ' + name)
        if oid not in blobs:
            blob = git('cat-file', 'blob', oid, binary=True)
            actual_oid = hashlib.sha1(b'blob ' + str(len(blob)).encode() + b'\0' + blob).hexdigest()
            require(actual_oid == oid, 'Immutable Git object identity differs: ' + oid)
            blobs[oid] = blob
        path, blob = ROOT / name, blobs[oid]
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode), 'Working source is not a regular file: ' + name)
        require(bool(info.st_mode & 0o111) == (mode == '100755'), 'Working source executable mode differs: ' + name)
        require(path.read_bytes() == blob, 'Working source bytes differ: ' + name)
        rows.append({'path': name, 'mode': mode, 'oid': oid, 'bytes': len(blob), 'sha256': sha(blob)})
    require(len(rows) == 2546 and len(blobs) == 2288, 'Full source object inventory differs')
    require(sum(row['bytes'] for row in rows) == 88465624, 'Summed tracked bytes differ')
    digest = sha(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode())
    require(digest == SOURCE_MAP_SHA256, 'Full source canonical map differs')
    return rows

def retain_runtime_call(label, args, env, meta):
    argv = [NODE, *args]
    started = time.monotonic()
    try:
        result = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True, timeout=10)
        stdout, stderr, code, timed_out = result.stdout, result.stderr, result.returncode, False
    except subprocess.TimeoutExpired as error:
        stdout, stderr, code, timed_out = error.stdout or b'', error.stderr or b'', None, True
    (OUT / (label + '.stdout')).write_bytes(stdout)
    (OUT / (label + '.stderr')).write_bytes(stderr)
    meta['runtime_identity_calls'].append({
        'label': label, 'argv': argv, 'timeout_seconds': 10, 'exit_code': code, 'timed_out': timed_out,
        'elapsed_seconds': time.monotonic() - started,
        'stdout_bytes': len(stdout), 'stdout_sha256': sha(stdout),
        'stderr_bytes': len(stderr), 'stderr_sha256': sha(stderr),
    })
    require(code == 0 and not timed_out, 'Node identity command failed: ' + label)
    return stdout

def send_signal(proc, signum, start, meta):
    event = {'signal': signal.Signals(signum).name, 'at_elapsed_seconds': time.monotonic() - start}
    try:
        os.killpg(proc.pid, signum)
        event['delivered'] = True
    except ProcessLookupError:
        event['delivered'] = False
    meta['termination_events'].append(event)

require(len(sys.argv) == 2, 'Exactly one reviewed configuration path is required')
require(not OUT.exists() and not OUT.is_symlink(), 'First-outcome directory already exists; no rerun permitted')
require(not OUT.is_relative_to(ROOT), 'Output must remain external to the source checkout')
CONFIG = Path(sys.argv[1]).resolve(strict=True)
driver_path = Path(__file__).resolve(strict=True)
require(not CONFIG.is_relative_to(ROOT) and not driver_path.is_relative_to(ROOT), 'Controls must remain external')
driver_raw, config_raw = driver_path.read_bytes(), CONFIG.read_bytes()
OUT.mkdir(mode=0o700)
(OUT / DRIVER_COPY).write_bytes(driver_raw)
(OUT / CONFIG_COPY).write_bytes(config_raw)
meta = {
    'schema': RESULT_SCHEMA,
    'source_commit': COMMIT, 'source_tree': TREE, 'source_branch': BRANCH, 'source_parents': PARENTS,
    'cwd': str(ROOT), 'driver_original_path': str(driver_path), 'config_original_path': str(CONFIG),
    'output_original_path': str(OUT), 'driver_sha256': sha(driver_raw), 'config_sha256': sha(config_raw),
    'python_version': platform.python_version(), 'python_executable': sys.executable,
    'recorder_started_at_utc': utc(), 'runtime_identity_calls': [],
    'project_command_started': False, 'exit_code': None, 'timed_out': False,
    'termination_events': [], 'execution_budget_seconds': BUDGET,
    'termination_signal_after_seconds': TERM_AFTER, 'termination_grace_seconds': BUDGET - TERM_AFTER,
    'scope': SCOPE,
}
names = None
before = None
actual_tests = None
tracked_top_tests = None
postflight_error = None
stage = 'configuration'
try:
    config = json.loads(config_raw)
    require(sha(config_raw) == CONFIG_SHA256, 'Configuration byte identity differs from reviewed source')
    require(config['schema'] == CONFIG_SCHEMA, 'Wrong configuration schema')
    require(config['source_parents'] == PARENTS and config['expected_source_map_sha256'] == SOURCE_MAP_SHA256,
            'Configuration source custody differs')
    expected_names = [name for path in SOURCES for name in config['expected_case_names_by_file'][path]]
    require(config['expected_case_count'] == len(expected_names) == len(set(expected_names)) == 132,
            'Source-derived case inventory differs')
    ordered_file_names = [{'file': path, 'name': name} for path in SOURCES for name in config['expected_case_names_by_file'][path]]
    require(sha(json.dumps(expected_names, ensure_ascii=False, separators=(',', ':')).encode()) ==
            config['expected_ordered_names_sha256'], 'Ordered name identity differs')
    require(sha(json.dumps(ordered_file_names, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()) ==
            config['expected_ordered_file_names_sha256'], 'Ordered file/name identity differs')
    save('expected-case-names.json', expected_names)
    require(config['source_commit'] == COMMIT and config['source_tree'] == TREE and config['source_branch'] == BRANCH,
            'Configuration does not identify the fixed reviewed source')
    require(config['expected_tracked_file_count'] == 2546 and config['expected_all_top_level_test_count'] == 207,
            'Configuration inventory sizes differ from the fixed review')
    require(config['expected_node_version'] == 'v24.22.3' and config['expected_node_binary'] == NODE_PIN, 'Configuration runtime differs')
    require(config['execution_budget_seconds'] == BUDGET and config['termination_signal_after_seconds'] == TERM_AFTER,
            'Configuration execution budget differs')
    require(config['source_paths'] == SOURCES and config['expected_sources'] == SOURCE_PINS,
            'Configuration source selection or byte identities differ')
    if MODE == 'focused':
        require(config['expected_test_file_count'] == 5 and config['test_files'] == SOURCES, 'Focused test selection differs')
    stage = 'source guard'
    state_before = source_state()
    meta['source_state_before'] = state_before
    require_frozen(state_before)
    blocked = sorted(key for key in os.environ if key == 'NODE_OPTIONS' or key.startswith('DECKCHEK_AUDIO_') or key == 'MIXXX_CONTROLLERS_DIR')
    meta['forbidden_environment_variable_names'] = blocked
    require(not blocked, 'Forbidden execution environment variable names: ' + ', '.join(blocked))
    names = inventory()
    actual_tests, tracked_top_tests = tests_on_disk(), tracked_tests(names)
    require(len(names) == 2546, 'Tracked file inventory count differs')
    require(actual_tests == tracked_top_tests and len(actual_tests) == 207, 'Actual/tracked top-level test inventories differ')
    require(all(name in names for name in SOURCES), 'Selected source is not tracked')
    if MODE == 'focused':
        require(SOURCES == sorted(set(SOURCES)) and all(name in actual_tests for name in SOURCES), 'Invalid focused test list')
    entries = immutable_tree_entries()
    require(list(entries) == names, 'Immutable Git inventory differs from working index')
    source_map_before = full_source_custody()
    save('full-source-before.json', source_map_before)
    meta['full_source_map_sha256_before'] = SOURCE_MAP_SHA256
    meta['immutable_distinct_blob_count'] = 2288
    meta['summed_tracked_bytes'] = 88465624
    meta['source_working_bytes_modes_verified_before'] = True
    before = snapshot(names)
    save('tracked-before.json', before)
    save('tracked-inventory-before.json', names)
    save('all-top-level-test-files.json', actual_tests)
    save('tracked-top-level-test-files.json', tracked_top_tests)
    save('source-tree-entries.json', entries)
    meta['tracked_file_count'] = len(names)
    meta['all_top_level_test_file_count'] = len(actual_tests)
    meta['status_before'] = state_before['status']
    meta['selected_source_identities_before'] = {}
    for source in SOURCES:
        raw = (ROOT / source).read_bytes()
        identity = {'bytes': len(raw), 'sha256': sha(raw)}
        meta['selected_source_identities_before'][source] = identity
        require(identity == SOURCE_PINS[source], 'Selected source byte identity differs: ' + source)
    save('test-files.json', SOURCES)
    meta['test_file_count'] = len(SOURCES)
    env = dict(os.environ)
    env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
    meta['node_options'] = None
    meta['diagnostic_variables_present'] = []
    meta['optional_external_corpus_present'] = False
    meta['environment_changes'] = {'PATH_prefix': str(Path(NODE).parent)}
    stage = 'runtime identity'
    node_raw = Path(NODE).read_bytes()
    meta['node_executable_bytes'] = len(node_raw)
    meta['node_executable_sha256_before'] = sha(node_raw)
    meta['node_resolved_path'] = str(Path(NODE).resolve(strict=True))
    require({'bytes': len(node_raw), 'sha256': sha(node_raw), 'resolved_path': meta['node_resolved_path']} == NODE_PIN,
            'Node executable bytes/path differ from the reviewed runtime')
    version = retain_runtime_call('node-version', ['--version'], env, meta).decode().strip()
    runtime = json.loads(retain_runtime_call('node-runtime',
        ['-p', 'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch,execArgv:process.execArgv})'], env, meta))
    meta['node_version'], meta['runtime'] = version, runtime
    require(version == 'v24.22.3' and runtime['versions']['node'] == '24.22.3' and runtime['execPath'] == NODE,
            'Absolute Node runtime identity differs')
    require_frozen(source_state())
    argv = [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap', *SOURCES]
    meta['argv'] = argv
    stage = 'project command'
    meta['started_at_utc'] = utc()
    save('running.json', meta)
    start = time.monotonic()
    with (OUT / STDOUT_NAME).open('wb') as stdout, (OUT / STDERR_NAME).open('wb') as stderr:
        proc = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        meta['project_command_started'] = True
        meta['project_pid'] = proc.pid
        try:
            code = proc.wait(timeout=max(0, TERM_AFTER - (time.monotonic() - start)))
        except subprocess.TimeoutExpired:
            meta['timed_out'] = True
            send_signal(proc, signal.SIGTERM, start, meta)
            try:
                code = proc.wait(timeout=max(0, BUDGET - (time.monotonic() - start)))
            except subprocess.TimeoutExpired:
                send_signal(proc, signal.SIGKILL, start, meta)
                code = proc.wait()
    meta['exit_code'] = code
    meta['execution_elapsed_seconds'] = time.monotonic() - start
    meta['completed_at_utc'] = utc()
except BaseException as error:
    meta['recorder_error_stage'] = stage
    meta['recorder_error_type'] = type(error).__name__
    meta['recorder_error_message'] = str(error)
    (OUT / 'recorder-error.txt').write_text(traceback.format_exc())
finally:
    if before is not None:
        try:
            source_map_after = full_source_custody()
            save('full-source-after.json', source_map_after)
            meta['full_source_map_sha256_after'] = SOURCE_MAP_SHA256
            meta['source_working_bytes_modes_verified_after'] = True
            require(source_map_before == source_map_after, 'Full immutable source or working mode/byte custody changed')
            names_after = inventory()
            after = snapshot(names_after)
            actual_after, tracked_after_tests = tests_on_disk(), tracked_tests(names_after)
            save('tracked-after.json', after)
            save('tracked-inventory-after.json', names_after)
            save('all-top-level-test-files-after.json', actual_after)
            save('tracked-top-level-test-files-after.json', tracked_after_tests)
            state_after = source_state()
            meta.update({
                'source_state_after': state_after,
                'head_after': state_after['commit'], 'tree_after': state_after['tree'],
                'status_after': state_after['status'],
                'tracked_hash_maps_equal': before == after, 'tracked_file_inventory_equal': names == names_after,
                'actual_test_inventory_equal': actual_tests == actual_after,
                'tracked_test_inventory_equal': tracked_top_tests == tracked_after_tests,
                'actual_and_tracked_test_inventories_equal_after': actual_after == tracked_after_tests,
                'changed_tracked_paths': [name for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)],
                'selected_source_identities_after': {name: {'bytes': (ROOT / name).stat().st_size, 'sha256': sha((ROOT / name).read_bytes())} for name in SOURCES},
                'driver_sha256_after': sha(driver_path.read_bytes()), 'config_sha256_after': sha(CONFIG.read_bytes()),
                'node_executable_sha256_after': sha(Path(NODE).read_bytes()),
            })
            require_frozen(state_after)
            require(before == after and names == names_after, 'Tracked source changed during the first outcome')
            require(actual_tests == actual_after == tracked_after_tests == tracked_top_tests, 'Test inventories changed during the first outcome')
            require(meta['selected_source_identities_before'] == meta['selected_source_identities_after'], 'Selected source bytes changed')
            require(meta['driver_sha256'] == meta['driver_sha256_after'] and meta['config_sha256'] == meta['config_sha256_after'],
                    'Reviewed external control bytes changed')
            if 'node_executable_sha256_before' in meta:
                require(meta['node_executable_sha256_before'] == meta['node_executable_sha256_after'], 'Node binary changed')
        except BaseException as error:
            postflight_error = traceback.format_exc()
            meta['postflight_error_type'] = type(error).__name__
            meta['postflight_error_message'] = str(error)
            (OUT / 'postflight-error.txt').write_text(postflight_error)
    for filename, label in [(STDOUT_NAME, 'stdout'), (STDERR_NAME, 'stderr')]:
        path = OUT / filename
        if path.exists():
            raw = path.read_bytes()
            meta[label + '_file'] = filename
            meta[label + '_bytes'], meta[label + '_sha256'] = len(raw), sha(raw)
            if label == 'stdout' and MODE == 'focused':
                meta['tap_bytes'], meta['tap_sha256'] = len(raw), sha(raw)
                meta['tap_counts'] = {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw.decode(errors='replace'), re.M)}
    if (OUT / STDOUT_NAME).exists() and 'expected_names' in locals():
        tap_text = (OUT / STDOUT_NAME).read_text(errors='replace')
        outcomes = [{'outcome': outcome, 'number': int(number), 'name': name}
                    for outcome, number, name in re.findall(r'^(ok|not ok) (\d+) - (.+)$', tap_text, re.M)]
        save('ordered-outcomes.json', outcomes)
        meta['ordered_case_names_match_source'] = [row['name'] for row in outcomes] == expected_names
        meta['ordered_case_numbers_match'] = [row['number'] for row in outcomes] == list(range(1, 133))
        meta['all_expected_cases_passed'] = len(outcomes) == 132 and all(row['outcome'] == 'ok' for row in outcomes)
        meta['tap_counts_match_expected'] = meta.get('tap_counts') == {'tests': 132, 'suites': 0, 'pass': 132, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
    meta['recorder_completed_at_utc'] = utc()
    meta['recorder_success'] = (meta['project_command_started'] and meta['exit_code'] == 0 and not meta['timed_out']
                                and 'recorder_error_type' not in meta and postflight_error is None
                                and meta.get('ordered_case_names_match_source') and meta.get('ordered_case_numbers_match')
                                and meta.get('all_expected_cases_passed') and meta.get('tap_counts_match_expected'))
    save('result.json', meta)
print(json.dumps({key: meta.get(key) for key in [
    'source_commit', 'source_tree', 'argv', 'project_command_started', 'exit_code', 'timed_out',
    'execution_elapsed_seconds', 'tap_counts', 'tracked_file_count', 'tracked_hash_maps_equal',
    'tracked_file_inventory_equal', 'status_after', 'stdout_bytes', 'stdout_sha256', 'stderr_bytes',
    'recorder_error_stage', 'recorder_error_message', 'postflight_error_message', 'recorder_success',
]}), flush=True)
sys.exit(0 if meta['recorder_success'] else 1)
