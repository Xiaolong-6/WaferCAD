import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, processBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { conformalCarrierXYScale, createModel } = await import('../model.js');
const { difference, intersection, isEmpty, pointInMulti, rectMulti } =
  await import('../vector-geometry.js');
const { materialSolids, sectionContours, solidBorders, surfaceGroups } =
  await import('../model-view-geometry.js');

function area(polys) {
  const signed = (ring) =>
    ring.slice(1).reduce((a, p, i) => a + ring[i][0] * p[1] - ring[i][1] * p[0], 0) / 2;
  return polys.reduce(
    (sum, poly) =>
      sum +
      Math.abs(signed(poly[0])) -
      poly.slice(1).reduce((sum, ring) => sum + Math.abs(signed(ring)), 0),
    0,
  );
}
function sameFootprint(a, b) {
  assert.equal(isEmpty(difference(a, b)), true);
  assert.equal(isEmpty(difference(b, a)), true);
}

test('arbitrary XY and Z partitions do not create visible material seams', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const layerId = model.regions[0].stack[0].layerId;
  model.regions = [
    {
      geom: rectMulti(10, 20, -5),
      stack: [
        { layerId, z0: -5, z1: 0 },
        { layerId, z0: 0, z1: 5 },
      ],
    },
    { geom: rectMulti(10, 20, 5), stack: [{ layerId, z0: -5, z1: 5 }] },
  ];
  const before = structuredClone(model);
  for (const face of ['front', 'back']) {
    const surfaces = surfaceGroups(model, face);
    assert.equal(surfaces.length, 1);
    sameFootprint(surfaces[0].geom, model.boundary);
  }
  const contours = sectionContours(model, [-9, 0], [9, 0]);
  assert.equal(contours.length, 1);
  sameFootprint(contours[0].polys, rectMulti(1, 10, 0.5));
  const [solid] = materialSolids(model);
  assert.equal(solid.caps.length, 2);
  assert.deepEqual(
    solid.caps.map((cap) => cap.z),
    [-5, 5],
  );
  for (const cap of solid.caps) sameFootprint(cap.polys, model.boundary);
  for (const [a, b] of solidBorders(solid)) {
    if (a[2] === b[2]) assert.ok(a[2] === -5 || a[2] === 5);
    else assert.ok(Math.abs(a[0]) === 10 && Math.abs(a[1]) === 10);
  }
  assert.deepEqual(model, before);
});

for (const face of ['front', 'back']) {
  for (const kind of ['step', 'trench', 'island']) {
    test(`${kind} ${face}: continuous boundaries preserve true steps and material interfaces`, async () => {
      const { model, layerId, section } = await processBenchmark(kind, 'conformal', face);
      const before = structuredClone(model);
      const contours = sectionContours(model, section.a, section.b);
      const solids = materialSolids(model);
      assert.equal(contours.find((c) => c.layerId === layerId).polys.length, 1);
      // Independently sample material identity throughout the section, including deep
      // substrate where the reported false vertical lines used to appear.
      for (let x = -8.75; x < 9; x += 0.5)
        for (let z = -8.25; z < 8.5; z += 0.5) {
          const expected = model.regions
            .find((r) => pointInMulti([x, 0], r.geom))
            ?.stack.find((s) => z > s.z0 && z < s.z1)?.layerId;
          const actual = contours.find((c) => pointInMulti([(x + 9) / 18, z], c.polys))?.layerId;
          assert.equal(actual, expected);
        }
      for (const solid of solids) {
        for (const cap of solid.caps) {
          const neighbor = solid.slabs.find((slab) =>
            cap.normal > 0 ? slab.z0 === cap.z : slab.z1 === cap.z,
          );
          assert.equal(
            isEmpty(intersection(cap.polys, neighbor?.polys || [])),
            true,
            'no internal horizontal material faces',
          );
        }
      }
      const volume = solids
        .find((s) => s.layerId === layerId)
        .slabs.reduce((sum, s) => sum + area(s.polys) * (s.z1 - s.z0), 0);
      const lateral = conformalCarrierXYScale(model);
      const expectedVolume =
        kind === 'step'
          ? 400 + 40 * lateral
          : kind === 'trench'
            ? 400 + 80 * lateral
            : 400 + 2 * (16 * lateral + Math.PI * lateral ** 2);
      assert.ok(Math.abs(volume - expectedVolume) < 0.05);
      const clip = rectMulti(8, 8);
      for (const solid of materialSolids(model, clip))
        for (const slab of solid.slabs) assert.equal(isEmpty(difference(slab.polys, clip)), true);
      assert.deepEqual(model, before);
    });
  }
}

test('same color does not erase distinct materials, holes or separated islands', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const left = rectMulti(4, 4, -5),
    right = rectMulti(4, 4, 5);
  const hole = rectMulti(2, 2, -5);
  model.regions = [
    { geom: difference(left, hole), stack: [{ layerId: 'a', z0: -5, z1: 5 }] },
    { geom: right, stack: [{ layerId: 'b', z0: -5, z1: 5 }] },
  ];
  assert.equal(surfaceGroups(model).length, 2);
  const solids = materialSolids(model);
  assert.equal(solids.length, 2);
  assert.equal(solids[0].caps[0].polys[0].length, 2);
  assert.equal(solidBorders(solids[0]).length, 24);
  const contours = sectionContours(model, [-9, 0], [9, 0]);
  assert.equal(contours.length, 2);
  assert.equal(contours[0].polys.length, 2);
});
