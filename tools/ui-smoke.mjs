// DeckChek UI smoke test (Playwright; CI job `ui-smoke`).
// Run: NODE_PATH=$(npm root -g) node tools/ui-smoke.mjs [name ...]
// Auto-discovers tools/smoke/*.mjs (each: export default async function run(ctx) -> console errors[]);
// optional name arguments (e.g. `core`) run only those modules.
// Serves app/ over HTTP, drives the UI in Chromium (browser mode and a mocked
// Tauri desktop mode), asserts key behaviour and saves screenshots to
// /tmp/deckchek-shots (override with SHOTS_DIR).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const SHOTS = process.env.SHOTS_DIR || '/tmp/deckchek-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'";

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'smoke');
  const only = process.argv.slice(2);
  const modules = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().filter(f => !only.length || only.includes(f.replace(/\.mjs$/, '')));
  check('smoke modules discovered', modules.length > 0, modules.join(', '));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deckchek-smoke-'));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const file of modules) {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      errors.push(...(await mod.default({ browser, base, tmp, check, SHOTS, ROOT })) || []);
    }
  } catch (error) {
    check('smoke run completed without exceptions', false, error.message.split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
}

main();
