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

function mount({ get = async () => detail(), compare = async () => comparison(), createError = null } = {}) {
  const calls = [];
  window.__TAURI__ = { core: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'job_list') return { jobs: [], total: 0 };
    if (command === 'job_get') return get(args.id);
    if (command === 'job_comparison') return compare(args.id);
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
