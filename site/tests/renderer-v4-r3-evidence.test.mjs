import assert from 'node:assert/strict';
import test from 'node:test';
import { surveyV4FeatureFootprints } from '../renderer-v4-feature-footprints.js';
import { censusV4SceneResources } from '../renderer-v4-resource-census.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const camera = {
  viewProjectionMatrix: identity,
  viewportWidth: 200,
  viewportHeight: 200,
  farTier: true,
};
const owner = () => ({
  buried: true,
  layerId: 'oxide',
  parts: [{ p: [0, 0], q: [0.002, 0], z0: 0, z1: 0.002 }],
  instanceTranslations: Array.from({ length: 128 }, (_, i) => [(i % 16) * 0.01, 0]),
});

test('R3 measures individual quads, not oversized tiles; physically unchanged', () => {
  const o = [owner()];
  const frozen = structuredClone(o);
  const r = surveyV4FeatureFootprints(o, camera);
  assert.deepEqual(o, frozen);
  assert.equal(r.valid, true);
  assert.equal(r.measuredQuads, 128);
  assert.equal(r.subpixelQuads, 128);
  assert.equal(r.rawTriangleCandidates, 512);
  assert.equal(r.skippedTriangles, 0);
  assert.equal(r.reductionGate, 'alpha-coverage-unverified');
  assert.ok(r.sample.every((px) => px < 0.5));
});

test('ROI, Section and edge-on forbid reduction even for 0.2px features', () => {
  for (const [patch, gate] of [
    [{ clipped: true }, 'roi'],
    [{ zCollapsed: true }, 'z-collapse'],
    [{ edgeOn: true }, 'edge-on'],
    [{ farTier: false }, 'not-far'],
  ]) {
    const r = surveyV4FeatureFootprints([owner()], { ...camera, ...patch });
    assert.equal(r.subpixelQuads, 128);
    assert.equal(r.skippedTriangles, 0);
    assert.equal(r.reductionGate, gate);
  }
});

test('budget overflow is explicit and never extrapolated into face-removal authorization', () => {
  const r = surveyV4FeatureFootprints([owner()], { ...camera, maxQuads: 10 });
  assert.equal(r.measuredQuads, 10);
  assert.equal(r.representedQuads, 128);
  assert.equal(r.workOverflow, 118);
  assert.equal(r.rawTriangleCandidates, 40);
  assert.equal(r.skippedTriangles, 0);
});

test('feature sampling is deterministic and stratified across multiple valid owners', () => {
  const a = owner();
  const b = owner();
  b.layerId = 'second';
  b.instanceTranslations = b.instanceTranslations.map(([x, y]) => [x + 2, y]);
  const report = surveyV4FeatureFootprints([a, b], { ...camera, maxQuads: 10 });
  const repeat = surveyV4FeatureFootprints([a, b], { ...camera, maxQuads: 10 });
  assert.deepEqual(report, repeat);
  assert.equal(report.owners, 2);
  assert.equal(report.sampledOwners, 2);
  assert.equal(report.measuredQuads, 10);
  assert.equal(report.representedQuads, 256);
  assert.equal(report.workOverflow, 246);
  assert.equal(report.subpixelQuads, 5);
  assert.equal(report.offscreenQuads, 5);
  assert.equal(report.skippedTriangles, 0);
});

test('invalid perspective input and near-plane clipping fail closed', () => {
  const bad = surveyV4FeatureFootprints([owner()], {
    ...camera,
    viewProjectionMatrix: [...identity.slice(0, 15), NaN],
  });
  assert.equal(bad.valid, false);
  const nearPlane = surveyV4FeatureFootprints([owner()], {
    ...camera,
    viewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
  });
  assert.equal(nearPlane.nearPlaneUncertainQuads, 128);
  assert.equal(nearPlane.subpixelQuads, 0);
  assert.equal(nearPlane.skippedTriangles, 0);
});

test('rough, NaN, and throwing display transforms cannot yield validated candidates', () => {
  const rough = owner();
  rough.parts[0].upperSurface = { appearance: { kind: 'rough' } };
  const bad = owner();
  bad.instanceTranslations[0] = [NaN, 0];
  const result = surveyV4FeatureFootprints([rough, bad, owner()], { ...camera, maxOwners: 3 });
  assert.equal(result.excludedOwners, 2);
  assert.equal(result.owners, 1);
  const transform = surveyV4FeatureFootprints([owner()], {
    ...camera,
    visibleIntervals: () => {
      throw new Error('invalid section');
    },
  });
  assert.equal(transform.excludedOwners, 1);
  assert.equal(transform.measuredQuads, 0);
});

test('resource census deduplicates shared material, geometry and typed-array identity', () => {
  const sharedArray = new Float32Array(9);
  const attr = { array: sharedArray };
  const geo = { attributes: { position: attr, normal: attr }, index: null };
  const material = {};
  const groupA = {
    children: [
      {
        geometry: geo,
        material,
        isInstancedMesh: true,
        instanceMatrix: { array: new Float32Array(32) },
      },
      { geometry: geo, material },
    ],
  };
  const groupB = { children: [{ geometry: geo, material }] };
  const r = censusV4SceneResources([groupA, groupB]);
  assert.equal(r.valid, true);
  assert.equal(r.complete, true);
  assert.equal(r.groupCount, 2);
  assert.equal(r.meshCount, 3);
  assert.equal(r.geometryCount, 1);
  assert.equal(r.materialCount, 1);
  assert.equal(r.bufferCount, 2);
  assert.equal(r.estimatedBufferBytes, 9 * 4 + 32 * 4);
  assert.equal(r.sharedGeometries, 1);
  assert.equal(r.sharedMaterials, 1);
  assert.equal(r.crossGroupGeometries, 1);
  assert.equal(r.crossGroupMaterials, 1);
});

test('resource census exposes object budget, rejects malformed groups and never disposes resources', () => {
  const geo = { attributes: { position: { array: new Float32Array(3) } } };
  const mat = {
    dispose: () => {
      throw new Error('must not dispose');
    },
  };
  const groups = [
    { children: Array.from({ length: 4 }, () => ({ geometry: geo, material: mat })) },
  ];
  const r = censusV4SceneResources(groups, { maxObjects: 2 });
  assert.equal(r.meshCount, 2);
  assert.equal(r.objectOverflow, 2);
  assert.equal(r.complete, false);
  assert.equal(censusV4SceneResources(groups, { maxObjects: 0 }).valid, false);
  assert.equal(censusV4SceneResources([{}]).valid, false);
});
