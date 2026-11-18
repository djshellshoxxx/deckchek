// SPEC-05 §20: a passive, operator-reported incident history. No capture/output
// session is acquired here; pending writes retain the original press/context.
import { h } from '../dom.js';
import { createCatalogStore } from '../../catalog-store.js';
import { INCIDENT_TYPES, INCIDENT_LIST_LIMIT, createIncidentDraft, createVenueIncidentStore } from '../../venue-incidents.js';
import { createIncidentMetricStore, liveMonitorMetricSources, METRIC_FIELDS } from '../../incident-metric-evidence.js';
import { saveTextFile } from '../../userfiles.js';

const label = kind => INCIDENT_TYPES.find(type => type.id === kind)?.label || kind;
const friendly = error => error?.message || String(error);
const at = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });

export function createVenueIncidentPanel(host, {
  catalog = createCatalogStore(), store = createVenueIncidentStore({ catalog }),
  metricStore = createIncidentMetricStore(), monitorSources = liveMonitorMetricSources,
  now = () => new Date().toISOString(), newId = () => globalThis.crypto.randomUUID(),
  download = (suggestedName, content) => saveTextFile({ suggestedName, content, ext: 'json' }),
} = {}) {
  const paginated = typeof store.page === 'function';
  const state = { active: true, disposed: false, ready: false, catalogError: null, catalogGeneration: 0, historyGeneration: 0,
    venues: [], setups: [], venueId: '', setupId: '', history: null, historyLoading: true, historyError: null,
    pageCursors: [null], pageIndex: 0, historyRequest: null,
    pending: null, saved: null, draftError: null, savedEvidence: null,
    metricSources: [], metricSource: null, metricError: null, detail: null, detailGeneration: 0 };
  const venue = h('select', { id: 'incident-venue', onchange: changeVenue });
  const setup = h('select', { id: 'incident-setup', onchange: () => {
    if (!visible() || !state.ready) return;
    state.setupId = setup.value; resetHistory();
  } });
  const note = h('textarea', { id: 'incident-note', rows: 2, maxlength: 1000, 'aria-describedby': 'incident-note-help' });
  const catalogStatus = h('div', { id: 'incident-catalog-status' });
  const saveStatus = h('div', { id: 'incident-save-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const history = h('div', { id: 'incident-history' });
  const metricDetail = h('div', { id: 'incident-metric-detail', 'aria-live': 'polite' });
  const attach = h('input', { id: 'incident-metric-attach', type: 'checkbox', style: 'width:24px;height:24px', onchange: () => {
    if (!visible() || state.pending) return;
    if (!attach.checked) state.metricSource = null;
    state.draftError = null; refreshMetricSources(); renderSave();
  } });
  const sourceSelect = h('select', { id: 'incident-metric-source', onchange: () => {
    if (!visible() || state.pending) return;
    const selected = state.metricSources.find(item => sourceKey(item.source) === sourceSelect.value);
    state.metricSource = selected ? structuredClone(selected.source) : null;
    state.draftError = null; renderMetricSource(); renderSave();
  } });
  const sourceStatus = h('div', { id: 'incident-metric-source-status' });
  const refreshSources = h('button', { type: 'button', id: 'incident-metric-refresh', class: 'btn btn-secondary', text: 'Refresh available readings', onclick: refreshMetricSources });
  const attachment = store.native ? h('div', { class: 'field' },
    h('label', { for: 'incident-metric-attach' }, attach, ' Attach latest live-monitor reading'),
    h('p', { class: 'muted small', text: 'Choose the input you associate with this venue/setup. This association is operator-selected; a device label or session ID does not establish physical identity. One existing frame is copied at the press.' }),
    h('label', { for: 'incident-metric-source', class: 'field-label', text: 'Live-monitor deck and input' }), sourceSelect, refreshSources, sourceStatus) : null;
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
    ...(attachment ? [attachment] : []),
    h('div', { class: 'form-actions', 'aria-label': 'Record an incident' }, ...buttons), saveStatus,
    h('p', { class: 'muted small', text: store.native
      ? 'Incidents are stored in the local database and included in its database backup. Venue reports include a readable incident history.'
      : 'Incidents stay in this browser. Data → Browser venue history file exports and imports all retained incident and support history. Workspace JSON does not include incidents or support history. All-venue history can show imported records without current catalog entries; venue reports require a matching current venue.' }),
    h('h3', { class: 'fb-sub', text: 'Recorded incidents' }), history, ...(store.native ? [metricDetail] : [])));

  const visible = () => state.active && !state.disposed;
  const selectedVenue = () => state.venues.find(item => item.id === state.venueId);
  function renderControls() {
    if (!visible()) return;
    venue.disabled = !state.ready;
    setup.disabled = !state.ready || !selectedVenue();
    for (const button of buttons) button.disabled = !state.ready || !selectedVenue() || Boolean(state.pending);
    attach.disabled = Boolean(state.pending);
    sourceSelect.disabled = !attach.checked || Boolean(state.pending);
    refreshSources.disabled = Boolean(state.pending);
  }
  const sourceKey = source => `${source.generation}:${source.deck}`;
  const observedAge = value => value === null ? 'unavailable' : `${value} ms`;
  function refreshMetricSources() {
    if (!visible() || !store.native) return;
    try { state.metricSources = monitorSources.list(); state.metricError = null; }
    catch (error) { state.metricSources = []; state.metricError = friendly(error); }
    sourceSelect.replaceChildren(h('option', { value: '', text: 'Choose a current deck reading' }), ...state.metricSources.map(item =>
      h('option', { value: sourceKey(item.source), text: `Deck ${item.source.deck} · ${item.source.deviceName || 'Device label unavailable'} · inputs ${item.source.firstChannel}–${item.source.secondChannel} · ${item.source.format} · generation ${item.source.generation}` })));
    sourceSelect.value = state.metricSource ? sourceKey(state.metricSource) : '';
    renderMetricSource(); renderControls();
  }
  function renderMetricSource() {
    if (!visible() || !store.native) return;
    const selected = state.metricSources.find(item => state.metricSource && sourceKey(item.source) === sourceKey(state.metricSource));
    sourceStatus.replaceChildren();
    if (state.metricError) sourceStatus.append(h('p', { role: 'alert', text: `Could not read available monitor sources: ${state.metricError}` }));
    else if (selected) sourceStatus.append(h('p', { class: 'muted small', text: `Observed ${selected.timing.observedAt}. Age at this refresh: ${observedAge(selected.timing.ageMs)} (host-callback-observation). Actual input rate: ${selected.configuration.sampleRateHz} Hz. Age is callback receipt age, not ADC acquisition time; no maximum acquisition age is established. The age at your press is saved.` }));
    else sourceStatus.append(h('p', { class: 'muted small', text: state.metricSource
      ? 'The selected source is no longer available. Refresh and explicitly choose a current generation, or turn off the attachment to record without a reading.'
      : state.metricSources.length ? 'Choose one deck to attach its latest existing reading. Refresh to update source availability and displayed age.'
        : 'No eligible live-monitor frame is available. Start the live monitor and wait for a frame to select a reading, or leave the attachment off.' }));
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
    else if (state.saved) saveStatus.append(h('p', { role: 'status', text: `Saved ${label(state.saved.kind)} for ${state.saved.context.venue.name} at ${at(state.saved.occurredAt)}. Operator report.${state.savedEvidence ? ' Its selected live-monitor snapshot was saved with it.' : ''}` }));
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
      h('thead', {}, h('tr', {}, ...['Occurred', 'Incident', 'Selected context', 'Notes', 'Saved', ...(store.native ? ['Live-monitor snapshot'] : [])].map(text => h('th', { scope: 'col', text })))),
      h('tbody', {}, ...result.items.map(row => h('tr', {},
        h('td', {}, h('time', { datetime: row.occurredAt, title: row.occurredAt, text: at(row.occurredAt) })),
        h('td', { text: label(row.kind) }),
        h('td', { text: `${row.context.venue.name} · ${row.context.setup?.name || 'No setup assigned'}` }),
        h('td', { text: row.note || '—' }),
        h('td', {}, h('time', { datetime: row.recordedAt, title: row.recordedAt, text: at(row.recordedAt) })),
        ...(store.native ? [h('td', {}, h('button', { type: 'button', class: 'btn btn-secondary', 'data-incident-metric-detail': row.id, text: 'View saved reading', onclick: () => {
          if (visible() && state.history === result) loadMetricDetail(row);
        } }))] : [])))))));
  }
  async function loadMetricDetail(row) {
    if (!visible()) return;
    const generation = ++state.detailGeneration;
    state.detail = { row, loading: true, pair: null, error: null }; renderMetricDetail();
    try {
      const pair = await metricStore.get(row);
      if (!visible() || generation !== state.detailGeneration) return;
      state.detail = { row, loading: false, pair, error: null }; renderMetricDetail();
    } catch (error) {
      if (!visible() || generation !== state.detailGeneration) return;
      state.detail = { row, loading: false, pair: null, error: friendly(error) }; renderMetricDetail();
    }
  }
  function renderMetricDetail() {
    if (!visible() || !store.native) return;
    metricDetail.replaceChildren();
    const detail = state.detail;
    if (!detail) return;
    metricDetail.append(h('h3', { text: `Saved reading for ${label(detail.row.kind)} at ${at(detail.row.occurredAt)}` }));
    if (detail.loading) { metricDetail.append(h('p', { role: 'status', text: 'Loading saved snapshot…' })); return; }
    if (detail.error) { metricDetail.append(h('p', { role: 'alert', text: `Could not load saved snapshot: ${detail.error}` }),
      h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: () => {
        if (visible() && state.detail === detail) loadMetricDetail(detail.row);
      } })); return; }
    const evidence = detail.pair?.evidence;
    if (!evidence) { metricDetail.append(h('p', { text: 'No saved snapshot accompanies this incident.' })); return; }
    const { source, timing, metrics, configuration, loss } = evidence;
    metricDetail.append(h('p', { text: `Operator-selected input: deck ${source.deck} · ${source.deviceName || 'Device label unavailable'} · inputs ${source.firstChannel}–${source.secondChannel} · ${source.format}. Generation ${source.generation}; monitor session ${source.sessionId || 'not persisted'}.` }),
      h('p', { text: `Observed ${timing.observedAt}; pressed ${evidence.pressAt}; receipt age at press ${observedAge(timing.ageMs)}. Basis: ${timing.basis}. Frame sample clock: ${timing.sampleTimeSeconds === null ? 'unavailable' : `${timing.sampleTimeSeconds} s`}. This does not establish ADC acquisition age or a surrounding recording interval.` }),
      h('p', { text: `Actual rate ${configuration.sampleRateHz} Hz; monitor hop ${configuration.hopMs} ms. Existing phase/SNR analysis window ${configuration.analysisWindowSeconds} s; metrics do not all share an acquisition window. Method ${evidence.method}.` }),
      h('dl', {}, ...METRIC_FIELDS.flatMap(field => [h('dt', { text: field.label }), h('dd', { text: evidence.unavailable.includes(field.key) ? 'unavailable' : `${metrics[field.key]} ${field.unit}` })])),
      h('p', { text: `Lock: ${metrics.locked}; motion: ${metrics.motion}; direction: ${metrics.direction}; state: ${metrics.state}; dropouts: ${metrics.dropouts} over the monitor's ${configuration.thresholds.dropoutSpanSec} s dropout interval.` }),
      h('p', { text: `Unavailable fields: ${evidence.unavailable.join(', ') || 'none'}. Transport loss: callback-reported dropped blocks ${loss.reportedDroppedBlocks ?? 'unavailable'}; monitor dropped blocks ${loss.monitorDroppedBlocks ?? 'unavailable'}; log events dropped ${loss.logEventsDropped ?? 'unavailable'}. These counters do not establish complete physical observation.` }));
    if (evidence.unavailable.length === METRIC_FIELDS.length) metricDetail.append(h('p', { text: 'This snapshot contains no valid numeric metric observations.' }));
    metricDetail.append(h('button', { type: 'button', id: 'incident-metric-download', class: 'btn btn-secondary', text: 'Download saved incident and snapshot (JSON)', onclick: async () => {
      if (!visible() || state.detail !== detail) return;
      try {
        const content = JSON.stringify(detail.pair, null, 2);
        const result = await download(`deckchek-incident-${detail.row.occurredAt.replace(/[:.]/g, '-')}.json`, content);
        if (!visible() || state.detail !== detail || result?.cancelled) return;
        metricDetail.append(h('p', { role: 'status', text: 'Saved incident and snapshot JSON downloaded.' }));
      } catch (error) {
        if (visible() && state.detail === detail) metricDetail.append(h('p', { role: 'alert', text: `Could not download the saved pair: ${friendly(error)}` }));
      }
    } }));
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
    ++state.detailGeneration; state.detail = null; renderMetricDetail();
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
      let evidence = null;
      if (store.native && attach.checked) {
        if (!state.metricSource) throw new Error('Choose a current live-monitor deck reading, or turn off the attachment to record without a reading.');
        evidence = structuredClone(monitorSources.snapshot(state.metricSource, draft));
      }
      state.pending = { draft, evidence, busy: false, error: null }; state.saved = null; state.savedEvidence = null; state.draftError = null;
      savePending();
    } catch (error) { state.draftError = friendly(error); renderSave(); }
  }
  async function savePending() {
    const pending = state.pending;
    if (!visible() || !pending || pending.busy) return;
    pending.busy = true; pending.error = null; renderSave();
    try {
      let saved, savedEvidence = null;
      if (pending.evidence) {
        const pair = await metricStore.save(structuredClone(pending.draft), structuredClone(pending.evidence));
        if (!pair?.incident || !pair.evidence) throw new Error('The combined save did not return the complete incident and snapshot');
        saved = pair.incident; savedEvidence = pair.evidence;
      } else saved = await store.save(structuredClone(pending.draft));
      if (state.pending !== pending) return;
      if (saved.id !== pending.draft.id) throw new Error('The saved incident has an unexpected identity');
      state.saved = saved; state.savedEvidence = savedEvidence; state.pending = null;
      if (visible() && state.venueId === pending.draft.venueId && state.setupId === (pending.draft.setupId || '') && note.value === (pending.draft.note || '')) note.value = '';
      renderSave();
      if (visible()) loadHistory(newestRequest()); else resetHistory();
    } catch (error) {
      if (state.pending !== pending) return;
      pending.busy = false; pending.error = friendly(error); renderSave();
    }
  }
  renderCatalog(); renderSave(); refreshMetricSources(); loadHistory(); loadCatalog();
  return {
    setActive(active) {
      if (state.disposed) return;
      state.active = Boolean(active); ++state.catalogGeneration; ++state.historyGeneration; ++state.detailGeneration;
      state.detail = null;
      if (state.active) { renderSave(); renderMetricDetail(); refreshMetricSources(); loadHistory(); loadCatalog(); }
    },
    dispose() { state.disposed = true; state.active = false; ++state.catalogGeneration; ++state.historyGeneration; ++state.detailGeneration; },
  };
}
