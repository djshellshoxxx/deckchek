import test from 'node:test';
import assert from 'node:assert/strict';
import { rustFailureAnnotation } from '../tools/annotate-rust-failure.mjs';

test('native test annotations identify panics and encode workflow control characters', () => {
  const annotation = rustFailureAnnotation("test db::upgrade ... FAILED\nthread 'db::upgrade' panicked at src/db.rs:1:2:\nassertion failed: expected 100%\n\n::notice::must remain plain text\n\ntest result: FAILED. 0 passed; 1 failed");
  assert.ok(annotation.includes('db::upgrade'));
  assert.ok(annotation.includes('expected 100%25'));
  assert.equal(annotation.includes('\n'), false);
  assert.ok(annotation.includes('%0A::notice::must remain plain text'));
  assert.ok(rustFailureAnnotation('error: '.repeat(10000)).length < 13000);
  const signed = rustFailureAnnotation("thread 'fixture' panicked at src/test.rs:1:\nhttps://user:password@example.invalid/log?sig=SECRET");
  assert.equal(signed.includes('SECRET'), false);
  assert.equal(signed.includes('password'), false);
  assert.ok(signed.includes('query redacted'));
});
