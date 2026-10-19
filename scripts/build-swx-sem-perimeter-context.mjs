/** Real Kernel/Recipe OFF/ON process for the isolated experimental bulk-Si field. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSwxMemsUnified } from './build-swx-mems-example.mjs';
import {
  createSwxSemPerimeterContext,
  SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
} from './swx-mems-sem-perimeter-context.mjs';

const { project, json, validation } = await buildSwxMemsUnified(
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
);
const source = createSwxSemPerimeterContext('off');
assert.deepEqual(project.layout.elements, source.layout.elements);
assert.equal(project.snapshotBranches.branches.length, 2);
// Verify post-HF material columns from the REAL Kernel output for each pose,
// not from the original positive-Si mask or a renderer-only illustration.
const v = await import('../site/vector-geometry.js');
const contains = (model, point) => {
  const regions = model.regions.filter((region) => v.pointInMulti(point, region.geom));
  return new Set(regions.flatMap((region) => region.stack.map((layer) => layer.layerId)));
};
const perimeterPoints = [
  [-90, -50],
  [90, -50],
  [-95, -95],
  [95, -95],
];
const cavityPoints = [
  [-81, -50],
  [81, -50],
  [0, -9],
  [0, -120],
];
for (const branch of project.snapshotBranches.branches) {
  const model = branch.headState.model;
  for (const point of perimeterPoints) {
    const layers = contains(model, point);
    assert.ok(layers.has('layer-2'), 'Outside perimeter missing real device Si');
    assert.ok(layers.has('layer-1'), 'Outside perimeter missing real BOX support');
  }
  for (const point of cavityPoints) {
    const layers = contains(model, point);
    assert.ok(!layers.has('layer-2'), 'Isolation trench contains device Si');
    assert.ok(!layers.has('layer-1'), 'Isolation trench contains residual BOX');
  }
  const comb = contains(model, [-25, -78]);
  assert.ok(comb.has('layer-1') && comb.has('layer-2'), 'Fixed comb lost BOX support');
  const moving = contains(model, [0, -52]);
  assert.ok(moving.has('layer-2') && !moving.has('layer-1'), 'Movable SWX lost suspension');
}

const dir = resolve('test-results/swx-sem-v2-perimeter');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'swx-sem-perimeter-context.wafercad'), json);
await writeFile(
  resolve(dir, 'science-report.json'),
  JSON.stringify(
    {
      ...validation,
      comparisonRole: 'real process geometry for open context flanks, not original SEM mask',
      perimeter: SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
      realPostHFPerimeterSiAndBoxColumnsVerified: true,
      realPostHFIsolationCavityOpen: true,
      sourceClosedPerimeterTrenchRejected: true,
      experimentallyInferredFlankSiSourceVerified: false,
      realPostHFFixedCombSupportedAndMovingSWXSuspended: true,
      sourceAuthorPerimeterGdsAccepted: false,
      sourceIsolationTrenchAccepted: false,
      paperDeviceFootprintAccepted: false,
      postHFMechanicalFEMVerified: false,
      fullSingleUnitPaperFidelityAccepted: false,
      productionExampleAccepted: false,
      fullArrayAccepted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('Real OFF/ON process+History built with experimental external Si field');
