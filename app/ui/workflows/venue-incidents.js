// SPEC-05 §20: a passive, operator-reported incident history. No capture/output
// session is acquired here; pending writes retain the original press/context.
import { h } from '../dom.js';
import { createCatalogStore } from '../../catalog-store.js';
import { INCIDENT_TYPES, INCIDENT_LIST_LIMIT, createIncidentDraft, createVenueIncidentStore } from '../../venue-incidents.js';

const label = kind => INCIDENT_TYPES.find(type => type.id === kind)?.label || kind;
const friendly = error => error?.message || String(error);
const at = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });

export function createVenueIncidentPanel(host, {
  catalog = createCatalogStore(), store = createVenueIncidentStore({ catalog }),
  now = () => new Date().toISOString(), newId = () => globalThis.crypto.randomUUID(),
} = {}) {
  const paginated = typeof store.page === 'function';
  const state = { active: true, disposed: false, ready: false, catalogError: null, catalogGeneration: 0, historyGeneration: 0,
    venues: [], setups: [], venueId: '', setupId: '', history: null, historyLoading: true, historyError: null,
    pageCursors: [null], pageIndex: 0, historyRequest: null,
    pending: null, saved: null, draftError: null };
  const venue = h('select', { id: 'incident-venue', onchange: changeVenue });
  const setup = h('select', { id: 'incident-setup', onchange: () => {
    if (!visible() || !state.ready) return;
    state.setupId = setup.value; resetHistory();
  } });
  const note = h('textarea', { id: 'incident-note', rows: 2, maxlength: 1000, 'aria-describedby': 'incident-note-help' });
  const catalogStatus = h('div', { id: 'incident-catalog-status' });
  const saveStatus = h('div', { id: 'incident-save-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const history = h('div', { id: 'incident-history' });
  const buttons = INCIDENT_TYPES.map(type => h('button', { type: 'button', class: 'btn btn-secondary', 'data-incident-kind': type.id,
    text: type.label, onclick: () => record(type.id) }));
  host.replaceChildren(h('section', { class: 'card incident-panel', 'aria-labelledby': 'incident-title' },
    h('h2', { id: 'incident-title', class: 'card-title', text: 'Venue incidents' }),
    h('p', { class: 'muted', text: 'Record what you noticed at the selected venue. Each press stores an operator report and its time, not a sensor detection or diagnosis.' }),
    catalogStatus,
    h('div', { class: 'field-grid' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'incident-venue', text: 'Venue (also filters history)' }), venue),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'incident-setup', text: 'Setup at this venue (optional)' }), setup)),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'incident-note', text: 'Notes for the next incident (optional)' }), note,
      h('p', { id: 'incident-note-help', class: 'muted small', text: 'Up to 500 characters. The selected context and notes are saved at the button press.' })),
    h('div', { class: 'form-actions', 'aria-label': 'Record an incident' }, ...buttons), saveStatus,
    h('p', { class: 'muted small', text: store.native
      ? 'Incidents are stored in the local database and included in its database backup. Venue reports include a readable incident history.'
      : 'Incidents stay in this browser. Data → Browser venue history file exports and imports all retained incident and support history. Workspace JSON does not include incidents or support history. All-venue history can show imported records without current catalog entries; venue reports require a matching current venue.' }),
    h('h3', { class: 'fb-sub', text: 'Recorded incidents' }), history));

  const visible = () => state.active && !state.disposed;
  const selectedVenue = () => state.venues.find(item => item.id === state.venueId);
  function renderControls() {
    if (!visible()) return;
    venue.disabled = !state.ready;
    setup.disabled = !state.ready || !selectedVenue();
    for (const button of buttons) button.disabled = !state.ready || !selectedVenue() || Boolean(state.pending);
  }
  function renderCatalog() {
    if (!visible()) return;
    catalogStatus.replaceChildren();
    if (state.catalogError) catalogStatus.append(h('p', { role: 'alert', text: `Could not load venues and setups: ${state.catalogError}` }),
      h('button', { type: 'button', id: 'incident-catalog-retry', class: 'btn btn-secondary', text: 'Try again', onclick: loadCatalog }));
    else if (!state.ready) catalogStatus.append(h('p', { class: 'muted', text: 'Loading venues and setups…' }));
    else if (!state.venues.length) catalogStatus.append(h('p', { class: 'muted', text: 'Create a venue in Equipment to record incidents. Earlier incident history remains below.' }));
    venue.replaceChildren(h('option', { value: '', text: 'Choose a venue · show all history' }),
      ...state.venues.map(item => h('option', { value: item.id, text: item.name })));
    venue.value = state.venueId;
    setup.replaceChildren(h('option', { value: '', text: 'No setup assigned' }),
      ...state.setups.filter(item => item.venueId === state.venueId).map(item => h('option', { value: item.id, text: item.name })));
    setup.value = state.setupId;
    renderControls();
  }
  function renderSave() {
    if (!visible()) return;
    saveStatus.replaceChildren();
    const pending = state.pending;
    if (pending) {
      const description = `${label(pending.draft.kind)} for ${pending.draft.context.venue.name} at ${at(pending.draft.occurredAt)}`;
      saveStatus.append(h('p', { role: pending.error ? 'alert' : 'status', text: pending.error
        ? `Could not confirm ${description} was saved: ${pending.error}`
        : `Saving ${description}. This write continues if you leave the screen.` }));
      if (pending.error) saveStatus.append(h('button', { type: 'button', class: 'btn btn-secondary', id: 'incident-save-retry', text: 'Retry this incident', onclick: savePending }));
    } else if (state.draftError) saveStatus.append(h('p', { role: 'alert', text: state.draftError }));
    else if (state.saved) saveStatus.append(h('p', { role: 'status', text: `Saved ${label(state.saved.kind)} for ${state.saved.context.venue.name} at ${at(state.saved.occurredAt)}. Operator report.` }));
    renderControls();
  }
  function renderHistory() {
    if (!visible()) return;
    history.replaceChildren();
    if (state.historyLoading) history.append(h('p', { class: 'muted', role: 'status', text: 'Loading incident history…' }));
    if (state.historyError) {
      const failedRequest = state.historyRequest;
      history.append(h('p', { role: 'alert', text: `Could not load incident history: ${state.historyError}` }),
        h('button', { type: 'button', id: 'incident-history-retry', class: 'btn btn-secondary', text: 'Try again', onclick: () => {
          if (visible() && state.historyRequest === failedRequest) loadHistory(failedRequest);
        } }));
    }
    const result = state.history;
    if (!result) return;
    if (result.total === 0) { history.append(h('p', { class: 'muted', text: 'No incidents recorded for this selection. This does not establish an incident-free session.' })); return; }
    const count = paginated
      ? `Page ${state.pageIndex + 1}: ${result.items.length} recorded incidents on this page; ${result.total} matching incidents (newest first; up to ${result.limit} per page).`
      : `Showing ${result.items.length} of ${result.total} recorded incidents (newest first; display limit ${result.limit}).${result.hasMore ? ' The older records remain stored.' : ''}`;
    history.append(h('p', { class: 'muted small', text: `${count} Names below are the selected context saved with each operator report.` }));
    if (paginated) {
      const requestOwner = state.historyRequest;
      const navigate = (index, cursors) => {
        if (visible() && state.historyRequest === requestOwner && state.history === result) loadHistory({ venueId: state.venueId || null, index, cursors });
      };
      history.append(h('div', { class: 'form-actions', 'aria-label': 'Incident history pages' },
        h('button', { type: 'button', id: 'incident-history-newest', class: 'btn btn-secondary', text: 'Newest',
          disabled: state.historyLoading && state.historyRequest?.index === 0, onclick: () => navigate(0, [null]) }),
        h('button', { type: 'button', id: 'incident-history-newer', class: 'btn btn-secondary', text: 'Newer',
          disabled: state.pageIndex === 0, onclick: () => {
            if (state.pageIndex > 0) navigate(state.pageIndex - 1, state.pageCursors.slice(0, state.pageIndex));
          } }),
        h('button', { type: 'button', id: 'incident-history-older', class: 'btn btn-secondary', text: 'Older',
          disabled: state.historyLoading || !result.nextCursor, onclick: () => {
            if (!state.historyLoading && result.nextCursor) navigate(state.pageIndex + 1, [...state.pageCursors.slice(0, state.pageIndex + 1), result.nextCursor]);
          } })));
      if (!result.items.length) history.append(h('p', { class: 'muted', text: 'No older incidents remain before this page boundary.' }));
    }
    history.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('caption', { class: 'sr-only', text: 'Operator-reported venue incidents' }),
      h('thead', {}, h('tr', {}, ...['Occurred', 'Incident', 'Selected context', 'Notes', 'Saved'].map(text => h('th', { scope: 'col', text })))),
      h('tbody', {}, ...result.items.map(row => h('tr', {},
        h('td', {}, h('time', { datetime: row.occurredAt, title: row.occurredAt, text: at(row.occurredAt) })),
        h('td', { text: label(row.kind) }),
        h('td', { text: `${row.context.venue.name} · ${row.context.setup?.name || 'No setup assigned'}` }),
        h('td', { text: row.note || '—' }),
        h('td', {}, h('time', { datetime: row.recordedAt, title: row.recordedAt, text: at(row.recordedAt) }))))))));
  }
  async function loadCatalog() {
    if (!visible()) return;
    const generation = ++state.catalogGeneration;
    state.ready = false; state.catalogError = null; renderCatalog();
    try {
      const [venues, setups] = await Promise.all([catalog.list('venue'), catalog.list('setup')]);
      if (!visible() || generation !== state.catalogGeneration) return;
      if (!Array.isArray(venues) || !Array.isArray(setups)) throw new Error('Catalog returned invalid records');
      const previousVenue = state.venueId, previousSetup = state.setupId;
      state.venues = venues.map(item => ({ ...item })); state.setups = setups.map(item => ({ ...item }));
      if (!selectedVenue()) state.venueId = '';
      if (!state.setups.some(item => item.id === state.setupId && item.venueId === state.venueId)) state.setupId = '';
      state.ready = true;
      renderCatalog();
      if (previousVenue !== state.venueId || previousSetup !== state.setupId) resetHistory();
    } catch (error) {
      if (!visible() || generation !== state.catalogGeneration) return;
      state.catalogError = friendly(error); renderCatalog();
    }
  }
  const copyCursor = cursor => cursor ? { occurredAt: cursor.occurredAt, id: cursor.id } : null;
  const newestRequest = () => ({ venueId: state.venueId || null, index: 0, cursors: [null] });
  async function loadHistory(request = { venueId: state.venueId || null, index: state.pageIndex, cursors: state.pageCursors }) {
    if (!visible() || request.venueId !== (state.venueId || null)) return;
    const generation = ++state.historyGeneration;
    // Pending navigation owns a copied cursor stack. Commit it only with its
    // result so failures retain a usable page, and retired retries cannot move it.
    const owned = { venueId: request.venueId, index: request.index, cursors: request.cursors.map(copyCursor) };
    state.historyRequest = owned;
    state.historyLoading = true; state.historyError = null; renderHistory();
    try {
      const filter = { venueId: owned.venueId, limit: INCIDENT_LIST_LIMIT };
      const rows = await (paginated ? store.page({ ...filter, before: owned.cursors[owned.index] }) : store.list(filter));
      if (!visible() || generation !== state.historyGeneration) return;
      state.pageIndex = owned.index; state.pageCursors = owned.cursors;
      state.history = rows; state.historyLoading = false; renderHistory();
    } catch (error) {
      if (!visible() || generation !== state.historyGeneration) return;
      state.historyError = friendly(error); state.historyLoading = false; renderHistory();
    }
  }
  function resetHistory() {
    ++state.historyGeneration;
    state.pageCursors = [null]; state.pageIndex = 0; state.historyRequest = null;
    state.history = null; state.historyError = null; state.historyLoading = true;
    if (visible()) loadHistory();
  }
  function changeVenue() {
    if (!visible() || !state.ready) return;
    state.venueId = venue.value; state.setupId = ''; state.draftError = null;
    renderCatalog(); renderSave(); resetHistory();
  }
  function record(kind) {
    if (!visible() || !state.ready || state.pending || !selectedVenue()) return;
    try {
      const draft = createIncidentDraft({ kind, venue: selectedVenue(), setup: state.setups.find(item => item.id === state.setupId) || null, note: note.value }, { now, newId });
      state.pending = { draft, busy: false, error: null }; state.saved = null; state.draftError = null;
      savePending();
    } catch (error) { state.draftError = friendly(error); renderSave(); }
  }
  async function savePending() {
    const pending = state.pending;
    if (!visible() || !pending || pending.busy) return;
    pending.busy = true; pending.error = null; renderSave();
    try {
      const saved = await store.save(structuredClone(pending.draft));
      if (state.pending !== pending) return;
      if (saved.id !== pending.draft.id) throw new Error('The saved incident has an unexpected identity');
      state.saved = saved; state.pending = null;
      if (visible() && state.venueId === pending.draft.venueId && state.setupId === (pending.draft.setupId || '') && note.value === (pending.draft.note || '')) note.value = '';
      renderSave();
      if (visible()) loadHistory(newestRequest()); else resetHistory();
    } catch (error) {
      if (state.pending !== pending) return;
      pending.busy = false; pending.error = friendly(error); renderSave();
    }
  }
  renderCatalog(); renderSave(); loadHistory(); loadCatalog();
  return {
    setActive(active) {
      if (state.disposed) return;
      state.active = Boolean(active); ++state.catalogGeneration; ++state.historyGeneration;
      if (state.active) { renderSave(); loadHistory(); loadCatalog(); }
    },
    dispose() { state.disposed = true; state.active = false; ++state.catalogGeneration; ++state.historyGeneration; },
  };
}
