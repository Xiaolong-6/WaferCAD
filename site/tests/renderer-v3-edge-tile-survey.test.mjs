import assert from 'node:assert/strict';
import test from 'node:test';
import { buriedInterfaceEdgeTileSurvey } from '../renderer-v3-edge-tile-survey.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const smooth = (layerId = 'layer-6') => ({
  layerId,
  buried: true,
  instanceTranslations: Array.from({ length: 128 }, (_, i) => [i * 0.000001, 0]),
  parts: [
    { p: [0, 0], q: [0.002, 0], z0: 0, z1: 0.002 },
    { p: [0, 0], q: [0.3, 0], z0: 0, z1: 0.002 },
  ],
});
const camera = {
  viewProjectionMatrix: identity,
  viewportWidth: 200,
  viewportHeight: 200,
  farTier: true,
  tileInstances: 64,
};

test('complete template edge x spatial tile bounds are conservative and source immutable', () => {
  const owners = [smooth()];
  const original = structuredClone(owners);
  const r = buriedInterfaceEdgeTileSurvey(owners, camera);
  assert.deepEqual(owners, original);
  assert.equal(r.valid, true);
  assert.equal(r.reductionGate, 'alpha-coverage-unverified');
  assert.equal(r.studiedOwners, 1);
  assert.equal(r.projectedBounds, 4);
  assert.equal(r.subpixelBounds, 2);
  assert.equal(r.offscreenBounds, 0);
  assert.equal(r.uncertainBounds, 0);
  assert.equal(r.topOwners[0].visibleFragments, 2);
  assert.equal(r.representedRawTwoPassTriangles, 1024);
  assert.equal(r.subpixelRawTwoPassUpperBound, 512);
  assert.equal(r.skippedTriangles, 0);
});

test('amplified Section Z projected with tilted camera cannot create false subpixel candidates', () => {
  const tilted = [...identity];
  tilted[9] = 1;
  const basis = { ...camera, viewProjectionMatrix: tilted };
  const base = buriedInterfaceEdgeTileSurvey([smooth()], basis);
  const boosted = buriedInterfaceEdgeTileSurvey([smooth()], {
    ...basis,
    displayZScale: 100,
    zCollapsed: true,
  });
  assert.equal(base.subpixelBounds, 2);
  assert.equal(boosted.subpixelBounds, 0);
  assert.equal(boosted.reductionGate, 'z-collapse');
  assert.equal(boosted.skippedTriangles, 0);
});

test('two surviving Section intervals are counted independently, not hidden or silently dropped', () => {
  const r = buriedInterfaceEdgeTileSurvey([smooth()], {
    ...camera,
    visibleIntervals: () => [
      [0, 0.0005],
      [0.0015, 0.002],
    ],
    zCollapsed: true,
  });
  assert.equal(r.projectedBounds, 8);
  assert.equal(r.topOwners[0].visibleFragments, 4);
  assert.equal(r.subpixelBounds, 4);
  assert.equal(r.reductionGate, 'z-collapse');
});

test('buried mixed rough owners are rejected as complete groups', () => {
  const rough = smooth();
  rough.parts[0].upperSurface = { appearance: { kind: 'rough' } };
  const outside = { ...smooth(), buried: false };
  const r = buriedInterfaceEdgeTileSurvey([rough, outside, smooth()], camera);
  assert.equal(r.studiedOwners, 1);
  assert.equal(r.excludedOwners, 1);
  assert.equal(r.projectedBounds, 4);
});

test('near-camera clip crossings are explicitly uncertain, not offscreen', () => {
  const wFromZ = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
  const r = buriedInterfaceEdgeTileSurvey([smooth()], {
    ...camera,
    viewProjectionMatrix: wFromZ,
  });
  assert.equal(r.projectedBounds, 4);
  assert.equal(r.uncertainBounds, 4);
  assert.equal(r.subpixelBounds, 0);
});

test('whole segment tile outside the viewport is recorded without actual culling', () => {
  const outside = smooth();
  outside.instanceTranslations = outside.instanceTranslations.map(() => [2, 0]);
  const r = buriedInterfaceEdgeTileSurvey([outside], camera);
  assert.equal(r.offscreenBounds, 4);
  assert.equal(r.subpixelBounds, 0);
  assert.equal(r.skippedTriangles, 0);
});

test('ROI, near and edge-on are fail-closed transparency gates', () => {
  for (const [overrides, reason] of [
    [{ farTier: false }, 'not-far'],
    [{ clipped: true }, 'roi'],
    [{ edgeOn: true }, 'edge-on'],
  ]) {
    const r = buriedInterfaceEdgeTileSurvey([smooth()], { ...camera, ...overrides });
    assert.equal(r.reductionGate, reason);
    assert.equal(r.skippedTriangles, 0);
  }
});

test('hard budget marks overflow rather than treating the subset as complete', () => {
  const r = buriedInterfaceEdgeTileSurvey([smooth(), smooth('layer-12')], {
    ...camera,
    maxOwners: 2,
    maxProjectedBounds: 1,
  });
  assert.equal(r.studiedOwners, 1);
  assert.equal(r.projectedBounds, 1);
  assert.ok(r.workOverflow > 0);
  assert.equal(r.skippedTriangles, 0);
});

test('invalid projector parameters cannot be called valid data', () => {
  for (const options of [
    { viewProjectionMatrix: [1, 2] },
    { viewportWidth: 0 },
    { displayZScale: Infinity },
    { tileInstances: 0 },
    { maxProjectedBounds: 200001 },
    { subpixelThreshold: 1 },
    { mapZ: null },
  ]) {
    const r = buriedInterfaceEdgeTileSurvey([smooth()], { ...camera, ...options });
    assert.equal(r.valid, false, JSON.stringify(options));
    assert.equal(r.skippedTriangles, 0);
  }
});
