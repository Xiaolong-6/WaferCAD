import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel, layerById, recolorLayer, renameLayer, surfaceSegment } =
  await import('../model.js');
const { difference, intersection, isEmpty, pointInMulti, rectMulti } =
  await import('../vector-geometry.js');
const { materialSolidsFromTopology, ownedMaterialSurfacesFromTopology, sectionSlicesFromTopology } =
  await import('../process-topology.js');

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

test('Conformal Extend joins top, sidewall and low film with finite contacts in Section and 3D topology', () => {
  for (const face of ['front', 'back']) {
    const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 10 });
    const seed = applyOperation(model, {
      type: 'add',
      name: 'Ridge seed',
      thickness: 2,
      face,
      area: rectMulti(4, 10),
      growth: 'direct',
    });
    assert.equal(seed.changed, true, face + ': create exposed ridge');

    const result = applyOperation(model, {
      type: 'grow',
      targetLayerId: seed.layerId,
      thickness: 1,
      face,
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(result.changed, true, face + ': extend ridge');

    const at = (x) => {
      const region = regionAt(model, [x, 0]);
      assert.ok(region, face + ': no region at x=' + x);
      const film = region.stack.find((segment) => segment.layerId === seed.layerId);
      assert.ok(film, face + ': no continuous film at x=' + x);
      return film;
    };
    const upper = at(1.5),
      wall = at(2.5),
      lower = at(3.5),
      expected =
        face === 'front'
          ? { upper: [5, 8], wall: [5, 8], lower: [5, 6], cornerZ: 7.5 }
          : { upper: [-8, -5], wall: [-8, -5], lower: [-6, -5], cornerZ: -7.5 };
    assert.deepEqual([upper.z0, upper.z1], expected.upper);
    assert.deepEqual([wall.z0, wall.z1], expected.wall);
    assert.deepEqual([lower.z0, lower.z1], expected.lower);
    assert.equal(wall.role, 'conformal-sidewall');

    const sharedHeight = (a, b) => Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(sharedHeight(upper, wall) >= 1 - 1e-8, face + ': top-wall face contact');
    assert.ok(sharedHeight(wall, lower) >= 1 - 1e-8, face + ': wall-low face contact');

    // The newly grown upper corner must have one finite-width XY solid,
    // rather than two polygons meeting only at an isolated cross-section point.
    const solid = materialSolidsFromTopology(model).find((item) => item.layerId === seed.layerId);
    assert.ok(solid);
    const cornerSlab = solid.slabs.find(
      (slab) => slab.z0 < expected.cornerZ && slab.z1 > expected.cornerZ,
    );
    assert.ok(cornerSlab, face + ': missing connected top-corner solid');
    assert.equal(cornerSlab.polys.length, 1, face + ': disconnected upper corner');
    assert.ok(pointInMulti([1.5, 0], cornerSlab.polys));
    assert.ok(pointInMulti([2.5, 0], cornerSlab.polys));

    const sectionWall = sectionSlicesFromTopology(model, [-5, 0], [5, 0]).find(
      (slice) =>
        slice.layerId === seed.layerId &&
        slice.role === 'conformal-sidewall' &&
        slice.t0 < 0.75 &&
        slice.t1 > 0.75,
    );
    assert.ok(sectionWall, face + ': Section must retain the physical wall');
    assert.deepEqual([sectionWall.z0, sectionWall.z1], expected.wall);

    // The 3D owner must not draw an artificial wall through the same material
    // at the x=2 join; its external wall belongs at x=3 instead.
    const plan = ownedMaterialSurfacesFromTopology(model);
    const onVertical = (item, x) =>
      item.layerId === seed.layerId &&
      Math.abs(item.p[0] - x) < 1e-7 &&
      Math.abs(item.q[0] - x) < 1e-7 &&
      item.z0 < expected.cornerZ &&
      item.z1 > expected.cornerZ;
    assert.equal(
      plan.sidewalls.filter((item) => onVertical(item, 2)).length,
      0,
      face + ': spurious internal 3D seam at top-wall join',
    );
    assert.ok(
      plan.sidewalls.some((item) => onVertical(item, 3)),
      face + ': missing outer 3D wall',
    );
  }
});
