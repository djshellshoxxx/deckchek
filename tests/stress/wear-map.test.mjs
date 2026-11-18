import test from 'node:test';
import { createScanner } from '../../app/wear-map.js';
import { quadratureTimecode } from '../fixtures/signals.mjs';
import { FULL, measure } from './helpers.mjs';

test('stress: wear-map streaming scanner keeps memory bounded over a long side', () => {
  const seconds = FULL ? 900 : 90, sampleRate = 48000, chunkSec = 30;
  const scanner = createScanner({ format: 'Serato CV02.5', sampleRate });
  measure(`wear-map stream ${seconds}s`, () => {
    for (let t = 0; t < seconds; t += chunkSec) {
      const c = quadratureTimecode({ carrierHz: 1000, seconds: chunkSec, sampleRate, snrDb: 35, seed: 1 + t });
      scanner.push(c.left, c.right);
    }
    return scanner.finish?.() ?? null;
  }, { budgetMs: FULL ? 180_000 : 30_000, budgetMb: FULL ? 900 : 700 });
});
