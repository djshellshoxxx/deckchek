import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUrl, linkConfirmDialog, openExternal, resetLinkState, sessionAllowedHosts,
} from '../app/external-links.js';
import { installServiceDom } from './fixtures/service-screen-dom.mjs';

beforeEach(() => resetLinkState());

// Both opening boundaries are in-memory recorders. No URL is opened or fetched.
function rig(native) {
  let clock = 0, choice = 'always';
  const log = { invokes: [], confirms: [], opened: [], copied: [] };
  return {
    log,
    choose(value) { choice = value; },
    deps: {
      native,
      now: () => (clock += 1000),
      confirm: async details => { log.confirms.push(details); return choice; },
      copy: async url => { log.copied.push(url); return true; },
      toast: () => {},
      invoke: native ? async (command, args) => {
        assert.equal(command, 'open_external_url');
        log.invokes.push({ ...args });
        if (!args.confirmed) return { opened: false, reason: 'needs_confirm' };
        log.opened.push(args.url);
        return { opened: true };
      } : undefined,
      windowOpen: (url, target, features) => {
        assert.equal(target, '_blank');
        assert.equal(features, 'noopener,noreferrer');
        log.opened.push(url);
      },
    },
  };
}

const ordinary = 'https://review.example.test/first';
const special = [
  ['nondefault port', 'https://review.example.test:8443/details', false, '8443'],
  ['userinfo', 'https://operator:example@review.example.test/details', true, ''],
  ['userinfo and port', 'https://operator:example@review.example.test:8443/details', true, '8443'],
];

for (const native of [false, true]) {
  const mode = native ? 'native-invoke boundary' : 'browser-mode boundary';

  test(`${mode}: ordinary host consent survives normalisation and remains host/session scoped`, async () => {
    const t = rig(native);
    assert.equal((await openExternal(ordinary, t.deps)).opened, true);
    assert.deepEqual(sessionAllowedHosts(), ['review.example.test']);
    for (const url of ['https://review.example.test/second', 'https://REVIEW.EXAMPLE.TEST.:443/third']) {
      assert.equal((await openExternal(url, t.deps)).opened, true);
      if (native) assert.equal(t.log.invokes.at(-1).confirmed, true);
    }
    assert.equal(t.log.confirms.length, 1);
    t.choose('cancel');
    for (const url of ['https://different.example.test/', 'https://sub.review.example.test/']) {
      assert.equal((await openExternal(url, t.deps)).reason, 'cancelled');
      if (native) assert.equal(t.log.invokes.at(-1).confirmed, false);
    }
    assert.equal(t.log.opened.length, 3);
    assert.equal(t.log.confirms.length, 3);
    assert.equal((await openExternal('http://review.example.test/', t.deps)).reason, 'blocked_scheme');
    assert.equal(t.log.opened.length, 3);
    assert.equal(t.log.confirms.length, 3);
    resetLinkState();
    assert.deepEqual(sessionAllowedHosts(), []);
    assert.equal((await openExternal(ordinary, t.deps)).reason, 'cancelled');
    assert.equal(t.log.confirms.length, 4);
  });

  for (const [label, url, hasUserinfo, port] of special) {
    test(`${mode}: remembered host requires fresh ${label} confirmation for cancel, copy and open`, async () => {
      const t = rig(native);
      assert.equal((await openExternal(ordinary, t.deps)).opened, true);
      assert.equal(classifyUrl(url).allowlisted, false);
      for (const [choice, reason] of [['cancel', 'cancelled'], ['copy', 'copied']]) {
        t.choose(choice);
        assert.equal((await openExternal(url, t.deps)).reason, reason);
        assert.equal(t.log.opened.length, 1);
        assert.deepEqual(t.log.confirms.at(-1), { url, host: 'review.example.test', punycodeHost: 'review.example.test', hasUserinfo, port });
        if (native) assert.equal(t.log.invokes.at(-1).confirmed, false);
      }
      assert.deepEqual(t.log.copied, [url]);
      t.choose('open');
      assert.equal((await openExternal(url, t.deps)).opened, true);
      assert.deepEqual(t.log.opened, [ordinary, url]);
      assert.equal(t.log.confirms.length, 4);
      if (native) assert.deepEqual(t.log.invokes.slice(-2).map(call => call.confirmed), [false, true]);
      t.choose('cancel');
      assert.equal((await openExternal(url, t.deps)).reason, 'cancelled');
      assert.equal(t.log.confirms.length, 5, 'Open approves only that attempt');
      assert.equal(t.log.opened.length, 2);
      assert.deepEqual(sessionAllowedHosts(), ['review.example.test']);
    });
  }

  test(`${mode}: an injected always choice for a special authority never creates host consent`, async () => {
    for (const [, url] of special) {
      resetLinkState();
      const t = rig(native);
      assert.equal((await openExternal(url, t.deps)).opened, true);
      assert.equal((await openExternal(url, t.deps)).opened, true);
      assert.equal(t.log.confirms.length, 2);
      assert.deepEqual(sessionAllowedHosts(), []);
      if (native) assert.deepEqual(t.log.invokes.map(call => call.confirmed), [false, true, false, true]);
      t.choose('cancel');
      assert.equal((await openExternal(ordinary, t.deps)).reason, 'cancelled');
      assert.equal(t.log.confirms.length, 3);
      assert.equal(t.log.opened.length, 2);
    }
  });
}

test('actual confirm dialog offers session consent for ordinary HTTPS links and restores focus', async t => {
  const document = installServiceDom(t);
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const pending = linkConfirmDialog({ url: ordinary, ...classifyUrl(ordinary) }, document);
  const dialog = document.querySelector('dialog');
  assert.ok(dialog?.open);
  assert.equal(document.activeElement?.getAttribute('value'), 'cancel');
  const checkbox = dialog.querySelector('input[type="checkbox"]');
  assert.ok(checkbox);
  assert.match(dialog.textContent, /Always allow standard HTTPS links to review\.example\.test/);
  checkbox.checked = true;
  dialog.close('open');
  assert.equal(await pending, 'always');
  assert.equal(document.activeElement, trigger);
  assert.equal(document.querySelector('dialog'), null);
});

for (const [label, url] of special) {
  test(`actual confirm dialog requires each ${label} decision and preserves cancel/copy/open`, async t => {
    const document = installServiceDom(t);
    for (const [closeValue, result] of [['', 'cancel'], ['copy', 'copy'], ['open', 'open']]) {
      const pending = linkConfirmDialog({ url, ...classifyUrl(url) }, document);
      const dialog = document.querySelector('dialog');
      assert.ok(dialog?.open);
      assert.equal(document.activeElement?.getAttribute('value'), 'cancel');
      assert.equal(dialog.querySelector('input[type="checkbox"]'), null);
      assert.match(dialog.textContent, /This link requires confirmation each time\./);
      assert.ok(dialog.textContent.includes(url));
      if (classifyUrl(url).hasUserinfo) assert.match(dialog.textContent, /contains a username or password/);
      if (classifyUrl(url).port) assert.match(dialog.textContent, /port 8443/);
      dialog.close(closeValue);
      assert.equal(await pending, result);
      assert.equal(document.querySelector('dialog'), null);
    }
  });
}
