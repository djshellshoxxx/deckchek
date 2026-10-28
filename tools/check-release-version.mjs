// Release gate: the tag (vMAJOR.MINOR.PATCH[-pre]) must match the app version in
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml. MSI needs a numeric version, so the
// app version carries MAJOR.MINOR.PATCH only and the prerelease label lives in the tag.
// Usage: node tools/check-release-version.mjs <tag>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function tagCoreVersion(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

export function checkRelease(tag, root) {
  const core = tagCoreVersion(tag);
  if (!core) return { ok: false, message: `Tag ${tag} is not vMAJOR.MINOR.PATCH[-prerelease]` };
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
  const cargo = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8'))?.[1];
  if (conf !== core || cargo !== core) return { ok: false, message: `Tag ${tag} needs app version ${core}; tauri.conf.json has ${conf}, Cargo.toml has ${cargo}` };
  return { ok: true, message: `Tag ${tag} matches app version ${core}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = checkRelease(process.argv[2], path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
