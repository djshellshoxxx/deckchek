"""Execute the one reviewed original two-file selection in an instrumented disposable tree."""
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

NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
ARGV = [NODE, '--test', '--test-concurrency=1', '--test-reporter=tap',
        'tests/audio-quality.test.mjs', 'tests/audio-runner-lifecycle.test.mjs']


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    prepared_path, output, reviews_path = (Path(p).resolve() for p in sys.argv[1:])
    prepared = json.loads(prepared_path.read_text())
    reviews = json.loads(reviews_path.read_text())
    source = Path(prepared['source_root'])
    copy = Path(prepared['copy_root'])
    preparation_dir = prepared_path.parent
    assert not output.is_relative_to(source) and not output.is_relative_to(copy)
    assert not output.exists()
    assert 'NODE_OPTIONS' not in os.environ, 'NODE_OPTIONS must be absent'
    assert not any(key.startswith('DECKCHEK_AUDIO_FIT_') or key == 'DECKCHEK_AUDIO_CONTEXT_PATH' for key in os.environ)

    def git(*args):
        return subprocess.check_output(['git', *args], cwd=source, text=True).strip()

    def snapshot(root, names):
        return {name: sha((root / name).read_bytes()) for name in names}

    source_expected = json.loads((preparation_dir / 'source-before.json').read_text())
    copy_expected = json.loads((preparation_dir / 'copy-prepared.json').read_text())
    assert git('rev-parse', 'HEAD') == prepared['source_commit']
    assert git('rev-parse', 'HEAD^{tree}') == prepared['source_tree']
    assert not git('status', '--porcelain=v1', '--untracked-files=all')
    source_before = snapshot(source, source_expected)
    copy_before = snapshot(copy, copy_expected)
    assert source_before == source_expected and copy_before == copy_expected
    inventory_before = sorted(p.relative_to(copy).as_posix() for p in copy.rglob('*') if p.is_file())
    assert inventory_before == sorted(copy_expected)
    assert reviews['instrumented_sha256'] == prepared['instrumented_sha256']
    for name in ('audio-fit-recorder.mjs', 'audio-fit-prepare.py', 'audio-fit-run.py'):
        assert reviews['tools_sha256'][name] == sha((source / 'tools/diagnostics' / name).read_bytes()), name
    assert reviews['code_review']['approved'] is True and reviews['security_review']['approved'] is True
    assert reviews['code_review']['reviewer'] and reviews['security_review']['reviewer']

    output.mkdir(parents=True, exist_ok=False)
    traces = output / 'traces'
    traces.mkdir(mode=0o700)

    def save(name, value):
        (output / name).write_text(json.dumps(value, indent=2) + '\n')

    save('source-before.json', source_before)
    save('copy-before.json', copy_before)
    save('reviews.json', reviews)
    env = dict(os.environ)
    env['PATH'] = str(Path(NODE).parent) + os.pathsep + env.get('PATH', '')
    diagnostic = {
        'DECKCHEK_AUDIO_CONTEXT_PATH': str(output / 'contexts.json'),
        'DECKCHEK_AUDIO_FIT_TRACE_DIR': str(traces),
        'DECKCHEK_AUDIO_FIT_SOURCE_COMMIT': prepared['source_commit'],
        'DECKCHEK_AUDIO_FIT_SOURCE_TREE': prepared['source_tree'],
        'DECKCHEK_AUDIO_FIT_SOURCE_SHA256': prepared['instrumented_sha256'],
    }
    env.update(diagnostic)
    version = subprocess.check_output([NODE, '--version'], cwd=copy, env=env, text=True).strip()
    runtime = json.loads(subprocess.check_output([NODE, '-p',
        'JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})'],
        cwd=copy, env=env, text=True))
    assert version == 'v24.22.3', version
    started, start = utc(), time.monotonic()
    meta = {
        'schema': 'deckchek.audio-fit-run.v1', 'source_commit': prepared['source_commit'],
        'source_tree': prepared['source_tree'], 'source_cwd': str(source), 'cwd': str(copy), 'argv': ARGV,
        'node_version': version, 'runtime': runtime, 'node_options': env.get('NODE_OPTIONS'),
        'python_version': platform.python_version(), 'diagnostic_environment': diagnostic,
        'started_at_utc': started, 'execution_budget_seconds': 180, 'termination_signal_after_seconds': 175,
        'termination_grace_seconds': 5, 'tracked_file_count': len(source_before),
        'prepared_sha256': sha(prepared_path.read_bytes()), 'reviews_sha256': sha(reviews_path.read_bytes()),
        'driver_sha256': sha(Path(__file__).read_bytes()), 'instrumented_sha256': prepared['instrumented_sha256'],
    }
    save('running.json', meta)
    timed_out = False
    with (output / 'run.tap').open('wb') as stdout, (output / 'stderr.log').open('wb') as stderr:
        process = subprocess.Popen(ARGV, cwd=copy, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            code = process.wait(timeout=175)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                code = process.wait(timeout=max(0, 180 - (time.monotonic() - start)))
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                code = process.wait()
    execution_elapsed = time.monotonic() - start
    source_after = snapshot(source, source_expected)
    copy_after = snapshot(copy, copy_expected)
    inventory_after = sorted(p.relative_to(copy).as_posix() for p in copy.rglob('*') if p.is_file())
    save('source-after.json', source_after)
    save('copy-after.json', copy_after)
    raw = (output / 'run.tap').read_bytes()
    stderr = (output / 'stderr.log').read_bytes()
    observed = []
    for path in sorted(traces.glob('*.json')):
        content = path.read_bytes()
        item = {'file': path.name, 'bytes': len(content), 'sha256': sha(content)}
        try:
            data = json.loads(content)
            item.update({key: data[key] for key in ('testFile', 'pid', 'recordCount', 'eligibleAnalysisCount', 'truncated', 'dropped', 'errors')})
            item['json_valid'] = True
        except (ValueError, KeyError, TypeError) as error:
            item.update({'json_valid': False, 'parse_error': str(error)})
        observed.append(item)
    meta.update({
        'completed_at_utc': utc(), 'execution_elapsed_seconds': execution_elapsed, 'exit_code': code,
        'timed_out': timed_out, 'source_head_after': git('rev-parse', 'HEAD'),
        'source_tree_after': git('rev-parse', 'HEAD^{tree}'),
        'source_status_after': git('status', '--porcelain=v1', '--untracked-files=all'),
        'source_hash_maps_equal': source_before == source_after, 'copy_hash_maps_equal': copy_before == copy_after,
        'copy_inventory_equal': inventory_before == inventory_after,
        'copy_extra_files': sorted(set(inventory_after) - set(inventory_before)),
        'tap_counts': {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw.decode(), re.M)},
        'tap_bytes': len(raw), 'tap_sha256': sha(raw), 'stderr_bytes': len(stderr), 'stderr_sha256': sha(stderr),
        'traces': observed,
    })
    contexts = output / 'contexts.json'
    if contexts.exists():
        content = contexts.read_bytes()
        meta.update({'context_bytes': len(content), 'context_sha256': sha(content)})
        try:
            data = json.loads(content)
            meta.update({'context_json_valid': True, 'context_results': len(data['results'])})
        except (ValueError, KeyError, TypeError) as error:
            meta.update({'context_json_valid': False, 'context_parse_error': str(error)})
    else:
        meta['context_file_missing'] = True
    save('result.json', meta)
    print(json.dumps({key: meta[key] for key in ('source_commit', 'source_tree', 'exit_code', 'timed_out',
        'tap_counts', 'execution_elapsed_seconds', 'tracked_file_count', 'source_hash_maps_equal',
        'copy_hash_maps_equal', 'copy_inventory_equal', 'tap_bytes', 'tap_sha256', 'stderr_bytes', 'traces')}))
    assert source_before == source_after and copy_before == copy_after and inventory_before == inventory_after
    assert meta['source_head_after'] == prepared['source_commit'] and meta['source_tree_after'] == prepared['source_tree']
    assert not meta['source_status_after']


if __name__ == '__main__':
    main()
