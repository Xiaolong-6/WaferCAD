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
// The former full Si ring and two broad flanks were fabricated by earlier
// iterations: there is no author evidence for device Si at these positions.
// Check the actual final OFF/ON material stack, not just the input Mask.
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
      comparisonRole: 'paper SEM source review without invented peripheral silicon',
      perimeter: SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
      realPostHFUnverifiedExteriorSiIsAbsent: true,
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
console.log('SEM Fig. 3a study: real OFF/ON Process, no invented outer Si');
