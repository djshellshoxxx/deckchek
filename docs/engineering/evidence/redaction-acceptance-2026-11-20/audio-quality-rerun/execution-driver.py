from pathlib import Path
import datetime, hashlib, json, os, platform, re, signal, subprocess, time
ROOT = Path("/workspace/scratch/6f2247f2f463/deckchek-redaction-functional-fresh")
OUT = Path(__file__).resolve().parent
NODE = "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node"
def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode().strip()
def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def snapshot():
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    return {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names if name}
def dump(name, data):
    (OUT/name).write_text(json.dumps(data, indent=2) + "\n")
head, tree = git("rev-parse", "HEAD"), git("rev-parse", "HEAD^{tree}")
assert head == "6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6"
assert tree == "7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a"
status_before = git("status", "--porcelain=v1", "--untracked-files=all")
assert status_before == "", status_before
before = snapshot()
dump("tracked-before.json", before)
files = ["tests/audio-quality.test.mjs"]
argv = [NODE, "--test", "--test-concurrency=1", "--test-reporter=tap", *files]
env = dict(os.environ)
env["PATH"] = str(Path(NODE).parent) + os.pathsep + env.get("PATH", "")
version = subprocess.check_output([NODE,"--version"],env=env,text=True).strip()
assert version == "v24.22.3"
versions = json.loads(subprocess.check_output([NODE,"-p","JSON.stringify({versions:process.versions,execPath:process.execPath,platform:process.platform,arch:process.arch})"],env=env,text=True))
started, monotonic_start = utc(), time.monotonic()
metadata = {"source_commit":head,"source_tree":tree,"working_directory":str(ROOT),"node_executable":NODE,"node_version":version,"runtime":versions,"python_version":platform.python_version(),"host":platform.platform(),"serial":True,"argv":argv,"test_file_count":len(files),"started_at_utc":started,"status_before":status_before,"tracked_file_count":len(before),"timeout_seconds":180,"log_outside_checkout":True,"node_directory_first_in_child_path":True}
dump("audio-quality-rerun-running.json", metadata)
print(json.dumps({"started_at_utc":started,"source":head,"files":len(files),"tracked":len(before),"node":version}),flush=True)
timed_out = False
with (OUT/"audio-quality-rerun.tap").open("wb") as log:
    process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        code = process.wait(timeout=180)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            code = process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            code = process.wait()
elapsed, completed = time.monotonic()-monotonic_start, utc()
after = snapshot()
dump("tracked-after.json", after)
status_after = git("status", "--porcelain=v1", "--untracked-files=all")
log_bytes = (OUT/"audio-quality-rerun.tap").read_bytes()
log_text = log_bytes.decode()
counts = {key:int(value) for key,value in re.findall(r"^# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]+)$",log_text,re.M)}
duration = re.findall(r"^# duration_ms ([0-9.]+)$",log_text,re.M)
metadata.update({"completed_at_utc":completed,"elapsed_seconds":elapsed,"exit_code":code,"timed_out":timed_out,"tap_counts":counts,"tap_duration_ms":float(duration[-1]) if duration else None,"tap_sha256":hashlib.sha256(log_bytes).hexdigest(),"tap_bytes":len(log_bytes),"status_after":status_after,"tracked_hash_maps_equal":before==after,"head_after":git("rev-parse","HEAD"),"tree_after":git("rev-parse","HEAD^{tree}"),"skipped_lines":[line for line in log_text.splitlines() if "# SKIP" in line]})
dump("audio-quality-rerun.json", metadata)
print(json.dumps({key:metadata[key] for key in ("exit_code","timed_out","tap_counts","elapsed_seconds","tracked_hash_maps_equal","status_after","tap_sha256")}),flush=True)
