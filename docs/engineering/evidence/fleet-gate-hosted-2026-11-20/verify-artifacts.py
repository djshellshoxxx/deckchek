"""Verify retained hosted evidence without executing application or native code."""

from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import subprocess
import zipfile


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ARTIFACT = HERE / "artifact"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


zip_path = HERE / "fleet-gate-context-44867671512.zip"
assert digest(zip_path) == "420867c55efa1b7ecf182da724d9d99893af23debb0c0d886aaa062523797de9"
with zipfile.ZipFile(zip_path) as archive:
    members = [entry for entry in archive.infolist() if not entry.is_dir()]
    assert len(members) == 13
    assert sum(entry.file_size for entry in members) < 10_000_000
    for entry in members:
        path = PurePosixPath(entry.filename)
        assert not path.is_absolute() and ".." not in path.parts
        assert "\\" not in entry.filename
        assert (entry.external_attr >> 16) & 0o170000 != 0o120000
        assert archive.read(entry) == (ARTIFACT / entry.filename).read_bytes()

complete_log = HERE / "complete-job.log"
assert complete_log.stat().st_size == 486777
assert digest(complete_log) == "5aef76d0196409c98a1b54b5d889aad3d4c42c241e5f9d7742525342c54cf7cf"
assert '"failedOrIncomplete": ["instrumented: exit 101"]' in complete_log.read_text()

context = read_json(ARTIFACT / "context.json")
proof_path = ARTIFACT / "overlay/source-proof.json"
proof = read_json(proof_path)
accepted_proof = ROOT / "docs/engineering/evidence/fleet-gate-acceptance-2026-11-20/generated/source-proof.json"
assert proof_path.read_bytes() == accepted_proof.read_bytes()
assert digest(proof_path) == "1940de1d300956e5fa24fe85d8ef71893063354a4d08ee2146a6ffa79f44738b"
assert context["sourceCommit"] == proof["sourceCommit"] == "5702a450d9a7faa3efb80c5b67de69386ae07540"
assert context["sourceTree"] == proof["sourceTree"] == "a2e4f571ac3a9c7d976db911a5fed3f910c3ea26"
assert context["toolingCommit"] == "69fc06eb471dfb00de544bbe233c0f5dc95402e8"
assert context["toolingTree"] == "09b6da880e5a19ea18cdea03e9511d760658bce4"
assert git("rev-parse", context["sourceCommit"] + "^{tree}") == context["sourceTree"]
assert git("rev-parse", context["toolingCommit"] + "^{tree}") == context["toolingTree"]
assert "commit-hash: c7d5ba59d8e11ee2e2204b173458eec4cb41c973" in context["rustc"]
assert digest(ARTIFACT / "overlay/fleet.rs") == proof["overlaySha256"]
assert digest(ROOT / "src-tauri/src/fleet.rs") == proof["originalFleetSha256"]
assert digest(ROOT / "tools/fleet-gate-diagnostic.py") == context["generatorSha256"] == proof["generatorSha256"]
for name, key in [("Cargo.toml", "manifestSha256"), ("Cargo.lock", "lockSha256")]:
    assert digest(ARTIFACT / name) == proof[key]
    assert (ARTIFACT / name).read_bytes() == (ROOT / "src-tauri" / name).read_bytes()
migrations = {p.name: digest(p) for p in sorted((ROOT / "database/migrations").glob("*.sql"))}
assert len(migrations) == 25 and migrations == proof["migrationSha256"]

stages = {}
for name, exit_code, counts in [
    ("baseline", 0, (767, 0, 8, 0)),
    ("instrumented", 101, (766, 1, 9, 0)),
    ("phases", 0, (1, 0, 0, 775)),
]:
    stage = read_json(ARTIFACT / (name + ".json"))
    assert stage["stage"] == name and stage["exitCode"] == exit_code
    assert stage["testsReached"] is True and stage["evidenceComplete"] is True
    assert tuple(stage["testCounts"][key] for key in ("passed", "failed", "ignored", "filtered")) == counts
    assert stage["testCounts"]["measured"] == 0
    assert stage["migrationSha256"] == migrations
    for key in ("manifestSha256", "lockSha256"):
        assert stage[key] == proof[key]
    assert stage["fleetSha256"] == proof["originalFleetSha256" if name == "baseline" else "overlaySha256"]
    assert stage["trackedStatus"] == ("" if name == "baseline" else " M src-tauri/src/fleet.rs\n")
    assert digest(ARTIFACT / (name + ".log")) == stage["logSha256"]
    timings = re.findall(r"test result: .*?finished in ([0-9.]+)s", (ARTIFACT / (name + ".log")).read_text())
    assert len(timings) == 1
    stage["suiteElapsedSeconds"] = float(timings[0])
    stages[name] = stage

assert stages["instrumented"]["binaries"] == stages["phases"]["binaries"]
assert stages["baseline"]["binaries"] != stages["instrumented"]["binaries"]
gate, = stages["instrumented"]["gateRecords"]
assert gate["budgetMs"] == 200 and gate["wallNs"] == 213308243
pairs = stages["phases"]["phaseRecords"]
assert len(pairs) == 4 and [pair["pair"] for pair in pairs] == [0, 1, 2, 3]
assert [pair["baselineFirst"] for pair in pairs] == [True, False, True, False]
assert all(pair["allRowsEqual"] is True and pair["rows"] == 2000 for pair in pairs)
sql, = stages["phases"]["sqlRecords"]
assert sql["migrations"] == 25 and sql["sqliteVersion"] == "3.54.1"
summary = {
    "runId": 44867671512,
    "jobId": 136734885941,
    "runUrl": "https://github.com/djshellshoxxx/deckchek/actions/runs/44867671512",
    "conclusion": "failure",
    "diagnosticOnly": True,
    "sourceCommit": context["sourceCommit"],
    "sourceTree": context["sourceTree"],
    "toolingCommit": context["toolingCommit"],
    "toolingTree": context["toolingTree"],
    "compilerCommit": "c7d5ba59d8e11ee2e2204b173458eec4cb41c973",
    "archiveByteVerification": True,
    "acceptedSourceProofByteEquality": True,
    "stages": {name: {key: record[key] for key in (
        "exitCode", "testCounts", "evidenceComplete", "elapsedSeconds", "suiteElapsedSeconds", "binaries", "logSha256", "trackedStatus"
    )} for name, record in stages.items()},
    "fullSuiteGate": gate,
    "phasePairs": [{
        "pair": pair["pair"], "baselineFirst": pair["baselineFirst"],
        "allRowsEqual": pair["allRowsEqual"], "rows": pair["rows"],
        "originalWholeCallMs": pair["baselineWholeCall"]["wallNs"] / 1e6,
        "instrumentedWholeCallMs": pair["instrumentedWholeCall"]["wallNs"] / 1e6,
        "phasesMs": {phase["name"]: phase["measurement"]["wallNs"] / 1e6 for phase in pair["phases"]},
    } for pair in pairs],
    "sqlContext": sql,
    "limits": [
        "The original PR65 failure remains failed and its cause remains unestablished.",
        "This single bounded experiment is not source-specific PR qualification and must not be retriggered until green.",
        "The untouched and instrumented full suites execute different binary hashes.",
        "Scheduler snapshots surround the wall interval and are not exactly coincident timers.",
        "The four phase pairs share a fixture that is warm after writes; order alternates but the sample is small.",
        "Four phase timers exclude recorder work and returned-value cleanup; whole-call timers include cleanup.",
        "The measured copy has probe overhead. There are no allocation measurements or causal attribution.",
        "Binary hashes are retained, but native executable bytes are not part of the uploaded artifact.",
        "No production Fleet change or threshold change is introduced by these records."
    ],
}
(HERE / "result-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
index = {"run_id": 44867671512, "artifact_id": 14692768918, "zip_sha256": digest(zip_path), "files": []}
for path in sorted(HERE.rglob("*")):
    if path.is_file() and path.name != "artifact-index.json":
        index["files"].append({"path": path.relative_to(HERE).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)})
(HERE / "artifact-index.json").write_text(json.dumps(index, indent=2) + "\n")
print(json.dumps({"verified": True, "archiveFiles": len(members), "indexedFiles": len(index["files"]), "stages": {name: record["testCounts"] for name, record in stages.items()}, "fullSuiteGateMs": gate["wallNs"] / 1e6}))
