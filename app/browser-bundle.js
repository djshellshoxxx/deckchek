// Browser-mode diagnostics bundle (FS-02 "unsupported" state): settings and a workspace summary only,
// no logs. Same layout and manifest as the desktop bundle, built here with the stored-only zip writer.

import { createZip } from './zip-writer.js';
import { redactValue, redactText, buildSummaryText } from './diagnostics-bundle.js';

const enc = new TextEncoder();
const pretty = v => JSON.stringify(v, null, 2) + '\n';

export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) return null;
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}

/** Run summary without raw samples or evidence: id, test, time, score, status, finding titles. */
export function summarizeRuns(runs, n = 1) {
  const list = Array.isArray(runs) ? runs : [];
  const count = Math.max(1, Math.min(50, Number(n) || 1));
  return list.slice(0, count).map(r => ({
    id: String(r?.id ?? ''),
    test: r?.test ?? r?.sessionType ?? null,
    startedAt: r?.createdAt ?? r?.startedAt ?? null,
    score: typeof r?.score === 'number' && Number.isFinite(r.score) ? r.score : null,
    status: r?.status ?? 'completed',
    findings: (Array.isArray(r?.findings) ? r.findings : []).slice(0, 20).map(f => String(f?.title ?? f?.code ?? '')).filter(Boolean),
  }));
}

/**
 * @param {object} i { appVersion, settings, runs, runCount, system, systemHealth, redact, redactCtx, now, subtle }
 * @returns {Promise<{files:{name,data:Uint8Array}[], parts:{name,sizeBytes,status,note?}[], summaryText:string}>}
 */
export async function buildBrowserBundleParts(i = {}) {
  const redact = i.redact !== false;
  const ctx = i.redactCtx ?? {};
  const rv = v => (redact ? redactValue(v, ctx) : v);
  const nowIso = (i.now ?? new Date()).toISOString();
  const runs = summarizeRuns(i.runs, i.runCount);
  const summaryText = buildSummaryText({
    appVersion: i.appVersion, os: i.system?.os?.name ?? i.system?.platform, osVersion: i.system?.os?.version,
    webview2Version: i.system?.webview2Version, locale: i.system?.locale, mode: 'Browser preview (no logs)',
    latestRun: runs[0] ? `${runs[0].startedAt ?? '?'} ${runs[0].test ?? '-'} score=${runs[0].score ?? '-'}` : undefined,
    notIncluded: ['logs (browser mode)', ...(i.systemHealth ? [] : ['System Health (not run)'])],
    redact,
  }, ctx);
  const body = [
    ['summary.txt', enc.encode((redact ? redactText(summaryText, ctx) : summaryText) + '\n')],
    ['system.json', enc.encode(pretty(rv({ mode: 'browser', ...(i.system ?? {}) })))],
    ['settings.json', enc.encode(pretty(rv(i.settings ?? {})))],
    ['runs-summary.json', enc.encode(pretty(rv({ runs })))],
  ];
  const parts = body.map(([name, data]) => ({ name, sizeBytes: data.length, status: 'ok' }));
  if (i.systemHealth) {
    const data = enc.encode(pretty(rv(i.systemHealth)));
    body.push(['system-health.json', data]);
    parts.push({ name: 'system-health.json', sizeBytes: data.length, status: 'ok' });
  } else {
    parts.push({ name: 'system-health.json', sizeBytes: 0, status: 'skipped', note: 'System Health scan not run' });
  }
  parts.push({ name: 'logs/', sizeBytes: 0, status: 'skipped', note: 'logs are only kept by the desktop app' });
  const manifestParts = [];
  for (const [name, data] of body) manifestParts.push({ name, sha256: await sha256Hex(data, i.subtle), bytes: data.length });
  const manifest = enc.encode(pretty({ bundleVersion: 1, createdAt: nowIso, appVersion: i.appVersion ?? null, redacted: redact, mode: 'browser', parts: manifestParts }));
  const files = [{ name: 'manifest.json', data: manifest }, ...body.map(([name, data]) => ({ name, data }))];
  parts.unshift({ name: 'manifest.json', sizeBytes: manifest.length, status: 'ok' });
  return { files, parts, summaryText: redact ? redactText(summaryText, ctx) : summaryText };
}

export async function buildBrowserBundleZip(i = {}) {
  const r = await buildBrowserBundleParts(i);
  return { ...r, zip: createZip(r.files, { date: i.now ?? new Date() }) };
}
