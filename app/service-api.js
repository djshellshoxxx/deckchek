// Service worksheets bridge (FS-22): thin wrappers over the Rust job_* / customer_* commands.
// Desktop only: jobs and customers live in the local database; the browser preview shows an unsupported state.
// The completion hook for other features (FS-23 maintenance logging and later) is the `job-status-changed`
// event: onJobStatusChanged(fn) receives {id, jobNumber, assetId, from, to}; a job is complete when `to` is
// 'ready' or 'collected'. The payload never carries customer data.

export const STATUS_EVENT = 'job-status-changed';

const tauri = () => globalThis.window?.__TAURI__;
const message = e => (typeof e === 'string' ? e : e?.message || String(e ?? 'Unknown error'));

export function serviceSupported(api = tauri()) {
  return typeof api?.core?.invoke === 'function';
}

export function createServiceApi(invoke = tauri()?.core?.invoke?.bind(tauri()?.core)) {
  const call = async (cmd, args) => {
    if (typeof invoke !== 'function') throw new Error('Service worksheets need the DeckChek desktop app.');
    try { return await invoke(cmd, args); } catch (e) { throw new Error(message(e)); }
  };
  return {
    create: input => call('job_create', { input }),
    get: id => call('job_get', { id }),
    list: (query = {}) => call('job_list', { query }),
    updateFields: (id, patch) => call('job_update_fields', { id, patch }),
    setStatus: (id, to, { expected = null, note = null, reopen = false } = {}) => call('job_set_status', { id, to, expected, note, reopen }),
    addLog: (id, kind, payload) => call('job_add_log', { id, kind, payload }),
    attachPhoto: (id, input) => call('job_attach_photo', { id, input }),
    linkResults: (id, phase, links) => call('job_link_results', { id, phase, links: { sessionIds: links.sessionIds || [], deviceTestResultIds: links.deviceTestResultIds || [] } }),
    comparison: id => call('job_comparison', { id }),
    remove: (id, confirm) => call('job_delete', { id, confirm }),
    customers: (q = null, limit = 50) => call('customer_list', { q, limit }),
    updateCustomer: (id, patch) => call('customer_update', { id, patch }),
    removeCustomer: id => call('customer_delete', { id }),
    photoRead: photoId => call('photo_read', { photoId }),
    photoUnlink: linkId => call('photo_unlink', { linkId }),
  };
}

/** Subscribe to status changes (desktop). Resolves to an unsubscribe function; a no-op in the browser. */
export async function onJobStatusChanged(listener, api = tauri()) {
  if (typeof api?.event?.listen !== 'function') return () => {};
  return api.event.listen(STATUS_EVENT, e => { try { listener(e?.payload ?? {}); } catch (err) { console.error('job-status-changed listener failed', err); } });
}
