// Exact Microdisk M07: compare native Main/Section/3D geometry against the
// same canonical analytic material at identical physical XY coordinates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { expandProjectStorage } = await import('../project-io.js');
const { attachContinuousEtchModel, validateContinuousEtchModel } =
  await import('../continuous-etch-model.js');
const { continuousOwnerColumnAtXY } = await import('../continuous-material-owner.js');
const { continuousSectionContours } = await import('../continuous-etch-section.js');
const { buildContinuousSiHeightfieldMesh } = await import('../continuous-heightfield-mesh.js');
const { createContinuousPlanSampler } = await import('../continuous-etch-plan.js');

const source = expandProjectStorage(
  JSON.parse(
    readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
  ),
).snapshots.find((entry) => entry.id === 'snapshot-microdisk-07')?.state?.model;
assert.ok(source, 'Use the published real M07 predecessor, not a synthetic approximation');

function triangleZ(positions, triangle, x, y) {
  const i = triangle * 9;
  const ax = positions[i],
    ay = positions[i + 1];
  const bx = positions[i + 3],
    by = positions[i + 4];
  const cx = positions[i + 6],
    cy = positions[i + 7];
  const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(determinant) < 1e-10) return null;
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / determinant;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / determinant;
  const c = 1 - a - b;
  if (a < -1e-7 || b < -1e-7 || c < -1e-7) return null;
  return a * positions[i + 2] + b * positions[i + 5] + c * positions[i + 8];
}

function meshTopAt(mesh, x, y, bounds) {
  const { nx, ny } = mesh.grid;
  const dx = (bounds.maxX - bounds.minX) / nx;
  const dy = (bounds.maxY - bounds.minY) / ny;
  const ix = Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.minX) / dx)));
  const iy = Math.min(ny - 1, Math.max(0, Math.floor((y - bounds.minY) / dy)));
  let top = -Infinity;
  // Includes neighbouring cells when the Slice meets an XY mesh-grid edge.
  for (let j = Math.max(0, iy - 1); j <= Math.min(ny - 1, iy + 1); j++) {
    for (let i = Math.max(0, ix - 1); i <= Math.min(nx - 1, ix + 1); i++) {
      for (let k = 0; k < 2; k++) {
        const z = triangleZ(mesh.positions, (j * nx + i) * 2 + k, x, y);
        if (z !== null) top = Math.max(top, z);
      }
    }
  }
  assert.ok(Number.isFinite(top), `No actual 3D mesh surface covers XY (${x},${y})`);
  return top;
}

function sectionTopAt(contours, t) {
  let top = -Infinity;
  for (const poly of contours)
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [t0, z0] = ring[i],
          [t1, z1] = ring[i + 1];
        if (Math.abs(t1 - t0) < 1e-12) continue;
        if (t < Math.min(t0, t1) - 1e-10 || t > Math.max(t0, t1) + 1e-10) continue;
        const f = (t - t0) / (t1 - t0);
        top = Math.max(top, z0 + f * (z1 - z0));
      }
    }
  assert.ok(Number.isFinite(top), `No native Section polygon covers t=${t}`);
  return top;
}

const stats = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    rms: Math.sqrt(values.reduce((sum, e) => sum + e * e, 0) / values.length),
    p95: sorted[Math.ceil(values.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};

test('real Microdisk M07 matches canonical material, native Section and physical 3D mesh on one Slice', () => {
  const model = attachContinuousEtchModel(source, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  const original = JSON.stringify(model);
  const owner = validateContinuousEtchModel(model);
  const sectionA = [-170, 0],
    sectionB = [170, 0];
  const si = continuousSectionContours(model, sectionA, sectionB).find(
    (part) => part.layerId === 'base',
  );
  assert.ok(si?.polys.length, 'Native Section must display released silicon');
  const mesh = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
  const main = createContinuousPlanSampler(model, 'front');
  const bounds = {
    minX: -source.width / 2,
    maxX: source.width / 2,
    minY: -source.height / 2,
    maxY: source.height / 2,
  };
  const meshError = [],
    sectionError = [],
    crossError = [];
  const materialCounts = new Set();
  const worst = [];
  for (let x = -159.63; x <= 159.63; x += 3.7) {
    const columns = continuousOwnerColumnAtXY(owner, [x, 0]);
    const siSegments = columns.filter((part) => part.layerId === 'base');
    assert.ok(siSegments.length, `Expected continuous Si under the Microdisk Slice at ${x}`);
    const expected = Math.max(...siSegments.map((part) => part.z1));
    const actualMesh = meshTopAt(mesh, x, 0, bounds);
    const actualSection = sectionTopAt(si.polys, (x - sectionA[0]) / (sectionB[0] - sectionA[0]));
    worst.push({
      x: Number(x.toFixed(3)),
      analytic: Number(expected.toFixed(4)),
      mesh: Number(actualMesh.toFixed(4)),
      section: Number(actualSection.toFixed(4)),
      sectionError: Number(Math.abs(actualSection - expected).toFixed(4)),
    });
    meshError.push(Math.abs(actualMesh - expected));
    sectionError.push(Math.abs(actualSection - expected));
    crossError.push(Math.abs(actualMesh - actualSection));
    const mainSample = main([x, 0]);
    const front = columns.at(-1);
    assert.equal(mainSample?.layerId, front?.layerId, `Main physical material mismatch at x=${x}`);
    assert.ok(Math.abs(mainSample.z - front.z1) <= 1e-7);
    materialCounts.add(mainSample.layerId);
  }
  const result = {
    samples: meshError.length,
    meshVsOwner: stats(meshError),
    sectionVsOwner: stats(sectionError),
    meshVsSection: stats(crossError),
  };
  console.log('Continuous M07 cross-view exact XY/Z witness: ' + JSON.stringify(result));
  console.log(
    'Worst Section x: ' +
      JSON.stringify(worst.toSorted((a, b) => b.sectionError - a.sectionError).slice(0, 10)),
  );
  assert.ok(meshError.length >= 80);
  assert.ok(materialCounts.has('layer-1') && materialCounts.has('base'));
  assert.ok(result.meshVsOwner.max < 0.8, '3D display error exceeds source mesh sampling contract');
  assert.ok(result.sectionVsOwner.max < 0.2, 'Section display deviates from exact material');
  assert.ok(result.meshVsSection.max < 0.85, 'Same Slice differs between Section and 3D');
  assert.equal(
    JSON.stringify(model),
    original,
    'Cross-view inspection must not change physical geometry',
  );
});
