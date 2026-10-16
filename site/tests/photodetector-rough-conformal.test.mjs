import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { expandProjectStorage } = await import('../project-io.js');
const { roughBoundaryEdgesFromTriangles, roughMeshDataFromPreparedCap } = await import(
  '../rough-mesh-geometry.js'
);
const { roughDisplayProfileOffsetAtPoint, roughProfileOffsetAtPoint } = await import(
  '../surface-rendering.js'
);

test('Photodetector 50 nm rough ALD and following implant preserve a shared front profile', async () => {
  const stored = JSON.parse(
    await readFile(
      new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
      'utf8',
    ),
  );
  const { model } = expandProjectStorage(stored);
  const active = model.regions.find((region) => region.id === 'region-113');
  assert.ok(active, 'Black-Si active region must exist');
  const silicon = active.stack.find((layer) => layer.layerId === 'base');
  const ald = active.stack.find((layer) => layer.layerId === 'layer-3');
  const implant = model.implants
    .find((entry) => entry.face === 'front')
    ?.patches.find((patch) => patch.surfaceAppearance?.kind === 'rough');

  assert.ok(silicon?.frontSurface && ald?.frontSurface && implant?.surfaceAppearance);
  assert.deepEqual(ald.frontSurface, silicon.frontSurface);
  assert.deepEqual(implant.surfaceAppearance, silicon.frontSurface);
  assert.equal(ald.z0, silicon.z1, 'ALD must begin at the rough Si front interface');
  const thickness = ald.z1 - silicon.z1;
  assert.ok(Math.abs(thickness - 0.05) < 1e-10, 'ALD physical thickness must remain 50 nm');

  const p = [2492, -3, 0],
    q = [2498, -3, 0],
    r = [2498, 3, 0],
    s = [2492, 3, 0],
    triangles = [
      [p, q, r],
      [p, r, s],
    ],
    edges = roughBoundaryEdgesFromTriangles(triangles),
    lodZones = [
      {
        baseTriangles: triangles,
        edges,
        maxEdge: Math.hypot(6, 6),
        triangleBudget: 128,
        lodContext: { distance: 15, viewportWidth: 1100, viewportHeight: 800, maxDepth: 3 },
      },
    ];

  // This tests matching-LOD vertex displacement, not interpolated gaps between
  // independently tessellated caps at unequal LOD. The latter needs its own oracle.
  for (const [mode, blend] of [
    ['macro', 0.12],
    ['resolved-micro', 1],
  ]) {
    const appearance = { ...silicon.frontSurface, displayRoughBlend: blend },
      implantAppearance = { ...implant.surfaceAppearance, displayRoughBlend: blend },
      mesh = (z) =>
        roughMeshDataFromPreparedCap({
          z,
          normal: 1,
          appearance,
          closeToIdeal: false,
          gpuDisplacement: false,
          lodZones,
        }),
      lower = mesh(silicon.z1),
      upper = mesh(ald.z1);

    assert.ok(lower.positions.length > 0, mode + ': nonempty detailed mesh');
    assert.equal(lower.positions.length, upper.positions.length);
    for (let i = 0; i < lower.positions.length; i += 3) {
      const x = lower.positions[i],
        y = lower.positions[i + 1],
        gap = upper.positions[i + 2] - lower.positions[i + 2],
        materialOffset = roughDisplayProfileOffsetAtPoint(x, y, appearance),
        implantOffset = roughDisplayProfileOffsetAtPoint(x, y, implantAppearance);
      assert.equal(upper.positions[i], x, mode + ': matched x tessellation');
      assert.equal(upper.positions[i + 1], y, mode + ': matched y tessellation');
      assert.ok(
        Math.abs(gap - thickness) < 2e-5,
        mode + ': Float32 vertex coating gap changed by ' + (gap - thickness) + ' um',
      );
      assert.equal(materialOffset, implantOffset, mode + ': implant display profile divergence');
      if (blend === 1)
        assert.equal(
          materialOffset,
          roughProfileOffsetAtPoint(x, y, silicon.frontSurface),
          'Resolved display must preserve the canonical physical morphology',
        );
    }
  }
});
