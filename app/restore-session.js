// A committed database restore ends the current renderer session. Screens may
// still hold pre-restore caches, so navigation and ordinary settings writers
// stay paused until a new document loads. Local-settings retry is explicit and
// remains available in the application-owned outcome dialog.
const pendingDocuments = new WeakSet();

export function requireRestoreReload() {
  pendingDocuments.add(globalThis.document);
}

export function restoreReloadRequired() {
  return !!globalThis.document && pendingDocuments.has(globalThis.document);
}
