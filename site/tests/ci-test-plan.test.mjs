import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_SUITES, buildCiTestPlan } from '../../scripts/ci-test-plan.mjs';

function enabled(plan) {
  return BROWSER_SUITES.filter((suite) => plan.suites[suite]);
}

test('bundled example History changes run focused state and example coverage', () => {
  const plan = buildCiTestPlan(['site/bundled-example-history.js']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), [
    'smoke',
    'workstation',
    'resilience',
    'history',
    'interaction',
    'examples',
  ]);
  assert.equal(plan.suites.process, false);
  assert.equal(plan.suites.renderer, false);
});

test('core geometry changes schedule heavy process coverage plus renderer review', () => {
  const plan = buildCiTestPlan(['site/model.js']);
  assert.equal(plan.full, false);
  assert.equal(plan.suites.process, true);
  assert.equal(plan.suites.renderer, true);
  assert.equal(plan.suites.examples, true);
});

test('project schema changes schedule persistence and example coverage without process geometry', () => {
  const plan = buildCiTestPlan(['site/project-schema.js']);
  assert.equal(plan.suites.persistence, true);
  assert.equal(plan.suites.examples, true);
  assert.equal(plan.suites.process, false);
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
  assert.deepEqual(enabled(plan), ['smoke', 'workstation', 'resilience']);
});

test('planner-only changes stay on the lightweight fast baseline', () => {
  const plan = buildCiTestPlan(['scripts/ci-test-plan.mjs']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke', 'workstation', 'resilience']);
});

test('dependency changes conservatively run the complete browser suite', () => {
  const plan = buildCiTestPlan(['package-lock.json']);
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});

test('empty changed-path plan stays on the lightweight fast baseline', () => {
  const plan = buildCiTestPlan([]);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke', 'workstation', 'resilience']);
  assert.equal(plan.suites.process, false);
});

test('explicit full mode runs every suite independent of changed paths', () => {
  const plan = buildCiTestPlan([], { full: true });
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});
