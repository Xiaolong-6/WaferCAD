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

const project = expandProjectStorage(
  JSON.parse(readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url))),
);
const model = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model;
const owner = {
  sourceModel: model,
  fronts: exposedSurfaceGroups(model, {
    face: 'front',
    clip: model.boundary,
    preserveOppositeZ: false,
  }).filter((p) => p.layerId === 'base').map((p) => ({
    seedGeom: p.geom,
    seedZ: p.z,
    layerId: p.layerId,
    face: 'front',
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  })),
};

function closed(mesh) {
  const positions = mesh.positions, counts = new Map();
  const vertex = (i) => [0, 1, 2].map((j) => Math.round(positions[i + j] * 1e4)).join(',');
  for (let i = 0; i < positions.length; i += 9) {
    const vertices = [vertex(i), vertex(i + 3), vertex(i + 6)];
    for (let edge = 0; edge < 3; edge++) {
      const a = vertices[edge], b = vertices[(edge + 1) % 3];
      const label = [a, b].sort().join('|');
      const current = counts.get(label) || { count: 0, winding: 0 };
      current.count++;
      current.winding += a < b ? 1 : -1;
      counts.set(label, current);
    }
  }
  assert.ok(counts.size);
  assert.equal([...counts.values()].filter((v) => v.count !== 2 || v.winding !== 0).length, 0);
}

function topAt(mesh, x) {
  const positions = mesh.positions;
  let top = -Infinity;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-9) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * -cy) / det;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * cy) / det;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    top = Math.max(top, u * az + v * bz + (1 - u - v) * cz);
  }
  return top;
}

test('real M07 analytic Si retains the hidden outer rise and center pedestal', () => {
  const original = JSON.stringify(model);
  assert.equal(canBuildContinuousSiHeightfield(owner), true);
  const mesh = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
  closed(mesh);
  for (const [x, expected] of [
    [0, 40],
    [45, 5.706],
    [60, 4.349],
    [115, 25.59],
    [145, 4.125],
    [175, 4],
  ]) assert.ok(Math.abs(topAt(mesh, x) - expected) < 0.75, `Silicon top at ${x} um drifted`);
  assert.ok(topAt(mesh, 115) - topAt(mesh, 60) > 18);
  assert.equal(JSON.stringify(model), original);
});

test('real four-opening oxide retains nine exact closed shell components', () => {
  const original = JSON.stringify(model);
  const films = exactUnetchedFilmCandidates(owner);
  assert.deepEqual([...films.keys()], ['layer-1']);
  const { geom, z0, z1 } = films.get('layer-1');
  const result = buildExactFilmComponents(THREE, geom, z0, z1);
  assert.equal(result.capComponents, 9);
  assert.equal(result.triangles, 3404);
  assert.ok(Math.abs(result.z1 - result.z0 - 1.8) < 1e-9);
  for (const part of result.parts) closed(part);
  assert.equal(JSON.stringify(model), original);
});

test('a vertical etch cliff must never use the smooth heightfield shortcut', () => {
  const vertical = structuredClone(owner);
  vertical.fronts[0].shape = 'vertical';
  assert.equal(canBuildContinuousSiHeightfield(vertical), false);
});
