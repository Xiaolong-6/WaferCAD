import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_SUITES, buildCiTestPlan } from '../../scripts/ci-test-plan.mjs';

function enabled(plan) {
  return BROWSER_SUITES.filter((suite) => plan.suites[suite]);
}

test('rough boundary and depth audit changes select renderer acceptance', () => {
  for (const path of [
    'site/rough-boundary-profile.js',
    'site/three-outline-pass.js',
    'scripts/pr250-renderer-audit.mjs',
    'scripts/pr250-audit-fixtures.mjs',
    'scripts/pr250-audit-compare.mjs',
    'scripts/rough-boundary-audit.mjs',
    'scripts/test-helpers/pr250-hidden-line-oracle.mjs',
    'scripts/test-helpers/pr250-gpu-height-oracle.mjs',
  ]) {
    assert.equal(buildCiTestPlan([path]).suites.renderer, true, path);
  }
});

test('shared state comparison changes run History and persistence coverage', () => {
  const plan = buildCiTestPlan(['site/state-equality.js']);
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke', 'history', 'persistence']);
});

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

test('project schema changes schedule persistence and process validation coverage', () => {
  const plan = buildCiTestPlan(['site/project-schema.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'persistence', 'process']);
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

test('real UI v2 changes select workstation and shared cross-interface regressions', () => {
  for (const path of [
    'site/ui-v2/workstation-entry.js',
    'site/ui-v2/workstation-workflow.js',
    'site/ui-v2/project-mask-panels.js',
    'scripts/v2/check-cross-ui-recovery.mjs',
  ]) {
    assert.deepEqual(
      enabled(buildCiTestPlan([path])),
      ['smoke', 'workstation', 'history', 'persistence', 'interaction'],
      path,
    );
  }
  assert.deepEqual(enabled(buildCiTestPlan(['site/ui-v2/main-view.css'])), [
    'smoke',
    'workstation',
  ]);
  assert.deepEqual(enabled(buildCiTestPlan(['site/ui-v2/mask-view.js'])), ['smoke', 'workstation']);
});

test('explicit full mode runs every suite independent of changed paths', () => {
  const plan = buildCiTestPlan([], { full: true });
  assert.equal(plan.full, true);
  for (const suite of BROWSER_SUITES) assert.equal(plan.suites[suite], true);
});

test('new cap triangulation schedules its renderer browser owner', () => {
  assert.deepEqual(enabled(buildCiTestPlan(['site/polygon-triangulation.js'])), [
    'smoke',
    'renderer',
  ]);
});

test('new storage and import modules schedule their persistence browser owner', () => {
  for (const path of [
    'site/workspace-storage-worker.js',
    'site/workspace-dirty-domains.js',
    'site/controllers/project-state-controller.js',
  ]) {
    assert.deepEqual(enabled(buildCiTestPlan([path])), ['smoke', 'persistence'], path);
  }
});

test('Welcome bootstrap schedules its workstation browser owner', () => {
  assert.deepEqual(enabled(buildCiTestPlan(['site/welcome.js'])), ['smoke', 'workstation']);
});

test('geometry codec and real IO runtime coverage select strict process and persistence owners', () => {
  assert.deepEqual(enabled(buildCiTestPlan(['site/project-io.js'])), [
    'smoke',
    'persistence',
    'process',
  ]);
  assert.deepEqual(enabled(buildCiTestPlan(['site/project-geometry-storage.js'])), [
    'smoke',
    'persistence',
    'process',
  ]);
  assert.deepEqual(enabled(buildCiTestPlan(['scripts/project-io-runtime-regression.mjs'])), [
    'smoke',
    'persistence',
    'process',
  ]);
});

test('array runtime and renderer regressions select their owning browser suites', () => {
  assert.deepEqual(enabled(buildCiTestPlan(['scripts/array-runtime-regression.mjs'])), [
    'smoke',
    'persistence',
    'renderer',
    'process',
  ]);
  assert.deepEqual(enabled(buildCiTestPlan(['scripts/array-renderer-regression.mjs'])), [
    'smoke',
    'renderer',
  ]);
  assert.deepEqual(enabled(buildCiTestPlan(['scripts/renderer-pipeline-benchmark.mjs'])), [
    'smoke',
    'renderer',
  ]);
});

test('release impact routes science owners without forcing unrelated suites', () => {
  const cases = [
    ['site/model.js', { main_mask: true, klayout: false, recipe: true }],
    ['site/process-numerical-contract.js', { main_mask: false, klayout: false, recipe: true }],
    ['site/process-recipe.js', { main_mask: false, klayout: false, recipe: true }],
    ['site/layout-export.js', { main_mask: true, klayout: true, recipe: false }],
    [
      'site/controllers/mask-import-controller.js',
      { main_mask: true, klayout: true, recipe: false },
    ],
    ['site/ui-v2/main-view.js', { main_mask: true, klayout: false, recipe: false }],
    ['docs/CI.md', { main_mask: false, klayout: false, recipe: false }],
  ];
  for (const [path, expected] of cases) {
    assert.deepEqual(buildCiTestPlan([path]).release, expected, path);
  }
});

test('manual/full release selects all scientific gates and fails closed on unknown history', () => {
  assert.deepEqual(buildCiTestPlan([], { full: true }).release, {
    main_mask: true,
    klayout: true,
    recipe: true,
  });
  assert.deepEqual(buildCiTestPlan(['site/process-recipe.js']).suites.process, true);
  assert.deepEqual(buildCiTestPlan(['site/process-face-execution.js']).suites.process, true);
  assert.deepEqual(buildCiTestPlan(['site/process-numerical-contract.js']).suites.process, true);
});

test('example prose changes do not select the scientific example replay', () => {
  for (const path of ['examples/projects/README.md', 'examples/projects/PROVENANCE.md']) {
    assert.deepEqual(enabled(buildCiTestPlan([path])), ['smoke']);
  }
  assert.equal(buildCiTestPlan(['examples/projects/device.wafercad']).suites.examples, true);
});

test('adding only the visual preview npm command selects the small smoke gate', () => {
  const packageBefore = {
    scripts: { test: 'node --test site/tests/*.test.mjs' },
    devDependencies: { playwright: '1.55.1' },
  };
  const packageAfter = {
    ...packageBefore,
    scripts: {
      ...packageBefore.scripts,
      'preview:visual': 'node scripts/v2/capture-visual-first.mjs',
    },
  };
  const plan = buildCiTestPlan(['package.json'], { packageBefore, packageAfter });
  assert.equal(plan.full, false);
  assert.deepEqual(enabled(plan), ['smoke']);
  assert.deepEqual(plan.release, { main_mask: false, klayout: false, recipe: false });
});

test('dependency, test command and unknown package changes are fail-closed', () => {
  const packageBefore = { scripts: { test: 'node --test site/tests/*.test.mjs' } };
  const cases = [
    { scripts: { test: 'node --test changed.test.mjs' } },
    {
      scripts: { ...packageBefore.scripts, 'test:ui': 'node run.mjs' },
    },
    {
      scripts: { ...packageBefore.scripts },
      dependencies: { three: '0.2.0' },
    },
  ];
  for (const packageAfter of cases) {
    const plan = buildCiTestPlan(['package.json'], { packageBefore, packageAfter });
    assert.equal(plan.full, true);
    assert.ok(Object.values(plan.release).every(Boolean));
  }
  assert.equal(buildCiTestPlan(['package.json']).full, true);
  assert.equal(buildCiTestPlan(['package-lock.json']).full, true);
});

test('scientific geometry, transaction and release owners remain selected', () => {
  assert.equal(buildCiTestPlan(['site/process-recipe.js']).release.recipe, true);
  assert.equal(buildCiTestPlan(['site/process-worker.js']).suites.process, true);
  assert.equal(buildCiTestPlan(['site/history-transaction.js']).suites.history, true);
  assert.equal(buildCiTestPlan(['site/project-io.js']).suites.persistence, true);
  assert.equal(buildCiTestPlan(['site/ui-v2/main-view.js']).release.main_mask, true);
  assert.equal(buildCiTestPlan(['site/gds.js']).release.klayout, true);
});

test('Example assets and bundled recipes select their owning browser suite', () => {
  for (const path of [
    'site/examples/suspended-silica-microdisks.wafercad',
    'site/bundled-example-history.js',
    'site/example-asset.js',
  ]) {
    assert.equal(buildCiTestPlan([path]).suites.examples, true, path);
  }
});

test('project open and replacement controller changes retain browser workstation acceptance', () => {
  const plan = buildCiTestPlan(['site/controllers/project-controller.js']);
  assert.deepEqual(enabled(plan), ['smoke', 'workstation', 'history', 'persistence']);
});
