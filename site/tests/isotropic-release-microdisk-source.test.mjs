// #327: exercise opt-in release on the published 148/82 um Microdisk
// geometry at M07, before XeF2. Never overwrite the saved M08/M09 History.
// The 36 um release radius is still an engineering assumption, not SEM data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, geometryArea } = await import('../model.js');
const { pointInMulti } = await import('../vector-geometry.js');

function inflateSourceModel(project, snapshotId) {
  const snapshot = project.snapshots.find((item) => item.id === snapshotId);
  assert.ok(snapshot, 'Expected published pre-release History snapshot');
  const compact = project.sharedModels[snapshot.state.modelRef];
  assert.ok(compact, 'Snapshot must reference a real immutable source Model');
  const model = structuredClone(compact);
  model.boundary = structuredClone(project.sharedGeometries[model.boundaryRef]);
  delete model.boundaryRef;
  model.regions = model.regions.map((region) => {
    const geom = structuredClone(project.sharedGeometries[region.geomRef]);
    const expanded = { ...region, geom };
    delete expanded.geomRef;
    return expanded;
  });
  return model;
}

function stackAt(model, xy) {
  return model.regions.find((region) => pointInMulti(xy, region.geom))?.stack || [];
}

function materialVolume(model, layerId) {
  return model.regions.reduce(
    (sum, region) =>
      sum +
      geometryArea(region.geom) *
        region.stack.reduce(
          (height, segment) => height + (segment.layerId === layerId ? segment.z1 - segment.z0 : 0),
          0,
        ),
    0,
  );
}

test('published M07 Microdisk selectively releases Si under the 148/82 um mask', async () => {
  const file = new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url);
  const project = JSON.parse(await readFile(file, 'utf8'));
  const releaseStep = project.processRecipe.steps.find(
    (step) => step.id === 'recipe-process-microdisk-08',
  );
  assert.ok(releaseStep, 'Published release step must exist');
  assert.equal(releaseStep.params.target, 'Silicon substrate');
  assert.equal(releaseStep.params.face, 'front');
  assert.equal(releaseStep.params.thicknessUm, 36);
  assert.equal(releaseStep.params.profile, 'isotropic');
  assert.equal(releaseStep.params.area, 'invert');
  const outlinePoints = project.layout.elements.flatMap((element) => element.points || []);
  for (const radius of [148, 82]) {
    assert.ok(
      outlinePoints.some(([x, y]) => Math.abs(x - radius) < 1e-6 && Math.abs(y) < 1e-6),
      'The published GDS mask must retain the real ' + radius + ' um radial landmark',
    );
  }

  const preRelease = inflateSourceModel(project, 'snapshot-microdisk-07');
  assert.deepEqual(preRelease.layers.map((layer) => layer.id), [
    'base', 'layer-1', 'layer-2', 'layer-3',
  ]);
  assert.ok(
    preRelease.regions.every((region) =>
      region.stack.every((segment) => segment.layerId === 'base' || segment.layerId === 'layer-1')),
    'Both temporary photoresists must be fully stripped before Si release',
  );
  assert.ok(stackAt(preRelease, [110, 0]).some((s) => s.layerId === 'layer-1'));
  assert.ok(stackAt(preRelease, [0, 0]).some((s) => s.layerId === 'layer-1'));
  assert.ok(stackAt(preRelease, [175, 0]).every((s) => s.layerId !== 'layer-1'));

  const oxideBefore = materialVolume(preRelease, 'layer-1');
  const siliconBefore = materialVolume(preRelease, 'base');
  const originalProjectModel = JSON.stringify(project.model);
  const originalHistory = JSON.stringify(project.snapshotBranches);
  const adaptive = structuredClone(preRelease);
  const result = applyOperation(adaptive, {
    type: 'etch',
    etchProfile: 'isotropic',
    etchTargetLayerIds: ['base'],
    thickness: 36,
    face: 'front',
    area: adaptive.boundary,
    isotropicLateralErrorUm: 0.25,
  });
  assert.equal(result.changed, true, result.error || 'Real M07 release must change Si');

  const shielded = stackAt(adaptive, [110, 0]);
  const hub = stackAt(adaptive, [0, 0]);
  assert.ok(
    shielded.some((s) => s.layerId === 'layer-1'),
    'Silica annulus must remain',
  );
  assert.ok(
    shielded.some((s) => s.layerId === 'base' && s.z1 < 40),
    'Si must laterally undercut the originally oxide-covered disk',
  );
  assert.ok(
    hub.some((s) => s.layerId === 'base' && s.z1 === 40),
    'Central support must not be silently removed by 36 um release',
  );
  const siliconAfter = materialVolume(adaptive, 'base');
  const oxideAfter = materialVolume(adaptive, 'layer-1');
  assert.ok(siliconAfter > 0 && siliconAfter < siliconBefore, 'Only a finite Si volume releases');
  assert.ok(oxideBefore > 0, 'Source oxide mass must be finite');
  assert.ok(
    Math.abs(oxideAfter - oxideBefore) <= oxideBefore * 1e-6,
    'Selective XeF2 release must conserve the original silica volume within 1 ppm',
  );

  assert.equal(JSON.stringify(project.model), originalProjectModel);
  assert.equal(JSON.stringify(project.snapshotBranches), originalHistory);
  assert.notDeepEqual(
    adaptive.regions,
    inflateSourceModel(project, 'snapshot-microdisk-08').regions,
    'Opt-in result must not silently replace the original M08 eight-band snapshot',
  );
});
