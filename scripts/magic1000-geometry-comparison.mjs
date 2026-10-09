// Physical material occupancy comparison, independent of Region IDs / XY partition order.
// For every material and vertical slab, compare the union of its XY footprints.
import assert from 'node:assert/strict';
import { loadGeometryKernel } from './process-benchmarks.mjs';

function close(a, b, tol = 1e-8) {
  return Math.abs(a - b) <= tol;
}
function sortedCuts(cuts) {
  const result = [];
  for (const z of cuts.sort((a, b) => a - b)) {
    if (!Number.isFinite(z)) throw new Error('Nonfinite process Z plane');
    if (!result.length || !close(z, result.at(-1))) result.push(z);
  }
  return result;
}
function occupancy(model) {
  const result = new Map();
  const byId = new Map((model.layers || []).map((l) => [l.id, l.name]));
  assert.equal(
    new Set(byId.values()).size,
    byId.size,
    'Duplicate layer names make geometry comparison ambiguous',
  );
  for (const region of model.regions || []) {
    for (const segment of region.stack || []) {
      const name = byId.get(segment.layerId);
      assert.ok(name, 'Unresolved material layer: ' + segment.layerId);
      if (!result.has(name)) result.set(name, []);
      result.get(name).push({ z0: segment.z0, z1: segment.z1, geom: region.geom });
    }
  }
  return result;
}
function footprint(slabs, mid, vectorApi) {
  const parts = slabs.filter((s) => s.z0 <= mid && s.z1 > mid).map((s) => s.geom);
  return parts.length ? vectorApi.unionGeometries(parts) : [];
}

/**
 * Verify that two 2.5D models occupy exactly the same material at every
 * process Z interval and across every XY polygon, up to Boolean precision.
 * Unlike layer names, total volume or region count checks, this detects
 * misplaced vias, buried seams, lost nanometre films and missing metal.
 */
export async function assertSameMaterialGeometry(expected, actual, options = {}) {
  await loadGeometryKernel();
  const vectorApi = await import('../site/vector-geometry.js');
  const { geometryArea } = await import('../site/model.js');
  assert.deepEqual(
    [actual.shape, actual.width, actual.height, actual.thickness],
    [expected.shape, expected.width, expected.height, expected.thickness],
    'Base geometry changed during Run All',
  );
  const e = occupancy(expected),
    a = occupancy(actual);
  assert.deepEqual([...a.keys()].sort(), [...e.keys()].sort(), 'Material names differ');
  let slabsChecked = 0,
    maxMismatchAreaUm2 = 0;
  const areaAbsTolerance = options.areaToleranceUm2 ?? 1e-7;
  for (const [name, eSegments] of e) {
    const aSegments = a.get(name);
    const cuts = sortedCuts([...eSegments, ...aSegments].flatMap((s) => [s.z0, s.z1]));
    for (let i = 0; i < cuts.length - 1; i++) {
      const z0 = cuts[i],
        z1 = cuts[i + 1];
      if (z1 - z0 < 1e-8) continue;
      const mid = (z0 + z1) / 2;
      const eg = footprint(eSegments, mid, vectorApi);
      const ag = footprint(aSegments, mid, vectorApi);
      const missing = geometryArea(vectorApi.difference(eg, ag));
      const extra = geometryArea(vectorApi.difference(ag, eg));
      const eArea = geometryArea(eg),
        aArea = geometryArea(ag);
      const tolerance = Math.max(areaAbsTolerance, 1e-9 * Math.max(eArea, aArea));
      const mismatch = missing + extra;
      maxMismatchAreaUm2 = Math.max(maxMismatchAreaUm2, mismatch);
      assert.ok(
        mismatch <= tolerance,
        name +
          ' Z [' +
          z0 +
          ', ' +
          z1 +
          '] µm: physical XY mismatch, missing=' +
          missing +
          ' µm², extra=' +
          extra +
          ' µm² (tolerance=' +
          tolerance +
          ')',
      );
      slabsChecked++;
    }
  }
  // Verify the saved annotated regions too; these describe D/E doping,
  // and cannot be silently lost when the file is reconstructed.
  assert.equal(
    (actual.electricalRegions || []).length,
    (expected.electricalRegions || []).length,
    'Electrical annotations changed',
  );
  for (let i = 0; i < (expected.electricalRegions || []).length; i++) {
    const x = expected.electricalRegions[i],
      y = actual.electricalRegions[i];
    assert.deepEqual(
      [y.name, y.thickness, y.regionType, y.source],
      [x.name, x.thickness, x.regionType, x.source],
      'Electrical annotation metadata changed',
    );
    assert.equal(y.patches.length, x.patches.length, 'Electrical region patch count changed');
  }
  return { verified: true, slabsChecked, materialCount: e.size, maxMismatchAreaUm2 };
}
