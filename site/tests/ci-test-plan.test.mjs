import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_SUITES, buildCiTestPlan } from '../../scripts/ci-test-plan.mjs';

function enabled(plan) {
  return BROWSER_SUITES.filter((suite) => plan.suites[suite]);
}

test('bundled example History changes run focused state and example coverage', () => {
  const plan = buildCiTestPlan(['site/bundled-example-history.js']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke', 'history', 'examples']);
  assert.equal(plan.suites.process, false);
  assert.equal(plan.suites.renderer, false);
});

test('core geometry changes schedule only the process browser owner', () => {
  const plan = buildCiTestPlan(['site/model.js']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke', 'process']);
});

test('project schema changes schedule persistence without unrelated example coverage', () => {
  const plan = buildCiTestPlan(['site/project-schema.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'persistence']);
});

test('shared polygon boolean kernel schedules persistence and process coverage', () => {
  const plan = buildCiTestPlan(['site/polygon-boolean.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'persistence', 'process']);
});

test('layout parser changes schedule interaction and layout review only', () => {
  const plan = buildCiTestPlan(['site/gds.js']);
  assert.equal(plan.suites.interaction, true);
  assert.equal(plan.suites.product_layout, true);
  assert.equal(plan.suites.process, false);
});

test('shared product orchestrator changes run both product review scopes', () => {
  const plan = buildCiTestPlan(['scripts/product-regression.mjs']);
  assert.equal(plan.suites.product_layout, true);
  assert.equal(plan.suites.renderer, true);
  assert.equal(plan.suites.process, false);
});

test('workflow-only changes stay on the lightweight fast baseline', () => {
  const plan = buildCiTestPlan(['.github/workflows/browser-regression.yml']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke']);
});

test('planner-only changes stay on the lightweight fast baseline', () => {
  const plan = buildCiTestPlan(['scripts/ci-test-plan.mjs']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke']);
});

test('product-specific helper changes stay within product owners', () => {
  const plan = buildCiTestPlan(['scripts/test-helpers/product.mjs']);
  assert.deepEqual(enabled(plan), ['smoke', 'product_layout', 'renderer']);
  assert.equal(plan.full, false);
});

test('shared browser bootstrap helper changes conservatively run the complete suite', () => {
  const plan = buildCiTestPlan(['scripts/test-helpers/ui.mjs']);
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});

test('shared scientific browser helper changes conservatively run the complete suite', () => {
  const plan = buildCiTestPlan(['scripts/test-helpers/product-scientific.mjs']);
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});

test('shared Section and rough renderer helpers select renderer coverage', () => {
  for (const path of [
    'site/plan-renderers.js',
    'site/rough-mesh-geometry.js',
    'site/rough-mesh-worker.js',
    'site/surface-rendering.js',
    'site/annotation-rendering.js',
  ]) {
    const plan = buildCiTestPlan([path]);
    assert.equal(plan.suites.renderer, true, `${path} must select renderer regression`);
  }
});

test('dependency changes conservatively run the complete browser suite', () => {
  const plan = buildCiTestPlan(['package-lock.json']);
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});

test('empty changed-path plan stays on the lightweight fast baseline', () => {
  const plan = buildCiTestPlan([]);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke']);
  assert.equal(plan.suites.process, false);
});

test('process controller changes do not pull layout, renderer or interaction review', () => {
  const plan = buildCiTestPlan(['site/controllers/process-panel-controller.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'history', 'process']);
});

test('Three renderer changes select renderer plus resilience without product layout', () => {
  const plan = buildCiTestPlan(['site/three-view.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'resilience', 'renderer']);
});

test('workstation shell changes select only their owned UI suites', () => {
  const plan = buildCiTestPlan(['site/workstation.css']);
  assert.deepEqual(enabled(plan), ['smoke', 'workstation', 'interaction', 'product_layout']);
});

test('explicit full mode runs every suite independent of changed paths', () => {
  const plan = buildCiTestPlan([], { full: true });
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});
