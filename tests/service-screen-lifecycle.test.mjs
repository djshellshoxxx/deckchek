import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

const document = installServiceDom({ after });
const { serviceScreenDefs } = await import('../app/ui/screens/service.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { navigateTo, takeHandoff } = await import('../app/ui/crosslinks.js');
const { active, settings } = await import('../app/ui/state.js');
const { bindSettings } = await import('../app/features.js');
const definitions = serviceScreenDefs();
bindSettings(settings);

const detail = () => ({
  job: { id: 'old', jobNumber: 'J-2026-0001', status: 'intake', reportedFault: 'Old job fault', accessories: [], openedAt: '2026-11-01T10:00:00Z' },
  customer: null, asset: null, results: [], log: [], photos: [], statusLog: [],
});
const comparison = () => ({ values: [], tests: [], methods: [] });

function mount({ get = async () => detail(), compare = async () => comparison(), setStatus = async () => detail().job, addLog = async () => ({}), create = async () => detail().job, createError = null } = {}) {
  const calls = [];
  window.__TAURI__ = { core: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'job_list') return { jobs: [], total: 0 };
    if (command === 'job_get') return get(args.id);
    if (command === 'job_comparison') return compare(args.id);
    if (command === 'job_set_status') return setStatus(args);
    if (command === 'job_add_log') return addLog(args);
    if (command === 'job_create') return create(args);
    return [];
  } } };
  settings.features = { service: true };
  settings.serviceList = {};
  active.screen = null;
  takeHandoff('service');
  document.activeElement = document.body;
  const section = document.getElementById('screen-service');
  section.replaceChildren(); section.hidden = true;
  document.getElementById('toasts').replaceChildren();
  const service = createError ? { ...definitions[0], create() { throw new Error(createError); } } : definitions[0];
  registerScreens([{ id: 'other', title: 'Other', icon: 'info', create: () => ({}) }, service]);
  go('other');
  return { calls, section };
}

const shortcut = () => document.dispatch('keydown', { key: 'j', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false });

test('Ctrl+J reports a navigation failure visibly instead of rejecting outside the event handler', async () => {
  mount({ createError: 'Service view could not be created' });
  const event = shortcut();
  await settle();
  assert.equal(event.defaultPrevented, true);
  const error = document.getElementById('toasts').querySelector('[role="alert"]');
  assert.ok(error, 'navigation failure must show an error alert');
  assert.match(error.textContent, /Could not open a new job: Service view could not be created/);
});

test('Ctrl+J opens the form and respects a subsequent navigation away from the service screen', async () => {
  const { section } = mount();
  go('service');
  await settle();
  shortcut();
  go('other');
  await settle();
  assert.equal(active.screen.def.id, 'other', 'a deferred shortcut must not reopen a screen the user left');
  assert.equal(section.hidden, true);
  navigateTo('service', { newJob: {} });
  assert.ok(section.querySelector('#svc-new-form'), 'the successful shortcut still supports creating jobs');
});

test('Ctrl+J leaves the feature-disabled and open-dialog cases alone', async () => {
  mount();
  settings.features.service = false;
  assert.equal(shortcut().defaultPrevented, false);
  settings.features.service = true;
  const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); document.body.append(dialog);
  assert.equal(shortcut().defaultPrevented, false);
  dialog.remove();
  await settle();
  assert.equal(active.screen.def.id, 'other');
});

for (const phase of ['job', 'comparison']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`a late ${phase} ${outcome} after hide/show preserves the new job form and its input`, async () => {
      const pending = deferred();
      const { section, calls } = mount({
        get: () => phase === 'job' ? pending.promise : Promise.resolve(detail()),
        compare: () => phase === 'comparison' ? pending.promise : Promise.resolve(comparison()),
      });
      navigateTo('service', { jobId: 'old', step: 'intake' });
      await settle();
      assert.ok(calls.some(call => call.command === (phase === 'job' ? 'job_get' : 'job_comparison')), 'the old request is in flight');
      go('other');
      navigateTo('service', { newJob: {} });
      const form = section.querySelector('#svc-new-form');
      const name = section.querySelector('#svc-cust-name');
      assert.ok(form);
      name.value = 'Unsaved new customer';
      name.focus();
      if (outcome === 'resolve') pending.resolve(phase === 'job' ? detail() : comparison());
      else pending.reject(new Error('Old request failed'));
      await settle();
      assert.ok(section.querySelector('#svc-new-form') === form, 'the superseded result must not replace the new form');
      assert.equal(section.querySelector('#svc-cust-name').value, 'Unsaved new customer');
      assert.ok(document.activeElement === name, 'the superseded request must not move focus');
      assert.equal(section.querySelector('#svc-job-error'), null, 'a stale error must not replace the new form');
      if (phase === 'job') assert.equal(calls.filter(call => call.command === 'job_comparison').length, 0, 'do not start comparison work for the superseded job');
    });
  }
}

test('current job loading still renders its comparison and current errors retain Retry', async () => {
  const { section } = mount();
  navigateTo('service', { jobId: 'old', step: 'after' });
  await settle();
  assert.equal(section.querySelector('#svc-job-title').textContent, 'Job J-2026-0001');
  assert.match(section.querySelector('#svc-compare-status').textContent, /No measured values are linked yet/);
  const failed = mount({ get: async () => { throw new Error('Job unavailable'); } });
  navigateTo('service', { jobId: 'old', step: 'intake' });
  await settle();
  const error = failed.section.querySelector('#svc-job-error');
  assert.match(error.textContent, /Could not load the job: Job unavailable/);
  assert.ok(error.querySelectorAll('button').some(button => button.textContent === 'Retry'));
});

for (const outcome of ['resolve', 'reject']) {
  test(`a late status ${outcome} leaves a replacement new-job form and its feedback alone`, async () => {
    const pending = deferred();
    const { section, calls } = mount({ setStatus: () => pending.promise });
    navigateTo('service', { jobId: 'old', step: 'intake' });
    await settle();
    section.querySelector('[data-status-to="diagnosing"]').dispatch('click');
    await settle();
    assert.ok(calls.some(call => call.command === 'job_set_status'));
    navigateTo('service', { newJob: {} });
    const form = section.querySelector('#svc-new-form');
    const name = section.querySelector('#svc-cust-name');
    name.value = 'Unsaved replacement customer'; name.focus();
    const previousReads = calls.filter(call => call.command === 'job_get').length;
    const feedback = document.getElementById('toasts').textContent;
    if (outcome === 'resolve') pending.resolve({ ...detail().job, status: 'diagnosing' });
    else pending.reject(new Error('Old status write failed'));
    await settle();
    assert.ok(section.querySelector('#svc-new-form') === form, 'a completed write must not reopen its old job');
    assert.equal(name.value, 'Unsaved replacement customer');
    assert.ok(document.activeElement === name);
    assert.equal(calls.filter(call => call.command === 'job_get').length, previousReads, 'do not start an obsolete reload');
    assert.equal(document.getElementById('toasts').textContent, feedback, 'stale success/error feedback must not intrude on the replacement form');
  });

  test(`a late work-log ${outcome} cannot reload a job after a new form opens`, async () => {
    const pending = deferred();
    const { section, calls } = mount({ addLog: () => pending.promise });
    navigateTo('service', { jobId: 'old', step: 'work' });
    await settle();
    section.querySelector('#svc-note').value = 'Saved on the old job';
    section.querySelector('#svc-note-save').dispatch('click');
    await settle();
    assert.ok(calls.some(call => call.command === 'job_add_log'));
    navigateTo('service', { newJob: {} });
    const form = section.querySelector('#svc-new-form');
    const name = section.querySelector('#svc-cust-name');
    name.value = 'Current customer'; name.focus();
    await new Promise(resolve => setTimeout(resolve, 60));
    const previousReads = calls.filter(call => call.command === 'job_get').length;
    const feedback = document.getElementById('sr-assertive').textContent;
    if (outcome === 'resolve') pending.resolve({});
    else pending.reject(new Error('Old note write failed'));
    await settle();
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.ok(section.querySelector('#svc-new-form') === form);
    assert.equal(name.value, 'Current customer');
    assert.ok(document.activeElement === name);
    assert.equal(calls.filter(call => call.command === 'job_get').length, previousReads);
    assert.equal(document.getElementById('sr-assertive').textContent, feedback, 'a detached panel must not announce its stale error');
  });

  test(`a late comparison ${outcome} preserves unsaved work on the current job`, async () => {
    const pending = deferred();
    const { section } = mount({ compare: () => pending.promise });
    navigateTo('service', { jobId: 'old', step: 'work' });
    await settle();
    const note = section.querySelector('#svc-note');
    assert.ok(note, 'job fields are usable while comparison loads');
    note.value = 'Work entered before comparison finished'; note.focus();
    if (outcome === 'resolve') pending.resolve(comparison());
    else pending.reject(new Error('Comparison unavailable'));
    await settle();
    assert.ok(section.querySelector('#svc-note') === note, 'background comparison must not replace edited fields');
    assert.equal(note.value, 'Work entered before comparison finished');
    assert.ok(document.activeElement === note);
    if (outcome === 'reject') {
      const error = section.querySelector('#svc-comparison-error');
      assert.match(error?.textContent || '', /Comparison unavailable/);
      assert.ok(error.querySelectorAll('button').some(button => button.textContent === 'Retry comparison'));
    }
  });
}

test('current status and work-log writes still reload their job and release the status controls', async () => {
  const row = detail();
  let nextLog = 0;
  const { section, calls } = mount({
    get: async () => structuredClone(row),
    setStatus: async ({ to }) => { row.job = { ...row.job, status: to }; return row.job; },
    addLog: async ({ kind, payload }) => { row.log.push({ ...payload, id: `log-${++nextLog}`, kind, at: '2026-11-19T10:00:00Z' }); },
  });
  navigateTo('service', { jobId: 'old', step: 'intake' });
  await settle();
  section.querySelector('[data-status-to="diagnosing"]').dispatch('click');
  await settle();
  assert.match(section.querySelector('#svc-job-status').textContent, /Diagnosing/);
  section.querySelector('[data-status-to="repairing"]').dispatch('click');
  await settle();
  assert.match(section.querySelector('#svc-job-status').textContent, /Repairing/);
  section.querySelector('[data-step="work"]').dispatch('click');
  section.querySelector('#svc-note').value = 'A saved repair note';
  section.querySelector('#svc-note-save').dispatch('click');
  await settle();
  assert.match(section.querySelector('#svc-notes').textContent, /A saved repair note/);
  assert.equal(section.querySelector('#svc-note').value, '');
  assert.equal(calls.filter(call => call.command === 'job_set_status').length, 2);
  assert.equal(calls.filter(call => call.command === 'job_add_log').length, 1);
});

test('a write pending on another job neither blocks the current status write nor releases its busy guard', async () => {
  const writes = [deferred(), deferred()];
  let index = 0;
  const { section, calls } = mount({
    get: async id => ({ ...detail(), job: { ...detail().job, id, jobNumber: id } }),
    setStatus: () => writes[index++].promise,
  });
  navigateTo('service', { jobId: 'old', step: 'intake' });
  await settle();
  section.querySelector('[data-status-to="diagnosing"]').dispatch('click');
  navigateTo('service', { jobId: 'new', step: 'intake' });
  await settle();
  const current = section.querySelector('[data-status-to="diagnosing"]');
  current.dispatch('click');
  assert.equal(calls.filter(call => call.command === 'job_set_status').length, 2, 'a different job has its own pending operation');
  writes[0].resolve({ ...detail().job, status: 'diagnosing' });
  await settle();
  assert.equal(current.disabled, true, 'the old completion does not release the current status button');
  current.dispatch('click');
  assert.equal(calls.filter(call => call.command === 'job_set_status').length, 2, 'duplicate submissions remain blocked');
  writes[1].resolve({ ...detail().job, id: 'new', jobNumber: 'new', status: 'diagnosing' });
  await settle();
  assert.equal(section.querySelector('#svc-job-title').textContent, 'Job new');
});

test('Retry comparison preserves edited fields, removes its error and makes the comparison available on the After step', async () => {
  let attempts = 0;
  const { section } = mount({ compare: async () => {
    if (++attempts === 1) throw new Error('Comparison temporarily unavailable');
    return comparison();
  } });
  navigateTo('service', { jobId: 'old', step: 'work' });
  await settle();
  const note = section.querySelector('#svc-note');
  note.value = 'Keep while retrying'; note.focus();
  section.querySelector('#svc-comparison-error').querySelector('button').dispatch('click');
  await settle();
  assert.ok(section.querySelector('#svc-note') === note);
  assert.equal(note.value, 'Keep while retrying');
  assert.equal(section.querySelector('#svc-comparison-error'), null);
  section.querySelector('[data-step="after"]').dispatch('click');
  assert.match(section.querySelector('#svc-compare-status').textContent, /No measured values are linked yet/);
  assert.equal(attempts, 2);
});

for (const step of ['after', 'sheet']) {
  test(`late comparison refreshes the ${step} evidence without replacing its options or status note`, async () => {
    const pending = deferred();
    const { section } = mount({ compare: () => pending.promise });
    navigateTo('service', { jobId: 'old', step });
    await settle();
    const note = section.querySelector('#svc-status-note');
    note.value = 'Keep this pending status note'; note.focus();
    const checkboxes = section.querySelectorAll('input[type="checkbox"]');
    if (step === 'sheet') checkboxes.forEach(checkbox => { checkbox.checked = true; });
    pending.resolve({ ...comparison(), tests: [
      { phase: 'before', testId: 'fader', title: 'Channel fader', status: 'fail' },
      { phase: 'after', testId: 'fader', title: 'Channel fader', status: 'pass' },
    ] });
    await settle();
    assert.ok(section.querySelector('#svc-status-note') === note);
    assert.equal(note.value, 'Keep this pending status note');
    assert.ok(document.activeElement === note);
    const evidence = section.querySelector(step === 'sheet' ? '#svc-sheet-preview' : '#svc-headline');
    assert.match(evidence.textContent, /Channel fader/);
    if (step === 'sheet') assert.ok(checkboxes.every(checkbox => checkbox.checked && checkbox.isConnected), 'sheet export options retain their selections');
  });
}

for (const outcome of ['resolve', 'reject']) {
  test(`a late new-job create ${outcome} preserves a replacement form`, async () => {
    const pending = deferred();
    const { section, calls } = mount({ create: () => pending.promise });
    navigateTo('service', { newJob: {} });
    await settle();
    section.querySelector('#svc-cust-name').value = 'First customer';
    section.querySelector('#svc-unit').value = '__new';
    section.querySelector('#svc-unit-nickname').value = 'First unit';
    section.querySelector('#svc-fault').value = 'Original fault';
    section.querySelector('#svc-new-form').dispatch('submit');
    await settle();
    assert.ok(calls.some(call => call.command === 'job_create'));
    navigateTo('service', { newJob: {} });
    const form = section.querySelector('#svc-new-form');
    const name = section.querySelector('#svc-cust-name');
    name.value = 'Second customer'; name.focus();
    await new Promise(resolve => setTimeout(resolve, 60));
    const feedback = document.getElementById('sr-assertive').textContent;
    const toasts = document.getElementById('toasts').textContent;
    if (outcome === 'resolve') pending.resolve(detail().job);
    else pending.reject(new Error('Old create failed'));
    await settle();
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.ok(section.querySelector('#svc-new-form') === form);
    assert.equal(name.value, 'Second customer');
    assert.ok(document.activeElement === name);
    assert.equal(document.getElementById('toasts').textContent, toasts);
    assert.equal(document.getElementById('sr-assertive').textContent, feedback);
    assert.equal(calls.filter(call => call.command === 'job_get').length, 0);
  });
}
