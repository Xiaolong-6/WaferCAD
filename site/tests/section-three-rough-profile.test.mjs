import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { expandProjectStorage } = await import('../project-io.js');
const {
  roughDisplayHeightBlend,
  roughDisplayProfileOffsetAtPoint,
  roughProfileOffsetAtPixelFootprint,
  roughProfileOffsetAtPoint,
} = await import('../surface-rendering.js');
const { createCollapsedZDisplayTransform } = await import('../section-z-collapse.js');
const { threeZDisplayScale } = await import('../three-z-display.js');

const source = JSON.parse(
  await readFile(
    new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
  ),
);
const { model } = expandProjectStorage(source);
const region = model.regions.find((item) => item.id === 'region-113');
assert.ok(region, 'Published Photodetector rough fixture must exist');
const si = region.stack.find((item) => item.layerId === 'base');
const oxide = region.stack.find((item) => item.layerId === 'layer-3');
assert.ok(si?.frontSurface && oxide?.frontSurface);
const appearance = si.frontSurface;

function originalSectionFiveTap(x, y, profile, density, ux, uy) {
  if (profile.featureSize * density >= 2) return roughProfileOffsetAtPoint(x, y, profile);
  const half = 0.5 / Math.max(density, 1e-12);
  let sum = 0;
  for (const offset of [-1, -0.5, 0, 0.5, 1]) {
    sum += roughProfileOffsetAtPoint(x + ux * half * offset, y + uy * half * offset, profile);
  }
  return sum / 5;
}

test('Section screen-footprint sampler preserves exact legacy output at two ROI scales and axes', () => {
  const original = JSON.stringify(appearance);
  for (const roi of [240, 6800]) {
    const density = 1100 / roi;
    for (const [ux, uy] of [
      [1, 0],
      [0, 1],
      [0.6, 0.8],
    ]) {
      for (const [x, y] of [
        [2492, -3],
        [2495.123, 0.125],
        [2499.8, 2.75],
      ]) {
        const actual = roughProfileOffsetAtPixelFootprint(x, y, appearance, {
          pixelsPerUm: density,
          unitX: ux,
          unitY: uy,
        });
        assert.equal(actual, originalSectionFiveTap(x, y, appearance, density, ux, uy));
        assert.ok(actual >= 0 && actual <= appearance.etchDepth);
      }
    }
  }
  assert.equal(JSON.stringify(appearance), original);
});

test('Section and 3D share physical heights when resolved; coarse views have explicitly distinct LOD', () => {
  const x = 2495.123,
    y = 0.125,
    original = roughProfileOffsetAtPoint(x, y, appearance);
  for (const [density, pitch] of [
    [1100 / 240, 1.87],
    [1100 / 6800, 48.5],
    [100, 0.01],
  ]) {
    const sectionHeight = roughProfileOffsetAtPixelFootprint(x, y, appearance, {
      pixelsPerUm: density,
    });
    const raw = roughProfileOffsetAtPoint(x, y, appearance);
    const blend = roughDisplayHeightBlend(appearance.featureSize, pitch);
    const previewHeight = roughDisplayProfileOffsetAtPoint(x, y, {
      ...appearance,
      displayRoughBlend: blend,
    });
    assert.ok(sectionHeight >= 0 && sectionHeight <= appearance.etchDepth);
    assert.ok(previewHeight >= 0 && previewHeight <= appearance.etchDepth);
    if (density === 100) {
      assert.equal(sectionHeight, raw);
      assert.equal(previewHeight, raw);
    } else {
      assert.ok(blend < 1, 'Subpixel 3D height LOD must be reported, not mistaken for physics');
    }
  }
  assert.equal(roughProfileOffsetAtPoint(x, y, appearance), original);
});

for (const morphology of ['stochastic', 'stochastic-v2']) {
  test(`Actual 3D cutline audits ${morphology} convergence and conformal registration`, async (t) => {
    const appearance = { ...si.frontSurface, morphology };
    const THREE = await import('three');
    const {
      geometryFromRoughMeshData,
      roughBoundaryEdgesFromTriangles,
      roughMeshDataFromPreparedCap,
    } = await import('../rough-mesh-geometry.js');
    const x0 = 2494.7,
      x1 = 2495.3,
      y0 = -0.3,
      y1 = 0.3;
    const triangles = [
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y1, 0],
      ],
      [
        [x0, y0, 0],
        [x1, y1, 0],
        [x0, y1, 0],
      ],
    ];
    const before = JSON.stringify(region);
    const rms = [];
    for (const depth of morphology === 'stochastic-v2' ? [0, 2, 4, 6] : [0, 2, 4]) {
      const zone = {
        baseTriangles: triangles,
        edges: roughBoundaryEdgesFromTriangles(triangles),
        maxEdge: Math.hypot(x1 - x0, y1 - y0),
        triangleBudget: 2 * 4 ** depth,
        lodContext: {
          distance: 0.1,
          viewportWidth: 1100,
          viewportHeight: 800,
          maxDepth: depth,
        },
      };
      const meshes = [si.z1, oxide.z1].map((z) => {
        const data = roughMeshDataFromPreparedCap({
          z,
          normal: 1,
          appearance,
          closeToIdeal: false,
          gpuDisplacement: false,
          lodZones: [zone],
        });
        assert.equal(data.metadata.roughSubdivisionDepth, depth);
        for (let index = 0; index < data.positions.length; index += 3) {
          const [x, y, height] = data.positions.slice(index, index + 3);
          const sectionHeight =
            z + roughProfileOffsetAtPixelFootprint(x, y, appearance, { pixelsPerUm: 100 });
          assert.ok(
            Math.abs(height - sectionHeight) < 2e-5,
            'Matched Float32 vertices must retain physical Section height',
          );
        }
        return new THREE.Mesh(
          geometryFromRoughMeshData(THREE, data),
          new THREE.MeshBasicMaterial(),
        );
      });
      const ray = new THREE.Raycaster();
      let squared = 0,
        maximum = 0,
        filmError = 0;
      for (let i = 0; i < 65; i++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / 65,
          y = 0.123;
        ray.set(
          new THREE.Vector3(x, y, oxide.z1 + appearance.etchDepth + 1),
          new THREE.Vector3(0, 0, -1),
        );
        const heights = meshes.map((mesh) => {
          const hit = ray.intersectObject(mesh, false)[0];
          assert.ok(hit, 'The physical cutline must hit the rendered cap');
          return hit.point.z;
        });
        const section =
          si.z1 + roughProfileOffsetAtPixelFootprint(x, y, appearance, { pixelsPerUm: 100 });
        const error = Math.abs(heights[0] - section);
        squared += error ** 2;
        maximum = Math.max(maximum, error);
        filmError = Math.max(filmError, Math.abs(heights[1] - heights[0] - (oxide.z1 - si.z1)));
      }
      rms.push(Math.sqrt(squared / 65));
      assert.ok(filmError < 2e-5, `Actual cap-interior film error ${filmError} um`);
      t.diagnostic(
        `cutline refinement ${depth}: RMS ${rms.at(-1)} um; max ${maximum} um; film error ${filmError} um`,
      );
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    if (morphology === 'stochastic-v2') {
      assert.ok(rms[2] < rms[0] / 10, 'Resolved fixed-scale meshes must converge');
      assert.ok(rms[3] < rms[2] / 4, 'Further refinement must keep reducing interpolation error');
      assert.ok(rms[3] < 0.001, 'Resolved cutline RMS must be below 1 nm');
    }
    // Interpolation error is diagnostic, not an accepted pixel/height tolerance.
    // This legacy variable-feature field is not band-limited by featureSize:
    // comparing vertices alone cannot establish interior cross-view acceptance.
    const x = 2495.0123,
      y = 0.123;
    const roundingError = Math.abs(
      roughProfileOffsetAtPoint(x, y, appearance) -
        roughProfileOffsetAtPoint(Math.fround(x), Math.fround(y), appearance),
    );
    t.diagnostic(
      `physical field change after Float32 XY rounding at (${x}, ${y}): ${roundingError} um`,
    );
    assert.equal(
      JSON.stringify(region),
      before,
      'Cutline inspection cannot mutate the Process model',
    );
  });
}

test('Seed-matched conformal interfaces retain 50 nm physical separation at both views and Z factors', () => {
  assert.deepEqual(appearance, oxide.frontSurface);
  const film = oxide.z1 - si.z1;
  assert.ok(Math.abs(film - 0.05) < 1e-10);
  const zMap = createCollapsedZDisplayTransform({
    zMin: si.z0,
    zMax: oxide.z1 + appearance.etchDepth,
    collapse: { enabled: true, top: si.z1 - 0.5, bottom: si.z0 + 0.5 },
    breakFraction: 0,
  });
  for (const roi of [240, 6800]) {
    const density = 1100 / roi;
    for (const x of [2492, 2495.123, 2498.75]) {
      const offset = roughProfileOffsetAtPixelFootprint(x, -1.3, appearance, {
        pixelsPerUm: density,
      });
      const other = roughProfileOffsetAtPixelFootprint(x, -1.3, oxide.frontSurface, {
        pixelsPerUm: density,
      });
      assert.equal(offset, other);
      assert.ok(Math.abs(oxide.z1 + other - (si.z1 + offset) - film) < 1e-10);
      for (const factor of [1, 2, 5, 10]) {
        const scale = threeZDisplayScale(36.97, factor);
        const displayedGap = (zMap.mapZ(oxide.z1 + other) - zMap.mapZ(si.z1 + offset)) * scale;
        assert.ok(Math.abs(displayedGap - film * scale) < 1e-7);
      }
    }
  }
});

test('Photodetector local relief bands keep seeded cap, oxide, implant and sidewall Z ordered', async () => {
  const { createThreeRoughReliefDisplayTransform, threeRoughReliefBands } =
    await import('../three-z-display.js');
  const bands = threeRoughReliefBands(model);
  assert.ok(bands.length > 0 && bands.length <= 16);
  const state = createCollapsedZDisplayTransform({
    zMin: si.z0,
    zMax: oxide.z1 + appearance.etchDepth,
    collapse: { enabled: true, top: si.z1 - 0.5, bottom: si.z0 + 0.5 },
    breakFraction: 0,
  });
  const display = createThreeRoughReliefDisplayTransform(state, bands, 30);
  assert.equal(display.reliefActive, true);
  const modelBefore = JSON.stringify(region);
  for (const [x, y] of [
    [2492, -3],
    [2495.123, -0.4],
    [2498, 3],
  ]) {
    const height = roughDisplayProfileOffsetAtPoint(x, y, {
      ...appearance,
      displayRoughBlend: 0.12,
    });
    const lower = display.mapZ(si.z1 + height);
    const upper = display.mapZ(oxide.z1 + height);
    assert.ok(lower < upper, 'Conformal thickness must retain its sign');
    assert.ok(Math.abs(upper - lower - (oxide.z1 - si.z1) * 30) < 1e-7);
    assert.ok(Number.isFinite(display.mapZ(si.z0)));
    assert.ok(display.mapZ(si.z0) < lower, 'Underlying silicon may not cross top cap');
  }
  assert.equal(JSON.stringify(region), modelBefore, 'Presentation may not mutate Process geometry');
});

test('Legacy profile samples remain fixed and stable-scale increments stay bounded far from origin', () => {
  for (const [x, y, expected] of [
    [0, 0, 0.38579933392208593],
    [2495.0123, 0.123, 0.05073407009054709],
    [2495.0133, 0.123, 0.12885675297740373],
    [-50000, 20000, 0.3018437136383224],
  ])
    assert.equal(roughProfileOffsetAtPoint(x, y, appearance), expected);
  for (const seed of [0, 123, appearance.seed, 0xffffffff]) {
    for (const featureCv of [0, 0.25, 1]) {
      const profile = {
        ...appearance,
        morphology: 'stochastic-v2',
        seed,
        featureCv,
        polarity: 'inverted',
      };
      for (const origin of [0, 2495, -50000, 50000]) {
        for (let i = 0; i < 40; i++) {
          const x = origin + i * 0.037,
            y = 0.123 + i * 0.013;
          const offset = roughProfileOffsetAtPoint(x, y, profile);
          const near = roughProfileOffsetAtPoint(x + profile.featureSize / 1000, y, profile);
          assert.ok(offset >= 0 && offset <= profile.etchDepth);
          assert.ok(
            Math.abs(near - offset) < profile.etchDepth * 0.02,
            'A 1/1000-pitch step cannot introduce origin-amplified spikes',
          );
          assert.ok(
            Math.abs(
              roughProfileOffsetAtPoint(x, y, { ...profile, polarity: 'normal' }) +
                offset -
                profile.etchDepth,
            ) < 1e-12,
          );
        }
      }
    }
  }
});
