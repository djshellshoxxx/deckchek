// System Health: pure interpretation of Windows driver / event-log / DJ-software
// log scans (see docs/SYSTEM-CHECK-CONTRACT.md). No DOM access in this module.

export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2, ok: 3 };
export const UNSUPPORTED_NOTE = 'System Health scans run in the Windows desktop app';

// ---------------------------------------------------------------- bridge
const emptyScan = (extra = {}) => ({ supported: false, scannedAt: new Date().toISOString(), errors: [], ...extra });

/** Wraps the three Tauri commands. Without a backend every call resolves to a `supported:false` payload. */
export function createSystemBridge(invoke) {
  const call = () => invoke || globalThis.window?.__TAURI__?.core?.invoke || globalThis.__TAURI__?.core?.invoke || null;
  const run = async (cmd, args, fallback) => {
    const fn = call();
    if (typeof fn !== 'function') return fallback;
    const out = await fn(cmd, args);
    return out && typeof out === 'object' ? out : fallback;
  };
  return {
    isAvailable: () => typeof call() === 'function',
    scanDrivers: () => run('system_scan_drivers', {}, emptyScan({ drivers: [], asioDrivers: [] })),
    scanEvents: ({ days = 14 } = {}) => run('system_scan_events', { days }, emptyScan({ days, events: [] })),
    scanDjLogs: () => run('system_scan_dj_logs', {}, emptyScan({ apps: [] })),
  };
}

// ---------------------------------------------------------------- knowledge base
/** Device Manager problem codes (Win32_PnPEntity.ConfigManagerErrorCode). */
export const PROBLEM_CODES = {
  1: { name: 'Not configured correctly', severity: 'error', meaning: 'Windows has no complete configuration for this device, so it cannot use it.', action: 'Open Device Manager, right-click the device, choose Uninstall device, then unplug and replug it (or reinstall the manufacturer driver).' },
  3: { name: 'Driver corrupted or low memory', severity: 'error', meaning: 'The device driver may be corrupted, or Windows is running low on memory, so the device cannot work.', action: 'Restart the computer and close other programs. If it persists, uninstall the device in Device Manager and reinstall the manufacturer driver.' },
  10: { name: 'Device cannot start', severity: 'error', meaning: 'Windows found the device but it cannot start, usually because the driver is missing, wrong or failing.', action: 'Install the latest driver from the manufacturer, replug the device into a different USB port (not a hub), then restart.' },
  12: { name: 'Not enough free resources', severity: 'error', meaning: 'Two devices are trying to use the same system resources, so this one cannot start.', action: 'Unplug other unused devices, then restart. Update the chipset and USB drivers if it persists.' },
  14: { name: 'Restart required', severity: 'warning', meaning: 'The device cannot work properly until the computer is restarted.', action: 'Restart Windows (use Restart, not Shut down, so Fast Startup does not skip it).' },
  18: { name: 'Reinstall the driver', severity: 'error', meaning: 'The driver for this device needs to be reinstalled.', action: 'In Device Manager choose Uninstall device (tick “Delete the driver software” if offered), then reinstall the manufacturer driver.' },
  19: { name: 'Registry configuration damaged', severity: 'error', meaning: 'Windows has incomplete or damaged registry information for this device.', action: 'Uninstall the device in Device Manager and reinstall the manufacturer driver. If it returns, run “sfc /scannow” from an administrator command prompt.' },
  21: { name: 'Windows is removing the device', severity: 'warning', meaning: 'Windows is in the middle of removing this device.', action: 'Wait a few seconds, then refresh Device Manager. If it stays, restart the computer.' },
  22: { name: 'Device disabled', severity: 'warning', meaning: 'The device has been disabled, so DJ software cannot see it.', action: 'In Device Manager right-click the device and choose Enable device.' },
  24: { name: 'Device missing or not working', severity: 'warning', meaning: 'The device is not present, not working properly, or not all of its drivers are installed.', action: 'Reconnect the device, try another USB port, and reinstall the manufacturer driver.' },
  28: { name: 'Drivers not installed', severity: 'error', meaning: 'Windows has no driver installed for this device, so it cannot be used (or only as a generic device).', action: 'Download and run the installer from the manufacturer, or use Update driver in Device Manager. Pioneer DJ / AlphaTheta, Native Instruments, Denon DJ and others publish their own driver packages.' },
  31: { name: 'Windows cannot load the driver', severity: 'error', meaning: 'The device is not working properly because Windows cannot load the required drivers.', action: 'Uninstall the device and reinstall the manufacturer driver; install pending Windows updates.' },
  32: { name: 'Driver service disabled', severity: 'error', meaning: 'The driver’s service has been disabled, often by a leftover or conflicting driver.', action: 'Reinstall the manufacturer driver. If it persists, check Services for a disabled driver service for this device.' },
  37: { name: 'Driver failed to initialize', severity: 'error', meaning: 'Windows loaded the driver but it returned a failure while starting up.', action: 'Update or reinstall the driver from the manufacturer; unplug other USB audio devices and retry.' },
  39: { name: 'Driver missing or corrupted', severity: 'error', meaning: 'Windows cannot load the device driver because it may be corrupted or missing.', action: 'Uninstall the device and reinstall the manufacturer driver package.' },
  41: { name: 'Loaded but hardware not found', severity: 'error', meaning: 'The driver loaded successfully but Windows cannot find the hardware it controls.', action: 'Reconnect the device, try another USB port or cable, and reinstall the driver if the code remains.' },
  43: { name: 'Windows stopped the device', severity: 'error', meaning: 'Windows stopped this device because it (or its driver) reported problems. This is common for USB audio devices that lose power or reset on the bus.', action: 'Use a different USB port directly on the computer (no hub) and a short, good cable; set USB selective suspend to Disabled in Power Options; reinstall the manufacturer driver.' },
  45: { name: 'Device not connected', severity: 'info', meaning: 'This device was installed before but is not connected now.', action: 'Nothing to fix if the device is unplugged on purpose. Otherwise reconnect it.' },
  48: { name: 'Driver blocked by Windows', severity: 'error', meaning: 'Windows blocked this driver from starting because of known compatibility problems.', action: 'Get a newer driver version from the manufacturer that supports your Windows version.' },
  52: { name: 'Driver signature cannot be verified', severity: 'error', meaning: 'Windows cannot verify the digital signature of the driver, so it refuses to load it.', action: 'Install a properly signed driver from the manufacturer. Avoid disabling driver signature enforcement as a permanent workaround.' },
};

/** Application Error exception codes. */
export const EXCEPTION_CODES = {
  '0xc0000005': 'an access violation (the program touched memory it should not)',
  '0xc0000409': 'a stack buffer overrun / fail-fast (the program deliberately aborted after detecting corruption)',
  '0xc0000374': 'heap corruption (memory management data was damaged)',
  '0x80000003': 'a breakpoint (a debug trap was hit, often from a failed internal check)',
  '0xe0434352': 'an unhandled .NET exception',
  '0xc000001d': 'an illegal instruction (code ran that this CPU cannot execute, or memory was overwritten)',
};

const SCM_EVENTS = {
  7000: 'failed to start because it could not log on or load',
  7001: 'did not start because a service it depends on failed to start',
  7009: 'took too long to start (timeout waiting for the service to connect)',
  7011: 'stopped responding (timeout waiting for a service transaction)',
  7023: 'terminated with an error',
  7024: 'terminated with a service-specific error',
  7031: 'terminated unexpectedly (Windows tried to restart it)',
  7034: 'terminated unexpectedly',
};

const SCM_SHORT = { 7000: 'failed to start', 7001: 'did not start (dependency failed)', 7009: 'timed out starting', 7011: 'stopped responding', 7023: 'stopped with an error', 7024: 'stopped with a service error', 7031: 'crashed', 7034: 'crashed' };

const PNP_EVENTS = {
  219: 'Windows could not load a driver for a device',
  410: 'a device failed to start',
  411: 'a device had problems starting',
};

const DJ_VENDORS = /pioneer|alphatheta|denon|inmusic|native instruments|serato|rane|numark|reloop|hercules|allen\s*&?\s*heath|focusrite|\brme\b|behringer|roland|steinberg|yamaha|audient|motu|presonus|universal audio|ecler|mixars|technics|audio-technica|rekordbox|\bcdj\b|\bddj\b|traktor|kontrol|maschine/i;
const AUDIO_MODULE = /asio|audio|wasapi|wdm|portcls|dsound|xaudio|^ks[a-z]*\.|usbaudio|focusrite|rme|motu|presonus|behringer|steinberg|yamaha|universal|alphatheta|pioneer|pdj|denon|numark|reloop|hercules|allen|ni[a-z]*(usb|audio)|traktorkontrol|native.?instruments|serato.*\.dll/i;
const GENERIC_MODULE = /^(ntdll|ucrtbase|kernelbase|kernel32|msvcrt|msvcp\d*|vcruntime\d*|combase|rpcrt4|win32u|user32|gdi32|d3d\d*|dxgi|clr|coreclr)\b/i;
const PLUGIN_MODULE = /vst|plugin|plug-in|\.vst3|\.dll$/i;
const DROPOUT_RE = /under-?run|underflow|drop-?out|dropped (?:frames?|samples?|buffers?)|glitch|xrun|buffer (?:over|under)|audio (?:stall|interrupt|lost)|asio.*(?:reset|resync|lost|error|fail|not responding|overload)|late callback|cpu overload|stutter|crackl|audio device.*(?:removed|lost|failed)/i;

const GENERIC_ASIO = /asio4all|flexasio|asio link|generic low latency|fl studio asio|reaper asio|voicemeeter|wasapi/i;

// ---------------------------------------------------------------- helpers
const arr = v => (Array.isArray(v) ? v : []);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const stripExe = s => String(s ?? '').replace(/\.exe$/i, '');
const day = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? 'unknown date') : d.toISOString().slice(0, 10); };
const stamp = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; };
const t = iso => { const n = new Date(iso).getTime(); return Number.isNaN(n) ? 0 : n; };
const lowerHex = s => String(s ?? '').trim().toLowerCase();

/** Parses ISO, "M/D/YYYY" or WMI "20190314000000.000000-000" dates; null if unknown. */
export function parseDriverDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const wmi = /^(\d{4})(\d{2})(\d{2})\d{6}\.|^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (wmi) return new Date(Date.UTC(+(wmi[1] || wmi[4]), +(wmi[2] || wmi[5]) - 1, +(wmi[3] || wmi[6])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mk(area, id, severity, title, meaning, action, { evidence = [], when = null, ...extra } = {}) {
  return { id, area, severity, title, meaning, action, evidence, when, ...extra };
}

// ---------------------------------------------------------------- drivers
function interpretDrivers(scan, now) {
  const out = [];
  const drivers = arr(scan.drivers), asio = arr(scan.asioDrivers);
  const present = drivers.filter(d => d.present !== false);
  let problems = 0;

  for (const d of drivers) {
    const code = Number(d.problemCode) || 0;
    const name = d.deviceName || d.hardwareId || 'Unknown device';
    const info = code ? PROBLEM_CODES[code] : null;
    if (code && d.present === false && code !== 45) continue; // stale entry for hardware that is not connected
    if (code) {
      const known = info || { name: `Problem code ${code}`, severity: 'error', meaning: `Windows reports problem code ${code} for this device, so it is not working properly.`, action: 'Open Device Manager, check the device’s Properties, and reinstall the manufacturer driver.' };
      if (code === 45 || known.severity === 'info') {
        out.push(mk('drivers', `drv-${slug(name)}-code-${code}`, 'info', `${name}: ${known.name}`, known.meaning, known.action, { evidence: [`Device Manager code ${code}`, ...driverFacts(d)] }));
        continue;
      }
      problems++;
      out.push(mk('drivers', `drv-${slug(name)}-code-${code}`, known.severity, `${name}: ${known.name} (code ${code})`, known.meaning, known.action, { evidence: [`Device Manager code ${code}`, ...driverFacts(d)] }));
      continue;
    }
    if (d.status === 'Error' || d.status === 'Degraded') {
      problems++;
      out.push(mk('drivers', `drv-${slug(name)}-status`, d.status === 'Error' ? 'error' : 'warning', `${name}: Windows reports the device is ${d.status === 'Error' ? 'in an error state' : 'degraded'}`, 'Windows is reporting a problem with this device but gave no specific code.', 'Replug the device into a different USB port, then reinstall the manufacturer driver and restart.', { evidence: driverFacts(d) }));
      continue;
    }
    if (d.isSigned === false && d.present !== false) {
      problems++;
      out.push(mk('drivers', `drv-${slug(name)}-unsigned`, 'warning', `${name}: driver is not digitally signed`, 'The driver has no valid digital signature. Unsigned drivers can be blocked by Windows (especially with Secure Boot or Memory Integrity) and may be unstable or tampered with.', 'Download the current driver from the manufacturer’s website and install it over the existing one.', { evidence: driverFacts(d) }));
    }
  }

  // Microsoft generic USB Audio driver where the vendor has its own driver.
  const generic = present.filter(d => !Number(d.problemCode) && /^microsoft/i.test(d.driverProvider || '') && /usbaudio2?\.inf|usbaudio/i.test(d.infName || '')
    && (DJ_VENDORS.test(d.manufacturer || '') || DJ_VENDORS.test(d.deviceName || '')) && !/^microsoft/i.test(d.manufacturer || ''));
  if (generic.length) {
    out.push(mk('drivers', 'drv-generic-usb-audio', 'info', `${plural(generic.length, 'device')} using the generic Windows USB audio driver`,
      'Windows is driving these devices with its built-in USB Audio Class driver. They will play sound, but the manufacturer’s own driver usually adds a low-latency ASIO driver and device-specific features, which DJ software typically wants.',
      'If your DJ software reports no ASIO option or high latency, install the manufacturer’s driver package for this device.', { evidence: generic.map(d => `${d.deviceName} (${d.manufacturer || 'unknown vendor'}) — ${d.infName}`) }));
  }

  // Very old drivers.
  const cutoff = now - 3 * 365.25 * 86400000;
  const old = present.filter(d => { const dt = parseDriverDate(d.driverDate); return dt && dt.getTime() < cutoff && /^(MEDIA|AudioEndpoint|USB)$/i.test(d.deviceClass || '') && !/^microsoft/i.test(d.driverProvider || ''); });
  if (old.length) {
    out.push(mk('drivers', 'drv-old', 'info', `${plural(old.length, 'audio driver')} older than 3 years`,
      'These drivers have not been updated in over three years. Old drivers often still work, but may be missing fixes for current Windows versions.',
      'Check the manufacturer’s support page for a newer version, especially if you see dropouts or crashes. If everything works, no action is needed.',
      { evidence: old.map(d => `${d.deviceName} — ${d.driverProvider || d.manufacturer || 'unknown'} ${d.driverVersion || ''} (${day(parseDriverDate(d.driverDate))})`.replace(/\s+\(/, ' (')) }));
  }

  // ASIO drivers.
  for (const a of asio) {
    const name = a.name || 'Unnamed ASIO driver';
    if (a.dllExists === false) {
      problems++;
      out.push(mk('drivers', `asio-${slug(name)}-missing`, 'warning', `ASIO driver “${name}” points to a missing file`,
        'The ASIO driver is still registered in Windows but its DLL no longer exists. This is a broken leftover from an incomplete uninstall; DJ software may list it and then fail to open it.',
        `Reinstall ${name} from its manufacturer, or remove the stale registration by uninstalling the product and deleting its key under HKLM\\SOFTWARE\\ASIO.`, { evidence: [a.dllPath ? `Missing: ${a.dllPath}` : 'No DLL path registered', a.clsid && `CLSID ${a.clsid}`].filter(Boolean) }));
      continue;
    }
    const sig = a.signatureStatus;
    if (sig && sig !== 'Valid') {
      problems++;
      const bad = sig === 'HashMismatch';
      out.push(mk('drivers', `asio-${slug(name)}-sig`, bad ? 'error' : 'warning', `ASIO driver “${name}” ${sig === 'NotSigned' ? 'is not signed' : bad ? 'has been modified' : 'has an invalid signature'}`,
        bad ? 'The file’s contents no longer match its digital signature, so it was changed or damaged after it was signed.' : 'The ASIO DLL has no valid digital signature, so Windows cannot confirm who made it or that it is intact. Many small or older ASIO drivers are unsigned and still work.',
        `Reinstall ${name} from the manufacturer’s official download.`, { evidence: [a.dllPath, `Signature status: ${sig}`, a.signer && `Signer: ${a.signer}`].filter(Boolean) }));
    }
  }
  const genericAsio = asio.filter(a => GENERIC_ASIO.test(a.name || ''));
  if (genericAsio.length) {
    out.push(mk('drivers', 'asio-generic', 'info', `Generic ASIO driver installed: ${genericAsio.map(a => a.name).join(', ')}`,
      'ASIO4ALL and FlexASIO are generic wrappers that sit on top of Windows drivers. They work, but usually add latency and can conflict with the hardware’s own driver.',
      'Prefer the ASIO driver from your hardware manufacturer in your DJ software if one exists; keep the generic one only if you need it.', { evidence: genericAsio.map(a => a.name) }));
  }
  if (asio.length > 1) {
    out.push(mk('drivers', 'asio-multiple', 'info', `${asio.length} ASIO drivers are installed`,
      'Having several ASIO drivers installed is normal and harmless; DJ software only uses the one you select.',
      'No action needed. Make sure your DJ software is set to the ASIO driver for your controller or interface.', { evidence: asio.map(a => a.name) }));
  }

  if (!problems) {
    out.push(mk('drivers', 'drv-ok', 'ok', 'No driver problems found',
      `Windows reports ${plural(present.length, 'audio-related device')} and ${plural(asio.length, 'ASIO driver')}, none with an error code, bad signature or missing file.`,
      'Nothing to do.', { evidence: [] }));
  }
  return out;
}

function driverFacts(d) {
  return [d.driverProvider && `Provider: ${d.driverProvider}`, d.driverVersion && `Version: ${d.driverVersion}`, d.driverDate && `Date: ${day(parseDriverDate(d.driverDate) || d.driverDate)}`,
    d.infName && `INF: ${d.infName}`, d.isSigned === false ? 'Signature: not signed' : d.signer && `Signed by ${d.signer}`].filter(Boolean);
}

// ---------------------------------------------------------------- events
function moduleAdvice(mod, appLabel) {
  if (!mod) return null;
  const m = String(mod);
  if (GENERIC_MODULE.test(m)) return { kind: 'generic', meaning: `The crash was detected inside ${m}, a core Windows or runtime library. That only shows where the problem surfaced, not what caused it.`, action: `Check ${appLabel}’s own log under DJ software logs for the real cause, and keep Windows and the app up to date.` };
  if (AUDIO_MODULE.test(m)) return { kind: 'driver', meaning: `The crash happened inside ${m}, which looks like an audio, ASIO or hardware-vendor driver component. A driver problem is the likely cause.`, action: 'Update or reinstall the driver for your audio interface or controller; if you use an ASIO driver, try another driver (or WASAPI) to confirm.' };
  if (/vst|plug-?in/i.test(m)) return { kind: 'plugin', meaning: `The crash happened inside ${m}, which looks like a plugin (VST/effect). A plugin is the likely cause.`, action: `Disable or remove that plugin, or rescan plugins, then start ${appLabel} again.` };
  if (new RegExp(`^${stripExe(appLabel).replace(/[^a-z0-9]/gi, '.')}`, 'i').test(m)) return { kind: 'app', meaning: `The crash happened inside ${appLabel} itself, so it is a bug in the program or its data.`, action: 'Update to the latest version; if it keeps happening, reset the app’s settings or library cache and contact its support with the log.' };
  return { kind: 'other', meaning: `The crash happened inside ${m}, which is not a core Windows library. This is a third-party component loaded by the app.`, action: 'Update or uninstall the software that provides this file (for example a plugin, overlay or audio utility).' };
}

function eventKind(e) {
  const p = String(e.provider || '').toLowerCase();
  if (e.log === 'Application' || ['application error', 'application hang', 'windows error reporting'].includes(p)) {
    if (e.eventId === 1002) return 'appHang';
    if (e.eventId === 1001) return 'appWer';
    return 'appCrash';
  }
  if (p.includes('service control manager')) return 'scm';
  if (p.includes('kernel-pnp') || p.includes('userpnp')) return 'pnp';
  if (/usb(hub|xhci|ccgp|port)?|usb-/.test(p) && !p.includes('audio')) return 'usb';
  if (/usbaudio|portcls/.test(p)) return 'audioDriver';
  if (/audio|audiosrv|audioendpoint/.test(p)) return 'audioService';
  return e.category === 'usb' ? 'usb' : e.category === 'audio' ? 'audioService' : e.category === 'driver' ? 'pnp' : 'other';
}

function groupEvents(events) {
  const groups = new Map();
  for (const e of events) {
    const key = [e.log, e.provider, e.eventId, e.appName || '', e.faultingModule || '', e.exceptionCode || ''].join('|');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, sample: e, events: [] });
    g.events.push(e);
  }
  return [...groups.values()].map(g => {
    const times = g.events.map(x => t(x.timeCreated)).filter(Boolean);
    return { ...g, count: g.events.length, first: times.length ? new Date(Math.min(...times)).toISOString() : null, last: times.length ? new Date(Math.max(...times)).toISOString() : null };
  });
}

const downgrade = sev => (sev === 'error' ? 'warning' : sev === 'warning' ? 'info' : sev);

function interpretEvents(scan) {
  const events = arr(scan.events);
  const out = [];
  if (!events.length) {
    return [mk('events', 'evt-ok', 'ok', `No audio, USB or DJ-app errors in the Windows event logs (last ${scan.days || 14} days)`,
      'The System and Application event logs contain no audio-service failures, USB errors, driver problems or DJ-program crashes in this period.', 'Nothing to do.')];
  }
  const groups = groupEvents(events);
  const crashedApps = new Set(groups.filter(g => eventKind(g.sample) === 'appCrash').map(g => stripExe(g.sample.appName).toLowerCase()));

  for (const g of groups) {
    const e = g.sample, kind = eventKind(e), n = g.count;
    const times = n > 1 ? [`${n} occurrences`, `First: ${stamp(g.first)}`, `Last: ${stamp(g.last)}`] : [`Time: ${stamp(g.last)}`];
    const base = `evt-${slug(`${e.provider}-${e.eventId}-${e.appName || ''}-${e.faultingModule || ''}`)}`;
    const xn = n > 1 ? ` (${n}×)` : '';
    const msg = e.message ? [String(e.message).replace(/\s+/g, ' ').slice(0, 300)] : [];
    const ex = { count: n, firstSeen: g.first, lastSeen: g.last, events: g.events.slice(0, 25), eventLog: e.log, eventId: e.eventId, provider: e.provider };
    let f = null;
    if (kind === 'appCrash') {
      const app = stripExe(e.appName) || 'A program', code = lowerHex(e.exceptionCode);
      const exText = EXCEPTION_CODES[code];
      const adv = moduleAdvice(e.faultingModule, e.appName || app);
      const meaning = [`${app} crashed and Windows closed it${n > 1 ? `, ${n} times` : ''}.`, exText && `The error was ${exText} (${code}).`, adv?.meaning, !adv && e.faultingModule == null && 'Windows did not report which file failed.'].filter(Boolean).join(' ');
      const action = adv?.action || `Update ${app} and your audio drivers; if it repeats, check ${app}’s own log under DJ software logs.`;
      f = mk('events', base, 'error', `${app} crashed${xn}`, meaning, action, { evidence: [...times, e.faultingModule && `Faulting module: ${e.faultingModule}`, code && `Exception: ${code}`, ...msg].filter(Boolean), when: g.last, ...ex });
    } else if (kind === 'appHang') {
      const app = stripExe(e.appName) || 'A program';
      f = mk('events', base, 'warning', `${app} stopped responding${xn}`, `${app} froze long enough that Windows flagged it as “not responding”. For DJ software this is often a stuck audio driver call or a slow disk.`, 'Update your audio driver, make sure the music drive is healthy and not asleep, and check the app’s own log for what it was doing.', { evidence: [...times, ...msg], when: g.last, ...ex });
    } else if (kind === 'appWer') {
      const app = stripExe(e.appName) || 'a program';
      const dup = crashedApps.has(app.toLowerCase());
      f = mk('events', base, dup ? 'info' : 'warning', `Windows filed an error report for ${app}${xn}`, dup ? `This is the follow-up report for the ${app} crash listed above; it does not mean a separate problem.` : `Windows Error Reporting recorded a crash or freeze of ${app}.`, `See the crash details for ${app} in DJ software logs.`, { evidence: [...times, ...msg], when: g.last, ...ex });
    } else if (kind === 'scm') {
      const phrase = SCM_EVENTS[e.eventId];
      const isAudio = /audio|audiosrv|endpoint/i.test(e.message || '');
      const svc = (/The (.+?) service/i.exec(e.message || '') || [])[1] || (isAudio ? 'Windows Audio' : 'A Windows');
      f = mk('events', base, isAudio ? 'error' : 'warning', `${svc} service ${SCM_SHORT[e.eventId] || 'failed'}${xn}`,
        isAudio ? `The ${svc} service ${phrase || 'reported a failure'}. While it is down there is no sound and DJ software cannot open audio devices.` : `The ${svc} service ${phrase || 'reported a failure'}.`,
        isAudio ? 'Restart the “Windows Audio” and “Windows Audio Endpoint Builder” services (services.msc), then restart the PC. If it repeats, reinstall your audio drivers and run “sfc /scannow”.' : 'Restart the service in services.msc; if it keeps failing, install pending Windows updates.',
        { evidence: [`Service Control Manager event ${e.eventId}`, ...times, ...msg], when: g.last, ...ex });
    } else if (kind === 'audioService' || kind === 'audioDriver') {
      const sev = kind === 'audioDriver' ? 'warning' : e.level === 'Warning' ? 'info' : 'warning';
      f = mk('events', base, e.level === 'Critical' ? 'error' : sev, `${kind === 'audioDriver' ? 'Audio driver' : 'Windows audio'} error from ${e.provider}${xn}`,
        kind === 'audioDriver' ? 'The USB audio or kernel audio driver (usbaudio / portcls) reported an error, typically a device that stopped streaming, reset, or returned bad data.' : 'The Windows audio engine logged a problem, such as a device that failed to start or an endpoint that disappeared.',
        'Reconnect the audio device to a different USB port (no hub), update its driver, and make sure no other program holds the device in exclusive mode.', { evidence: [`${e.provider} event ${e.eventId}`, ...times, ...msg], when: g.last, ...ex });
    } else if (kind === 'pnp') {
      const what = PNP_EVENTS[e.eventId];
      f = mk('events', base, e.level === 'Warning' ? 'info' : 'warning', `Device driver problem reported by Windows${xn}`, `Plug and Play logged that ${what || 'a device or driver had a problem'}. Repeated entries usually mean one device keeps failing to start.`, 'Check Device Manager for a warning icon, reinstall that device’s driver, and try another USB port or cable.', { evidence: [`Kernel-PnP event ${e.eventId}`, ...times, ...msg], when: g.last, ...ex });
    } else if (kind === 'usb') {
      const sev = n >= 10 ? 'error' : e.level === 'Warning' ? 'info' : 'warning';
      f = mk('events', base, sev, `USB port or hub errors${xn}`, 'Windows logged USB hub/controller problems such as a device resetting, failing to enumerate or a port error. For DJ gear this causes dropouts and disconnects, and is usually caused by a cable, a hub, or USB power saving.', 'Plug the device directly into a port on the computer (no hub or dock), swap the cable, and in Power Options turn off “USB selective suspend”. Avoid sharing a controller with other busy devices.', { evidence: [`${e.provider} event ${e.eventId}`, ...times, ...msg], when: g.last, ...ex });
    } else {
      f = mk('events', base, e.level === 'Warning' ? 'info' : 'warning', `${e.provider} event ${e.eventId}${xn}`, 'Windows logged an event related to audio, drivers or a DJ program.', 'Review the details; no action is needed if everything works.', { evidence: [...times, ...msg], when: g.last, ...ex });
    }
    out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------- DJ logs
const normalizeLine = l => String(l).replace(/[A-Za-z]:\\[^\s"']+/g, '<path>').replace(/^\s*[[(]?\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z)?[\])]?\s*/, '').replace(/^\s*\[?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\]?\s*/, '').replace(/0x[0-9a-f]+/gi, '0x…').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160);

function topMessages(lines, n = 5) {
  const m = new Map();
  for (const l of lines) { const k = normalizeLine(l.line ?? l); const e = m.get(k) || { text: String(l.line ?? l).trim().slice(0, 240), count: 0 }; e.count++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

function crashDetails(files) {
  let module = null, code = null;
  for (const f of files) for (const m of arr(f.matches)) {
    const line = String(m.line || '');
    module ||= (/(?:fault(?:ing)? module(?: name)?|Sig\[3\]\.Value)\s*[:=]\s*([\w.\-]+\.(?:dll|exe|drv|sys|asi|vst3?))/i.exec(line) || [])[1] || (/\bin ([\w.\-]+\.(?:dll|exe))\b/i.exec(line) || [])[1] || null;
    code ||= (/(?:exception(?: code)?|Sig\[6\]\.Value)\s*[:=]?\s*(0x[0-9a-f]{8})/i.exec(line) || /\b(0x(?:c0000005|c0000409|c0000374|80000003|e0434352|c000001d))\b/i.exec(line) || [])[1] || null;
  }
  return { module, code: code ? code.toLowerCase() : null };
}

function interpretDjLogs(scan) {
  const out = [];
  const apps = arr(scan.apps).filter(a => a.installed);
  if (!apps.length) {
    return [mk('djLogs', 'dj-none', 'ok', 'No DJ software detected on this computer', 'None of the supported DJ programs (Serato, Traktor, rekordbox, VirtualDJ, Mixxx, djay, Engine DJ) were found, so there are no program logs to check.', 'Nothing to do. If you do have one installed in a custom location, run the scan after starting it once.')];
  }
  for (const app of apps) {
    const files = arr(app.files);
    const crashFiles = files.filter(f => f.kind === 'crashDump' || f.kind === 'crashReport').sort((a, b) => t(b.modified) - t(a.modified));
    const logs = files.filter(f => f.kind === 'log');
    const id = slug(app.app);
    const matches = logs.flatMap(f => arr(f.matches).map(m => ({ ...m, file: f.path })));
    let found = false;

    if (crashFiles.length) {
      found = true;
      const last = crashFiles[0];
      const { module, code } = crashDetails(crashFiles);
      const adv = moduleAdvice(module, app.app);
      const exText = code && EXCEPTION_CODES[code];
      const dumps = crashFiles.filter(f => f.kind === 'crashDump').length;
      out.push(mk('djLogs', `dj-${id}-crash`, 'error', `${app.app} crashed on ${day(last.modified)}${crashFiles.length > 1 ? ` (${plural(crashFiles.length, 'crash record')} in the last 90 days)` : ''}`,
        [`Windows saved ${plural(crashFiles.length, 'crash report/dump file')} for ${app.app}${dumps ? ` (${plural(dumps, 'memory dump')})` : ''}, so it closed unexpectedly.`, exText && `The error was ${exText}.`, adv?.meaning].filter(Boolean).join(' '),
        adv?.action || `Update ${app.app} and your audio driver. If it keeps crashing, send the newest crash file and the app log to the vendor’s support.`,
        { evidence: [...crashFiles.slice(0, 5).map(f => `${f.path} — ${stamp(f.modified)}`), module && `Faulting module: ${module}`, code && `Exception: ${code}`].filter(Boolean), when: last.modified, app: app.app, crashCount: crashFiles.length, files: crashFiles.slice(0, 5) }));
    }

    const dropouts = matches.filter(m => DROPOUT_RE.test(m.line || ''));
    const crashLines = matches.filter(m => m.severity === 'crash' && !DROPOUT_RE.test(m.line || ''));
    const errorLines = matches.filter(m => m.severity === 'error' && !DROPOUT_RE.test(m.line || ''));
    if (crashLines.length) {
      found = true;
      const top = topMessages(crashLines);
      out.push(mk('djLogs', `dj-${id}-logcrash`, 'error', `${app.app} log records a crash or fatal error (${plural(crashLines.length, 'line')})`, `${app.app}’s own log contains fatal-error lines, meaning the program hit something it could not recover from.`, 'Read the messages below for the cause (missing file, audio device, database). Update the app, and if it names a device or driver, reinstall that driver.',
        { evidence: top.map(x => `${x.count > 1 ? `${x.count}× ` : ''}${x.text}`), when: lastModified(logs), app: app.app, matches: crashLines.slice(0, 50) }));
    }
    if (errorLines.length) {
      found = true;
      const top = topMessages(errorLines);
      out.push(mk('djLogs', `dj-${id}-logerror`, 'warning', `${app.app} log contains ${plural(errorLines.length, 'error line')}`, `${app.app} recorded errors while running. Single errors are often harmless (a missing track, a network check), but repeated ones point to a real fault.`, 'Check the most frequent messages below; fix missing files or relink the library, and update the app or audio driver if they mention audio.',
        { evidence: top.map(x => `${x.count > 1 ? `${x.count}× ` : ''}${x.text}`), when: lastModified(logs), app: app.app, matches: errorLines.slice(0, 50) }));
    }
    if (dropouts.length) {
      found = true;
      const top = topMessages(dropouts);
      out.push(mk('djLogs', `dj-${id}-dropouts`, dropouts.length >= 20 ? 'error' : 'warning', `${app.app} reports audio dropouts (${plural(dropouts.length, 'log line')})`,
        'The app logged buffer underruns, dropouts or ASIO errors. That means the audio driver did not get data on time, which you hear as clicks, crackles or stutter.',
        'Raise the buffer size in the app’s audio settings; turn off USB selective suspend and choose the High Performance power plan; update the audio/ASIO driver; connect the device straight to a computer USB port (no hub), and try a different port.',
        { evidence: top.map(x => `${x.count > 1 ? `${x.count}× ` : ''}${x.text}`), when: lastModified(logs), app: app.app, matches: dropouts.slice(0, 50) }));
    }
    const warnOnly = matches.filter(m => m.severity === 'warning' && !DROPOUT_RE.test(m.line || ''));
    if (warnOnly.length >= 5 && !found) {
      found = true;
      out.push(mk('djLogs', `dj-${id}-logwarn`, 'info', `${app.app} log has ${plural(warnOnly.length, 'warning')}`, 'Warnings are usually informational and do not mean something is broken.', 'No action needed unless you notice a problem.', { evidence: topMessages(warnOnly, 3).map(x => `${x.count > 1 ? `${x.count}× ` : ''}${x.text}`), when: lastModified(logs), app: app.app }));
    }
    if (!found) {
      out.push(mk('djLogs', `dj-${id}-ok`, 'ok', `${app.app}: no crashes or log errors found`, `${app.app} is installed${logs.length ? ` and ${plural(logs.length, 'log file')} show no crashes, errors or dropouts` : '; there are no crash records and no log files to check'}.`, 'Nothing to do.', { evidence: [], when: lastModified(logs), app: app.app }));
    }
  }
  return out;
}
const lastModified = files => files.reduce((m, f) => (t(f.modified) > t(m) ? f.modified : m), null) || null;

// ---------------------------------------------------------------- public API
/** Turns raw scan payloads into findings, sorted error > warning > info > ok (newest first within a severity). */
export function interpretSystemScan({ drivers = null, events = null, logs = null } = {}, { now = Date.now() } = {}) {
  const scans = { drivers, events, logs };
  const provided = Object.values(scans).filter(Boolean);
  const findings = [];
  if (provided.length && provided.every(s => s.supported === false)) {
    findings.push(mk('drivers', 'system-unsupported', 'info', UNSUPPORTED_NOTE, 'This check reads Windows drivers, the Windows event log and DJ-program log files, which are only available when DeckChek runs as the Windows desktop app. Nothing was scanned.', 'Open DeckChek on the Windows computer you use for DJing and run the scan there.', { evidence: provided.flatMap(s => arr(s.errors)) }));
    return findings;
  }
  const partial = (scan, area, label) => {
    const errs = arr(scan.errors);
    if (errs.length) findings.push(mk(area, `${area}-scan-errors`, 'info', `${label} scan was incomplete`, 'Part of the scan could not read some data (often because of permissions), so results for this area may be missing items.', 'Run DeckChek as administrator to read protected logs, then scan again.', { evidence: errs.slice(0, 5).map(String), when: scan.scannedAt || null }));
  };
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  if (drivers && drivers.supported !== false) { findings.push(...interpretDrivers(drivers, nowMs)); partial(drivers, 'drivers', 'Driver'); }
  if (events && events.supported !== false) { findings.push(...interpretEvents(events)); partial(events, 'events', 'Event log'); }
  if (logs && logs.supported !== false) { findings.push(...interpretDjLogs(logs)); partial(logs, 'djLogs', 'DJ software log'); }
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || t(b.when) - t(a.when));
}

/** Overall verdict: status is fail | warn | pass | info (matches the app's status chips). */
export function summarizeFindings(findings = []) {
  const counts = { error: 0, warning: 0, info: 0, ok: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity]++;
  const only = findings.length === 1 && findings[0].id === 'system-unsupported';
  let status, headline;
  if (!findings.length) { status = 'info'; headline = 'No scan results yet.'; }
  else if (only) { status = 'info'; headline = `${UNSUPPORTED_NOTE}.`; }
  else if (counts.error) {
    status = 'fail';
    headline = `${plural(counts.error, 'problem')} found${counts.warning ? ` and ${plural(counts.warning, 'warning')}` : ''} — these can cause crashes, dropouts or missing devices.`;
  } else if (counts.warning) {
    status = 'warn';
    headline = `${plural(counts.warning, 'thing')} worth checking — no serious problems found.`;
  } else {
    status = 'pass';
    headline = 'No problems found with your audio drivers, event logs or DJ software.';
  }
  return { status, counts, headline };
}

// ---------------------------------------------------------------- report
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEV_LABEL = { error: 'ERROR', warning: 'WARNING', info: 'INFO', ok: 'OK' };
const AREA_LABEL = { drivers: 'Audio drivers', events: 'Windows event logs', djLogs: 'DJ software logs' };

/** Self-contained HTML report (no external assets). */
export function buildSystemReportHtml({ findings = [], summary = summarizeFindings(findings), generatedAt = new Date().toISOString(), drivers = null } = {}) {
  const color = { error: '#B3261E', warning: '#8A5A00', info: '#0B5FCC', ok: '#0B7A55' };
  const sections = ['drivers', 'events', 'djLogs'].map(area => {
    const items = findings.filter(f => f.area === area);
    if (!items.length) return '';
    return `<h2>${AREA_LABEL[area]}</h2>${items.map(f => `<article style="border-left:5px solid ${color[f.severity]}"><h3><span class="sev" style="color:${color[f.severity]}">${SEV_LABEL[f.severity]}</span> ${escHtml(f.title)}</h3>
<p><strong>What this means.</strong> ${escHtml(f.meaning)}</p><p><strong>What to do.</strong> ${escHtml(f.action)}</p>${arr(f.evidence).length ? `<ul>${f.evidence.map(e => `<li>${escHtml(e)}</li>`).join('')}</ul>` : ''}</article>`).join('')}`;
  }).join('');
  const driverTable = drivers && arr(drivers.drivers).length ? `<h2>Driver inventory</h2><table><thead><tr><th>Device</th><th>Class</th><th>Provider</th><th>Version</th><th>Date</th><th>Signed</th><th>Status</th></tr></thead><tbody>${drivers.drivers.map(d => `<tr><td>${escHtml(d.deviceName)}</td><td>${escHtml(d.deviceClass)}</td><td>${escHtml(d.driverProvider)}</td><td>${escHtml(d.driverVersion)}</td><td>${escHtml(d.driverDate ? day(parseDriverDate(d.driverDate) || d.driverDate) : '')}</td><td>${d.isSigned == null ? 'unknown' : d.isSigned ? 'yes' : 'NO'}</td><td>${escHtml(d.status)}${d.problemCode ? ` (code ${escHtml(d.problemCode)})` : ''}</td></tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeckChek System Health report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#14171c}article{border:1px solid #d5d9e0;border-radius:8px;padding:.6rem 1rem;margin:.8rem 0}h1{margin-bottom:.2rem}.sev{font-size:.75rem;letter-spacing:.06em}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #d5d9e0;padding:4px 8px;text-align:left}ul{font:13px/1.4 ui-monospace,monospace;color:#444}</style></head><body>
<h1>DeckChek System Health report</h1><p>Generated ${escHtml(stamp(generatedAt))}</p>
<p><strong>${escHtml(summary.headline)}</strong> ${summary.counts.error} error(s), ${summary.counts.warning} warning(s), ${summary.counts.info} info, ${summary.counts.ok} OK.</p>${sections}${driverTable}</body></html>`;
}
