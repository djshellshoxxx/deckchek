// Imported only from the diagnostic runner after hook, after all original cases finish.
// This hashes retained synthetic fixture references; it performs no audio analysis.
import { createHash } from 'node:crypto';

const arrayIdentity = samples => samples == null ? null : {
  type: samples.constructor.name,
  samples: samples.length,
  bytes: samples.byteLength,
  sha256: createHash('sha256').update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)).digest('hex'),
};
const audioIdentity = audio => audio == null ? null : {
  sampleRate: audio.sampleRate,
  left: arrayIdentity(audio.left),
  right: arrayIdentity(audio.right),
};

export function serializeAudioContexts(records) {
  const mounts = new Map();
  return {
    schema: 'deckchek.audio-lifecycle-context.v1',
    snapshotPhase: 'runner test after hook; all original cases completed',
    inputIdentityScope: 'Actual live fixture recorded references retained at finish and hashed after the suite. Imported-file input references were not observed.',
    limitations: [
      'Delayed references are not immutable snapshots at analyzer entry and provide no before/after input hash proof.',
      'The finish payload omits raw internal fits and unrounded lag/clock fields; rounded latency/clock measurements remain available. No missing field is inferred or reconstructed here.',
      'Full left/right buffers intentionally differ during crosstalk segments; equality is not required.',
      'Retaining references extends object/buffer lifetimes during later analyses and may affect allocation or timing; this observer effect does not establish a failure cause.',
      'Test-harness instrumentation changes execution context; this observation is not a production repair or qualification pass.',
    ],
    results: records.map((record, index) => {
      if (!mounts.has(record.mountKey)) mounts.set(record.mountKey, mounts.size + 1);
      const source = record.result.extra?.captureIntegrity?.source ?? null;
      const live = source === 'live';
      const captureOptions = live ? record.capture.options : null;
      return {
        sequence: index + 1,
        mount: mounts.get(record.mountKey),
        test: { id: record.test.id, method: record.test.method, title: record.test.title },
        source,
        fixtureAttemptAtFinish: live ? record.capture.attempt : null,
        input: live ? audioIdentity(record.capture.audio) : null,
        inputIdentityUnavailableReason: live ? null : 'Imported decode input was not observed by this live fixture hook.',
        captureOptions: captureOptions == null ? null : {
          deviceName: captureOptions.deviceName, maxSeconds: captureOptions.maxSeconds, pairs: captureOptions.pairs,
        },
        playback: record.playback.map(({ buffer, opts, extra }) => ({ input: audioIdentity(buffer), options: opts, output: extra })),
        callsAtFinish: record.calls,
        result: record.result,
      };
    }),
  };
}
