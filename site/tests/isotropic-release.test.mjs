import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel, surfaceSegment } = await import('../model.js');
const { implantSolids } = await import('../model-view-geometry.js');
const {
  circleMulti,
  difference,
  pointInMulti,
  rectMulti,
  unionGeometries,
} = await import('../vector-geometry.js');

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}

test('Isotropic release preserves canonical cavity topology', () => {
  // Literature acceptance case: suspended spoked silica microdisk released from Si.
  // Geometry follows the reported 148 µm outer / 82 µm inner radii and 1.8 µm
  // thermal oxide thickness. A larger central hub leaves a Si pedestal while a
  // 36 µm isotropic XeF2-like release clears the annulus from both radial sides.
  const releaseModel = createModel({ shape: 'rect', width: 400, height: 400, thickness: 80 });
  const releaseOxide = applyOperation(releaseModel, {
    type: 'add',
    name: 'Thermal SiO2',
    thickness: 1.8,
    face: 'front',
    area: releaseModel.boundary,
    growth: 'direct',
  });
  const releaseOuter = circleMulti(296, 296, 128),
    releaseInner = circleMulti(164, 164, 128),
    releaseAnnulus = difference(releaseOuter, releaseInner),
    releaseHub = circleMulti(110, 110, 96),
    releaseSpokeH = rectMulti(180, 10),
    releaseSpokeV = rectMulti(10, 180),
    releasePad = unionGeometries([
      releaseAnnulus,
      releaseHub,
      releaseSpokeH,
      releaseSpokeV,
    ]),
    oxideOpen = difference(releaseModel.boundary, releasePad);

  const oxidePattern = applyOperation(releaseModel, {
    type: 'etch',
    etchProfile: 'directional',
    etchTargetLayerIds: [releaseOxide.layerId],
    thickness: 2,
    face: 'front',
    area: oxideOpen,
  });
  assert.equal(oxidePattern.changed, true);
  assert.equal(surfaceSegment(regionAt(releaseModel, [115, 0]).stack).layerId, releaseOxide.layerId);
  assert.equal(surfaceSegment(regionAt(releaseModel, [170, 0]).stack).layerId, 'base');

  const releaseResult = applyOperation(releaseModel, {
    type: 'etch',
    etchProfile: 'isotropic',
    etchTargetLayerIds: ['base'],
    thickness: 36,
    face: 'front',
    area: releaseModel.boundary,
  });
  assert.equal(releaseResult.changed, true, releaseResult.error || 'release changed=false');

  const releasedRing = regionAt(releaseModel, [115, 0]).stack,
    releasedRingOxide = releasedRing.find((segment) => segment.layerId === releaseOxide.layerId),
    releasedRingSi = releasedRing.find((segment) => segment.layerId === 'base'),
    supportedHub = regionAt(releaseModel, [0, 0]).stack,
    supportedHubSi = supportedHub.find((segment) => segment.layerId === 'base');
  assert.ok(releasedRingOxide, 'release must preserve the silica annulus');
  assert.ok(releasedRingSi, 'release radius should leave deeper Si below the cavity');
  assert.ok(
    releasedRingOxide.z0 - releasedRingSi.z1 > 10,
    'annulus must be physically suspended above a true air gap',
  );
  assert.ok(supportedHubSi);
  assert.ok(
    Math.abs(supportedHubSi.z1 - releasedRingOxide.z0) < 1e-9,
    'central hub must retain a Si pedestal up to the oxide interface',
  );
  assert.equal(
    releaseModel.regions.some((region) =>
      region.stack.some(
        (segment) =>
          segment.layerId === releaseOxide.layerId &&
          region.stack.some((other) => other.layerId === 'base' && other.z1 < segment.z0 - 1e-6),
      ),
    ),
    true,
    'canonical topology must contain an overhang/cavity stack, not a render-only illusion',
  );

  // Implant rendering must respect the same canonical void instead of filling the
  // air gap between the suspended oxide and lower silicon.
  const gapImplant = applyOperation(releaseModel, {
    type: 'implant',
    name: 'Release gap probe',
    thickness: 50,
    face: 'front',
    area: rectMulti(2, 2, 115, 0),
  });
  assert.equal(gapImplant.changed, true);
  const gapImplantIntervals = implantSolids(releaseModel, rectMulti(2, 2, 115, 0))
    .filter((solid) => solid.implantId === gapImplant.implantId)
    .map((solid) => [solid.z0, solid.z1])
    .sort((a, b) => a[0] - b[0]);
  assert.ok(gapImplantIntervals.length >= 2);
  assert.ok(
    gapImplantIntervals.some(
      (interval, index) =>
        index < gapImplantIntervals.length - 1 &&
        gapImplantIntervals[index + 1][0] - interval[1] > 1,
    ),
    'implant fragments must preserve the physical release gap',
  );

  // Compatibility: legacy directional etch must remove the oxide above a released
  // cavity and stop at the void instead of jumping across air into the lower Si.
  const postReleaseDirectional = structuredClone(releaseModel),
    postReleaseBeforeSi = regionAt(postReleaseDirectional, [115, 0]).stack.find(
      (segment) => segment.layerId === 'base',
    ).z1,
    postReleaseStrip = applyOperation(postReleaseDirectional, {
      type: 'etch',
      thickness: 5,
      face: 'front',
      area: rectMulti(2, 2, 115, 0),
    });
  assert.equal(postReleaseStrip.changed, true);
  const postReleaseStack = regionAt(postReleaseDirectional, [115, 0]).stack,
    postReleaseSi = postReleaseStack.find((segment) => segment.layerId === 'base');
  assert.equal(
    postReleaseStack.some((segment) => segment.layerId === releaseOxide.layerId),
    false,
  );
  assert.equal(postReleaseSi.z1, postReleaseBeforeSi);

  const releaseWithoutTarget = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const releaseWithoutTargetResult = applyOperation(releaseWithoutTarget, {
    type: 'etch',
    etchProfile: 'isotropic',
    thickness: 1,
    face: 'front',
    area: releaseWithoutTarget.boundary,
  });
  assert.equal(releaseWithoutTargetResult.changed, false);
  assert.match(releaseWithoutTargetResult.error, /requires a selected material/);

  const incompatibleRelease = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const incompatibleReleaseResult = applyOperation(incompatibleRelease, {
    type: 'etch',
    etchProfile: 'isotropic',
    etchTargetLayerIds: ['base'],
    thickness: 1,
    face: 'front',
    area: incompatibleRelease.boundary,
    surface: {
      kind: 'rough',
      morphology: 'stochastic',
      polarity: 'inverted',
      featureSize: 0.2,
      meanHeight: 0.1,
      featureCv: 0.2,
      heightCv: 0.2,
    },
  });
  assert.equal(incompatibleReleaseResult.changed, false);
  assert.match(incompatibleReleaseResult.error, /cannot combine with Rough\/Pyramid/);
});
