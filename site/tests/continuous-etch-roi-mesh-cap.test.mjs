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
const { createModel } = await import('../model.js');
const { attachContinuousEtchModel, validateContinuousEtchModel } =
  await import('../continuous-etch-model.js');
const { buildContinuousSiHeightfieldMesh } = await import('../continuous-heightfield-mesh.js');
const { buildExactFilmComponents, exactUnetchedFilmCandidates } =
  await import('../continuous-exact-film-mesh.js');
const { clipContinuousSurfaceToRect } = await import('../continuous-etch-roi-mesh.js');
const { buildContinuousRectMeshCaps } = await import('../continuous-etch-roi-mesh-cap.js');
const { expandProjectStorage } = await import('../project-io.js');

// Structural closure must use exactly the same display vertex precision as
// Float32 Three.js positions. A positive cap-triangle count proves nothing.
function openEdges(parts) {
  const counts = new Map();
  const winding = new Map();
  const vertex = (position) => position.map((value) => Math.round(value * 1e4)).join(':');
  for (const { positions } of parts) {
    for (let k = 0; k < positions.length; k += 9) {
      const triangle = Array.from({ length: 3 }, (_, i) =>
        vertex(Array.from(positions.slice(k + i * 3, k + i * 3 + 3))),
      );
      for (let i = 0; i < 3; i++) {
        const a = triangle[i],
          b = triangle[(i + 1) % 3];
        const edge = [a, b].sort().join('|');
        counts.set(edge, (counts.get(edge) || 0) + 1);
        winding.set(edge, (winding.get(edge) || 0) + (a < b ? 1 : -1));
      }
    }
  }
  return {
    boundary: [...counts.values()].filter((count) => count === 1).length,
    nonmanifold: [...counts.values()].filter((count) => count !== 2 && count !== 1).length,
    wrongWinding: [...winding.values()].filter((sum) => sum !== 0).length,
  };
}

function verifyClosed(meshes, bounds) {
  for (const part of meshes) {
    if (!part.positions.length) continue;
    const input = Array.from(part.positions);
    const cropped = clipContinuousSurfaceToRect(part, bounds);
    const caps = buildContinuousRectMeshCaps(THREE, [cropped], bounds);
    assert.deepEqual(Array.from(part.positions), input, 'ROI must not modify source mesh');
    if (!cropped.triangles) continue; // This disconnected film shell lies outside ROI.
    assert.ok(caps.length > 0 && caps[0].triangles > 0, 'Expected real cut surfaces');
    for (const material of [cropped, ...caps]) {
      for (let k = 0; k < material.positions.length; k += 3) {
        const [x, y, z] = material.positions.slice(k, k + 3);
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
        assert.ok(x >= bounds.minX - 1e-4 && x <= bounds.maxX + 1e-4);
        assert.ok(y >= bounds.minY - 1e-4 && y <= bounds.maxY + 1e-4);
      }
    }
    const after = openEdges([cropped, ...caps]);
    assert.equal(after.boundary, 0, `${part.layerId}: open ROI cut faces`);
    assert.equal(after.nonmanifold, 0, `${part.layerId}: nonmanifold ROI cut faces`);
    assert.equal(after.wrongWinding, 0, `${part.layerId}: inconsistent outward mesh winding`);
  }
}

test('Full-face base continuous release remains manifold after centered rectangular ROI', () => {
  const base = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const model = attachContinuousEtchModel(base, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 2,
    verticalUm: 2,
    shape: 'circular',
  });
  const mesh = buildContinuousSiHeightfieldMesh(validateContinuousEtchModel(model), {
    xyStepUm: 1,
  });
  verifyClosed([mesh], { minX: -6, minY: -5, maxX: 6, maxY: 5 });
});

test('Real Microdisk material shells close at centered and off-centre ROI boundaries', () => {
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const source = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model;
  const model = attachContinuousEtchModel(source, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  const original = JSON.stringify(model);
  const owner = validateContinuousEtchModel(model);
  const parts = [buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 })];
  for (const [layerId, { geom, z0, z1 }] of exactUnetchedFilmCandidates(owner)) {
    const film = buildExactFilmComponents(THREE, geom, z0, z1);
    for (const mesh of film.parts) parts.push({ ...mesh, layerId });
  }
  for (const bounds of [
    { minX: -170, minY: 0, maxX: 170, maxY: 75 },
    { minX: -90, minY: -20, maxX: 90, maxY: 60 },
    // This ROI meets a native SiO2 sidewall at x=-5 um. The previous mesh
    // crop kept that face and added overlapping cap triangles: one edge had
    // four incident triangles despite the original source mesh being closed.
    { minX: -75, minY: 56, maxX: -5, maxY: 114 },
  ])
    verifyClosed(parts, bounds);
  assert.equal(JSON.stringify(model), original, 'ROI inspection cannot modify exact material');
});
