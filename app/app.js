// DeckChek UI entry point: wires the shell, workflow screens and backend bridges.
// Analysis orchestration lives in ui/analysis.js; pure measurement code in core/advanced/diagnostics.

import { initShell, go } from './ui/shell.js';
import { settings } from './ui/state.js';
import { WORKFLOWS } from './ui/workflows/definitions.js';
import { createWorkflowScreen } from './ui/workflows/flow.js';
import { createCalibrationScreen } from './ui/screens/calibration.js';
import { createSystemScreen } from './ui/screens/system.js';
import { createEquipmentScreen } from './ui/screens/equipment.js';
import { createDevicesScreen } from './ui/screens/devices.js';
import { ensureLibrary } from './ui/devices/library-state.js';
import { createHistoryScreen } from './ui/screens/history.js';
import { migrateLocalRuns } from './ui/persistence.js';
import { toast } from './ui/live.js';
import { isNative } from './ui/dom.js';
import { bindSettings } from './features.js';
// [FS-00] screens imports
// [FS-01] screens imports
// [FS-02] screens imports
import { initDiagnostics } from './ui/screens/support-dialog.js';
initDiagnostics(); // error hooks, Ctrl+Shift+D, startup crash prompt (FS-02)
// [FS-03] screens imports
// [FS-06] screens imports
import { mediaScreenDefs } from './ui/screens/media.js';
// [FS-07] screens imports
// [FS-08] screens imports
import { dataScreenDefs } from './ui/screens/data.js';
// [FS-10] screens imports
// [FS-11] screens imports
// [FS-12] screens imports
import { stylusScreenDefs } from './ui/screens/stylus.js';
// [FS-13] screens imports
// [FS-14] screens imports
// [FS-15] screens imports
import { humScreenDefs } from './ui/workflows/hum.js';
// [FS-20] screens imports
// [FS-21] screens imports
// [FS-22] screens imports
// [FS-23] screens imports
// [FS-30] screens imports
// [FS-31] screens imports
// [FS-32] screens imports
// [FS-33] screens imports

bindSettings(settings); // keeps feature-flag changes from being overwritten by the settings store (FS-00 §4.14)

const SCREENS = [
  ...WORKFLOWS.map(def => ({ id: def.id, title: def.title, short: def.short, icon: def.icon, create: createWorkflowScreen(def) })),
  { id: 'calibration', title: 'Calibration', short: 'Calibrate', icon: 'calibration', create: createCalibrationScreen },
  { id: 'system', title: 'System Health', short: 'System', icon: 'system', create: createSystemScreen },
  { id: 'devices', title: 'Devices', short: 'Devices', icon: 'devices', create: createDevicesScreen },
  { id: 'equipment', title: 'Equipment', short: 'Equipment', icon: 'equipment', create: createEquipmentScreen },
  { id: 'history', title: 'History', short: 'History', icon: 'history', create: createHistoryScreen },
  // [FS-00] screens
  // [FS-01] screens
  // [FS-02] screens
  // [FS-03] screens
  // [FS-06] screens
  ...mediaScreenDefs(),
  // [FS-07] screens
  // [FS-08] screens
  ...dataScreenDefs(),
  // [FS-10] screens
  // [FS-11] screens
  // [FS-12] screens
  ...stylusScreenDefs(),
  // [FS-13] screens
  // [FS-14] screens
  // [FS-15] screens
  ...humScreenDefs(),
  // [FS-20] screens
  // [FS-21] screens
  // [FS-22] screens
  // [FS-23] screens
  // [FS-30] screens
  // [FS-31] screens
  // [FS-32] screens
  // [FS-33] screens
];

async function initNativePersistence() {
  if (!isNative()) return;
  try { await window.__TAURI__.core.invoke('initialize_database'); }
  catch (error) { toast(`Local database unavailable — results stay in this window only: ${error}`, { type: 'error' }); }
}

function start() {
  initShell(SCREENS);
  const initial = SCREENS.some(s => s.id === settings.screen) ? settings.screen : 'quick';
  go(initial);
  // First run: sync every device profile into the catalog and create one asset per device ("My <model>").
  initNativePersistence().then(migrateLocalRuns).catch(() => {}).then(() => ensureLibrary()).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
