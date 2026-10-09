import assert from 'node:assert/strict';
import test from 'node:test';
import { buriedInterfaceSubpixelBudget } from '../renderer-v3-screen-budget.js';

const translated = Array.from({ length: 625 }, (_, index) => [index * 10, 0]);
const smoothInterior = (overrides = {}) => ({
  layerId: 'buried',
  buried: true,
  instanceTranslations: translated,
  parts: [
    { p: [0, 0], q: [1, 0], z0: 0.02, z1: 0.04 },
    { p: [1, 0], q: [1, 1], z0: 0.02, z1: 0.52 },
  ],
  ...overrides,
});
const farOptions = {
  farTier: true,
  unitsPerPixel: 0.1,
  viewZFraction: 0.9,
};

test('observe-only far camera budget records only smooth buried subpixel wall instances', () => {
  const owner = smoothInterior();
  const before = structuredClone(owner);
  const result = buriedInterfaceSubpixelBudget([owner], farOptions);
  assert.deepEqual(owner, before, 'canonical owner and physical Z may never be mutated');
  assert.equal(result.mode, 'observe-only');
  assert.equal(result.qualified, true);
  assert.equal(result.candidates, 1);
  assert.equal(result.instanceWallSegments, 625);
  assert.equal(result.rawTwoPassTriangleEstimate, 2500);
  assert.ok(Math.abs(result.smallestSpanPixels - 0.2) < 1e-10);
  assert.equal(result.skippedTriangles, 0, 'phase A never alters visible geometry');
});

test('ROI, collapse, edge-on, near, invalid camera or excessive error budgets fail closed', () => {
  for (const overrides of [
    { farTier: false },
    { clipped: true },
    { zCollapsed: true },
    { viewZFraction: 0.34 },
    { viewZFraction: NaN },
    { viewZFraction: 1.01 },
    { unitsPerPixel: 0 },
    { unitsPerPixel: Infinity },
    { maxPixelSpan: 0.51 },
    { maxPixelSpan: -1 },
  ]) {
    const result = buriedInterfaceSubpixelBudget([smoothInterior()], {
      ...farOptions,
      ...overrides,
    });
    assert.equal(result.qualified, false, JSON.stringify(overrides));
    assert.equal(result.candidates, 0);
    assert.equal(result.skippedTriangles, 0);
  }
});

test('exterior, rough, unique and invalid sidewalls cannot enter candidate budget', () => {
  const smooth = smoothInterior();
  const invalid = [
    smoothInterior({ buried: false }),
    smoothInterior({ instanceTranslations: [[0, 0]] }),
    smoothInterior({
      parts: [
        {
          p: [0, 0],
          q: [1, 0],
          z0: 0.02,
          z1: 0.04,
          lowerSurface: { appearance: { kind: 'rough' } },
        },
      ],
    }),
    smoothInterior({ parts: [{ z0: 1, z1: 1 }] }),
    smoothInterior({ parts: [{ z0: NaN, z1: 0.02 }] }),
    { buried: true, parts: smooth.parts },
  ];
  const r = buriedInterfaceSubpixelBudget(invalid, farOptions);
  assert.equal(r.qualified, true);
  assert.equal(r.candidates, 0);
});

test('thickness must be bounded in physical units; oblique camera cannot hide a thick wall', () => {
  const r = buriedInterfaceSubpixelBudget(
    [
      smoothInterior({
        parts: [{ p: [0, 0], q: [1, 0], z0: 0, z1: 0.06 }],
      }),
    ],
    { ...farOptions, viewZFraction: 0.999 },
  );
  assert.equal(r.candidates, 0);
  assert.equal(r.rawTwoPassTriangleEstimate, 0);
});
