import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installMonitorDom, nativeMonitorSettings, settle } from './fixtures/monitor-settings-dom.mjs';

const document = installMonitorDom({ after });
const { registerScreens, go } = await import('../app/ui/shell.js');
const { active } = await import('../app/ui/state.js');
const { normalizeSettings, SETTINGS_KEY } = await import('../app/monitor.js');
const section = document.createElement('section'); section.id = 'screen-monitor';
document.getElementById('main').append(section);
let mountId = 0;
const oldSettings = normalizeSettings({ retentionDays: 7, toastsEnabled: true });
const newSettings = normalizeSettings({ retentionDays: 30, toastsEnabled: false });

async function mount(t, options = {}) {
  const read = options.read || deferred();
  const native = nativeMonitorSettings({ initial: oldSettings, ...options, read });
  window.__TAURI__ = native.api;
  // The production module owns one page-long controller. Isolate pages between tests;
  // navigating away and back within a test still uses the real cached screen instance.
  const { createMonitorScreen } = await import(`../app/ui/screens/monitor.js?settings-page=${++mountId}`);
  active.screen = null;
  section.replaceChildren(); section.hidden = true;
  document.getElementById('toasts').replaceChildren();
  registerScreens([
    { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
    { id: 'monitor', title: 'Live monitor', icon: 'dvs', create: createMonitorScreen },
  ]);
  go('monitor');
  const byId = id => section.querySelector(`#${id}`);
  const form = section.querySelector('.mon-settings-form');
  t.after(async () => { byId('mon-stop').click(); await settle(); go('other'); });
  await settle();
  assert.deepEqual(native.of('app_state_get'), [{ key: SETTINGS_KEY }]);
  return {
    native, read, byId, form, navigate: go,
    save(days = '30', toasts = false) {
      byId('mon-retention').value = days;
      byId('mon-toasts').checked = toasts;
      form.dispatch('submit');
    },
  };
}

async function assertAlertPreference(screen, toasts) {
  screen.byId('mon-start').click(); await settle();
  assert.match(document.getElementById('status-capture').textContent, /Live monitor running/);
  screen.navigate('other');
  assert.equal(screen.native.of('stop_stream_capture').length, 0, 'hiding the cached screen must keep monitoring');
  screen.native.loseDevice(); await settle();
  assert.equal(section.hidden, true);
  assert.match(section.querySelector('.mon-events').textContent, /Audio device lost/);
  assert.equal(document.getElementById('toasts').children.length, toasts ? 1 : 0, 'the controller must use the current toast preference while hidden');
  screen.navigate('monitor');
  assert.match(screen.byId('mon-banner').textContent, /Audio device lost/);
  assert.equal(screen.native.of('app_state_get').length, 1, 'showing the cached screen must not reload preferences');
}

for (const outcome of ['value', 'error']) {
  for (const savePhase of ['complete', 'pruning']) {
    test(`an earlier settings ${outcome} cannot replace a newer saved preference while save is ${savePhase}`, async t => {
      const prune = savePhase === 'pruning' ? deferred() : null;
      const screen = await mount(t, { prune });
      screen.save(); await settle();
      assert.deepEqual(screen.native.saved, newSettings);
      assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }]);
      if (outcome === 'value') screen.read.resolve({ value: oldSettings });
      else screen.read.reject(new Error('Earlier settings read failed'));
      await settle();
      assert.equal(screen.byId('mon-retention').value, '30');
      assert.equal(screen.byId('mon-toasts').checked, false);
      assert.deepEqual(screen.native.saved, newSettings, 'the old read must not trigger another write');
      if (prune) { prune.resolve({ deleted: 2 }); await settle(); }
      assert.match(screen.form.textContent, /Saved\. Logs are kept for 30 days; 2 older logs removed/);
      await assertAlertPreference(screen, false);
    });
  }
}

test('a settings read that finishes during a native save cannot leave the saved toast checkbox stale', async t => {
  const write = deferred(), screen = await mount(t, { write });
  screen.save(); await settle();
  assert.deepEqual(screen.native.of('monitor_prune'), [], 'pruning waits for the native save');
  screen.read.resolve({ value: oldSettings }); await settle();
  write.resolve(); await settle();
  assert.deepEqual(screen.native.saved, newSettings);
  assert.equal(screen.byId('mon-retention').value, '30');
  assert.equal(screen.byId('mon-toasts').checked, false);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }]);
  await assertAlertPreference(screen, false);
});

test('a late old settings read cannot re-enable saved-disabled alert toasts in the background monitor', async t => {
  const screen = await mount(t);
  screen.save(); await settle();
  screen.read.resolve({ value: oldSettings }); await settle();
  assert.deepEqual(screen.native.saved, newSettings);
  await assertAlertPreference(screen, false);
});

test('a current initial read can finish while hidden and is retained when the cached screen returns', async t => {
  const screen = await mount(t), retention = screen.byId('mon-retention');
  screen.navigate('other');
  screen.read.resolve({ value: { retentionDays: 120, toastsEnabled: false } }); await settle();
  assert.equal(section.hidden, true);
  screen.navigate('monitor');
  assert.equal(screen.byId('mon-retention'), retention);
  assert.equal(retention.value, '120');
  assert.equal(screen.byId('mon-toasts').checked, false);
  assert.deepEqual(screen.native.of('app_state_set'), []);
  assert.deepEqual(screen.native.of('monitor_prune'), []);
  await assertAlertPreference(screen, false);
});

for (const outcome of ['missing', 'error']) {
  test(`a current ${outcome} settings read keeps the normalized defaults and alert toasts`, async t => {
    const screen = await mount(t);
    if (outcome === 'missing') screen.read.resolve(null);
    else screen.read.reject(new Error('Settings unavailable'));
    await settle();
    assert.equal(screen.byId('mon-retention').value, '90');
    assert.equal(screen.byId('mon-toasts').checked, true);
    await assertAlertPreference(screen, true);
  });
}

test('invalid retention fields still refuse native writes and pruning', async t => {
  const screen = await mount(t);
  screen.read.resolve({ value: oldSettings }); await settle();
  for (const raw of ['', '0', '1.5', '3651', '99999', '-1']) {
    screen.save(raw); await settle();
    assert.equal(screen.byId('mon-retention').getAttribute('aria-invalid'), 'true');
    assert.match(screen.byId('mon-retention-msg').textContent, /Nothing was saved; logs are still kept for 7 days/);
  }
  screen.byId('mon-retention').validity = { badInput: true };
  screen.save('30'); await settle();
  assert.deepEqual(screen.native.of('app_state_set'), []);
  assert.deepEqual(screen.native.of('monitor_prune'), []);
  screen.byId('mon-retention').validity = { badInput: false };
  screen.save(); await settle();
  assert.equal(screen.byId('mon-retention').hasAttribute('aria-invalid'), false);
  assert.deepEqual(screen.native.of('app_state_set'), [{ key: SETTINGS_KEY, value: newSettings }]);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }]);
});

test('a failed native save does not prune or prevent the current persisted settings read', async t => {
  const write = deferred(), screen = await mount(t, { write });
  screen.save(); await settle();
  write.reject(new Error('Settings disk unavailable')); await settle();
  screen.read.resolve({ value: oldSettings }); await settle();
  assert.deepEqual(screen.native.saved, oldSettings);
  assert.equal(screen.byId('mon-retention').value, '7');
  assert.equal(screen.byId('mon-toasts').checked, true);
  assert.match(screen.form.textContent, /Settings could not be saved: Settings disk unavailable/);
  assert.deepEqual(screen.native.of('monitor_prune'), []);
  await assertAlertPreference(screen, true);
});

test('settings persistence admits one save at a time and does not claim success before the write', async t => {
  const write = deferred(), screen = await mount(t, { write });
  screen.save(); await settle();
  for (const id of ['mon-settings-save', 'mon-retention', 'mon-toasts']) assert.equal(screen.byId(id).disabled, true);
  assert.match(screen.form.textContent, /Saving settings/);
  assert.doesNotMatch(screen.form.textContent, /Saved\. Logs/);
  assert.deepEqual(screen.native.saved, oldSettings);
  screen.save('120', true); await settle(); // a second programmatic submit is refused too
  assert.equal(screen.native.of('app_state_set').length, 1, 'no older acknowledgement can race a second native write');
  write.resolve(); await settle();
  assert.deepEqual(screen.native.saved, newSettings);
  assert.equal(screen.byId('mon-retention').value, '30');
  assert.equal(screen.byId('mon-toasts').checked, false);
  for (const id of ['mon-settings-save', 'mon-retention', 'mon-toasts']) assert.equal(screen.byId(id).disabled, false);
  screen.save('120', true); await settle();
  assert.equal(screen.native.of('app_state_set').length, 2);
  assert.equal(screen.native.saved.retentionDays, 120);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }, { retentionDays: 120 }]);
  screen.read.resolve({ value: oldSettings }); await settle();
  assert.equal(screen.byId('mon-retention').value, '120', 'late initialization cannot reset the completed second save');
});

test('pruning retains the save transaction across cached navigation before another save can begin', async t => {
  const prune = deferred(), screen = await mount(t, { prune });
  screen.save(); await settle();
  const button = screen.byId('mon-settings-save');
  assert.equal(button.disabled, true, 'the transaction remains owned while pruning');
  screen.navigate('other'); screen.navigate('monitor');
  assert.equal(screen.byId('mon-settings-save'), button);
  assert.equal(button.disabled, true);
  screen.form.dispatch('submit'); await settle();
  assert.equal(screen.native.of('app_state_set').length, 1);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }]);
  prune.resolve({ deleted: 3 }); await settle();
  assert.equal(button.disabled, false);
  screen.save('120', false); await settle();
  assert.equal(screen.native.saved.retentionDays, 120);
  assert.match(screen.form.textContent, /Saved\. Logs are kept for 120 days/);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }, { retentionDays: 120 }]);
});

test('a rejected settings write releases the transaction for retry and never prunes the failed value', async t => {
  const write = deferred(); let writes = 0;
  const screen = await mount(t, { write: () => ++writes === 1 ? write.promise : Promise.resolve() });
  screen.save(); await settle(); write.reject(new Error('write failed')); await settle();
  assert.equal(screen.byId('mon-settings-save').disabled, false);
  assert.equal(screen.byId('mon-retention').disabled, false);
  assert.equal(screen.byId('mon-toasts').disabled, false);
  assert.match(screen.form.textContent, /Settings could not be saved: write failed/);
  assert.deepEqual(screen.native.saved, oldSettings);
  assert.deepEqual(screen.native.of('monitor_prune'), []);
  screen.save(); await settle();
  assert.deepEqual(screen.native.saved, newSettings);
  assert.deepEqual(screen.native.of('monitor_prune'), [{ retentionDays: 30 }]);
  screen.read.resolve({ value: oldSettings }); await settle();
  assert.equal(screen.byId('mon-retention').value, '30');
  assert.equal(screen.byId('mon-toasts').checked, false);
});

test('a prune failure reports the committed settings truthfully and permits a later retry', async t => {
  const prune = deferred(); let prunes = 0;
  const screen = await mount(t, { prune: () => ++prunes === 1 ? prune.promise : { deleted: 1 } });
  screen.save(); await settle(); prune.reject(new Error('prune failed')); await settle();
  assert.deepEqual(screen.native.saved, newSettings);
  assert.match(screen.form.textContent, /Settings saved, but older logs could not be pruned: prune failed/);
  assert.doesNotMatch(screen.form.textContent, /Settings could not be saved/);
  assert.equal(screen.byId('mon-settings-save').disabled, false);
  screen.read.resolve({ value: oldSettings }); await settle();
  assert.equal(screen.byId('mon-retention').value, '30');
  screen.save(); await settle();
  assert.match(screen.form.textContent, /Saved\. Logs are kept for 30 days; 1 older log removed/);
  assert.equal(prunes, 2);
  await assertAlertPreference(screen, false);
});
