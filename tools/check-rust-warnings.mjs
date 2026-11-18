#!/usr/bin/env node
// Attribute Cargo diagnostics to the selected app package without suppressing dependencies.
// Format: https://doc.rust-lang.org/cargo/reference/external-tools.html#json-messages
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectRustBuild(metadata, output, manifestPath) {
  const manifest = path.resolve(manifestPath);
  const packages = metadata?.packages?.filter(pkg => typeof pkg.manifest_path === 'string' && path.resolve(pkg.manifest_path) === manifest);
  if (packages?.length !== 1 || typeof packages[0].id !== 'string' || !packages[0].id) throw new Error('Cargo metadata must identify exactly one app package at the requested manifest.');
  const app = packages[0], report = { appPackageId: app.id, appWarnings: [], dependencyWarnings: [], errors: [], invalid: [], appArtifacts: 0, finished: 0, success: false };
  const lines = output.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let item;
    try { item = JSON.parse(lines[index]); } catch { report.invalid.push(`Line ${index + 1} is not a Cargo JSON message.`); continue; }
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.reason !== 'string') {
      report.invalid.push(`Line ${index + 1} has no Cargo message reason.`); continue;
    }
    if (report.finished) report.invalid.push(`Cargo output continues after build-finished at line ${index + 1}.`);
    if (item.reason === 'build-finished') {
      report.finished++;
      report.success = item.success === true;
      if (typeof item.success !== 'boolean') report.invalid.push('build-finished has no boolean success observation.');
      continue;
    }
    if (item.reason === 'build-script-executed') continue;
    if (!['compiler-message', 'compiler-artifact'].includes(item.reason)) {
      report.invalid.push(`Unsupported Cargo message reason: ${item.reason}`); continue;
    }
    if (typeof item.package_id !== 'string' || !item.package_id || typeof item.manifest_path !== 'string' || !item.manifest_path) {
      report.invalid.push(`Line ${index + 1} lacks package attribution.`); continue;
    }
    const isApp = item.package_id === app.id;
    if (isApp !== (path.resolve(item.manifest_path) === manifest)) {
      report.invalid.push(`Line ${index + 1} has conflicting package and manifest identities.`); continue;
    }
    if (item.reason === 'compiler-artifact') {
      if (!Array.isArray(item.target?.kind) || !item.target.kind.length || item.target.kind.some(kind => typeof kind !== 'string' || !kind.trim())) report.invalid.push(`Line ${index + 1} lacks a valid artifact target kind.`);
      else if (isApp && item.target.kind.some(kind => kind !== 'custom-build')) report.appArtifacts++;
      continue;
    }
    const diagnostic = item.message;
    if (!diagnostic || typeof diagnostic.message !== 'string' || !['warning', 'error', 'note', 'help', 'failure-note'].includes(diagnostic.level)) {
      report.invalid.push(`Line ${index + 1} has an invalid compiler diagnostic.`); continue;
    }
    const observed = { packageId: item.package_id, manifestPath: item.manifest_path, ...diagnostic };
    if (diagnostic.level === 'warning') (isApp ? report.appWarnings : report.dependencyWarnings).push(observed);
    if (diagnostic.level === 'error') report.errors.push(observed);
  }
  report.ok = report.success && report.finished === 1 && report.appArtifacts > 0 && report.appWarnings.length === 0 && report.errors.length === 0 && report.invalid.length === 0;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifest, metadataFile, messagesFile, ...extra] = process.argv.slice(2);
    if (!manifest || !metadataFile || !messagesFile || extra.length) throw new Error('Usage: check-rust-warnings.mjs MANIFEST METADATA_JSON BUILD_MESSAGES_JSONL');
    const report = inspectRustBuild(JSON.parse(fs.readFileSync(metadataFile, 'utf8')), fs.readFileSync(messagesFile, 'utf8'), manifest);
    for (const [label, observations] of [['App warning', report.appWarnings], ['Dependency warning', report.dependencyWarnings], ['Compiler error', report.errors]]) {
      for (const observation of observations) console.error(`${label} (${observation.packageId}):\n${observation.rendered || observation.message}`);
    }
    for (const issue of report.invalid) console.error(issue);
    console.log(`Rust build: ${report.appWarnings.length} app warnings; ${report.dependencyWarnings.length} dependency warnings retained; ${report.errors.length} compiler errors; ${report.appArtifacts} app artifacts; completed=${report.success && report.finished === 1}.`);
    if (!report.ok) { console.error('App warning/build-evidence gate failed.'); process.exitCode = 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
