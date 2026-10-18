import assert from 'node:assert/strict';
import test from 'node:test';
import {
  measureBoxCenterline,
  measureBoxPolyline,
  auditSwxPostHFPerimeterSupport,
} from '../../scripts/swx-mems-posthf-perimeter-audit.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');

test('BOX polygon boundaries split a supported beam without sampled guesses', () => {
  const box = [
    [
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
    ],
  ];
  const actual = measureBoxCenterline(v, box, [-2, 2.5], [7, 2.5]);
  assert.equal(actual.lengthUm, 9);
  assert.equal(actual.supportedLengthUm, 5);
  assert.equal(actual.releasedLengthUm, 4);
  assert.deepEqual(
    actual.intervals.map((span) => span.supportedByBOX),
    [false, true, false],
  );
  assert.deepEqual(
    actual.intervals.map((span) => span.lengthUm),
    [2, 5, 2],
  );
});

test('continuous release run crosses a corner but stops at a real BOX support', () => {
  const box = [[[[0, -1], [3, -1], [3, 1], [0, 1], [0, -1]]]];
  const route = measureBoxPolyline(v, box, [[0, 0], [10, 0], [10, 10]]);
  assert.equal(route.runs.length, 2);
  assert.equal(route.runs[0].supportedByBOX, true);
  assert.equal(route.runs[0].lengthUm, 3);
  assert.equal(route.longestReleasedRun.lengthUm, 17);
  assert.equal(route.longestReleasedRun.startSegmentIndex, 0);
  assert.equal(route.longestReleasedRun.endSegmentIndex, 1);
  assert.deepEqual(route.longestReleasedRun.from, [3, 0]);
  assert.deepEqual(route.longestReleasedRun.to, [10, 10]);
});

test('genuine OFF/ON post-HF source models expose nominal-vs-actual Ground and Signal support', async () => {
  const { buildSwxMemsUnified } = await import('../../scripts/build-swx-mems-example.mjs');
  const { SWX_GROUND_RETURN_ASSUMPTIONS, SWX_GROUND_RETURN_PROCESS_PROFILE } =
    await import('../../scripts/swx-mems-sem-ground-return-candidate.mjs');
  const { project } = await buildSwxMemsUnified(SWX_GROUND_RETURN_PROCESS_PROFILE);
  assert.equal(project.snapshotBranches.branches.length, 2);
  for (const branch of project.snapshotBranches.branches) {
    const actual = auditSwxPostHFPerimeterSupport(
      v,
      branch.headState.model,
      SWX_GROUND_RETURN_ASSUMPTIONS,
    );
    assert.equal(actual.externalSignalContinuouslySupported, true);
    assert.equal(actual.actualGroundSupportShorterThanNominal, true);
    assert.equal(actual.ground.length, 2);
    for (const path of actual.ground) {
      // The nominal 8um anchor loses BOX undercut on either side.
      assert.ok(path.supportedLengthUm > 4 && path.supportedLengthUm < 5);
      assert.ok(path.releasedLengthUm > 38);
    }
    // Under the 6um-wide silicon bus, only the central ~2um BOX spine remains.
    assert.ok(actual.signalCrossSection.supportedLengthUm > 1.9);
    assert.ok(actual.signalCrossSection.supportedLengthUm < 2.1);
    assert.ok(actual.longestActualReleasedSpan.lengthUm > 35);
    assert.ok(actual.longestActualReleasedSpan.lengthUm < 37);
    // Scientific regression: a continuous curved free path may cross a
    // nominal layout corner; checking each straight edge alone underreports it.
    assert.ok(actual.longestActualContinuousReleasedPath.lengthUm > 56.58);
    assert.ok(actual.longestActualContinuousReleasedPath.lengthUm < 56.60);
    assert.ok(actual.longestActualContinuousReleasedPath.route.startsWith('ground-'));
    assert.ok(
      actual.longestActualContinuousReleasedPath.lengthUm >
        actual.longestActualReleasedSpan.lengthUm + 20,
    );
    assert.equal(actual.continuousPathArcLengthIsFEMEffectiveBucklingLength, false);
    for (const route of actual.continuousPaths) {
      assert.ok(route.longestReleasedRun?.lengthUm > 53);
    }
    assert.equal(actual.postHFMechanicalAcceptance, false);
    assert.equal(actual.mechanicalFEMVerified, false);
  }
});
