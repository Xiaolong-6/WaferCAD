import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { expandProjectStorage } = await import('../project-io.js');
const meshGeometry = await import('../rough-mesh-geometry.js');
const surface = await import('../surface-rendering.js');

test('Photodetector rough conformal geometry retains a 50 nm film', async () => {
  const url = new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url);
  const stored = JSON.parse(await readFile(url, 'utf8'));
  const { model } = expandProjectStorage(stored);
  const region = model.regions.find((item) => item.id === 'region-113');
  assert.ok(region, 'Missing Black-Si active region');

  const silicon = region.stack.find((layer) => layer.layerId === 'base');
  const ald = region.stack.find((layer) => layer.layerId === 'layer-3');
  const frontImplant = model.implants.find((item) => item.face === 'front');
  const implant = frontImplant?.patches.find((patch) => patch.surfaceAppearance?.kind === 'rough');
  assert.ok(silicon?.frontSurface && ald?.frontSurface && implant?.surfaceAppearance);
  assert.deepEqual(ald.frontSurface, silicon.frontSurface);
  assert.deepEqual(implant.surfaceAppearance, silicon.frontSurface);
  assert.equal(silicon.frontSurface.morphology, 'stochastic-v2');
  assert.equal(ald.z0, silicon.z1);

  const thickness = ald.z1 - silicon.z1;
  assert.ok(Math.abs(thickness - 0.05) < 1e-10, 'ALD must remain 50 nm');

  const a = [2492, -3, 0];
  const b = [2498, -3, 0];
  const c = [2498, 3, 0];
  const d = [2492, 3, 0];
  const triangles = [
    [a, b, c],
    [a, c, d],
  ];
  const zone = {
    baseTriangles: triangles,
    edges: meshGeometry.roughBoundaryEdgesFromTriangles(triangles),
    maxEdge: Math.hypot(6, 6),
    triangleBudget: 128,
    lodContext: { distance: 15, viewportWidth: 1100, viewportHeight: 800, maxDepth: 3 },
  };
  const lodZones = [zone];

  // This covers matching-LOD vertices; independently triangulated LODs
  // still require a separate continuous interior spacing test.
  for (const [mode, blend] of [
    ['macro', 0.12],
    ['resolved-micro', 1],
  ]) {
    const appearance = { ...silicon.frontSurface, displayRoughBlend: blend };
    const implantAppearance = { ...implant.surfaceAppearance, displayRoughBlend: blend };
    const lower = meshGeometry.roughMeshDataFromPreparedCap({
      z: silicon.z1,
      normal: 1,
      appearance,
      closeToIdeal: false,
      gpuDisplacement: false,
      lodZones,
    });
    const upper = meshGeometry.roughMeshDataFromPreparedCap({
      z: ald.z1,
      normal: 1,
      appearance,
      closeToIdeal: false,
      gpuDisplacement: false,
      lodZones,
    });

    assert.ok(lower.positions.length > 0, mode);
    assert.equal(lower.positions.length, upper.positions.length);
    for (let i = 0; i < lower.positions.length; i += 3) {
      const x = lower.positions[i];
      const y = lower.positions[i + 1];
      const gap = upper.positions[i + 2] - lower.positions[i + 2];
      const materialOffset = surface.roughDisplayProfileOffsetAtPoint(x, y, appearance);
      const implantOffset = surface.roughDisplayProfileOffsetAtPoint(x, y, implantAppearance);
      assert.equal(upper.positions[i], x);
      assert.equal(upper.positions[i + 1], y);
      assert.ok(Math.abs(gap - thickness) < 2e-5, mode + ': coating gap');
      assert.equal(materialOffset, implantOffset, mode + ': implant profile');
      if (blend === 1) {
        const physicalOffset = surface.roughProfileOffsetAtPoint(x, y, silicon.frontSurface);
        assert.equal(materialOffset, physicalOffset);
      }
    }
  }
});

test('Photodetector independent rough LOD keeps 50 nm gap at common XY', async (t) => {
  const url = new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url);
  const { model } = expandProjectStorage(JSON.parse(await readFile(url, 'utf8')));
  const region = model.regions.find((item) => item.id === 'region-113');
  assert.ok(region);
  const silicon = region.stack.find((layer) => layer.layerId === 'base');
  const ald = region.stack.find((layer) => layer.layerId === 'layer-3');
  const thickness = ald.z1 - silicon.z1;
  assert.ok(Math.abs(thickness - 0.05) < 1e-10);

  const triangles = [
    [
      [2492, -3, 0],
      [2498, -3, 0],
      [2498, 3, 0],
    ],
    [
      [2492, -3, 0],
      [2498, 3, 0],
      [2492, 3, 0],
    ],
  ];
  const baseZone = {
    baseTriangles: triangles,
    edges: meshGeometry.roughBoundaryEdgesFromTriangles(triangles),
    bounds: { minX: 2492, maxX: 2498, minY: -3, maxY: 3 },
    maxEdge: Math.hypot(6, 6),
  };
  const lodContext = {
    distance: 15,
    viewportWidth: 1100,
    viewportHeight: 800,
    fovDegrees: 34,
    visibleFraction: 1,
    roiFraction: 1,
    screenPriority: 1,
    maxDepth: 4,
    roughnessDetail: 1,
  };
  const interpolate = (mesh, x, y) => {
    const p = mesh.positions;
    for (let i = 0; i + 8 < p.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(i, i + 9);
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-10) continue;
      const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      const c = 1 - a - b;
      if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) {
        return a * az + b * bz + c * cz;
      }
    }
    throw new Error(`Sample (${x}, ${y}) is outside the rough cap`);
  };
  const sampleGap = (lower, upper) => {
    let maximumDeviation = 0;
    let minimumGap = Infinity;
    for (let ix = 0; ix < 11; ix++) {
      for (let iy = 0; iy < 11; iy++) {
        // Interior, nonvertex barycentric samples on the actual tessellated
        // triangles: matching boundary endpoints alone cannot pass this.
        const x = 2492 + (6 * (ix + 0.37)) / 11;
        const y = -3 + (6 * (iy + 0.61)) / 11;
        const gap = interpolate(upper, x, y) - interpolate(lower, x, y);
        minimumGap = Math.min(minimumGap, gap);
        maximumDeviation = Math.max(maximumDeviation, Math.abs(gap - thickness));
      }
    }
    return { minimumGap, maximumDeviation };
  };

  for (const [mode, blend] of [
    ['macro', 0.12],
    ['micro', 1],
  ]) {
    const appearance = { ...silicon.frontSurface, displayRoughBlend: blend };
    const caps = [
      { appearance, z: silicon.z1, normal: 1, profileNormal: 1 },
      {
        appearance: { ...ald.frontSurface, displayRoughBlend: blend },
        z: ald.z1,
        normal: 1,
        profileNormal: 1,
      },
    ];
    const requests = caps.map((cap) => ({
      cap,
      appearance: cap.appearance,
      zone: { ...baseZone, lodContext: { ...lodContext } },
    }));
    const makeMesh = (index) =>
      meshGeometry.roughMeshDataFromPreparedCap({
        z: caps[index].z,
        normal: 1,
        appearance: caps[index].appearance,
        closeToIdeal: false,
        analyticNormals: false,
        lodZones: [requests[index].zone],
      });

    const allocations = [8, 512];
    requests.forEach((request, index) => {
      request.zone.triangleBudget = allocations[index];
    });
    const initial = sampleGap(makeMesh(0), makeMesh(1));
    assert.ok(
      initial.maximumDeviation > 2e-5,
      `${mode}: unequal LOD must reproduce a measurable interpolation mismatch`,
    );
    assert.equal(surface.synchronizeConformalRoughLods(requests, allocations), 2);
    assert.ok(
      requests.reduce((sum, request) => sum + request.zone.triangleBudget, 0) <=
        allocations.reduce((sum, budget) => sum + budget, 0),
      'conformal synchronization must not increase allocated triangle budgets',
    );
    const lower = makeMesh(0);
    const upper = makeMesh(1);
    assert.equal(lower.positions.length, upper.positions.length, mode);
    const resolved = sampleGap(lower, upper);
    assert.ok(
      resolved.maximumDeviation < 2e-5 && resolved.minimumGap > 0,
      `${mode}: common-XY film must stay positive and within existing tolerance: ${JSON.stringify(resolved)}`,
    );
    t.diagnostic(
      `${mode} common-XY gap: unequal-LOD deviation ${initial.maximumDeviation} um; shared-LOD deviation ${resolved.maximumDeviation} um; min gap ${resolved.minimumGap} um`,
    );
  }
});
