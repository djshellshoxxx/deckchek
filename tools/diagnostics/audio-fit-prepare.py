"""Materialize one exact committed tree and instrument only its disposable audio-quality.js."""
from pathlib import Path, PurePosixPath
import datetime
import difflib
import hashlib
import io
import json
import subprocess
import sys
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def transform(source):
    edits = []

    def after(anchor, addition):
        nonlocal source
        assert source.count(anchor) == 1, ("anchor must match exactly once", anchor)
        source = source.replace(anchor, anchor + addition, 1)
        edits.append({"anchor": anchor, "addition": addition})

    after("import { evaluatePass } from './device-checks.js';\n",
          "import { audioFitTraceBegin, audioFitTraceStage, audioFitTraceReadout } from '../tools/diagnostics/audio-fit-recorder.mjs';\n")
    after("  if (!L.every(Number.isFinite) || !R.every(Number.isFinite)) { out.issues.push(issue('BAD_INPUT', 'The recording contains non-finite samples. No measurements were produced.')); return out; }\n",
          "  const fitTrace = audioFitTraceBegin(captured, meta, { chainFloor, calibrated, trimSec, maxLagSec });\n")
    after("    const xs = slice(x, toneSeg), f0 = fAt(1000);\n",
          "    audioFitTraceStage(fitTrace, 'before-fundamental', c, xs, null, { sampleRate: sr, f0, clockPpm, shift, trim, lagSamples: out.lagSamples });\n")
    after("    const fit = fitTone(xs, sr, f0);\n",
          "    audioFitTraceStage(fitTrace, 'fundamental-return', c, xs, fit, { sampleRate: sr, f0 });\n")
    after("    let thdn = toneRms > 0 ? (fit.residualRms / toneRms) * 100 : NaN;\n",
          "    audioFitTraceStage(fitTrace, 'cached-tone-rms-initial-thdn', c, xs, fit, { toneRms, thdn });\n")
    after("    for (let k = 2; k <= 9 && k * f0 < 0.45 * sr; k++) harm += fitTone(xs, sr, k * f0).amplitude ** 2;\n",
          "    audioFitTraceStage(fitTrace, 'after-harmonics', c, xs, fit, { toneRms, thdn, harm });\n")
    after("    const low = fitAt(x, seg('lin-low')[0]), high = fitAt(x, seg('lin-high')[0]);\n",
          "    audioFitTraceStage(fitTrace, 'after-low-high', c, xs, fit, { toneRms, thdn, harm, thd, dc, noiseA, noiseU }, { low, high });\n")
    after("    per[c].phaseDeg = Math.atan2(Math.sin(ph), Math.cos(ph)) * 180 / Math.PI;\n",
          "    audioFitTraceStage(fitTrace, 'after-channel-metrics', c, xs, fit, { toneRms, thdn, harm, thd, gainDb: per[c].gainDb, snr: per[c].snr, phaseDeg: per[c].phaseDeg });\n")
    after("  out.channels = per;\n",
          "  audioFitTraceReadout(fitTrace, 'after-both-channels', out, per);\n")
    after("  const ref1k = Object.fromEntries(Object.keys(chans).map(c => [c, per[c].fit.amplitude]));\n",
          "  audioFitTraceReadout(fitTrace, 'response-reference', out, per, ref1k);\n")
    after("  const sepLR = sepOf('L', 'R', 'xtalk-L'), sepRL = sepOf('R', 'L', 'xtalk-R');\n",
          "  audioFitTraceReadout(fitTrace, 'after-response-and-crosstalk', out, per, ref1k, { sepLR, sepRL });\n")
    after("  const hum = Math.max(w('L').hum.mainsDb - dbfs(w('L').fit.amplitude), w('R').hum.mainsDb - dbfs(w('R').fit.amplitude));\n",
          "  audioFitTraceReadout(fitTrace, 'after-hum-read', out, per, ref1k, { bal, polarityInv, hum });\n")
    after("  out.valid = true;\n",
          "  audioFitTraceReadout(fitTrace, 'return', out, per, ref1k, { bal, polarityInv, hum, sepLR, sepRL }, { left: L, right: R });\n")
    return source, edits


def main():
    root, expected, destination, evidence = sys.argv[1:]
    root, destination, evidence = (Path(p).resolve() for p in (root, destination, evidence))
    assert not destination.is_relative_to(root) and not evidence.is_relative_to(root)
    assert not destination.exists() and not evidence.exists()

    def git(*args, text=True):
        return subprocess.check_output(['git', *args], cwd=root, text=text).strip() if text else subprocess.check_output(['git', *args], cwd=root)

    head, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
    assert head == expected, (head, expected)
    assert not git('status', '--porcelain=v1', '--untracked-files=all')
    object_format = git('rev-parse', '--show-object-format')
    entries = {}
    for item in git('ls-tree', '-rz', '--full-tree', head, text=False).split(b'\0'):
        if not item:
            continue
        prefix, name = item.split(b'\t', 1)
        mode, kind, object_id = prefix.decode().split()
        assert kind == 'blob' and mode in ('100644', '100755'), (name, mode, kind)
        entries[name.decode()] = {"mode": mode, "object": object_id}

    def snapshot(base):
        return {name: sha((base / name).read_bytes()) for name in entries}

    source_before = snapshot(root)
    archive = git('archive', '--format=tar', head, text=False)
    destination.mkdir(parents=True, exist_ok=False)
    evidence.mkdir(parents=True, exist_ok=False)
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        for member in bundle.getmembers():
            path = PurePosixPath(member.name)
            assert not path.is_absolute() and '..' not in path.parts
            assert member.isdir() or member.isfile(), member.name
        bundle.extractall(destination, filter='data')
    assert set(p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()) == set(entries)
    for name, entry in entries.items():
        raw = (destination / name).read_bytes()
        assert hashlib.new(object_format, b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == entry['object'], name
    copy_before = snapshot(destination)
    assert copy_before == source_before
    source_path = Path('app/audio-quality.js')
    original = (destination / source_path).read_text()
    instrumented, edits = transform(original)
    (destination / source_path).write_text(instrumented)
    copy_prepared = snapshot(destination)
    changed = [name for name in entries if copy_before[name] != copy_prepared[name]]
    assert changed == [source_path.as_posix()], changed
    # Every added line is removed again to prove that original source text and read/arithmetic order remain.
    reversed_text = instrumented
    for edit in reversed(edits):
        assert reversed_text.count(edit['anchor'] + edit['addition']) == 1
        reversed_text = reversed_text.replace(edit['anchor'] + edit['addition'], edit['anchor'], 1)
    assert reversed_text == original
    source_after = snapshot(root)
    assert source_before == source_after
    assert git('rev-parse', 'HEAD') == head and not git('status', '--porcelain=v1', '--untracked-files=all')

    def save(name, data):
        (evidence / name).write_text(json.dumps(data, indent=2) + '\n')

    (evidence / 'audio-quality.original.js').write_text(original)
    (evidence / 'audio-quality.instrumented.js').write_text(instrumented)
    (evidence / 'audio-quality.patch').write_text(''.join(difflib.unified_diff(original.splitlines(keepends=True), instrumented.splitlines(keepends=True), fromfile='a/app/audio-quality.js', tofile='b/app/audio-quality.js')))
    save('tree-entries.json', entries)
    save('source-before.json', source_before)
    save('source-after.json', source_after)
    save('copy-before.json', copy_before)
    save('copy-prepared.json', copy_prepared)
    save('transformation.json', edits)
    result = {"schema": "deckchek.audio-fit-preparation.v1", "created_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "source_root": str(root), "source_commit": head, "source_tree": tree, "copy_root": str(destination),
              "evidence_root": str(evidence), "tracked_file_count": len(entries), "git_object_format": object_format,
              "archive_sha256": sha(archive), "source_hash_maps_equal": source_before == source_after,
              "copy_matches_committed_blobs_before_transform": True, "copy_changed_files": changed,
              "original_sha256": sha(original.encode()), "instrumented_sha256": sha(instrumented.encode()),
              "prepare_tool_sha256": sha(Path(__file__).read_bytes()), "addition_count": len(edits),
              "additions_reversed_equal_original": True, "project_execution_performed": False}
    save('preparation.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
