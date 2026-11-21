# Exact one-run audio fit observation plan

Date: 20 November 2026, America/Los_Angeles; host timestamps use UTC.

## Frozen source

Production, tests and smoke files remain those of `eafaa53ade2b626a1817792dbab36a2b95dedd58` / tree `a7ba52d1208efa0818841b46a2c8dc5351e8e967`. The prepared descendant adds only the three owned diagnostic tools:

- Commit `f3a8a5d551d35941d3258feb34f6b2dd1bba1e3f`, tree `78c92aad0b1e26755d1e11e4ff1c2c0bd25bf9e8`.
- Source: `/workspace/scratch/6f2247f2f463/deckchek-fit-functional`.
- Disposable copy: `/workspace/scratch/6f2247f2f463/deckchek-audio-fit-disposable-20261120`.
- Preparation evidence: `/workspace/scratch/6f2247f2f463/deckchek-fit-round3-raw/preparation`.

The preparation tool materialized the exact committed tree with `git archive`, verified every extracted file against its committed Git blob ID, and retained full 2,039-file before/prepared maps. Only the disposable `app/audio-quality.js` changed: thirteen added lines. Removing those additions reconstructs the original bytes. Source HEAD/status and full source before/after maps are unchanged.

| Item | SHA-256 |
| --- | --- |
| Preparation tool | `85609f6778b1a38344ee20b0e6220f2bbd61bdfb70973f2c44f54a97749cac68` |
| Recorder | `2414c9d8692de394ef60e7390d14a79d1e6ee204e4ae80486c6c0028ca278adc` |
| Execution driver | `4daee499847e5b8c73971f5502076f1f5289ecc8e0741570bc1114fcc2c1c044` |
| Original analyzer | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| Instrumented analyzer | `39e991b51ea11f3c63b3d7b4a4630f4900568703d8ca3b9cdb9069d404c51af8` |

The exact generated patch is `preparation/audio-quality.patch`. Both complete source files, anchor/addition pairs, tree entries and hash maps are alongside it. Original arithmetic/read expressions, solver, fitAt expression, harmonic loop, test ordering/assertions, thresholds/skips and engine flags are untouched. No extra analyzer/fit call is introduced. Production source never imports the recorder.

## Observations and limits

After the original shape/rate/finite guards, record full actual L/R capture hashes, object/backing-buffer IDs and byte ranges. Earlier rejected inputs have no trace; original silent/marker/length returns may leave entry-only records.

For each channel, hash the actual tone slice and snapshot scalar fields before the fundamental call, immediately after its return, after cached tone RMS/initial THD+N, after harmonics, after low/high calls, and after channel metrics/phase. Reread the same fundamental fit after both channels, after the response reference, after response/crosstalk, after the hum read, and at successful return. The final record includes original output measurements/response plus full input hashes again. Low/high fit fields are observed after their calls; their input slice identities are not claimed as observed.

Numbers have decimal strings plus IEEE-754 binary64 big-endian hex, including signed zero/nonfinite values. WeakMap IDs add no properties and do not freeze/mutate originals. Each event becomes an immutable JSON string before its helper returns. No waveform samples or strong fit references are retained in the event list. Fit fields are read before slice hashing; observations are sequential, not atomic.

Each child writes one sanitized test-file/PID filename with exclusive wx and mode0600 in an explicit external output directory. IDs are local to that child/file. Each child is capped at 8,192 records / 8MiB serialized records, with truncation/errors explicit. The existing runner finish aggregate remains a separate comparator with all its delayed-reference limitations.

Hashes prove bytes at observed moments, not continuous immutability. Imports, synchronous hashing, added field reads, snapshot allocations, WeakMap identity, object escape, retained strings and existing aggregate fixture retention can change timing/allocation/lifetimes/optimization context. A diagnostic pass or changed failure neither qualifies untouched production nor establishes a solver, mutation, aliasing or engine cause.

## One invocation after both static reviews and root go-ahead

The driver requires matching reviewed tool/analyzer hashes and positive code/security review records. It revalidates the clean source commit, every source/copy hash and copy inventory before launching the original selection:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/audio-quality.test.mjs tests/audio-runner-lifecycle.test.mjs
```

Cwd is the disposable copy. Node must be exactly v24.22.3; NODE_OPTIONS and inherited diagnostic variables must be absent. Added environment values are only aggregate output path, trace directory, frozen commit/tree/transformed hash; PATH is prefixed with the same absolute Node directory. All original33 cases/assertions remain; failures may naturally short-circuit later statements in the same test.

There is one invocation only, bounded to180 seconds with TERM at175 and KILL by180 if needed. No browser, native runtime, broad suite, alternative engine/optimization flags, identical rerun or extra audio diagnostic is authorized. The first exit/output is preserved regardless of result, along with full source/copy maps, runtime/environment/argv, raw stdout/stderr, both child traces and the separate aggregate. Root decides later work from this new evidence.

```text
python3 -B tools/diagnostics/audio-fit-run.py /workspace/scratch/6f2247f2f463/deckchek-fit-round3-raw/preparation/preparation.json /workspace/scratch/6f2247f2f463/deckchek-fit-round3-raw/trace /workspace/scratch/6f2247f2f463/deckchek-fit-round3-raw/trace-reviews.json
```

## Already completed checks

At unchanged eafaa53, the six selected player-screen/reference-file, preset-boundary, ledger, ledger-UI and feature files ran once:82/82 passed. Raw8,257-byte stdout is Node spec output despite the inherited driver's run.tap filename; SHA `e3c49de363d42265d611ecb3f87007524f942829f397ceb8b58817979ad22f5b`. `focused/spec-summary.json` derives counts without changing or rerunning it. All2,036 tracked hashes matched.

`syntax-shell-layout` and `syntax-player-capture` each contain a separate successful Node --check and full2,036-file maps. Preparation also parsed the recorder and instrumented copy without importing/executing them; `syntax-fit-recorder` and `syntax-instrumented-copy` each exited0 with empty streams and unchanged2,039-file source maps. These are parsing checks, not audio observations or browser geometry validation. Python tools and transformation anchors were checked statically without project execution.
