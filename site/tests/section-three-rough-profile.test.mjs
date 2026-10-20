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
