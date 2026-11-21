// SPEC-10 player capture: real browser rendering/public opt-in and the production
// screen + acquisition + live-capture adapter with a modeled native boundary.
// No hardware, native binary, scientific calibration or release qualification.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { watchConsole, tauriMock, setViewport, a11yAudit } from './core.mjs';

const REFERENCE_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
// Identity-only fixture: these are deliberately not a decoded or validated audio file.
const referenceFile = () => ({ name: 'Reference tone.wav', mimeType: 'audio/wav', buffer: Buffer.from('abc') });
async function selectReference(page) {
  await page.setInputFiles('#pc-reference-file', referenceFile());
  await page.waitForFunction(expected => !document.getElementById('pc-reference-file').disabled &&
    document.getElementById('pc-reference-status').textContent.includes(expected), REFERENCE_SHA256);
}

function playerNativeMock() {
  const original = window.__TAURI__.core.invoke;
  const state = { starts: [], stops: [], running: false, lease: 100, diagnosticWrites: 0 };
  window.__playerCaptureSmoke = state;
  window.__TAURI__.core.invoke = async (command, args = {}) => {
    if (command === 'list_native_audio_inputs') return [{ name: 'Requested input', isDefault: true, maxChannels: 4, defaultChannels: 4 }];
    if (command === 'start_live_capture') {
      if (state.running) throw new Error('A capture is already running.');
      state.running = true; state.lease++; state.started = Date.now();
      state.starts.push({ ...args, leaseId: state.lease });
      return { deviceName: 'Start-only label', sampleRate: 48000, channels: 4, maxSeconds: args.maxSeconds, leaseId: state.lease };
    }
    if (command === 'live_capture_status') return { running: state.running, elapsedSec: (Date.now() - state.started) / 1000, quality: {} };
    if (command === 'stop_live_capture') {
      if (!state.running || args.leaseId !== state.lease) throw new Error('The caller does not own this capture.');
      state.running = false; state.stops.push({ leaseId: args.leaseId });
      const first = state.starts.at(-1).pairs?.[0] ?? 1;
      const pair = { first, second: first + 1, mono: false, label: `${first}-${first + 1}` };
      const samples = Array(4410).fill(0.1);
      return { payload: { deviceName: 'Observed recorder', sampleRate: 44100, channels: 4, pairs: [pair],
        left: samples, right: samples, streamErrors: [] },
      quality: { framesCaptured: samples.length, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 0,
        streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: 10, maxCallbackGapMs: 10,
        pairs: [{ first, clippedSamplesL: 0, clippedSamplesR: 0 }] } };
    }
    if (command === 'save_diagnostic_run') state.diagnosticWrites++;
    return original(command, args);
  };
}

async function experimental(page) {
  await page.click('#cdlOptionsBtn');
  await page.click('#cdlOptionsDialog [data-support-id="experimental"]');
  await page.waitForSelector('dialog.experimental-dialog[open]');
  return page.locator('dialog.experimental-dialog [data-feature="playerCapture"]');
}
async function closeExperimental(page) {
  await page.click('[data-experimental-close]');
  await page.waitForSelector('dialog.experimental-dialog', { state: 'detached' });
}

// Independent stored-ZIP reader for the real browser download. No application
// exporter/ZIP reader is imported to validate the delivered payload.
function readAudioArchive(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = new Map();
  const end = bytes.length - 22;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('Audio download is not a complete ZIP.');
  const count = view.getUint16(end + 10, true);
  if (count !== 4) throw new Error('Audio download has unexpected entries.');
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50 || view.getUint16(offset + 10, true) !== 0) throw new Error('Unexpected audio ZIP record.');
    const nameLength = view.getUint16(offset + 28, true), size = view.getUint32(offset + 24, true);
    const local = view.getUint32(offset + 42, true), name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (files.has(name) || view.getUint32(local, true) !== 0x04034b50 || view.getUint32(local + 22, true) !== size) throw new Error('Inconsistent audio ZIP entry.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > offset) throw new Error('Audio ZIP payload exceeds its local entry.');
    files.set(name, bytes.subarray(start, start + size));
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset !== end) throw new Error('Audio ZIP directory does not end at its footer.');
  return files;
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const screenshot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

  const preview = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  try {
    const page = await preview.newPage(); errors.push(watchConsole(page, 'player-preview'));
    await page.goto(base); await page.waitForSelector('.rail-item');
    check('player: default-off hides the public route without adding a stored opt-in',
      await page.locator('.rail-item[data-screen="player-capture"]').count() === 0 &&
      await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1') || '{}').features?.playerCapture === undefined));
    const toggle = await experimental(page);
    check('player: Experimental features offers the new control unchecked', await toggle.count() === 1 && !await toggle.isChecked());
    await toggle.check(); await closeExperimental(page);
    await page.click('.rail-item[data-screen="player-capture"]');
    await page.waitForSelector('#screen-player-capture:not([hidden]) h1');
    check('player: public opt-in persists and opens the capture preview',
      await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.ui.v1') || '{}').features?.playerCapture === true) &&
      await page.locator('#screen-player-capture').isVisible());
    check('player: entering the route replaces the previous workflow guide',
      await page.locator('#inspector-title').textContent() === 'Player capture guide' &&
      /do not measure pitch accuracy/.test(await page.locator('#inspector-body').textContent()) &&
      /Export completed capture details/.test(await page.locator('#inspector-body').textContent()));
    check('player: browser capture/export stay disabled with a desktop requirement',
      await page.locator('#pc-start').isDisabled() && await page.locator('#pc-export').isDisabled() &&
      /desktop app/.test(await page.locator('#screen-player-capture').innerText()));
    check('player: preview states the unmeasured and optional local-audio boundaries',
      /Pitch accuracy is not measured/.test(await page.locator('#screen-player-capture').innerText()) &&
      /Off by default/.test(await page.locator('#pc-audio-export-help').innerText()) &&
      /Reference-file audio is not included/.test(await page.locator('#pc-audio-export-help').innerText()) &&
      !await page.locator('#pc-keep-audio').isChecked() && await page.locator('#pc-export-audio').isDisabled());
    await selectReference(page);
    check('player: browser File selection identifies exact bytes without enabling native capture',
      (await page.locator('#pc-reference-status').textContent()).includes(REFERENCE_SHA256) &&
      await page.locator('#pc-start').isDisabled() && await page.locator('#pc-export').isDisabled() &&
      await page.locator('#pc-reference-file').evaluate(input => input.value === '' && input.files.length === 0));
    check('player: selected-file help separates byte identity from audio and playback verification',
      /does not verify its audio content or what the player is playing/.test(await page.locator('#pc-reference-help').textContent()));
    const names = await a11yAudit(page);
    check('player: desktop controls have accessible names and usable target sizes',
      !names.unnamed.length && !names.small.length, [...names.unnamed, ...names.small].slice(0, 3).join(' | '));
    await screenshot(page, 'player-preview-desktop');
    await setViewport(page, { width: 420, height: 900 });
    check('player: browser preview has no horizontal overflow at phone width',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await screenshot(page, 'player-preview-mobile');
    await setViewport(page, { width: 1440, height: 1000 });
    const off = await experimental(page); await off.uncheck(); await closeExperimental(page);
    check('player: public disable hides the active route and leaves it',
      await page.locator('.rail-item[data-screen="player-capture"]').count() === 0 &&
      !await page.locator('#screen-player-capture').isVisible());
    check('player: disabling the preview clears its selected-file identity',
      /No reference file selected/.test(await page.locator('#pc-reference-status').textContent()) &&
      await page.locator('#pc-reference-file').evaluate(input => input.files.length === 0));
  } finally { await preview.close(); }

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', acceptDownloads: true });
  try {
    // Install the shared native mock and its dependent adapter in one script.
    await desktop.addInitScript({ content: `(${tauriMock.toString()})();\n(${playerNativeMock.toString()})();` });
    const page = await desktop.newPage(); errors.push(watchConsole(page, 'player-native-model'));
    await page.goto(base); await page.waitForSelector('.rail-item');
    const toggle = await experimental(page); await toggle.check(); await closeExperimental(page);
    await page.click('.rail-item[data-screen="player-capture"]');
    await page.selectOption('#device-select', 'Requested input');
    await page.selectOption('#pc-input-pair', '3');
    await page.fill('#pc-duration', '1');
    await page.fill('#pc-model', 'Fixture player'); await page.fill('#pc-firmware', '1.2');
    await page.fill('#pc-reference', 'Reference tone'); await page.fill('#pc-pitch', '2');
    await selectReference(page);
    await page.selectOption('#pc-medium', 'usb');
    await page.selectOption('#pc-keylock', 'disabled'); await page.selectOption('#pc-fx', 'disabled');
    await page.click('#pc-start');
    await page.waitForFunction(() => window.__playerCaptureSmoke.starts.length === 1);
    check('player: live adapter receives one selected pair and bounded capture capacity',
      await page.evaluate(() => {
        const start = window.__playerCaptureSmoke.starts[0];
        return start.deviceName === 'Requested input' && start.maxSeconds === 6 && JSON.stringify(start.pairs) === '[3]';
      }));
    await page.waitForSelector('#pc-result:not([hidden])');
    check('player: rendered metadata distinguishes requested and observed capture values',
      /Requested input/.test(await page.locator('#pc-result').innerText()) &&
      /Observed recorder/.test(await page.locator('#pc-result').innerText()) &&
      /44100 Hz/.test(await page.locator('#pc-result').innerText()) &&
      /Not measured/.test(await page.locator('#pc-result').innerText()));
    const pendingDownload = page.waitForEvent('download'); await page.click('#pc-export');
    const downloaded = await pendingDownload;
    const exported = JSON.parse(fs.readFileSync(await downloaded.path(), 'utf8'));
    check('player: the real local download contains only acquisition, record and selected-file metadata',
      JSON.stringify(Object.keys(exported).sort()) === '["acquisition","record","selectedReference"]' &&
      exported.acquisition.retention === 'ephemeral_audio_only' && exported.acquisition.rawEvidenceRefs.length === 0 &&
      exported.record.capture.rawEvidenceRefs.length === 0 && !Object.hasOwn(exported, 'audio'));
    check('player: the default completed capture retains no downloadable audio',
      !await page.locator('#pc-keep-audio').isChecked() && await page.locator('#pc-export-audio').isDisabled());
    check('player: exported file identity matches the selected bytes and is still unverified playback',
      exported.selectedReference.fileName === 'Reference tone.wav' && exported.selectedReference.byteLength === 3 &&
      exported.selectedReference.sha256 === REFERENCE_SHA256 && exported.selectedReference.digestAlgorithm === 'SHA-256' &&
      exported.selectedReference.hashBasis === 'selected_file_bytes' && exported.selectedReference.bytesRetained === false &&
      exported.selectedReference.playbackIdentity === 'unverified' &&
      exported.record.source.referenceHashSha256 === REFERENCE_SHA256 && exported.record.source.referenceId === 'Reference tone' &&
      exported.record.source.referenceFrequencyHz === null &&
      Object.values(exported.selectedReference).every(value => value === null || typeof value !== 'object'));
    check('player: exported observations remain nominal and the record stays unverified/report-ineligible',
      exported.acquisition.observed.nominalSampleRateHz === 44100 && exported.acquisition.observed.measuredSampleRateHz === null &&
      exported.acquisition.observed.deviceName === 'Observed recorder' && exported.acquisition.requested.deviceName === 'Requested input' &&
      exported.record.asset.model === 'Fixture player' && exported.record.pitch.displayedPercent === 2 &&
      exported.record.qualification.status === 'unverified' && exported.record.qualification.eligibleForReport === false &&
      exported.record.qualification.measurement === null);
    check('player: completing capture did not create a diagnostic History run',
      await page.evaluate(() => window.__playerCaptureSmoke.diagnosticWrites === 0));
    await page.locator('#pc-result').scrollIntoViewIfNeeded();
    await screenshot(page, 'player-result-desktop');
    await setViewport(page, { width: 420, height: 900 });
    await page.locator('#pc-result').scrollIntoViewIfNeeded();
    check('player: captured details have no horizontal overflow at phone width',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await screenshot(page, 'player-result-mobile');
    await setViewport(page, { width: 1440, height: 1000 });
    await page.click('#pc-clear');
    check('player: Clear removes completed metadata and disables export',
      await page.locator('#pc-result').isHidden() && await page.locator('#pc-export').isDisabled());
    await page.click('#pc-reference-clear');
    check('player: explicit reference clear removes the selected-file identity',
      /No reference file selected/.test(await page.locator('#pc-reference-status').textContent()) &&
      await page.locator('#pc-reference-file').evaluate(input => input.files.length === 0));

    await page.fill('#pc-duration', '30'); await page.click('#pc-start');
    await page.waitForFunction(() => window.__playerCaptureSmoke.starts.length === 2);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__playerCaptureSmoke.stops.length === 2 && !document.getElementById('pc-start').disabled);
    check('player: Escape releases only its own capture and leaves no export',
      await page.locator('#pc-export').isDisabled() && await page.evaluate(() => {
        const state = window.__playerCaptureSmoke;
        return !state.running && state.stops[1].leaseId === state.starts[1].leaseId;
      }));

    await page.click('#pc-start'); await page.waitForFunction(() => window.__playerCaptureSmoke.starts.length === 3);
    await page.click('.rail-item[data-screen="quick"]');
    await page.waitForFunction(() => window.__playerCaptureSmoke.stops.length === 3);
    await page.click('.rail-item[data-screen="player-capture"]');
    check('player: navigating away cancels capture and returning shows no stale result',
      await page.locator('#pc-result').isHidden() && await page.locator('#pc-export').isDisabled() &&
      await page.evaluate(() => !window.__playerCaptureSmoke.running));

    await page.click('#pc-start'); await page.waitForFunction(() => window.__playerCaptureSmoke.starts.length === 4);
    const off = await experimental(page); await off.uncheck(); await closeExperimental(page);
    await page.waitForFunction(() => window.__playerCaptureSmoke.stops.length === 4);
    check('player: disabling the feature during recording releases the input and removes the route',
      await page.locator('.rail-item[data-screen="player-capture"]').count() === 0 &&
      await page.evaluate(() => !window.__playerCaptureSmoke.running && document.getElementById('screen-player-capture').hidden));
    check('player: this opt-in flow leaves Fleet disabled',
      await page.locator('.rail-item[data-screen="fleet"]').count() === 0);

    const enableAudio = await experimental(page); await enableAudio.check(); await closeExperimental(page);
    await page.click('.rail-item[data-screen="player-capture"]');
    await page.fill('#pc-duration', '1'); await page.check('#pc-keep-audio');
    await selectReference(page);
    await page.click('#pc-start');
    await page.waitForFunction(() => !document.getElementById('pc-export-audio').disabled);
    check('player: explicit retention prepares an archive without claiming it was saved',
      /ready in memory.*not been saved/.test(await page.locator('#pc-status').innerText()));
    const pendingAudio = page.waitForEvent('download'); await page.click('#pc-export-audio');
    const downloadedAudio = await pendingAudio, archiveBytes = fs.readFileSync(await downloadedAudio.path());
    const files = readAudioArchive(archiveBytes), manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
    const audioDetails = JSON.parse(files.get('capture.json').toString('utf8')), pcm = files.get('audio/primary.f32le');
    check('player: the actual audio download contains only the documented four local entries',
      /^deckchek-player-audio-[a-f\d-]{36}\.zip$/.test(downloadedAudio.suggestedFilename()) &&
      JSON.stringify([...files.keys()]) === '["manifest.json","capture.json","audio/primary.f32le","README.txt"]' &&
      archiveBytes.length < 20 * 1024 * 1024 && manifest.schemaVersion === 'deckchek.player-audio-export.v1');
    check('player: independent SHA-256 checks match every archived evidence payload',
      manifest.files.length === 3 && manifest.files.every(file => files.get(file.path)?.length === file.byteLength &&
        createHash('sha256').update(files.get(file.path)).digest('hex') === file.sha256));
    let exactSamples = pcm.length === 4410 * 8;
    for (let offset = 0; offset < pcm.length && exactSamples; offset += 4) exactSamples = pcm.readFloatLE(offset) === Math.fround(0.1);
    check('player: the downloaded PCM preserves returned normalized samples and nominal format',
      exactSamples && manifest.audio.encoding === 'float32_le_interleaved' && manifest.audio.frames === 4410 &&
      manifest.audio.nominalSampleRateHz === 44100 && manifest.audio.measuredSampleRateHz === null &&
      manifest.audio.sourceHardwareFormat === null && manifest.audio.sampleBasis === 'normalized_capture_adapter_values');
    check('player: the archive binds capture identity and reference metadata without qualification or reference bytes',
      manifest.runId === audioDetails.acquisition.runId && manifest.captureId === audioDetails.acquisition.captureId &&
      manifest.qualification.eligibleForReport === false && manifest.qualification.pitchMeasured === false &&
      audioDetails.record.qualification.status === 'unverified' && audioDetails.record.qualification.measurement === null &&
      audioDetails.selectedReference.sha256 === REFERENCE_SHA256 && audioDetails.selectedReference.bytesRetained === false &&
      manifest.referenceBytesIncluded === false &&
      JSON.stringify(audioDetails.acquisition.rawEvidenceRefs) === '["audio/primary.f32le"]' &&
      JSON.stringify(audioDetails.record.capture.rawEvidenceRefs) === '["audio/primary.f32le"]');
    check('player: audio export still creates no diagnostic History run',
      await page.evaluate(() => window.__playerCaptureSmoke.diagnosticWrites === 0));
    await page.click('#pc-clear');
    check('player: Clear discards both optional audio and metadata exports',
      await page.locator('#pc-result').isHidden() && await page.locator('#pc-export-audio').isDisabled() &&
      await page.locator('#pc-export').isDisabled());
  } finally { await desktop.close(); }
  return errors.flat();
}
