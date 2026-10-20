import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;
const { expandProjectStorage } = await import('../project-io.js');
const { exposedSurfaceGroups } = await import('../process-topology.js');
const { buildContinuousSiHeightfieldMesh, canBuildContinuousSiHeightfield } =
  await import('../continuous-heightfield-mesh.js');
const { buildExactFilmComponents, exactUnetchedFilmCandidates } =
  await import('../continuous-exact-film-mesh.js');
const file = JSON.parse(
  readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
);
const p = expandProjectStorage(file);
const model = p.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model;
const exposed = exposedSurfaceGroups(model, {
  face: 'front',
  clip: model.boundary,
  preserveOppositeZ: false,
}).filter((s) => s.layerId === 'base');
const owner = {
  sourceModel: model,
  fronts: exposed.map((s) => ({
    seedGeom: s.geom,
    seedZ: s.z,
    face: 'front',
    layerId: 'base',
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  })),
};

function verifyEdges(part) {
  const pos = part.positions;
  const counts = new Map();
  const point = (i) => Array.from(pos.slice(i, i + 3), (v) => Math.round(v * 1e4)).join(',');
  for (let i = 0; i < pos.length; i += 9) {
    const tri = [point(i), point(i + 3), point(i + 6)];
    for (let e = 0; e < 3; e++) {
      const a = tri[e],
        b = tri[(e + 1) % 3];
      const id = [a, b].sort().join('|');
      const entry = counts.get(id) || { count: 0, winding: 0 };
      entry.count++;
      entry.winding += a < b ? 1 : -1;
      counts.set(id, entry);
    }
  }
  assert.ok(counts.size > 0);
  assert.equal([...counts.values()].filter((v) => v.count !== 2 || v.winding !== 0).length, 0);
}
function topAt(mesh, x, y = 0) {
  const pos = mesh.positions;
  let upper = -Infinity;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    upper = Math.max(upper, u * az + v * bz + (1 - u - v) * cz);
  }
  return upper;
}
test('M07 continuous Si mesh retains pedestal, residual outer rise and cavity', () => {
  const original = JSON.stringify(model);
  assert.equal(canBuildContinuousSiHeightfield(owner), true);
  const mesh = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
  verifyEdges(mesh);
  for (const [x, z] of [
    [0, 40],
    [45, 5.706],
    [60, 4.349],
    [115, 25.59],
    [145, 4.125],
    [175, 4],
  ]) {
    assert.ok(Math.abs(topAt(mesh, x) - z) < 0.75, `Physical Si top at ${x} um drifted`);
  }
  assert.ok(topAt(mesh, 115) - topAt(mesh, 60) > 18);
  assert.equal(JSON.stringify(model), original);
});
test('M07 exact SiO2 keeps all four openings as nine manifold film shells', () => {
  const untouched = JSON.stringify(model);
  const flat = exactUnetchedFilmCandidates(owner);
  assert.deepEqual([...flat.keys()], ['layer-1']);
  const { geom, z0, z1 } = flat.get('layer-1');
  const film = buildExactFilmComponents(THREE, geom, z0, z1);
  assert.equal(film.capComponents, 9);
  assert.equal(film.triangles, 3404);
  assert.ok(Math.abs(film.z1 - film.z0 - 1.8) < 1e-9);
  for (const part of film.parts) verifyEdges(part);
  assert.equal(JSON.stringify(model), untouched);
});
test('non-analytic vertical step must retain generic display path', () => {
  const other = structuredClone(owner);
  other.fronts[0].shape = 'vertical';
  assert.equal(canBuildContinuousSiHeightfield(other), false);
});
