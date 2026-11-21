import hashlib, json, os, pathlib, re, signal, subprocess, sys, time
stage = sys.argv[1]
extra = {'baseline':[], 'instrumented':['--','--show-output'],
    'phases':['fleet::fleet_gate_diagnostic::bounded_phase_measurements',
        '--','--ignored','--exact','--nocapture']}[stage]
argv = ['cargo','+nightly-2026-11-21','test','--locked','--manifest-path',
    'src-tauri/Cargo.toml','-j','4','--lib','--target',
    'x86_64-unknown-linux-gnu'] + extra
out = pathlib.Path(os.environ['RUNNER_TEMP']) / 'fleet-gate-context'
log = out / (stage + '.log')
started = time.monotonic()
with log.open('wb') as stream:
    process = subprocess.Popen(argv, stdout=stream, stderr=subprocess.STDOUT,
        start_new_session=True)
    try:
        code = process.wait(timeout=180 if stage == 'phases' else 1200)
    except subprocess.TimeoutExpired:
        try: os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: pass
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        process.wait()
        code = 124
text = log.read_text(errors='replace')
matches = re.findall(r'test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;', text)
counts = dict(zip(['passed','failed','ignored','measured','filtered'], map(int,matches[-1]))) if len(matches) == 1 else None
def records(marker):
    return [json.loads(line.split(marker,1)[1]) for line in text.splitlines() if marker in line]
gates = records('FLEET_GATE_CONTEXT ')
samples = records('FLEET_PHASE_SAMPLE ')
sql = records('FLEET_SQL_CONTEXT ')
if stage == 'phases':
    complete = bool(counts and counts['passed'] == 1 and counts['failed'] == 0
        and counts['ignored'] == 0 and counts['filtered'] == 775 and counts['measured'] == 0
        and [x['pair'] for x in samples] == [0,1,2,3]
        and all(x['rows'] == 2000 and x['allRowsEqual'] and len(x['phases']) == 4 for x in samples)
        and len(sql) == 1 and sql[0]['migrations'] == 25 and len(sql[0]['queryPlans']) == 6)
else:
    complete = bool(counts and counts['passed'] + counts['failed'] == 767
        and counts['ignored'] == (8 if stage == 'baseline' else 9)
        and counts['filtered'] == 0 and counts['measured'] == 0
        and (not gates if stage == 'baseline' else len(gates) == 1 and gates[0]['budgetMs'] == 200))
binaries = []
for candidate in re.findall(r'Running unittests[^\n]* \(([^\n]+)\)', text):
    path = pathlib.Path(candidate)
    if path.is_file():
        binaries.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
record = {'stage':stage,'argv':argv,'cwd':str(pathlib.Path.cwd()),
    'elapsedSeconds':time.monotonic()-started,'exitCode':code,
    'testsReached':counts is not None,'testCounts':counts,'evidenceComplete':complete,
    'gateRecords':gates,'phaseRecords':samples,'sqlRecords':sql,'binaries':binaries,
    'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),
    'fleetSha256':hashlib.sha256(pathlib.Path('src-tauri/src/fleet.rs').read_bytes()).hexdigest(),
    'manifestSha256':hashlib.sha256(pathlib.Path('src-tauri/Cargo.toml').read_bytes()).hexdigest(),
    'lockSha256':hashlib.sha256(pathlib.Path('src-tauri/Cargo.lock').read_bytes()).hexdigest(),
    'migrationSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(pathlib.Path('database/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql'))},
    'trackedStatus':subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],text=True)}
(out / (stage + '.json')).write_text(json.dumps(record, indent=2)+'\n')
with open(os.environ['GITHUB_OUTPUT'],'a') as output:
    output.write('tests_ran='+str(record['testsReached'] and complete and bool(binaries)).lower()+'\n')
print(text)
print(json.dumps(record, indent=2))
# Preserve failures in JSON; the final step makes any failure fail the job.
