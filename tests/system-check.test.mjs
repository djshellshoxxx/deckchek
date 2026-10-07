import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemBridge, interpretSystemScan, summarizeFindings, buildSystemReportHtml, PROBLEM_CODES, parseDriverDate } from '../app/system-check.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const iso = d => new Date(d).toISOString();
const dev = (o = {}) => ({ deviceName: 'Test Device', deviceClass: 'MEDIA', manufacturer: 'Acme', driverProvider: 'Acme', driverVersion: '1.0.0.0', driverDate: '2025-06-01T00:00:00Z', infName: 'oem1.inf', hardwareId: 'USB\\VID_1', isSigned: true, signer: 'Acme', status: 'OK', problemCode: 0, present: true, ...o });
const scan = (o = {}) => ({ supported: true, scannedAt: iso(NOW), errors: [], ...o });
const drivers = (ds = [], asio = []) => scan({ drivers: ds, asioDrivers: asio });
const events = (evs = [], days = 14) => scan({ days, events: evs });
const logs = (apps = []) => scan({ apps });
const evt = (o = {}) => ({ log: 'System', provider: 'Microsoft-Windows-Kernel-PnP', eventId: 411, level: 'Error', timeCreated: '2026-10-05T10:00:00Z', message: 'x', category: 'driver', appName: null, faultingModule: null, exceptionCode: null, ...o });
const interp = (o) => interpretSystemScan(o, { now: NOW });
const byId = (fs, re) => fs.filter(f => re.test(f.id));

test('bridge: no backend gives supported:false payloads', async () => {
  const b = createSystemBridge();
  assert.equal((await b.scanDrivers()).supported, false);
  assert.deepEqual((await b.scanEvents({ days: 7 })).events, []);
  assert.deepEqual((await b.scanDjLogs()).apps, []);
});

test('bridge: wraps the three commands', async () => {
  const calls = [];
  const b = createSystemBridge(async (cmd, args) => { calls.push([cmd, args]); return { supported: true }; });
  await b.scanDrivers(); await b.scanEvents({ days: 30 }); await b.scanDjLogs();
  assert.deepEqual(calls.map(c => c[0]), ['system_scan_drivers', 'system_scan_events', 'system_scan_dj_logs']);
  assert.deepEqual(calls[1][1], { days: 30 });
});

test('unsupported scans yield a single info finding', () => {
  const u = { supported: false, errors: ['System Health scans require Windows.'], drivers: [], asioDrivers: [], events: [], apps: [] };
  const f = interp({ drivers: u, events: u, logs: u });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'info');
  assert.match(f[0].title, /Windows desktop app/);
  const s = summarizeFindings(f);
  assert.equal(s.status, 'info');
});

test('every required problem code has a meaning and action', () => {
  for (const c of [1, 3, 10, 12, 14, 18, 19, 21, 22, 24, 28, 31, 32, 37, 39, 41, 43, 45, 48, 52]) {
    assert.ok(PROBLEM_CODES[c]?.meaning && PROBLEM_CODES[c].action, `code ${c}`);
  }
  assert.match(PROBLEM_CODES[10].name, /cannot start/i);
  assert.match(PROBLEM_CODES[28].name, /not installed/i);
  assert.match(PROBLEM_CODES[43].meaning, /stopped/i);
  assert.match(PROBLEM_CODES[45].name, /not connected/i);
  assert.match(PROBLEM_CODES[52].name, /signature/i);
});

test('driver problem code 43 is an error with USB advice; 45 is info', () => {
  const f = interp({ drivers: drivers([dev({ deviceName: 'DDJ-FLX4', status: 'Error', problemCode: 43 }), dev({ deviceName: 'Old Mixer', problemCode: 45, present: true })]) });
  const e43 = f.find(x => x.id.includes('code-43'));
  assert.equal(e43.severity, 'error');
  assert.match(e43.action, /USB port/);
  assert.equal(f.find(x => x.id.includes('code-45')).severity, 'info');
  assert.equal(f[0].severity, 'error');
});

test('every known code produces a finding', () => {
  for (const c of Object.keys(PROBLEM_CODES)) {
    const f = interp({ drivers: drivers([dev({ problemCode: Number(c), status: 'Error' })]) });
    assert.ok(f.some(x => x.id.endsWith(`code-${c}`)), `code ${c}`);
  }
  const unknown = interp({ drivers: drivers([dev({ problemCode: 99, status: 'Error' })]) });
  assert.ok(unknown.some(x => /code 99/.test(x.title)));
});

test('unsigned driver is a warning', () => {
  const f = interp({ drivers: drivers([dev({ deviceName: 'Cheap Interface', isSigned: false, signer: null })]) });
  const u = f.find(x => x.id.endsWith('-unsigned'));
  assert.equal(u.severity, 'warning');
  assert.match(u.meaning, /signature/i);
});

test('ASIO: missing DLL, bad signature, generic and multiple', () => {
  const f = interp({ drivers: drivers([], [
    { name: 'Old ASIO', clsid: '{1}', dllPath: 'C:\\gone\\old.dll', dllExists: false, signatureStatus: null, signer: null },
    { name: 'Tampered ASIO', clsid: '{2}', dllPath: 'C:\\x\\t.dll', dllExists: true, signatureStatus: 'HashMismatch', signer: null },
    { name: 'Plain ASIO', clsid: '{3}', dllPath: 'C:\\x\\p.dll', dllExists: true, signatureStatus: 'NotSigned', signer: null },
    { name: 'ASIO4ALL v2', clsid: '{4}', dllPath: 'C:\\x\\a.dll', dllExists: true, signatureStatus: 'Valid', signer: 'Wolfgang' },
  ]) });
  assert.match(f.find(x => x.id === 'asio-old-asio-missing').meaning, /leftover/i);
  assert.equal(f.find(x => x.id === 'asio-tampered-asio-sig').severity, 'error');
  assert.equal(f.find(x => x.id === 'asio-plain-asio-sig').severity, 'warning');
  assert.equal(f.find(x => x.id === 'asio-generic').severity, 'info');
  assert.match(f.find(x => x.id === 'asio-multiple').meaning, /normal/i);
});

test('generic Microsoft USB audio driver for vendor hardware is info', () => {
  const f = interp({ drivers: drivers([dev({ deviceName: 'DDJ-400', manufacturer: 'Pioneer DJ', driverProvider: 'Microsoft', infName: 'usbaudio.inf' }), dev({ deviceName: 'Generic Headset', manufacturer: 'Microsoft', driverProvider: 'Microsoft', infName: 'usbaudio.inf' })]) });
  const g = f.find(x => x.id === 'drv-generic-usb-audio');
  assert.equal(g.severity, 'info');
  assert.equal(g.evidence.length, 1);
});

test('very old drivers (>3 years) are info', () => {
  const f = interp({ drivers: drivers([dev({ deviceName: 'Ancient', driverDate: '2019-03-14T00:00:00Z' }), dev({ deviceName: 'Fresh', driverDate: '2026-01-01T00:00:00Z' })]) });
  const o = f.find(x => x.id === 'drv-old');
  assert.equal(o.severity, 'info');
  assert.equal(o.evidence.length, 1);
  assert.deepEqual(parseDriverDate('20190314000000.000000-000')?.toISOString().slice(0, 10), '2019-03-14');
});

test('healthy drivers produce an ok finding', () => {
  const f = interp({ drivers: drivers([dev()], []) });
  assert.deepEqual(f.map(x => x.severity), ['ok']);
});

test('Application Error 1000: exception meanings and module heuristics', () => {
  const mk = (code, mod, n = 1) => Array.from({ length: n }, (_, i) => evt({ log: 'Application', provider: 'Application Error', eventId: 1000, appName: 'Serato DJ Pro.exe', faultingModule: mod, exceptionCode: code, category: 'djApp', timeCreated: iso(NOW - (i + 1) * 3600e3) }));
  const cases = [['0xc0000005', /access violation/], ['0xc0000409', /stack buffer overrun/], ['0xc0000374', /heap corruption/], ['0x80000003', /breakpoint/], ['0xe0434352', /\.NET/], ['0xc000001d', /illegal instruction/]];
  for (const [code, re] of cases) {
    const f = interp({ events: events(mk(code, 'ntdll.dll')) })[0];
    assert.equal(f.severity, 'error');
    assert.match(f.meaning, re, code);
  }
  const drv = interp({ events: events(mk('0xc0000005', 'FocusriteASIO64.dll')) })[0];
  assert.match(drv.meaning, /driver/i);
  const gen = interp({ events: events(mk('0xc0000005', 'KERNELBASE.dll')) })[0];
  assert.match(gen.meaning, /core Windows/);
  assert.match(gen.action, /DJ software logs/);
  const plug = interp({ events: events(mk('0xc0000005', 'SuperReverb_VST.dll')) })[0];
  assert.match(plug.meaning, /plugin/i);
});

test('repeated events are grouped with count and first/last time', () => {
  const evs = Array.from({ length: 50 }, (_, i) => evt({ log: 'Application', provider: 'Application Error', eventId: 1000, appName: 'Traktor.exe', faultingModule: 'ntdll.dll', exceptionCode: '0xc0000005', timeCreated: iso(NOW - i * 3600e3) }));
  const f = interp({ events: events(evs) });
  assert.equal(f.length, 1);
  assert.equal(f[0].count, 50);
  assert.match(f[0].title, /50×/);
  assert.ok(f[0].evidence.some(e => e.startsWith('First:')) && f[0].evidence.some(e => e.startsWith('Last:')));
  assert.equal(f[0].events.length, 25);
});

test('hang 1002 and WER 1001', () => {
  const f = interp({ events: events([
    evt({ log: 'Application', provider: 'Application Hang', eventId: 1002, appName: 'rekordbox.exe', category: 'djApp' }),
    evt({ log: 'Application', provider: 'Windows Error Reporting', eventId: 1001, appName: 'rekordbox.exe', category: 'djApp' }),
    evt({ log: 'Application', provider: 'Application Error', eventId: 1000, appName: 'Mixxx.exe', category: 'djApp', faultingModule: 'mixxx.exe', exceptionCode: '0xc0000005' }),
    evt({ log: 'Application', provider: 'Windows Error Reporting', eventId: 1001, appName: 'Mixxx.exe', category: 'djApp' }),
  ]) });
  assert.equal(f.find(x => /stopped responding/.test(x.title)).severity, 'warning');
  assert.equal(f.find(x => /error report for rekordbox/.test(x.title)).severity, 'warning');
  assert.equal(f.find(x => /error report for Mixxx/.test(x.title)).severity, 'info');
  assert.match(f.find(x => /Mixxx crashed/.test(x.title)).meaning, /itself/);
});

test('audio service failures (SCM 7000..7034)', () => {
  for (const id of [7000, 7001, 7009, 7011, 7023, 7024, 7031, 7034]) {
    const f = interp({ events: events([evt({ provider: 'Service Control Manager', eventId: id, message: 'The Windows Audio service terminated unexpectedly.', category: 'audio' })]) });
    assert.equal(f[0].severity, 'error', String(id));
    assert.match(f[0].title, /Windows Audio service/);
    assert.match(f[0].action, /services\.msc/);
  }
});

test('Kernel-PnP, USB hub/xHCI and portcls/usbaudio events', () => {
  const usb = Array.from({ length: 12 }, () => evt({ provider: 'Microsoft-Windows-USB-USBHUB3', eventId: 43, category: 'usb' }));
  const f = interp({ events: events([evt({ eventId: 219 }), ...usb, evt({ provider: 'Microsoft-Windows-USB-USBXHCI', eventId: 1, category: 'usb' }), evt({ provider: 'usbaudio', eventId: 7, category: 'audio' }), evt({ provider: 'portcls', eventId: 1, category: 'audio' })]) });
  assert.match(f.find(x => /Device driver problem/.test(x.title)).meaning, /could not load a driver/);
  const hub = f.find(x => /USB port or hub errors \(12×\)/.test(x.title));
  assert.equal(hub.severity, 'error');
  assert.match(hub.action, /selective suspend/);
  assert.equal(f.find(x => x.provider === 'Microsoft-Windows-USB-USBXHCI').severity, 'warning');
  assert.equal(f.filter(x => /Audio driver error/.test(x.title)).length, 2);
});

test('no events gives ok with period', () => {
  const f = interp({ events: events([], 30) });
  assert.equal(f[0].severity, 'ok');
  assert.match(f[0].title, /30 days/);
});

const crashApp = { app: 'Serato DJ Pro', exeNames: ['Serato DJ Pro.exe'], installed: true, locations: [{ path: 'C:\\Users\\a\\Music\\_Serato_\\Logs', exists: true }],
  files: [{ path: 'C:\\Users\\a\\AppData\\Local\\CrashDumps\\Serato DJ Pro.exe.1234.dmp', kind: 'crashDump', modified: '2026-10-03T21:10:00Z', sizeBytes: 5e7, matches: [], tail: [] },
    { path: 'C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive\\AppCrash_Serato DJ Pro.exe_x\\Report.wer', kind: 'crashReport', modified: '2026-10-03T21:10:05Z', sizeBytes: 9e3,
      matches: [{ lineNo: 12, line: 'Sig[3].Value=FocusriteASIO64.dll', severity: 'crash' }, { lineNo: 15, line: 'Sig[6].Value=c0000005', severity: 'crash' }, { lineNo: 20, line: 'ExceptionCode: 0xc0000005', severity: 'crash' }], tail: [] }] };

test('DJ crash dump/report: "X crashed on <date>" with module and exception', () => {
  const f = interp({ logs: logs([crashApp]) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.equal(f[0].title, 'Serato DJ Pro crashed on 2026-10-03 (2 crash records in the last 90 days)');
  assert.match(f[0].meaning, /access violation/);
  assert.match(f[0].meaning, /driver/i);
  assert.ok(f[0].evidence.includes('Faulting module: FocusriteASIO64.dll'));
});

test('DJ log lines: errors, crashes and dropouts', () => {
  const m = (line, severity) => ({ lineNo: 1, line, severity });
  const traktor = { app: 'Traktor Pro', exeNames: ['Traktor.exe'], installed: true, locations: [], files: [{ path: 'C:\\x\\Traktor.log', kind: 'log', modified: '2026-10-06T10:00:00Z', sizeBytes: 100,
    matches: [...Array.from({ length: 30 }, (_, i) => m(`2026-10-06 10:00:${String(i).padStart(2, '0')} Audio buffer underrun on ASIO device (${i} frames)`, 'warning')),
      m('2026-10-06 10:01:00 ERROR: could not open track C:\\Music\\a.mp3', 'error'), m('2026-10-06 10:01:09 ERROR: could not open track C:\\Music\\b.mp3', 'error'),
      m('FATAL: unhandled exception, terminating', 'crash')], tail: ['last line'] }] };
  const f = interp({ logs: logs([traktor]) });
  const d = f.find(x => x.id.endsWith('dropouts'));
  assert.equal(d.severity, 'error');
  assert.match(d.action, /buffer size/);
  assert.match(d.action, /selective suspend/);
  assert.match(d.action, /High Performance/);
  assert.match(d.action, /hub/);
  assert.equal(d.evidence.length, 1); // 30 distinct lines collapse to one message
  assert.match(d.evidence[0], /^30×/);
  const e = f.find(x => x.id.endsWith('logerror'));
  assert.equal(e.severity, 'warning');
  assert.match(e.evidence[0], /^2×/);
  assert.equal(f.find(x => x.id.endsWith('logcrash')).severity, 'error');
});

test('installed app with no issues is ok; uninstalled apps omitted', () => {
  const f = interp({ logs: logs([
    { app: 'Mixxx', installed: true, exeNames: [], locations: [], files: [{ path: 'm.log', kind: 'log', modified: '2026-10-01T00:00:00Z', sizeBytes: 1, matches: [], tail: [] }] },
    { app: 'VirtualDJ', installed: false, exeNames: [], locations: [], files: [] }]) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'ok');
  assert.match(f[0].title, /Mixxx/);
  const none = interp({ logs: logs([{ app: 'VirtualDJ', installed: false, exeNames: [], locations: [], files: [] }]) });
  assert.equal(none[0].severity, 'ok');
});

test('findings sorted error > warning > info > ok and summarized', () => {
  const f = interp({ drivers: drivers([dev({ problemCode: 10, status: 'Error' }), dev({ deviceName: 'B', isSigned: false })], []), events: events([]), logs: logs([crashApp]) });
  const order = ['error', 'warning', 'info', 'ok'];
  const idx = f.map(x => order.indexOf(x.severity));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  for (const x of f) { assert.ok(x.id && x.area && x.title && x.meaning && x.action && Array.isArray(x.evidence) && 'when' in x); }
  const s = summarizeFindings(f);
  assert.equal(s.status, 'fail');
  assert.equal(s.counts.error, 2);
  assert.match(s.headline, /2 problems/);
  assert.equal(summarizeFindings([{ severity: 'warning' }]).status, 'warn');
  assert.equal(summarizeFindings([{ severity: 'ok' }, { severity: 'info' }]).status, 'pass');
  assert.equal(summarizeFindings([]).status, 'info');
});

test('scan errors surface as an info finding; report HTML escapes content', () => {
  const f = interp({ events: { ...events([]), errors: ['Access denied reading Security log'] } });
  assert.ok(f.some(x => x.id === 'events-scan-errors'));
  const html = buildSystemReportHtml({ findings: [{ id: 'a', area: 'drivers', severity: 'error', title: '<b>x</b>', meaning: 'm', action: 'a', evidence: ['e'], when: null }] });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.ok(html.includes('What to do'));
});
