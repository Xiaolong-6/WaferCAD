import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel, layerById, recolorLayer, renameLayer, surfaceSegment } =
  await import('../model.js');
const { difference, intersection, isEmpty, pointInMulti, rectMulti } =
  await import('../vector-geometry.js');

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}

test('Direct/conformal growth and material topology contracts', () => {
  const area = rectMulti(4, 4);

  const direct = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const d = applyOperation(direct, {
    type: 'add',
    name: 'D',
    thickness: 2,
    face: 'front',
    area,
    growth: 'direct',
  });
  assert.notEqual(surfaceSegment(regionAt(direct, [2.5, 0]).stack).layerId, d.layerId);

  const conformal = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const c = applyOperation(conformal, {
    type: 'add',
    name: 'C',
    thickness: 2,
    face: 'front',
    area,
    growth: 'conformal',
  });
  assert.notEqual(
    surfaceSegment(regionAt(conformal, [2.5, 0]).stack).layerId,
    c.layerId,
    'A flat mask boundary must stay hard-clipped even for conformal deposition',
  );

  const maskedConformal = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const maskedFilm = applyOperation(maskedConformal, {
    type: 'add',
    name: 'Masked conformal',
    thickness: 1,
    face: 'front',
    area: rectMulti(4, 20),
    growth: 'conformal',
  });
  assert.equal(surfaceSegment(regionAt(maskedConformal, [0, 0]).stack).layerId, maskedFilm.layerId);
  assert.equal(
    regionAt(maskedConformal, [2.5, 0]).stack.some(
      (segment) => segment.layerId === maskedFilm.layerId,
    ),
    false,
    'Conformal deposition must not wrap around an artificial mask edge',
  );

  const maskedConformalStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(maskedConformalStep, {
    type: 'add',
    name: 'Inner ridge',
    thickness: 2,
    face: 'front',
    area: rectMulti(2, 20),
    growth: 'direct',
  });
  const maskedStepFilm = applyOperation(maskedConformalStep, {
    type: 'add',
    name: 'Masked conformal over step',
    thickness: 1,
    face: 'front',
    area: rectMulti(8, 20),
    growth: 'conformal',
  });
  const maskedPhysicalSide = regionAt(maskedConformalStep, [1.5, 0]).stack.find(
    (segment) => segment.layerId === maskedStepFilm.layerId,
  );
  assert.equal(maskedPhysicalSide?.role, 'conformal-sidewall');
  assert.equal(maskedPhysicalSide?.z0, 5);
  assert.equal(maskedPhysicalSide?.z1, 8);
  assert.equal(
    regionAt(maskedConformalStep, [4.5, 0]).stack.some(
      (segment) => segment.layerId === maskedStepFilm.layerId,
    ),
    false,
    'Masked conformal coating must remain hard-clipped at the selected area boundary',
  );

  const directStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(directStep, {
    type: 'add',
    name: 'Ridge',
    thickness: 2,
    face: 'front',
    area: rectMulti(4, 20),
    growth: 'direct',
  });
  const directBlanket = applyOperation(directStep, {
    type: 'add',
    name: 'Direct blanket',
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'direct',
  });
  const directSide = regionAt(directStep, [2.5, 0]).stack.find(
    (segment) => segment.layerId === directBlanket.layerId,
  );
  assert.equal(directSide.z0, 5);
  assert.equal(directSide.z1, 6);

  const conformalStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(conformalStep, {
    type: 'add',
    name: 'Ridge',
    thickness: 2,
    face: 'front',
    area: rectMulti(4, 20),
    growth: 'direct',
  });
  const conformalBlanket = applyOperation(conformalStep, {
    type: 'add',
    name: 'Conformal blanket',
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'conformal',
  });
  const conformalSide = regionAt(conformalStep, [2.5, 0]).stack.find(
    (segment) => segment.layerId === conformalBlanket.layerId,
  );
  assert.equal(conformalSide.z0, 5);
  assert.equal(conformalSide.z1, 8);
  const conformalFlat = regionAt(conformalStep, [4, 0]).stack.find(
    (segment) => segment.layerId === conformalBlanket.layerId,
  );
  assert.equal(conformalFlat.z0, 5);
  assert.equal(conformalFlat.z1, 6);

  const conformalGrowStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const conformalGrowSeed = applyOperation(conformalGrowStep, {
    type: 'add',
    name: 'Grow seed',
    thickness: 2,
    face: 'front',
    area: rectMulti(4, 20),
    growth: 'direct',
  });
  applyOperation(conformalGrowStep, {
    type: 'grow',
    targetLayerId: conformalGrowSeed.layerId,
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'conformal',
  });
  const conformalGrowSide = regionAt(conformalGrowStep, [2.5, 0]).stack.find(
    (segment) => segment.layerId === conformalGrowSeed.layerId,
  );
  assert.equal(conformalGrowSide.z0, 5);
  assert.equal(conformalGrowSide.z1, 8);
  assert.equal(conformalGrowSide.role, 'conformal-sidewall');
  assert.equal(surfaceSegment(regionAt(conformalGrowStep, [0, 0]).stack).z1, 8);
  assert.deepEqual(
    regionAt(conformalGrowStep, [4, 0]).stack.find(
      (segment) => segment.layerId === conformalGrowSeed.layerId,
    ),
    { layerId: conformalGrowSeed.layerId, z0: 5, z1: 6 },
  );

  const buriedGrow = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const buriedSeed = applyOperation(buriedGrow, {
    type: 'add',
    name: 'Seed',
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'direct',
  });
  applyOperation(buriedGrow, {
    type: 'add',
    name: 'Cap',
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'direct',
  });
  const buriedRevision = buriedGrow.revision;
  const buriedProcessRevision = buriedGrow.processRevision;
  const buriedResult = applyOperation(buriedGrow, {
    type: 'grow',
    targetLayerId: buriedSeed.layerId,
    thickness: 1,
    face: 'front',
    area: rectMulti(20, 20),
    growth: 'direct',
  });
  assert.equal(buriedResult.changed, false);
  assert.match(buriedResult.error, /not exposed/);
  assert.equal(buriedGrow.revision, buriedRevision);
  assert.equal(buriedGrow.processRevision, buriedProcessRevision);

  assert.equal(renameLayer(conformal, c.layerId, 'Contact'), true);
  assert.equal(layerById(conformal, c.layerId).name, 'Contact');
  assert.equal(recolorLayer(conformal, c.layerId, '#55aacc'), true);
  assert.equal(layerById(conformal, c.layerId).color, '#55aacc');
  assert.ok(conformal.processRevision > 0);

  const full = rectMulti(20, 20),
    inside = intersection(full, area),
    outside = difference(full, area);
  assert.equal(isEmpty(inside), false);
  assert.equal(pointInMulti([0, 0], outside), false);
  assert.equal(pointInMulti([7, 0], outside), true);

  const circle = createModel({ shape: 'circle', width: 20, height: 20, thickness: 10 });
  assert.ok(circle.boundary[0][0].length > 100);
  assert.equal(pointInMulti([0, 0], circle.boundary), true);
  assert.equal(pointInMulti([10.1, 0], circle.boundary), false);
});
