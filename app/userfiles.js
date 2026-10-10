// Save user-facing files (FS-00 §4.4). In the desktop app: native save dialog, then the
// Rust `userfiles_write_text` command re-validates the chosen path. In browser mode: a
// Blob download. Dialog/invoke access is injectable for tests.

const MIME = { csv: 'text/csv', json: 'application/json', html: 'text/html', txt: 'text/plain', md: 'text/markdown', svg: 'image/svg+xml' };

const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;

export function normalizeExt(ext) {
  const e = String(ext ?? '').replace(/^\./, '').toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(e)) throw new Error('Invalid file extension.');
  return e;
}

// Mirrors Rust sanitize_file_stem for the dialog's suggested name.
export function sanitizeFileStem(s) {
  let out = String(s ?? '').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 80).replace(/[. ]+$/, '');
  if (!out) return '_';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out.split('.')[0].trimEnd())) out += '_';
  return out;
}

function stemOf(name, ext) {
  const n = String(name ?? '');
  return n.toLowerCase().endsWith('.' + ext) ? n.slice(0, -(ext.length + 1)) : n;
}

function browserDownload(fileName, content, ext, doc) {
  const d = doc ?? globalThis.document;
  const blob = new Blob([content], { type: (MIME[ext] ?? 'application/octet-stream') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = d.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  d.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @returns {Promise<{cancelled:true}|{cancelled:false, path:string|null, bytes:number}>}
 * `path` is null for browser downloads. Rejects with the Rust {code,message} error object on validation failure.
 */
export async function saveTextFile({ suggestedName, content, ext, api = tauri(), doc } = {}) {
  const e = normalizeExt(ext);
  const text = String(content ?? '');
  const fileName = `${sanitizeFileStem(stemOf(suggestedName || 'deckchek', e))}.${e}`;
  const dialog = api?.dialog?.save;
  const invoke = api?.core?.invoke;
  if (!dialog || !invoke) {
    browserDownload(fileName, text, e, doc);
    return { cancelled: false, path: null, bytes: new TextEncoder().encode(text).length };
  }
  const path = await dialog({ defaultPath: fileName, filters: [{ name: e.toUpperCase(), extensions: [e] }] });
  if (!path) return { cancelled: true };
  const r = await invoke('userfiles_write_text', { path, content: text, allowedExt: e });
  return { cancelled: false, path: r.path, bytes: r.bytes };
}

/**
 * Write several files into a folder the user picks (FS-00 §4.4; first consumer is the gear ledger, FS-33). Desktop only:
 * native folder dialog, then the Rust `userfiles_write_folder` command re-validates every relative path (no `..`, absolute,
 * drive-letter, UNC, reserved names or symlinks) and the extension list. `files` = [{relPath, text?|base64?}].
 * @returns {Promise<{cancelled:true}|{cancelled:false, path:string, written:number}>}
 * Rejects with the Rust {code,message} error on validation failure, or an Error outside the desktop app.
 */
export async function saveFolder({ files, allowedExts, title = 'Choose a folder', api = tauri() } = {}) {
  const exts = (allowedExts ?? []).map(normalizeExt);
  if (!exts.length) throw new Error('saveFolder needs at least one allowed extension.');
  const list = Array.isArray(files) ? files : [];
  if (!list.length) throw new Error('There are no files to write.');
  const open = api?.dialog?.open;
  const invoke = api?.core?.invoke;
  if (!open || !invoke) throw new Error('Saving a folder is only available in the DeckChek desktop app.');
  const dir = await open({ directory: true, multiple: false, title });
  const chosen = Array.isArray(dir) ? dir[0] : dir;
  if (!chosen) return { cancelled: true };
  const r = await invoke('userfiles_write_folder', { dir: chosen, files: list, allowedExts: exts });
  return { cancelled: false, path: r.path, written: r.written };
}
