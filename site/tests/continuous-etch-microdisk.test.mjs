import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { expandProjectStorage } = await import('../project-io.js');
const { planContinuousEtchFromTopology, remainingMaterialInContinuousPlan } =
  await import('../continuous-etch-topology.js');
const { continuousDepthAtXY, sampleContinuousSection } =
  await import('../continuous-etch-geometry.js');

const raw = JSON.parse(
  readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
);
const project = expandProjectStorage(raw);
const originalM07 = project.snapshots.find((step) => step.id === 'snapshot-microdisk-07')?.state
  ?.model;

function microdiskPlan(model) {
  return planContinuousEtchFromTopology({
    model,
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
}

test('published Microdisk M07 exposes physical silicon before release', () => {
  assert.ok(originalM07, 'M07 release predecessor must exist in published History');
  const model = structuredClone(originalM07);
  const state = JSON.stringify(model);
  const plan = microdiskPlan(model);
  assert.equal(plan.fronts.length, 1);
  assert.equal(plan.fronts[0].seedZ, 40);
  assert.equal(plan.fronts[0].layerId, 'base');
  assert.equal(plan.fronts[0].lateralUm, 36);
  assert.equal(plan.fronts[0].verticalUm, 36);
  assert.equal(JSON.stringify(model), state, 'Read-only planning may not mutate M07');
});

test('continuous Microdisk keeps central silicon pedestal and undercuts silica', () => {
  const model = structuredClone(originalM07);
  const plan = microdiskPlan(model);
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [0, 0, 39]), 'base');
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [50, 0, 39]), null);
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [50, 0, 15]), null);
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [145, 0, 39]), null);
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [145, 0, 2]), 'base');
  assert.equal(remainingMaterialInContinuousPlan(model, plan, [145, 0, 40.5]), 'layer-1');
});

test('Microdisk analytic release front keeps continuous elliptical/circular law', () => {
  const plan = microdiskPlan(structuredClone(originalM07));
  const front = plan.fronts[0];
  const xy = [50, 0];
  const d = continuousDepthAtXY(front, xy);
  assert.ok(d > 35 && d < 36, 'This Si point is below a partly undercut silica region');
  assert.equal(sampleContinuousSection(front, [-200, 0], [200, 0], 8).length, 9);
  assert.equal(sampleContinuousSection(front, [-200, 0], [200, 0], 72).length, 73);
  assert.equal(sampleContinuousSection(front, [-200, 0], [200, 0], 144).length, 145);
  assert.equal(continuousDepthAtXY(front, xy), d, 'Sampling must never change the physical front');
});
