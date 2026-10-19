/** Genuine OFF/ON Process and History verification without invented outer Si. */
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
const v = await import('../site/vector-geometry.js');
const contains = (model, point) => {
  const regions = model.regions.filter((region) => v.pointInMulti(point, region.geom));
  return new Set(regions.flatMap((region) => region.stack.map((layer) => layer.layerId)));
};
// Registered, non-production SEM grey-area candidate: verify material from
// actual post-HF model, never from the mask silhouette alone.
const examinedPhotoMesaPoints = [
  [-52.648, -93.006],
  [-22.461, -51.621],
  [-47.994, -87.888],
  [55.9, -90.002],
  [7.5, -66.701],
];
const unverifiedExterior = [
  [-90, -50],
  [90, -50],
  [-95, -95],
  [95, -95],
  [0, 25],
  [0, -130],
];
for (const branch of project.snapshotBranches.branches) {
  const model = branch.headState.model;
  for (const point of examinedPhotoMesaPoints) {
    const layers = contains(model, point);
    assert.ok(layers.has('layer-2'), 'SEM photo-mesa hypothesis missing device Si');
  }
  for (const point of unverifiedExterior) {
    const layers = contains(model, point);
    assert.ok(!layers.has('layer-2'), 'Source-unverified exterior device Si fabricated');
    assert.ok(!layers.has('layer-1'), 'Exterior mask unexpectedly retains BOX');
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
      comparisonRole: 'SEM Fig3a photographic grey-area Si hypothesis, NOT author GDS',
      perimeter: SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
      realPostHFUnverifiedExteriorSiIsAbsent: true,
      processedSemPhotoMesaMaterialProbesVerified: true,
      tracedMesaSourceMaterialVerified: false,
      sourceMeasuredXYRegistrationVerified: false,
      realPostHFFixedCombSupportedAndMovingSWXSuspended: true,
      sourceClosedPerimeterTrenchRejected: true,
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
console.log('SEM Fig. 3a study: real OFF/ON Process with photo-traced mesa trial');
