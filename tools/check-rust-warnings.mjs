#!/usr/bin/env node
// Attribute Cargo diagnostics without exempting dependencies or stderr warnings.
// Format: https://doc.rust-lang.org/cargo/reference/external-tools.html#json-messages
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

export function inspectRustBuild(metadata, output, manifestPath, stderrOutput = '') {
  const manifest = path.resolve(manifestPath);
  const packages = metadata?.packages?.filter(pkg => typeof pkg.manifest_path === 'string' && path.resolve(pkg.manifest_path) === manifest);
  if (packages?.length !== 1 || typeof packages[0].id !== 'string' || !packages[0].id) throw new Error('Cargo metadata must identify exactly one app package at the requested manifest.');
  const app = packages[0], report = { appPackageId: app.id, appWarnings: [], dependencyWarnings: [], stderrWarnings: [], stderrErrors: [], errors: [], invalid: [], appArtifacts: 0, finished: 0, success: false };
  // Cargo manifest and build-script diagnostics can remain on stderr with
  // --message-format=json. Keep progress text separate from warning/error lines.
  for (const line of stderrOutput.split(/\r?\n/)) {
    const level = /^(warning|error)(?:\[[^\]\r\n]*\])?:/.exec(stripVTControlCharacters(line).trimStart())?.[1];
    if (level === 'warning') report.stderrWarnings.push(line);
    if (level === 'error') report.stderrErrors.push(line);
  }
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
  report.ok = report.success && report.finished === 1 && report.appArtifacts > 0 && report.appWarnings.length === 0 && report.dependencyWarnings.length === 0 && report.stderrWarnings.length === 0 && report.stderrErrors.length === 0 && report.errors.length === 0 && report.invalid.length === 0;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifest, metadataFile, messagesFile, stderrFile, ...extra] = process.argv.slice(2);
    if (!manifest || !metadataFile || !messagesFile || !stderrFile || extra.length) throw new Error('Usage: check-rust-warnings.mjs MANIFEST METADATA_JSON BUILD_MESSAGES_JSONL BUILD_STDERR');
    const report = inspectRustBuild(JSON.parse(fs.readFileSync(metadataFile, 'utf8')), fs.readFileSync(messagesFile, 'utf8'), manifest, fs.readFileSync(stderrFile, 'utf8'));
    for (const [label, observations] of [['App warning', report.appWarnings], ['Dependency warning', report.dependencyWarnings], ['Compiler error', report.errors]]) {
      for (const observation of observations) console.error(`${label} (${observation.packageId}):\n${observation.rendered || observation.message}`);
    }
    for (const observation of [...report.stderrWarnings, ...report.stderrErrors]) console.error(observation);
    for (const issue of report.invalid) console.error(issue);
    console.log(`Rust build: ${report.appWarnings.length} app warnings; ${report.dependencyWarnings.length} dependency warnings; ${report.stderrWarnings.length} stderr warnings; ${report.errors.length} compiler errors; ${report.stderrErrors.length} stderr errors; ${report.appArtifacts} app artifacts; completed=${report.success && report.finished === 1}.`);
    if (!report.ok) { console.error('Rust warning/build-evidence gate failed.'); process.exitCode = 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
