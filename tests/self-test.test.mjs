import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSelfTest, selfTestSignal, uiChecks, runSelfTestIfRequested } from '../app/self-test.js';

test('self-test: shipping analysis recovers the known tone, speed error, level and balance', () => {
  const r = evaluateSelfTest();
  assert.ok(r.ok, JSON.stringify(r.checks));
  assert.equal(r.checks.length, 5);
});

test('self-test: a wrong signal fails the speed check (the check can fail)', () => {
  const s = selfTestSignal({ sampleRate: 48000, seconds: 3, toneHz: 1010, referenceHz: 1000, leftDbfs: -12, rightDbfs: -12.5 });
  const r = evaluateSelfTest(s);
  assert.equal(r.ok, false);
  assert.equal(r.checks.find(c => c.name.startsWith('tone')).ok, false);
});

test('self-test: navigation check needs at least five rail items', () => {
  const doc = n => ({ querySelectorAll: () => ({ length: n }) });
  assert.equal(uiChecks(doc(9))[0].ok, true);
  assert.equal(uiChecks(doc(0))[0].ok, false);
});

test('self-test: inactive mode never reports; active mode reports once', async () => {
  const calls = [];
  const inactive = async cmd => { calls.push(cmd); return false; };
  assert.equal(await runSelfTestIfRequested(inactive), false);
  assert.deepEqual(calls, ['self_test_mode']);
  const sent = [];
  const active = async (cmd, args) => { if (cmd === 'self_test_mode') return true; sent.push(args.report); };
  assert.equal(await runSelfTestIfRequested(active), true);
  assert.equal(sent.length, 1);
  assert.equal(typeof sent[0].ok, 'boolean');
});
