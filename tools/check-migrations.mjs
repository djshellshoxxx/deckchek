// Validates database/migrations/*.sql (FS-00 §4.1, §5.2).
//   node tools/check-migrations.mjs                 names, duplicates, BEGIN/COMMIT
//   node tools/check-migrations.mjs --contiguous    also require a gap-free 0001..N prefix (release tags)
// Exit 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;
const TXN = /^\s*(BEGIN|COMMIT|END|ROLLBACK)\b/im;

export function checkMigrations(files, { contiguous = false, read = () => '' } = {}) {
  const problems = [];
  const seen = new Map();
  for (const f of files) {
    const m = NAME.exec(f);
    if (!m) { problems.push(`${f}: name must match ^\\d{4}_[a-z0-9_]+\\.sql$`); continue; }
    const n = Number(m[1]);
    if (n === 0) problems.push(`${f}: version 0000 is not allowed`);
    if (seen.has(n)) problems.push(`${f}: duplicate version ${m[1]} (also ${seen.get(n)})`);
    else seen.set(n, f);
    if (TXN.test(read(f))) problems.push(`${f}: must not contain BEGIN/COMMIT/ROLLBACK (the runner owns the transaction)`);
  }
  if (contiguous) {
    const max = Math.max(0, ...seen.keys());
    for (let n = 1; n <= max; n++) if (!seen.has(n)) problems.push(`gap: no migration numbered ${String(n).padStart(4, '0')} (max is ${String(max).padStart(4, '0')})`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'migrations');
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort();
  const problems = checkMigrations(files, { contiguous: process.argv.includes('--contiguous'), read: f => fs.readFileSync(path.join(dir, f), 'utf8') });
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`${files.length} migrations OK${process.argv.includes('--contiguous') ? ' (contiguous)' : ''}`);
}
