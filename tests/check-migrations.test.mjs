import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMigrations } from '../tools/check-migrations.mjs';

test('accepts a contiguous valid set', () => {
  assert.deepEqual(checkMigrations(['0001_a.sql', '0002_b.sql'], { contiguous: true }), []);
});
test('flags bad names, duplicates and BEGIN/COMMIT', () => {
  const p = checkMigrations(['0001_a.sql', '0001_b.sql', '2_x.sql', '0003_c.sql'], { read: f => (f === '0003_c.sql' ? 'BEGIN;\nSELECT 1;' : '') });
  assert.equal(p.length, 3);
});
test('gaps fail only in contiguous mode', () => {
  assert.deepEqual(checkMigrations(['0001_a.sql', '0003_c.sql']), []);
  assert.match(checkMigrations(['0001_a.sql', '0003_c.sql'], { contiguous: true })[0], /0002/);
});
