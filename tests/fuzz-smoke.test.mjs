// Every-push fuzz smoke for the JavaScript parsers (tests/fuzz/). Long runs: tools/fuzz-js.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargets } from './fuzz/targets.mjs';
import { runTarget } from './fuzz/harness.mjs';

const ITERATIONS = Number(process.env.FUZZ_JS_ITERATIONS || 400);

for (const target of buildTargets()) {
  test(`fuzz smoke: ${target.name} survives ${ITERATIONS} seeded mutations`, () => {
    const r = runTarget(target, { seeds: target.seeds, iterations: ITERATIONS, seed: 20261028 });
    assert.ok(!r.error, r.error && `${target.name} iteration ${r.iteration}: ${r.error?.stack || r.error}\ninput (first 300 chars): ${JSON.stringify(String(r.input).slice(0, 300))}`);
  });
}
