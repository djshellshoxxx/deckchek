import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeImportedRun } from '../app/export.js';
import { metricDetails, renderResults, uncertaintyText } from '../app/ui/results.js';

const measurement = uncertainty => ({ metricId: 'rpm', label: 'Speed', value: 33.3, unit: 'RPM', qualityFlags: [], uncertainty });
const imported = uncertainty => sanitizeImportedRun({ id: 'legacy / unit "A" & B', test: 'Imported run', measurements: [measurement(uncertainty)], findings: [] });

test('workspace import preserves identifiers, measurements and valid numeric uncertainty evidence', () => {
  const uncertainty = { standard: .01, expanded: .02, k: 2, unit: 'RPM', components: { clock: .006, estimator: .008 } };
  const run = imported(uncertainty);
  assert.equal(run.id, 'legacy / unit "A" & B');
  assert.equal(run.measurements[0].value, 33.3);
  assert.deepEqual(run.measurements[0].uncertainty, uncertainty);
  assert.equal(imported(.02).measurements[0].uncertainty, .02);
  assert.equal(imported(0).measurements[0].uncertainty, 0);
  assert.equal(uncertaintyText(run.measurements[0]), '± 0.020');
});

test('workspace import drops invalid uncertainty fields without guessing missing values', () => {
  const run = imported({ standard: .01, expanded: .02, k: '<b>2</b>', unit: 'RPM', components: { clock: .01, invalid: '0.02', negative: -1 }, extra: '<b>ignored</b>' });
  assert.deepEqual(run.measurements[0].uncertainty, { standard: .01, expanded: .02, unit: 'RPM', components: { clock: .01 } });
  for (const bad of ['0.2', '<b>1</b>', -1, NaN, Infinity, [], { expanded: -1 }, { expanded: '0.2', k: 2 }]) {
    assert.equal(imported(bad).measurements[0].uncertainty, null);
    assert.equal(uncertaintyText(measurement(bad)), null);
  }
  assert.deepEqual(imported({ expanded: .1 }).measurements[0].uncertainty, { expanded: .1 });
  assert.deepEqual(imported({ standard: .1 }).measurements[0].uncertainty, { standard: .1 });
  for (const k of [0, -2, Infinity, NaN, '2', {}]) {
    assert.deepEqual(imported({ expanded: .1, k }).measurements[0].uncertainty, { expanded: .1 });
  }
});

// These tests inspect the real renderers' output; the browser smoke separately checks parsed DOM and interaction.
function withDom(fn) {
  const previous = { document: globalThis.document, Node: globalThis.Node };
  const elements = [];
  class Element {
    constructor() { this.children = []; this.attrs = {}; this.dataset = {}; this.innerHTML = ''; elements.push(this); }
    setAttribute(key, value) { this.attrs[key] = value; }
    append(...children) { this.children.push(...children); }
    addEventListener() {}
    querySelectorAll() { return []; }
  }
  globalThis.Node = Element;
  globalThis.document = { createElement: () => new Element(), createTextNode: () => new Element() };
  try { return fn(elements); }
  finally { globalThis.document = previous.document; globalThis.Node = previous.Node; }
}

test('results escape imported run IDs in verdict and finding HTML while keeping DOM identity', () => withDom(elements => {
  const id = 'r"><button data-workspace-marker="id">Marker</button><span x="';
  const run = { ...imported(null), id, calibration: { applied: true }, findings: [{ title: 'Recorded finding', severity: 'review', detail: '', supportedBy: [], contradictedBy: [] }] };
  renderResults(run);
  const html = elements.map(e => e.innerHTML).join('\n');
  assert.ok(!html.includes('<button data-workspace-marker='));
  assert.ok(html.includes('id="verdict-r&quot;&gt;&lt;button'));
  assert.ok(html.includes('id="finding-r&quot;&gt;&lt;button'));
  assert.ok(elements.some(e => e.attrs['aria-labelledby'] === `verdict-${id}`));
}));

test('inspector rejects legacy malformed coverage factors and components as numeric evidence', () => withDom(() => {
  const marker = '<button data-workspace-marker="k">Marker</button>';
  const m = measurement({ expanded: .2, k: marker, unit: 'RPM', components: { valid: .1, invalid: marker } });
  const html = metricDetails(m, { findings: [] }).innerHTML;
  assert.ok(!html.includes(marker));
  assert.ok(html.includes('± 0.200'));
  assert.ok(!html.includes('k='));
  assert.ok(!html.includes('~95%'));
  assert.ok(!html.includes('>invalid</th>'));
}));

test('inspector retains numeric scalar and structured uncertainty without inventing a coverage factor', () => withDom(() => {
  const detail = uncertainty => metricDetails(measurement(uncertainty), { findings: [] }).innerHTML;
  assert.ok(detail({ expanded: .02, k: 2, unit: 'RPM' }).includes('(k=2, ~95%)'));
  assert.ok(detail({ expanded: .02, k: 3 }).includes('(k=3)'));
  assert.ok(!detail({ expanded: .02, k: 3 }).includes('~95%'));
  assert.ok(detail(.02).includes('± 0.020'));
  assert.ok(!detail(.02).includes('k='));
  assert.ok(detail({ standard: .01 }).includes('Standard uncertainty: 0.010'));
  assert.ok(detail({ standard: .01 }).includes('expanded uncertainty not recorded'));
}));
