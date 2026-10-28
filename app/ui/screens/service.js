// Service screen (FS-22): job list (status filter chips, search, newest update first), the new-job form and the
// job detail with its stepper Intake > Before > Work > After > Sheet. Step panels live in ../workflows/service-job.js,
// rules and numbers in ../../service.js, IPC in ../../service-api.js.
// Flag: features.service (rail entry only while it is on). Desktop only: jobs live in the local database, so the
// browser preview shows an explanatory unsupported state.
// Shortcuts: Ctrl+J new job (anywhere while the flag is on), Alt+Left / Alt+Right previous / next step, Ctrl+Enter saves
// a note (work step), Esc goes back. None collides with the shell (Ctrl+digits, Alt+digits, Ctrl+E/S, Ctrl+Shift+T/C/D),
// pre-gig (Ctrl+G, Ctrl+R on its own screen) or the setup wizard (Alt+Left inside its own dialog).
// Privacy: the search text and customer details are never written to settings or localStorage; only the status filter is.

import { h, esc, isNative, isTyping } from '../dom.js';
import { icon, chip } from '../icons.js';
import { toast, announce } from '../live.js';
import { go, confirmDialog, showInspector } from '../shell.js';
import { settings, setSetting, active } from '../state.js';
import { isEnabled } from '../../features.js';
import { takeHandoff } from '../crosslinks.js';
import { createServiceApi, serviceSupported } from '../../service-api.js';
import { STATUSES, STATUS_LABELS, STEPS, statusLabel, nextStatuses, isReadOnly, stepperState, stepIndex, buildComparison, directionHints, deleteConfirmed, listPrefsForSettings, when, CHANGE_TEXT } from '../../service.js';
import { ensureLibrary, profileById } from '../devices/library-state.js';
import { renderIntakeForm, renderIntakeStep, renderTestsStep, renderWorkStep, renderSheetStep, hasUnsavedInput } from '../workflows/service-job.js';

const STATUS_ICON = { intake: 'plus', diagnosing: 'search', awaiting_parts: 'review', repairing: 'edit', testing: 'play', ready: 'pass', collected: 'check', cancelled: 'x' };
const STEP_STATE_TEXT = { done: 'Done', blocked: 'Blocked', todo: 'To do' };
const FILTERS = [['all', 'All'], ['open', 'Open'], ...STATUSES.map(s => [s, STATUS_LABELS[s]])];
const ACTION_TEXT = { diagnosing: 'Start diagnosing', awaiting_parts: 'Awaiting parts', repairing: 'Start repair', testing: 'Start testing', ready: 'Mark ready', collected: 'Mark collected', cancelled: 'Cancel job' };
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const PAGE = 200; // jobs per list page; "Show more" loads the next page with offset

// Re-renders replace the whole body, which destroys the focused control. focusMark() records where focus was (an id or
// a stable data attribute, plus the caret) before a render and restoreFocus() puts it back, or on `fallback`, after it.
const FOCUS_KEYS = ['data-filter', 'data-step', 'data-status-to', 'data-open-job', 'data-plan-test', 'data-amend'];
function focusMark(root) {
  const el = document.activeElement;
  if (!el || el === document.body || !root.contains(el)) return null;
  let sel = el.id ? `#${CSS.escape(el.id)}` : null;
  for (const a of FOCUS_KEYS) if (!sel && el.hasAttribute(a)) sel = `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
  let caret = null;
  try { if (typeof el.selectionStart === 'number') caret = [el.selectionStart, el.selectionEnd]; } catch { /* no caret on this input type */ }
  return { sel, caret };
}
function restoreFocus(root, mark, fallback = null) {
  if (!mark) return;
  const el = mark.sel ? root.querySelector(mark.sel) : null;
  if (el && !el.disabled) {
    el.focus();
    if (mark.caret) try { el.setSelectionRange(...mark.caret); } catch { /* not a text field */ }
  } else if (fallback) root.querySelector(fallback)?.focus();
}

/** One sentence for screen readers: the before/after outcome (the on-screen block is rebuilt, so it cannot announce itself). */
function comparisonSummary(cmp) {
  if (!cmp) return '';
  const count = s => cmp.rows.filter(r => r.status === s).length;
  const parts = [['improved', 'improved'], ['worse', 'worse'], ['unchanged', 'unchanged within uncertainty']].filter(([s]) => count(s)).map(([s, w]) => `${count(s)} ${w}`);
  const tests = cmp.headline.map(x => `${x.title}: ${CHANGE_TEXT[x.change] || x.change}`);
  return [`Before and after: ${cmp.completeness.state === 'empty' ? 'no measured values are linked yet' : cmp.completeness.message}.`, parts.length ? `${parts.join(', ')}.` : '', tests.length ? `${tests.join('; ')}.` : ''].filter(Boolean).join(' ');
}

/** Status as a badge: icon + word (never colour alone). */
export function statusBadge(status) {
  return `<span class="svc-badge svc-badge-${esc(status)}">${icon(STATUS_ICON[status] || 'info', { size: 14 })}<span>${esc(statusLabel(status))}</span></span>`;
}

export function createServiceScreen(section) {
  const native = serviceSupported();
  const api = createServiceApi();
  const st = { view: 'list', filter: listPrefsForSettings(settings.serviceList || {}).status, q: '', jobs: [], total: 0, loading: false, error: null, detail: null, comparison: null, step: 'intake', pending: false, loadSeq: 0 };
  const q = sel => section.querySelector(sel);

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('edit', { size: 24 })}</span><div><h1 tabindex="-1">Service</h1>
      <p class="lede">Repair jobs: intake, before and after measurements, the work log and a job sheet. Everything stays on this computer.</p></div></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" id="svc-new">${icon('plus', { size: 18 })}<span>New job</span><kbd>Ctrl+J</kbd></button></div></header>
    <div id="svc-body" class="svc-body"></div>`;
  const body = q('#svc-body');
  q('#svc-new').addEventListener('click', () => openNew());

  // ------------------------------------------------------------ list
  async function loadList() {
    if (!native) return;
    const seq = ++st.loadSeq;
    st.loading = true; st.error = null;
    if (st.view === 'list') renderListKeepingFocus();
    try {
      const r = await api.list({ status: st.filter === 'all' ? null : st.filter, q: st.q.trim() || null, limit: PAGE, offset: 0 });
      if (seq !== st.loadSeq) return;
      st.jobs = r.jobs; st.total = r.total;
    } catch (e) { if (seq === st.loadSeq) st.error = friendly(e); }
    if (seq !== st.loadSeq) return;
    st.loading = false;
    if (st.view === 'list') renderListKeepingFocus();
  }

  async function loadMore() {
    if (st.loading || st.jobs.length >= st.total) return;
    const seq = ++st.loadSeq, firstNew = st.jobs.length;
    st.loading = true;
    const more = q('#svc-more');
    if (more) { more.disabled = true; more.setAttribute('aria-busy', 'true'); }
    try {
      const r = await api.list({ status: st.filter === 'all' ? null : st.filter, q: st.q.trim() || null, limit: PAGE, offset: st.jobs.length });
      if (seq !== st.loadSeq) return;
      const seen = new Set(st.jobs.map(j => j.id));
      st.jobs = [...st.jobs, ...r.jobs.filter(j => !seen.has(j.id))]; st.total = r.total;
    } catch (e) { if (seq === st.loadSeq) toast(`Could not load more jobs: ${friendly(e)}`, { type: 'error' }); }
    if (seq !== st.loadSeq) return;
    st.loading = false;
    if (st.view !== 'list') return;
    renderList();
    (q('#svc-more') || body.querySelectorAll('.svc-open')[firstNew] || q('#svc-search'))?.focus();
    announce(listCountText());
  }

  const listCountText = () => (st.jobs.length < st.total ? `Showing ${st.jobs.length} of ${st.total} jobs` : `${st.total} job${st.total === 1 ? '' : 's'}`);

  function renderListKeepingFocus() {
    const mark = focusMark(body);
    renderList();
    restoreFocus(body, mark, '#svc-search');
  }

  function renderList() {
    body.replaceChildren();
    q('#svc-new').hidden = !native;
    if (!native) {
      body.append(h('div', { class: 'empty card', id: 'svc-unsupported' }, h('span', { class: 'empty-icon', html: icon('edit', { size: 36 }) }), h('h2', { text: 'Service worksheets need the desktop app' }),
        h('p', { text: 'Jobs, customers and their photos are stored in DeckChek’s local database, which the browser preview does not have. Open the desktop app to manage repair jobs.' })));
      return;
    }
    const chips = h('div', { class: 'svc-chips', role: 'group', 'aria-label': 'Filter by status', id: 'svc-filter' },
      ...FILTERS.map(([id, label]) => h('button', { type: 'button', class: 'chip-btn svc-chip', 'data-filter': id, 'aria-pressed': String(st.filter === id), text: label, onclick: () => { st.filter = id; setSetting('serviceList', listPrefsForSettings({ status: id })); loadList(); } })));
    const search = h('input', { type: 'search', id: 'svc-search', autocomplete: 'off', maxlength: 100, placeholder: 'Job number, customer or serial…', value: st.q });
    let timer = null;
    search.addEventListener('input', () => { st.q = search.value; clearTimeout(timer); timer = setTimeout(loadList, 200); });
    body.append(h('div', { class: 'toolbar svc-toolbar' }, chips, h('search', { class: 'search' }, h('label', { for: 'svc-search', class: 'sr-only', text: 'Search jobs' }), h('span', { html: icon('search', { size: 18 }) }), search)));
    const status = h('p', { class: 'sr-only', 'aria-live': 'polite', id: 'svc-list-status' });
    body.append(status);
    if (st.error) {
      body.append(h('div', { class: 'banner banner-fail', role: 'alert', id: 'svc-list-error' }, h('span', { class: 'banner-text', text: `Could not load jobs: ${st.error}` }), h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Retry', onclick: loadList }))));
    } else if (st.loading && !st.jobs.length) {
      body.append(h('div', { class: 'empty', html: '<span class="spinner" aria-hidden="true"></span><h2>Loading jobs…</h2>' }));
    } else if (!st.jobs.length) {
      const filtered = st.filter !== 'all' || st.q.trim();
      body.append(h('div', { class: 'empty card', id: 'svc-empty' }, h('span', { class: 'empty-icon', html: icon('edit', { size: 36 }) }),
        h('h2', { text: filtered ? 'No jobs match' : 'No jobs yet. Create your first job' }),
        filtered ? h('p', { text: 'Change the filter or search.' }) : h('button', { type: 'button', class: 'btn btn-primary', id: 'svc-empty-new', text: 'New job', onclick: () => openNew() })));
    } else {
      const shown = st.jobs.length < st.total ? `showing ${st.jobs.length} of ${st.total}` : String(st.total);
      const table = h('table', { class: 'data svc-table', id: 'svc-jobs' }, h('caption', { text: `Jobs, most recently updated first (${shown})` }),
        h('thead', {}, h('tr', {}, ...['Job', 'Customer', 'Unit', 'Status', 'Updated'].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...st.jobs.map(j => h('tr', { 'data-job': j.id },
          h('th', { scope: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm svc-open', 'data-open-job': j.jobNumber, text: j.jobNumber, onclick: () => openJob(j.id) })),
          h('td', { text: j.customerName || '—' }), h('td', { text: `${j.assetName || '—'}${j.serialNumber ? ` · ${j.serialNumber}` : ''}` }),
          h('td', { html: statusBadge(j.status) }), h('td', { class: 'num', text: when(j.updatedAt) })))));
      body.append(h('div', { class: 'table-wrap' }, table));
      if (st.jobs.length < st.total) {
        const left = st.total - st.jobs.length;
        body.append(h('div', { class: 'svc-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', id: 'svc-more', text: `Show ${Math.min(PAGE, left)} more (${left} not shown)`, onclick: loadMore })));
      }
      status.textContent = listCountText();
    }
  }

  // ------------------------------------------------------------ new job
  function openNew(preset = {}) {
    if (!native) { st.view = 'list'; renderList(); return; }
    st.view = 'new';
    body.replaceChildren();
    const host = h('div', { id: 'svc-new-host' });
    body.append(h('nav', { class: 'dev-crumbs', 'aria-label': 'Breadcrumb' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'svc-back', html: `${icon('chevronLeft', { size: 18 })}<span>All jobs</span>`, onclick: backToList })), host);
    const form = renderIntakeForm(host, { api, preset, onCreated: job => { toast(`Job ${job.jobNumber} created.`, { type: 'success', timeout: 3000 }); openJob(job.id); }, onCancel: backToList });
    st.form = form;
    form.focus();
    announce('New job form');
  }

  function backToList() {
    st.view = 'list'; st.detail = null; st.comparison = null; st.form = null;
    renderList(); loadList();
    q('h1')?.focus();
  }

  // ------------------------------------------------------------ detail
  async function openJob(id, { step = null } = {}) {
    st.view = 'detail';
    if (step) st.step = step; else if (st.detail?.job.id !== id) st.step = null;
    body.replaceChildren(h('div', { class: 'empty', html: '<span class="spinner" aria-hidden="true"></span><h2>Loading the job…</h2>' }));
    await loadJob(id, { focusTitle: true });
  }

  /**
   * Fetches and renders a job. Focus stays on the control that had it (`mark`, taken now unless the caller took it
   * before disabling that control); when that control is gone it moves to `fallback`, or to the job title on open.
   * The comparison outcome is announced on the After step unless `quiet` (the caller announced something already).
   */
  async function loadJob(id, { mark = focusMark(body), fallback = '#svc-panel-title', focusTitle = false, quiet = false } = {}) {
    const seq = ++st.loadSeq;
    try {
      await ensureLibrary().catch(() => {});
      const detail = await api.get(id);
      if (seq !== st.loadSeq) return;
      st.detail = detail; st.comparison = null;
      if (!st.step) st.step = (stepperState(detail).find(s => s.current) || { id: 'intake' }).id;
      renderDetail();
      if (focusTitle) q('#svc-job-title')?.focus(); else restoreFocus(body, mark, fallback);
      const data = await api.comparison(id);
      if (seq !== st.loadSeq) return;
      const profile = detail.asset?.profileId ? profileById(detail.asset.profileId) : null;
      st.comparison = buildComparison(data, directionHints(profile));
      const mark2 = focusMark(body);
      renderDetail();
      restoreFocus(body, mark2, '#svc-panel-title');
      if (!quiet && st.step === 'after') announce(comparisonSummary(st.comparison));
    } catch (e) {
      if (seq !== st.loadSeq) return;
      body.replaceChildren(h('div', { class: 'banner banner-fail', role: 'alert', id: 'svc-job-error' }, h('span', { class: 'banner-text', text: `Could not load the job: ${friendly(e)}` }),
        h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Retry', onclick: () => loadJob(id) }), h('button', { type: 'button', class: 'btn btn-ghost', text: 'All jobs', onclick: backToList }))));
    }
  }

  function renderDetail() {
    const d = st.detail;
    if (!d) return;
    const job = d.job, readOnly = isReadOnly(job.status);
    const steps = stepperState(d, st.comparison);
    body.replaceChildren();
    body.append(h('nav', { class: 'dev-crumbs', 'aria-label': 'Breadcrumb' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'svc-back', html: `${icon('chevronLeft', { size: 18 })}<span>All jobs</span>`, onclick: backToList })));
    const head = h('header', { class: 'svc-job-head' },
      h('div', {}, h('h2', { id: 'svc-job-title', tabindex: '-1', text: `Job ${job.jobNumber}` }),
        h('p', { class: 'svc-job-sub' }, h('span', { id: 'svc-job-status', html: statusBadge(job.status) }), h('span', { class: 'muted small', text: ` ${d.asset?.nickname || ''}${d.asset?.serialNumber ? ` · S/N ${d.asset.serialNumber}` : ''} · opened ${when(job.openedAt)}` }))),
      statusActions(d));
    body.append(head);
    if (readOnly) body.append(h('div', { class: 'banner banner-info', role: 'status', id: 'svc-readonly', html: `${chip('info')}<div class="banner-text"><strong>This job is ${esc(statusLabel(job.status).toLowerCase())} and read-only</strong><span>Its data is kept. Reopen it to make changes.</span></div>` }));

    // stepper: ordered list, aria-current="step" on the shown step, state as text (not colour alone)
    const ol = h('ol', { class: 'svc-stepper', id: 'svc-stepper', 'aria-label': 'Job steps' });
    steps.forEach((s, i) => {
      const btn = h('button', { type: 'button', class: `svc-step svc-step-${s.state}${s.id === st.step ? ' is-current' : ''}`, 'data-step': s.id, 'aria-current': s.id === st.step ? 'step' : null, 'aria-describedby': `svc-step-${s.id}-state`, onclick: () => showStep(s.id, { focus: true }) },
        h('span', { class: 'svc-step-num', 'aria-hidden': 'true', html: s.state === 'done' ? icon('check', { size: 14 }) : String(i + 1) }), h('span', { class: 'svc-step-label', text: s.label }),
        h('span', { class: 'svc-step-state small', id: `svc-step-${s.id}-state`, text: STEP_STATE_TEXT[s.state] }));
      if (s.reason) btn.title = s.reason;
      ol.append(h('li', {}, btn));
    });
    body.append(ol, h('p', { class: 'muted small svc-step-hint', text: 'Alt+Left and Alt+Right move between steps.' }));
    const cur = steps.find(s => s.id === st.step);
    const panel = h('section', { class: 'svc-panel', id: 'svc-panel', 'aria-labelledby': 'svc-panel-title' }, h('h3', { class: 'svc-panel-title', id: 'svc-panel-title', tabindex: '-1', text: STEPS.find(([id]) => id === st.step)?.[1] || '' }));
    if (cur?.state === 'blocked') panel.append(h('div', { class: 'banner banner-warn', role: 'status', id: 'svc-step-blocked', html: `${chip('warn')}<div class="banner-text"><strong>Blocked</strong><span>${esc(cur.reason)}</span></div>` }));
    const host = h('div', {});
    panel.append(host);
    body.append(panel);
    const ctx = { api, detail: d, comparison: st.comparison, readOnly, reload: (opts = {}) => loadJob(job.id, opts), focusMark: () => focusMark(body), returnTo: phase => returnFromDevices(job.id, phase) };
    if (st.step === 'intake') renderIntakeStep(host, ctx);
    else if (st.step === 'before') renderTestsStep(host, ctx, 'before');
    else if (st.step === 'after') renderTestsStep(host, ctx, 'after');
    else if (st.step === 'work') renderWorkStep(host, ctx);
    else renderSheetStep(host, ctx);
  }

  function statusActions(d) {
    const job = d.job, wrap = h('div', { class: 'svc-status-actions', role: 'group', 'aria-label': 'Change status' });
    const note = h('input', { type: 'text', id: 'svc-status-note', maxlength: 500, placeholder: 'Note (optional)', 'aria-label': 'Note for the status change' });
    const readOnly = isReadOnly(job.status);
    const targets = readOnly ? nextStatuses(job.status, { reopen: true }) : nextStatuses(job.status);
    for (const to of targets) {
      const label = readOnly ? 'Reopen' : ACTION_TEXT[to] || statusLabel(to);
      wrap.append(h('button', { type: 'button', class: `btn btn-sm ${to === 'cancelled' ? 'btn-ghost' : 'btn-secondary'}`, 'data-status-to': to, text: label, onclick: e => setStatus(to, { reopen: readOnly, button: e.currentTarget, note: note.value }) }));
    }
    if (targets.length) wrap.prepend(note);
    wrap.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'svc-delete', html: `${icon('trash', { size: 14 })}<span>Delete</span>`, onclick: () => deleteJob(d) }));
    return wrap;
  }

  async function setStatus(to, { reopen = false, button = null, note = '' } = {}) {
    const job = st.detail?.job;
    if (!job || st.pending) return;
    if (to === 'cancelled' && !(await confirmDialog({ title: `Cancel job ${job.jobNumber}?`, body: 'The job is kept with all its data but becomes read-only. You can reopen it later.', confirmLabel: 'Cancel job' }))) return;
    st.pending = true;
    const reload = { mark: focusMark(body), fallback: '#svc-job-title', quiet: true }; // mark taken before the buttons are disabled
    section.querySelectorAll('[data-status-to]').forEach(b => { b.disabled = true; });
    try {
      const updated = await api.setStatus(job.id, to, { expected: job.status, note: note.trim() || null, reopen });
      announce(`Job ${updated.jobNumber} is now ${statusLabel(updated.status)}`);
      toast(`Job ${updated.jobNumber}: ${statusLabel(updated.status)}.`, { type: 'success', timeout: 2500 });
      await loadJob(job.id, reload);
    } catch (e) {
      toast(`Status not changed: ${friendly(e)}`, { type: 'error' });
      await loadJob(job.id, reload);
    } finally {
      st.pending = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function deleteJob(d) {
    const dlg = h('dialog', { class: 'svc-dialog', 'aria-labelledby': 'svc-del-title', id: 'svc-delete-dialog' });
    const inp = h('input', { type: 'text', id: 'svc-del-confirm', autocomplete: 'off', 'aria-describedby': 'svc-del-help' });
    const ok = h('button', { type: 'submit', class: 'btn btn-danger', id: 'svc-del-ok', value: 'confirm', disabled: true, text: 'Delete job' });
    // A customer with no other job can be erased together with this job (their details would otherwise stay forever).
    const lastJob = d.customer && d.customer.jobCount <= 1;
    const eraseBox = lastJob ? h('input', { type: 'checkbox', id: 'svc-del-customer', checked: true }) : null;
    const form = h('form', { method: 'dialog' }, h('h2', { id: 'svc-del-title', text: `Delete job ${d.job.jobNumber}?` }),
      h('p', { id: 'svc-del-help', text: `This removes the job, its work log, status history, result links and photo links. The unit and its test results stay. Type ${d.job.jobNumber} to confirm.` }),
      h('label', { for: 'svc-del-confirm', text: 'Job number' }), inp,
      lastJob ? h('label', { class: 'svc-check' }, eraseBox, ' Also delete the customer’s details (they have no other job)') : null,
      h('div', { class: 'svc-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', id: 'svc-del-cancel', text: 'Keep job', onclick: () => dlg.close('cancel') }), ok));
    inp.addEventListener('input', () => { ok.disabled = !deleteConfirmed(d.job, inp.value); });
    dlg.append(form);
    document.body.append(dlg);
    const trigger = document.activeElement;
    dlg.addEventListener('close', async () => {
      const confirmed = dlg.returnValue === 'confirm' && deleteConfirmed(d.job, inp.value); // Esc leaves returnValue empty
      const erase = !!eraseBox?.checked;
      dlg.remove();
      if (!confirmed) { if (trigger?.isConnected) trigger.focus(); return; }
      try {
        await api.remove(d.job.id, inp.value.trim());
        if (erase && d.customer) await api.removeCustomer(d.customer.id).catch(e => toast(`The customer’s details were kept: ${friendly(e)}`, { type: 'warn' }));
        toast(`Job ${d.job.jobNumber} deleted.`, { type: 'success', timeout: 3000 });
        backToList();
      } catch (e) { toast(`Job not deleted: ${friendly(e)}`, { type: 'error' }); }
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    inp.focus();
  }

  function showStep(id, { focus = false } = {}) {
    st.step = id;
    renderDetail();
    if (focus) q(`[data-step="${id}"]`)?.focus();
    announce(`${STEPS.find(([s]) => s === id)?.[1]} step${id === 'after' && st.comparison ? `. ${comparisonSummary(st.comparison)}` : ''}`);
  }

  function returnFromDevices(jobId, phase) {
    go('service');
    openJob(jobId, { step: phase });
  }

  // ------------------------------------------------------------ keyboard (this screen only)
  document.addEventListener('keydown', e => {
    if (active.screen?.def.id !== 'service' || !isEnabled('service') || document.querySelector('dialog[open]') || !native) return;
    if (st.view === 'detail' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      if (e.target?.tagName === 'TEXTAREA' || (isTyping(e.target) && e.target?.tagName !== 'SELECT')) return; // leave text editing alone
      e.preventDefault(); // also stops WebView back/forward navigation
      showStep(STEPS[stepIndex(st.step, e.key === 'ArrowRight' ? 1 : -1)][0], { focus: true });
    }
  });

  renderList();
  loadList();

  return {
    onShow() {
      showGuide();
      const handoff = takeHandoff('service');
      if (handoff?.newJob || handoff?.assetId) openNew({ assetId: handoff.assetId || handoff.newJob?.assetId });
      else if (handoff?.jobId) openJob(handoff.jobId, { step: handoff.step || null });
      else if (st.view === 'list') loadList();
    },
    onHide() {},
    onEscape() {
      if (st.view !== 'new' && st.view !== 'detail') return false;
      const a = document.activeElement;
      if (a?.tagName === 'INPUT' && a.type === 'search' && a.value) return false; // Esc clears a search field natively
      const unsaved = st.view === 'new' ? !!st.form?.isDirty?.() : hasUnsavedInput(body);
      if (!unsaved) { backToList(); return true; }
      const isNew = st.view === 'new';
      confirmDialog({ title: isNew ? 'Discard the new job?' : 'Discard unsaved changes?', body: isNew ? 'What you entered in the new-job form has not been saved.' : 'Text you typed on this job has not been saved.', confirmLabel: 'Discard' })
        .then(ok => { if (ok && st.view === (isNew ? 'new' : 'detail')) backToList(); });
      return true;
    },
    onSave() { if (st.view === 'new') st.form?.submit(); else toast('Job changes are saved as you make them.'); },
    onExport() { if (st.view === 'detail') showStep('sheet', { focus: true }); else toast('Open a job, then Ctrl+E shows its job sheet.'); },
    openNew,
    openJob,
  };
}

function showGuide() {
  const body = h('div', { class: 'inspect' });
  body.innerHTML = `<p>A job moves through Intake, Diagnosing, Awaiting parts, Repairing, Testing, Ready and Collected (or Cancelled). Each change is checked against the allowed transitions and logged with its time.</p>
    <h3>Steps</h3><ol><li>Intake: customer, unit, fault, accessories, photos.</li><li>Before: pre-repair tests from the unit's test plan.</li><li>Work: parts, labour and timestamped notes.</li><li>After: post-repair tests, compared with the before values.</li><li>Sheet: printable job sheet (no prices or customer details unless you include them).</li></ol>
    <h3>Shortcuts</h3><dl class="kv"><dt>Ctrl+J</dt><dd>New job</dd><dt>Alt+Left / Alt+Right</dt><dd>Previous / next step</dd><dt>Ctrl+Enter</dt><dd>Save the note</dd><dt>Esc</dt><dd>Back to the job list</dd></dl>
    <p class="muted small">Customer details stay on this computer. They are included in DeckChek backups, which you should store privately, and are excluded from workspace exports, packs, ledgers and diagnostics bundles.</p>`;
  showInspector({ title: 'Service guide', body, open: false });
}

/** Rail entry (follows features.service live) and the global Ctrl+J "new job" shortcut. */
export function serviceScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-service')) main.append(h('section', { class: 'screen', id: 'screen-service', hidden: true }));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'j' || !isEnabled('service')) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault(); // Ctrl+J would otherwise open the WebView downloads panel
    import('../crosslinks.js').then(m => m.navigateTo('service', { newJob: {} }));
  });
  return [{ id: 'service', title: 'Service', short: 'Service', icon: 'edit', feature: 'service', create: createServiceScreen }];
}
