// Long JavaScript fuzz run (nightly CI / local): node tools/fuzz-js.mjs [seconds-per-target] [crash-dir]
// Exits 1 and writes the failing input to <crash-dir>/<target>-<seed>.txt on the first crash per target.
import fs from 'node:fs';
import path from 'node:path';
import { buildTargets } from '../tests/fuzz/targets.mjs';
import { runTarget } from '../tests/fuzz/harness.mjs';

const seconds = Number(process.argv[2] || 60);
const crashDir = process.argv[3] || 'fuzz-crashes';
const seed = Number(process.env.FUZZ_SEED || Date.now() % 2 ** 31);
let failed = 0;
for (const target of buildTargets()) {
  const r = runTarget(target, { seeds: target.seeds, iterations: Infinity, timeBudgetMs: seconds * 1000, seed });
  if (r.error) {
    failed++;
    fs.mkdirSync(crashDir, { recursive: true });
    const file = path.join(crashDir, `${target.name}-${seed}.txt`);
    fs.writeFileSync(file, String(r.input));
    console.log(`CRASH ${target.name} after ${r.executions} executions (seed ${seed}): ${r.error?.stack || r.error}\n  input saved to ${file}`);
  } else {
    console.log(`ok    ${target.name}: ${r.executions} executions in ${seconds}s, no crash (seed ${seed})`);
  }
}
process.exit(failed ? 1 : 0);
