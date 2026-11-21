#!/usr/bin/env python3
"""Unexecuted exact-byte launcher. A separate root FIRST authorization is required."""
import hashlib
import os
import pathlib
import stat
import sys
import traceback

ROOT = pathlib.Path('/workspace/scratch/6f2247f2f463/deckchek-system-health-functional')
OUT = pathlib.Path('/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-raw')
LAUNCHER = pathlib.Path('/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-authorized-launcher.py')
RECORDER = pathlib.Path('/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-recorder.py')
CONFIG = pathlib.Path('/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-selection.json')
PYTHON = pathlib.Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3')
PINS = [{'bytes': 27466,
  'is_symlink': False,
  'mode': '0600',
  'path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-recorder.py',
  'resolved_path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-recorder.py',
  'sha256': 'e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b'},
 {'bytes': 28712,
  'is_symlink': False,
  'mode': '0600',
  'path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-selection.json',
  'resolved_path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-focused-selection.json',
  'sha256': 'ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a'},
 {'bytes': 163,
  'is_symlink': False,
  'mode': '0600',
  'path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-authorized-command.txt',
  'resolved_path': '/workspace/scratch/6f2247f2f463/deckchek-system-health-round18-authorized-command.txt',
  'sha256': '0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c'},
 {'bytes': 570148,
  'is_symlink': False,
  'mode': '0644',
  'path': '/workspace/scratch/6f2247f2f463/system-health-functional-round18-source-identity.json',
  'resolved_path': '/workspace/scratch/6f2247f2f463/system-health-functional-round18-source-identity.json',
  'sha256': '94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2'},
 {'bytes': 95393,
  'is_symlink': False,
  'mode': '0644',
  'path': '/workspace/scratch/6f2247f2f463/system-health-functional-round18-case-inventory.json',
  'resolved_path': '/workspace/scratch/6f2247f2f463/system-health-functional-round18-case-inventory.json',
  'sha256': 'c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1'},
 {'bytes': 126951512,
  'is_symlink': False,
  'mode': '0755',
  'path': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node',
  'resolved_path': '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node',
  'sha256': 'acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa'},
 {'bytes': 30894944,
  'is_symlink': True,
  'mode': '0755',
  'path': '/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  'resolved_path': '/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3.12',
  'sha256': 'fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7'},
 {'bytes': 4082768,
  'is_symlink': False,
  'mode': '0755',
  'path': '/usr/bin/git',
  'resolved_path': '/usr/bin/git',
  'sha256': '356db14e102d68a1a37d8a1ac577dfd678d45d46e92f468bef8b7154e7bfdc60'}]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def identity(path):
    path = pathlib.Path(path)
    require(stat.S_ISREG(path.stat().st_mode), 'Not a regular file: ' + str(path))
    raw = path.read_bytes()
    return {'path': str(path), 'resolved_path': str(path.resolve()), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'mode': format(stat.S_IMODE(path.stat().st_mode), '04o'),
            'is_symlink': path.is_symlink()}


try:
    require(len(sys.argv) == 1 and pathlib.Path(__file__).resolve() == LAUNCHER, 'Launcher path or arguments differ')
    require(pathlib.Path.cwd() == ROOT, 'Invocation working directory differs')
    require(not OUT.exists() and not OUT.is_symlink(), 'Refusing an existing raw output directory')
    require(not LAUNCHER.is_symlink() and stat.S_IMODE(LAUNCHER.stat().st_mode) == 0o600, 'Launcher kind or mode differs')
    require(pathlib.Path(sys.executable).resolve() == PYTHON.resolve() and sys.flags.isolated == 1, 'Isolated pinned Python is required')
    for pin in PINS:
        require(identity(pin['path']) == pin, 'Pre-execution pinned file identity differs: ' + pin['path'])
    recorder_sha = PINS[0]['sha256']
    launcher_sha = identity(LAUNCHER)['sha256']
    os.execv(str(PYTHON), [str(PYTHON), '-I', str(RECORDER), str(CONFIG), recorder_sha, launcher_sha])
except Exception:
    # A pre-execution denial leaves the raw directory absent; retain this original
    # command stderr with the launch record and request no automatic retry.
    traceback.print_exc()
    sys.exit(1)
