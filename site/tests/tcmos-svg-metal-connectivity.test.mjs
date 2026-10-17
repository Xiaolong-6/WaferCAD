// Connectivity of the *approved vector SVG*, not superseded raster rectangles.
// An XY continuous conductor is not proof of an ohmic semiconductor contact.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readTcmosReferenceMask } from '../../scripts/tcmos-svg-mask.mjs';
import { buildTcmosInverter } from '../../scripts/build-tcmos-inverter-example.mjs';
import { createTcmosArrayPatch } from '../../scripts/build-tcmos-array-patch.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const geometry = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const NAMES = ['VIN', 'VOUT', 'VDD', 'GND'];
const POLYGON = (points) => [[points.concat([points[0]])]];
const midpoint = (points) => [
  (Math.min(...points.map((point) => point[0])) +
    Math.max(...points.map((point) => point[0]))) / 2,
  (Math.min(...points.map((point) => point[1])) +
    Math.max(...points.map((point) => point[1]))) / 2,
];
const cover = (outer, inner) =>
  geometryArea(geometry.difference(POLYGON(inner), POLYGON(outer))) < 1e-12;

test('approved SVG: all 218 CNTs are fully covered by exactly one metal and a semiconductor/gate host', () => {
  const groups = readTcmosReferenceMask();
  const metal = groups.find((group) => group.name === 'METAL1').shapes;
  const contacts = groups.find((group) => group.name === 'CNT').shapes;
  const active = groups.find((group) => group.name === 'ACTIVE').shapes;
  const poly = groups.find((group) => group.name === 'POLY').shapes;
  assert.equal(metal.length, 4);
  assert.equal(contacts.length, 218);
  assert.deepEqual(metal.map((shape) => shape.points.length), [8, 12, 16, 16]);

  const count = Object.fromEntries(NAMES.map((name) => [name, 0]));
  for (const [index, contact] of contacts.entries()) {
    const owners = metal
      .map((shape, i) => (cover(shape.points, contact.points) ? i : -1))
      .filter((i) => i >= 0);
    assert.equal(owners.length, 1, 'CNT ' + index + ' requires exactly one complete Metal1 cover');
    const activeOwners = active.filter((shape) => cover(shape.points, contact.points));
    const gateOwners = poly.filter((shape) => cover(shape.points, contact.points));
    assert.equal(
      activeOwners.length + gateOwners.length,
      1,
      'CNT ' + index + ' must be fully on exactly one ACTIVE or POLY host',
    );
    if (owners[0] === 0) assert.equal(gateOwners.length, 1, 'VIN only terminates on POLY');
    else assert.equal(activeOwners.length, 1, 'VOUT / supply CNT requires ACTIVE');
    count[NAMES[owners[0]]]++;
  }
  assert.deepEqual(count, { VIN: 8, VOUT: 18, VDD: 96, GND: 96 });

  // Each supply line and its Well Tie must belong to the SAME source SVG
  // polygon. The obsolete raster test reports two disjoint islands; that
  // finding does NOT describe this source-approved SVG.
  for (const [index, source, tie] of [
    [2, [-4.0265, -1.2625], [-5.48, -1.14]],
    [3, [4.0265, -1.2625], [5.48, -1.14]],
  ]) {
    for (const terminal of [source, tie]) {
      assert.ok(
        geometry.pointInMulti(terminal, POLYGON(metal[index].points)),
        NAMES[index] + ': source and well-tie CNT must share one integral metal polygon',
      );
    }
  }
  for (let i = 0; i < metal.length; i++) {
    for (let j = i + 1; j < metal.length; j++) {
      assert.ok(
        geometryArea(geometry.intersection(
          POLYGON(metal[i].points), POLYGON(metal[j].points),
        )) < 1e-12,
        'Approved SVG contains a short between ' + NAMES[i] + ' and ' + NAMES[j],
      );
    }
  }
});

test('all 218 original contacts carry a real METAL1/W interface and a lower geometric material host', async () => {
  const { project } = await buildTcmosInverter({ includeComparison: false });
  const cnt = project.layout.elements.filter((shape) => shape.layer === 10);
  const layerNameById = new Map(project.model.layers.map((layer) => [layer.id, layer.name]));
  const slab = (region, name) => region?.stack.find(
    (segment) => layerNameById.get(segment.layerId) === name,
  );
  assert.equal(cnt.length, 218);
  for (const [index, contact] of cnt.entries()) {
    const [x, y] = midpoint(contact.points);
    const region = project.model.regions.find((part) =>
      geometry.pointInMulti([x, y], part.geom),
    );
    assert.ok(region, 'CNT ' + index + ' must have a physical owner');
    const w = slab(region, 'W contacts');
    const m = slab(region, 'METAL1 Al');
    assert.ok(w && m, 'CNT ' + index + ' must contain W and METAL1 in the 2.5D model');
    assert.ok(
      w.z0 <= m.z1 + 1e-9 && m.z0 <= w.z1 + 1e-9,
      'CNT ' + index + ' lacks W/METAL1 overlap',
    );
    const lower = [
      slab(region, 'POLY gate'),
      slab(region, 'S/D silicide surrogate'),
      slab(region, 'Si (100) substrate; 2 µm display thickness'),
    ].find((part) => part && Math.abs(part.z1 - w.z0) <= 1e-9);
    assert.ok(lower, 'CNT ' + index + ' W lacks lower solid contact interface');
  }
  // This is a geometrical contact-stack audit. No concentration/activation,
  // PN/BTBT current or low-ohmic well contact is inferred.
});

test('4×4 remains sixteen INDEPENDENT inverter nets, not one invented shared bus', async () => {
  const { project: source } = await buildTcmosInverter({ includeComparison: false });
  const { project } = await createTcmosArrayPatch(source);
  const metal = project.layout.elements.filter((shape) => shape.layer === 11);
  assert.equal(metal.length, 4 * 16);
  const bounds = (polygon) => ({
    x0: Math.min(...polygon.points.map(([x]) => x)),
    x1: Math.max(...polygon.points.map(([x]) => x)),
    y0: Math.min(...polygon.points.map(([, y]) => y)),
    y1: Math.max(...polygon.points.map(([, y]) => y)),
  });
  // Inter-cell Metal1 bounding boxes do not touch. This stronger, cheap
  // separation certificate avoids falsely claiming any shared VDD/VIN/VOUT.
  let shortestIntercellGap = Infinity;
  for (let i = 0; i < metal.length; i++) {
    for (let j = i + 1; j < metal.length; j++) {
      if (Math.floor(i / 4) === Math.floor(j / 4)) continue;
      const a = bounds(metal[i]), b = bounds(metal[j]);
      const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
      const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
      shortestIntercellGap = Math.min(shortestIntercellGap, Math.hypot(dx, dy));
      assert.ok(dx > 0 || dy > 0, '4×4 inter-cell METAL1 bounds unexpectedly overlap');
    }
  }
  assert.ok(shortestIntercellGap >= 0.475 - 1e-9);
  assert.equal(project.layout.elements.filter((e) => e.layer === 10).length, 3488);
});
