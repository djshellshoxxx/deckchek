// Keep failed test identities visible through GitHub's checks API even when a
// runner's separate log-storage endpoint is temporarily unavailable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function rustFailureAnnotation(log) {
  const lines = String(log).split(/\r?\n/), selected = [];
  for (let index = 0; index < lines.length; index++) {
    if (/^test .* \.\.\. FAILED$|^error(?:\[|:)|^test result: FAILED/.test(lines[index])) selected.push(lines[index]);
    if (/^thread .* panicked at /.test(lines[index])) selected.push(...lines.slice(index, index + 8));
  }
  const message = (selected.join('\n') || 'Cargo tests failed; inspect the Rust tests step log.')
    .replace(/https?:\/\/[^\s]+/g, raw => {
      try { const url = new URL(raw); return `${url.origin}${url.pathname}${url.search ? '?[query redacted]' : ''}`; }
      catch { return '[URL redacted]'; }
    }).slice(0, 12000);
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::error title=Rust tests failed::${escaped}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node tools/annotate-rust-failure.mjs <test log>');
  console.log(rustFailureAnnotation(fs.readFileSync(process.argv[2], 'utf8')));
}
