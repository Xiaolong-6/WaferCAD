import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleBuriedInterfaceProjection } from '../renderer-v3-projection-probe.js';

const instances = Array.from({ length: 625 }, () => [0, 0]);
const owner = () => ({
  layerId: 'buried-metal',
  buried: true,
  instanceTranslations: instances,
  parts: [
    { p: [0, 0], q: [0.2, 0], z0: 0, z1: 0.1 },
    { p: [0, 0], q: [4, 0], z0: 0, z1: 0.1 },
  ],
});
const screen = ([x, , z]) => [x, z];
const camera = {
  viewportWidth: 200,
  viewportHeight: 200,
  project: screen,
  maxOwners: 4,
  maxPartsPerOwner: 2,
  maxInstancesPerOwner: 3,
};

test('projected owner sample uses display-Z transform and preserves source geometry', () => {
  const source = [owner()];
  const before = structuredClone(source);
  const exact = sampleBuriedInterfaceProjection(source, { ...camera, displayZScale: 1 });
  const exaggerated = sampleBuriedInterfaceProjection(source, {
    ...camera,
    displayZScale: 100,
  });
  assert.deepEqual(source, before);
  assert.equal(exact.valid, true);
  assert.equal(exact.mode, 'observe-only');
  assert.equal(exact.reason, 'sampled');
  assert.equal(exact.analyzedOwners, 1);
  assert.equal(exact.sampledQuads, 6);
  assert.equal(exact.projectedQuads, 6);
  assert.equal(exact.subpixelQuads, 3);
  assert.equal(exaggerated.subpixelQuads, 0);
  assert.equal(exaggerated.projectedHeightMaxPx, 10);
  assert.equal(exaggerated.rawOwnerTriangleUpperBound, 2 * 625 * 4);
  assert.equal(exaggerated.skippedTriangles, 0);
  assert.equal(exaggerated.eligibleForReduction, false);
});

test('Section collapse hides sample slabs without falsely allowing geometric reduction', () => {
  const result = sampleBuriedInterfaceProjection([owner()], {
    ...camera,
    visibleIntervals: () => [],
  });
  assert.equal(result.valid, true);
  assert.equal(result.sampledQuads, 0);
  assert.equal(result.collapsedOrInvalidSamples, 2);
  assert.equal(result.eligibleForReduction, false);
  assert.equal(result.skippedTriangles, 0);
});

test('ROI, rough and exterior owners cannot enter the smooth buried sample', () => {
  const source = [
    { ...owner(), buried: false },
    { ...owner(), instanceTranslations: [[0, 0]] },
    { ...owner(), parts: [{ ...owner().parts[0], upperSurface: { appearance: { kind: 'rough' } } }] },
  ];
  const result = sampleBuriedInterfaceProjection(source, camera);
  assert.equal(result.reason, 'no-buried-smooth-array-owners');
  assert.equal(result.analyzedOwners, 0);
  assert.equal(result.sampledQuads, 0);
});

test('invalid viewport/projector fail closed and all outputs remain diagnostic only', () => {
  for (const props of [
    { viewportHeight: 0 },
    { viewportWidth: Infinity },
    { displayZScale: NaN },
    { project: null },
    { maxOwners: 0 },
    { maxPartsPerOwner: 100000 },
    { maxInstancesPerOwner: -1 },
  ]) {
    const result = sampleBuriedInterfaceProjection([owner()], { ...camera, ...props });
    assert.equal(result.valid, false, JSON.stringify(props));
    assert.equal(result.skippedTriangles, 0);
  }
  const behindCamera = sampleBuriedInterfaceProjection([owner()], {
    ...camera,
    project: () => null,
  });
  assert.equal(behindCamera.sampledQuads, 6);
  assert.equal(behindCamera.projectedQuads, 0);
  assert.equal(behindCamera.eligibleForReduction, false);
});

test('offscreen samples are reported, never removed and do not count as subpixel', () => {
  const result = sampleBuriedInterfaceProjection(
    [{ ...owner(), instanceTranslations: Array.from({ length: 625 }, () => [-200, 0]) }],
    camera,
  );
  assert.equal(result.projectedQuads, 6);
  assert.equal(result.offscreenQuads, 6);
  assert.equal(result.subpixelQuads, 0);
  assert.equal(result.skippedTriangles, 0);
});


test('Z-collapse with two surviving intervals samples both exposed wall fragments', () => {
  const result = sampleBuriedInterfaceProjection([owner()], {
    ...camera,
    visibleIntervals: () => [[0, 0.04], [0.06, 0.1]],
  });
  assert.equal(result.valid, true);
  assert.equal(result.sampledQuads, 12);
  assert.equal(result.projectedQuads, 12);
  assert.equal(result.eligibleForReduction, false);
  assert.equal(result.skippedTriangles, 0);
});
