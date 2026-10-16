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
