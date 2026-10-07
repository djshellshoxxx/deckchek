// DeckChek UI entry point: wires the shell, workflow screens and backend bridges.
// Analysis orchestration lives in ui/analysis.js; pure measurement code in core/advanced/diagnostics.

import { initShell, go } from './ui/shell.js';
import { settings } from './ui/state.js';
import { WORKFLOWS } from './ui/workflows/definitions.js';
import { createWorkflowScreen } from './ui/workflows/flow.js';
import { createCalibrationScreen } from './ui/screens/calibration.js';
import { createEquipmentScreen } from './ui/screens/equipment.js';
import { createHistoryScreen } from './ui/screens/history.js';
import { migrateLocalRuns } from './ui/persistence.js';
import { toast } from './ui/live.js';
import { isNative } from './ui/dom.js';

const SCREENS = [
  ...WORKFLOWS.map(def => ({ id: def.id, title: def.title, short: def.short, icon: def.icon, create: createWorkflowScreen(def) })),
  { id: 'calibration', title: 'Calibration', short: 'Calibrate', icon: 'calibration', create: createCalibrationScreen },
  { id: 'equipment', title: 'Equipment', short: 'Equipment', icon: 'equipment', create: createEquipmentScreen },
  { id: 'history', title: 'History', short: 'History', icon: 'history', create: createHistoryScreen },
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
  initNativePersistence().then(migrateLocalRuns).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
