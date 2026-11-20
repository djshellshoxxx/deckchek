import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
const realTimeout = globalThis.setTimeout;
const { renderIntakeStep, renderTestsStep, renderSheetStep } = await import('../app/ui/workflows/service-job.js');
const { ensureJobSheetKind } = await import('../app/report-kinds/jobsheet.js');
const { exportPdfWithFeedback } = await import('../app/ui/persistence.js');
const { toast } = await import('../app/ui/live.js');
const { settings } = await import('../app/ui/state.js');
const { bindSettings } = await import('../app/features.js');
bindSettings(settings);
await ensureJobSheetKind();

const detail = () => ({
  job: { id: 'old', jobNumber: 'J-2026-0001', status: 'intake', reportedFault: 'Old fault', accessories: [], openedAt: '2026-11-01T10:00:00Z' },
  customer: { id: 'customer', name: 'Existing client', phone: '555-0100', email: 'client@example.test' },
  asset: null, results: [], log: [], photos: [], statusLog: [],
});

function mount(t, { render = renderIntakeStep, api = {}, row = detail() } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  settings.features = { service: true, pdfExport: true };
  for (const id of ['toasts', 'sr-polite', 'sr-assertive']) document.getElementById(id).replaceChildren();
  const host = document.createElement('div');
  document.getElementById('main').replaceChildren(host);
  const calls = [], reloads = [];
  const ctx = { detail: row, comparison: null, readOnly: false, isCurrent: () => host.isConnected,
    reload: async options => { reloads.push(options); return true; },
    api: Object.fromEntries(['updateCustomer', 'updateFields', 'photoUnlink', 'attachPhoto', 'linkResults', 'photoRead'].map(name => [name, (...args) => {
      calls.push({ name, args }); return api[name]?.(...args) ?? Promise.resolve(name === 'photoRead' ? '' : {});
    }])),
  };
  window.__TAURI__ = { core: { invoke: async command => command === 'list_runs' ? [{ id: 'saved-run', startedAt: '2026-11-01T10:00:00Z', test: 'speed' }] : [] } };
  render(host, ctx);
  return { host, ctx, calls, reloads };
}

function feedback(t) {
  t.mock.timers.tick(50);
  return ['toasts', 'sr-polite', 'sr-assertive'].map(id => document.getElementById(id).textContent);
}

function leave(host) {
  const replacement = document.createElement('form'), field = document.createElement('input');
  field.value = 'Keep newer draft'; replacement.append(field); host.replaceWith(replacement); field.focus();
  return () => {
    assert.ok(replacement.isConnected); assert.equal(field.value, 'Keep newer draft'); assert.ok(document.activeElement === field);
  };
}

async function waitUntil(predicate) {
  // Native WebCrypto digests also need worker-thread time; a fixed number of immediate turns can
  // expire before that work finishes. Use the real timer independently of the announcement clock.
  for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => realTimeout(resolve, 2));
  assert.ok(predicate(), 'the real asynchronous handler reached the expected boundary');
}

const editCases = [
  { name: 'customer', button: '#svc-cust-edit', field: '#svc-ce-name', method: 'updateCustomer', success: 'Customer updated.' },
  { name: 'job details', button: '#svc-fields-edit', field: '#svc-e-fault', method: 'updateFields', success: 'Job details saved.' },
];

for (const edit of editCases) {
  for (const outcome of ['resolve', 'reject']) {
    test(`late ${edit.name} ${outcome} leaves the replacement panel and feedback alone`, async t => {
      const pending = deferred();
      const { host, calls, reloads } = mount(t, { api: { [edit.method]: () => pending.promise } });
      host.querySelector(edit.button).dispatch('click');
      host.querySelector(edit.field).value = 'Submitted value';
      host.querySelector('.svc-inline-form').dispatch('submit');
      assert.equal(calls.filter(call => call.name === edit.method).length, 1);
      const unchanged = leave(host), before = feedback(t);
      if (outcome === 'resolve') pending.resolve({}); else pending.reject(new Error('Old write failed'));
      await settle(); unchanged();
      assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
    });
  }

  test(`current ${edit.name} submission reports failure and can be retried`, async t => {
    let attempts = 0;
    const { host, reloads } = mount(t, { api: { [edit.method]: async () => { if (++attempts === 1) throw new Error('Retry me'); return {}; } } });
    host.querySelector(edit.button).dispatch('click');
    const form = host.querySelector('.svc-inline-form'); form.dispatch('submit'); await settle();
    assert.match(feedback(t)[2], /Retry me/); assert.equal(reloads.length, 0);
    form.dispatch('submit'); await settle();
    assert.match(feedback(t)[0], new RegExp(edit.success.replace('.', '\\.'))); assert.equal(reloads.length, 1);
  });
}

test('a cancelled customer editor cannot reload or toast over the replacement editor', async t => {
  const pending = deferred();
  const { host, reloads, calls } = mount(t, { api: { updateCustomer: () => pending.promise } });
  host.querySelector('#svc-cust-edit').dispatch('click');
  const oldForm = host.querySelector('.svc-inline-form');
  oldForm.dispatch('submit');
  oldForm.querySelectorAll('button').find(button => button.textContent === 'Cancel').dispatch('click');
  host.querySelector('#svc-cust-edit').dispatch('click');
  const newForm = host.querySelector('.svc-inline-form'), name = host.querySelector('#svc-ce-name');
  name.value = 'Keep another edit'; const before = feedback(t);
  pending.resolve({}); await settle();
  assert.ok(host.querySelector('.svc-inline-form') === newForm); assert.equal(name.value, 'Keep another edit');
  assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
  oldForm.dispatch('submit'); await settle();
  assert.equal(calls.filter(call => call.name === 'updateCustomer').length, 1, 'retired forms do not start new writes');
});

for (const outcome of ['resolve', 'reject']) {
  test(`late saved-run link ${outcome} preserves the current panel and feedback`, async t => {
    const pending = deferred();
    const { host, calls, reloads } = mount(t, { render: (node, ctx) => renderTestsStep(node, ctx, 'before'), api: { linkResults: () => pending.promise } });
    await settle(); host.querySelector('#svc-link-run-before').value = 'saved-run';
    host.querySelector('#svc-link-run-btn-before').dispatch('click');
    assert.deepEqual(calls.find(call => call.name === 'linkResults').args, ['old', 'before', { sessionIds: ['saved-run'] }]);
    const unchanged = leave(host), before = feedback(t);
    if (outcome === 'resolve') pending.resolve({}); else pending.reject(new Error('Old link failed'));
    await settle(); unchanged();
    assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
  });
}

test('current saved-run linking still refreshes and reports the linked phase', async t => {
  const { host, reloads } = mount(t, { render: (node, ctx) => renderTestsStep(node, ctx, 'before') });
  await settle(); host.querySelector('#svc-link-run-before').value = 'saved-run';
  host.querySelector('#svc-link-run-btn-before').dispatch('click'); await settle();
  assert.equal(reloads.length, 1); assert.match(feedback(t)[0], /Run linked as before/);
});

for (const outcome of ['resolve', 'reject']) {
  test(`late photo unlink ${outcome} does not reload or announce in another panel`, async t => {
    const pending = deferred();
    const row = detail(); row.photos = [{ photoId: 'photo', linkId: 'link', caption: 'Intake', stage: 'intake' }];
    const { host, calls, reloads } = mount(t, { row, api: { photoUnlink: () => pending.promise } });
    host.querySelector('[aria-label="Remove photo Intake"]').dispatch('click');
    assert.deepEqual(calls.find(call => call.name === 'photoUnlink').args, ['link']);
    const unchanged = leave(host), before = feedback(t);
    if (outcome === 'resolve') pending.resolve({}); else pending.reject(new Error('Old photo could not be removed'));
    await settle(); unchanged();
    assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
  });
}

// Validated by the production JPEG parser; decode and canvas are the browser-only seam.
const jpeg = Uint8Array.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,18,1,255,0,86,255,208,120,255,217]);
function photoRuntime(t) {
  const previous = Object.fromEntries(['createImageBitmap', 'OffscreenCanvas'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  globalThis.OffscreenCanvas = class { getContext() { return { fillRect() {}, drawImage() {} }; } convertToBlob() { return Promise.resolve(new Blob([jpeg])); } };
  t.after(() => { for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
}

for (const outcome of ['resolve', 'reject']) {
  test(`late photo attach ${outcome} preserves the submitted write and suppresses obsolete feedback`, async t => {
    photoRuntime(t); t.mock.method(console, 'warn', () => {});
    const pending = deferred();
    const { host, calls, reloads } = mount(t, { api: { attachPhoto: () => pending.promise } });
    host.querySelector('#svc-add-photo').files = [new Blob([jpeg])];
    host.querySelector('#svc-add-photo-caption').value = 'Submitted caption';
    host.querySelector('#svc-add-photo-btn').dispatch('click');
    await waitUntil(() => calls.some(call => call.name === 'attachPhoto'));
    assert.equal(calls.find(call => call.name === 'attachPhoto').args[1].caption, 'Submitted caption');
    const unchanged = leave(host), before = feedback(t);
    if (outcome === 'resolve') pending.resolve({}); else pending.reject(new Error('Attach failed'));
    await settle(); unchanged();
    assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
    assert.equal(calls.filter(call => call.name === 'attachPhoto').length, 1);
  });
}

test('photo success is not announced when a refresh is superseded by navigation', async t => {
  photoRuntime(t);
  const pending = deferred();
  const { host, ctx, calls } = mount(t);
  let reloadStarted = false;
  ctx.reload = () => { reloadStarted = true; return pending.promise; };
  host.querySelector('#svc-add-photo').files = [new Blob([jpeg])];
  host.querySelector('#svc-add-photo-btn').dispatch('click');
  await waitUntil(() => reloadStarted);
  assert.equal(calls.filter(call => call.name === 'attachPhoto').length, 1);
  const unchanged = leave(host), before = feedback(t);
  pending.resolve(false); await settle(); unchanged();
  assert.deepEqual(feedback(t), before);
});

test('a submitted photo batch finishes all its attachments after leaving the panel', async t => {
  photoRuntime(t);
  const pending = deferred(); let attachments = 0;
  const { host, calls, reloads } = mount(t, { api: { attachPhoto: () => ++attachments === 1 ? pending.promise : Promise.resolve({}) } });
  host.querySelector('#svc-add-photo').files = [new Blob([jpeg]), new Blob([jpeg])];
  host.querySelector('#svc-add-photo-btn').dispatch('click');
  await waitUntil(() => attachments === 1);
  const unchanged = leave(host), before = feedback(t);
  pending.resolve({}); await waitUntil(() => attachments === 2); await settle(); unchanged();
  assert.equal(calls.filter(call => call.name === 'attachPhoto').length, 2);
  assert.deepEqual(feedback(t), before); assert.equal(reloads.length, 0);
});

for (const outcome of ['success', 'failure']) {
  test(`current photo attachment ${outcome} retains its visible feedback and releases the button`, async t => {
    photoRuntime(t); t.mock.method(console, 'warn', () => {});
    const { host, reloads } = mount(t, { api: { attachPhoto: async () => { if (outcome === 'failure') throw new Error('Photo rejected'); return {}; } } });
    host.querySelector('#svc-add-photo').files = [new Blob([jpeg])];
    const button = host.querySelector('#svc-add-photo-btn'); button.dispatch('click');
    await waitUntil(() => reloads.length === 1); await settle();
    assert.equal(button.disabled, false); assert.equal(button.hasAttribute('aria-busy'), false);
    assert.match(feedback(t)[outcome === 'success' ? 1 : 2], outcome === 'success' ? /1 photo added/ : /1 photo could not be added/);
  });
}

test('HTML export captures the clicked sheet options before asynchronous preparation', async t => {
  const { host } = mount(t, { render: renderSheetStep });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => '' }));
  const writes = [];
  window.__TAURI__ = { dialog: { save: async () => '/tmp/job.html' }, core: { invoke: async (command, args) => { writes.push({ command, args }); return { path: args.path, bytes: args.content.length }; } } };
  host.querySelector('#svc-sheet-html').dispatch('click');
  host.querySelector('#svc-sheet-customer').checked = true;
  await waitUntil(() => writes.length === 1); await settle();
  assert.equal(writes[0].command, 'userfiles_write_text');
  assert.doesNotMatch(writes[0].args.content, /Existing client/, 'later checkbox changes belong to the next export');
  assert.match(feedback(t)[0], /Job sheet exported as HTML/);
});

for (const outcome of ['resolve', 'reject']) {
  test(`late HTML export ${outcome} completes the submitted save without feedback in another panel`, async t => {
    const { host } = mount(t, { render: renderSheetStep });
    const pending = deferred(), writes = [];
    window.__TAURI__ = { dialog: { save: async () => '/tmp/job.html' }, core: { invoke: (command, args) => { writes.push({ command, args }); return pending.promise; } } };
    host.querySelector('#svc-sheet-html').dispatch('click');
    await waitUntil(() => writes.length === 1);
    const unchanged = leave(host), before = feedback(t);
    if (outcome === 'resolve') pending.resolve({ path: '/tmp/job.html', bytes: 42 }); else pending.reject(new Error('Old export failed'));
    await settle(); unchanged();
    assert.deepEqual(feedback(t), before); assert.equal(writes.length, 1);
  });
}

test('HTML export preparation abandons a retired panel before opening a save dialog', async t => {
  const { host } = mount(t, { render: renderSheetStep });
  let dialogs = 0;
  window.__TAURI__ = { dialog: { save: async () => { dialogs++; return null; } }, core: { invoke: async () => ({}) } };
  host.querySelector('#svc-sheet-html').dispatch('click'); leave(host);
  await settle();
  assert.equal(dialogs, 0); assert.deepEqual(feedback(t), ['', '', '']);
});

test('current HTML export failure retains a working retry and cancellation stays quiet', async t => {
  const { host } = mount(t, { render: renderSheetStep });
  let attempts = 0, cancel = false;
  window.__TAURI__ = { dialog: { save: async () => cancel ? null : '/tmp/job.html' }, core: { invoke: async (_command, args) => {
    if (++attempts === 1) throw new Error('HTML save failed'); return { path: args.path, bytes: args.content.length };
  } } };
  host.querySelector('#svc-sheet-html').dispatch('click');
  await waitUntil(() => document.getElementById('toasts').querySelector('[data-toast-action="Retry"]'));
  assert.match(feedback(t)[2], /HTML save failed/);
  document.getElementById('toasts').querySelector('[data-toast-action="Retry"]').dispatch('click');
  await waitUntil(() => attempts === 2); await settle(); assert.match(feedback(t)[0], /Job sheet exported as HTML/);
  cancel = true; const before = feedback(t);
  host.querySelector('#svc-sheet-html').dispatch('click'); await settle();
  assert.equal(attempts, 2); assert.deepEqual(feedback(t), before);
});

function nativePdf(t, render) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Windows NT 10.0' } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; });
  const writes = [];
  window.__TAURI__ = { dialog: { save: async () => '/tmp/job.pdf' }, core: { invoke: (command, args) => {
    writes.push({ command, args }); return render?.(command, args) ?? Promise.resolve({ path: args.destPath, pages: 1 });
  } } };
  return writes;
}

test('PDF export captures the clicked sheet options and still reports current success', async t => {
  const { host } = mount(t, { render: renderSheetStep });
  const writes = nativePdf(t);
  host.querySelector('#svc-sheet-customer').checked = true;
  const button = host.querySelector('#svc-sheet-pdf'); button.dispatch('click');
  host.querySelector('#svc-sheet-customer').checked = false;
  await waitUntil(() => writes.length === 1); await settle();
  assert.equal(writes[0].command, 'pdf_render'); assert.match(writes[0].args.html, /Existing client/);
  assert.match(feedback(t)[0], /Job sheet saved as PDF/); assert.equal(button.disabled, false); assert.equal(button.hasAttribute('aria-busy'), false);
});

for (const outcome of ['resolve', 'reject']) {
  test(`late PDF export ${outcome} preserves the backend result and current-screen feedback`, async t => {
    const { host } = mount(t, { render: renderSheetStep });
    const pending = deferred(), writes = nativePdf(t, () => pending.promise);
    const button = host.querySelector('#svc-sheet-pdf'); button.dispatch('click');
    await waitUntil(() => writes.length === 1);
    const unchanged = leave(host); toast('Current panel message.', { timeout: 0 });
    if (outcome === 'resolve') pending.resolve({ path: '/tmp/job.pdf', pages: 1 }); else pending.reject({ code: 'io', message: 'Old PDF export failed' });
    await settle(); unchanged();
    assert.equal(feedback(t)[0], 'Current panel message.'); assert.equal(writes.length, 1);
    assert.equal(button.disabled, false); assert.equal(button.hasAttribute('aria-busy'), false);
  });
}

test('a PDF retry offered on a previous panel cannot start another export after navigation', async t => {
  const { host } = mount(t, { render: renderSheetStep });
  const writes = nativePdf(t, async () => { throw { code: 'io', message: 'Retry this PDF' }; });
  host.querySelector('#svc-sheet-pdf').dispatch('click');
  await waitUntil(() => document.getElementById('toasts').querySelector('[data-toast-action="Retry"]'));
  const retry = document.getElementById('toasts').querySelector('[data-toast-action="Retry"]');
  leave(host); retry.dispatch('click'); await settle();
  assert.equal(writes.length, 1); assert.doesNotMatch(feedback(t)[0], /Creating PDF|Retry this PDF/);
});

test('current PDF failure can retry and callers without ownership callbacks retain feedback', async t => {
  mount(t);
  let attempts = 0;
  const writes = nativePdf(t, async (_command, args) => { if (++attempts === 1) throw { code: 'io', message: 'Retry this PDF' }; return { path: args.destPath, pages: 1 }; });
  const result = await exportPdfWithFeedback('jobSheet', { detail: detail(), comparison: null, options: {} });
  assert.equal(result.error.code, 'io'); assert.match(feedback(t)[0], /Retry this PDF/);
  document.getElementById('toasts').querySelector('[data-toast-action="Retry"]').dispatch('click');
  await waitUntil(() => writes.length === 2); await settle();
  assert.match(feedback(t)[0], /Job sheet saved as PDF/);
});
