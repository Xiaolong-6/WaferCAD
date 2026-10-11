import assert from 'node:assert/strict';
import test from 'node:test';
import {
  R7_ORDER,
  selectR7Candidate,
  classifyR7CandidateActivation,
  R7_PIXEL_PAIRS,
  classifyR7PixelSignatures,
  summarizeR7Abba,
  summarizeR7PixelParity,
} from '../test-helpers/renderer-r7-abba.mjs';

test('R7 isolation modes enable exactly their declared browser boot flags', () => {
  const combined = selectR7Candidate(['--ci-smoke']);
  assert.equal(combined.mode, 'combined');
  assert.equal(combined.artifactSuffix, '');
  assert.deepEqual(combined.flags, ['rendererV4FastSmoothIndex=1', 'rendererV4SharedFlatCaps=1']);
  const index = selectR7Candidate(['--hardware-rtx3060', '--isolate-index']);
  assert.equal(index.mode, 'index');
  assert.equal(index.candidateName, 'FastSmoothIndex-only');
  assert.equal(index.artifactSuffix, '-index-only');
  assert.deepEqual(index.flags, ['rendererV4FastSmoothIndex=1']);
  const caps = selectR7Candidate(['--ci-smoke', '--isolate-caps']);
  assert.equal(caps.mode, 'caps');
  assert.equal(caps.artifactSuffix, '-caps-only');
  assert.deepEqual(caps.flags, ['rendererV4SharedFlatCaps=1']);
  assert.throws(() => selectR7Candidate(['--isolate-index', '--isolate-caps']), /at most one/);
  assert.equal(selectR7Candidate([]).mode, 'combined');
  index.flags.push('tampered');
  assert.deepEqual(selectR7Candidate(['--isolate-index']).flags, ['rendererV4FastSmoothIndex=1']);
});

test('R7 hardware isolation enforces requested optimization and rejects unselected side effects', () => {
  const both = { fastIndexedVertices: 4, fastOriginalVertices: 6, sharedFlatClonesAvoided: 8 };
  const indexOnly = { ...both, sharedFlatClonesAvoided: 0 };
  const capsOnly = { ...both, fastIndexedVertices: 0, fastOriginalVertices: 0 };
  const none = { fastIndexedVertices: 0, fastOriginalVertices: 0, sharedFlatClonesAvoided: 0 };

  for (const mode of ['index', 'caps', 'combined']) {
    const baseline = classifyR7CandidateActivation(mode, none, 'A');
    assert.equal(baseline.candidateExercised, true);
    assert.equal(baseline.expectedIndex, false);
    assert.equal(baseline.expectedCaps, false);
    assert.equal(classifyR7CandidateActivation(mode, both, 'A').candidateExercised, false);
    assert.equal(classifyR7CandidateActivation(mode, none, 'B').candidateExercised, false);
  }
  assert.equal(classifyR7CandidateActivation('index', indexOnly).candidateExercised, true);
  assert.equal(classifyR7CandidateActivation('caps', capsOnly).candidateExercised, true);
  assert.equal(classifyR7CandidateActivation('combined', both).candidateExercised, true);
  assert.equal(classifyR7CandidateActivation('index', both).candidateExercised, false);
  assert.equal(classifyR7CandidateActivation('caps', both).candidateExercised, false);
  assert.equal(classifyR7CandidateActivation('combined', indexOnly).candidateExercised, false);
  assert.equal(classifyR7CandidateActivation('combined', capsOnly).candidateExercised, false);

  for (const invalid of [
    { ...none, fastIndexedVertices: null },
    { ...none, fastIndexedVertices: NaN },
    { ...none, fastOriginalVertices: -1 },
    { ...none, sharedFlatClonesAvoided: null },
    { ...none, sharedFlatClonesAvoided: undefined },
  ]) {
    const result = classifyR7CandidateActivation('index', invalid, 'A');
    assert.equal(result.countersComplete, false);
    assert.equal(result.candidateExercised, false);
  }
  assert.throws(() => classifyR7CandidateActivation('unsupported', both), /unknown/);
  assert.throws(() => classifyR7CandidateActivation('index', both, 'C'), /unknown/);
});

const trial = (policy, a, b) => ({
  policy,
  samples: [{ driverFinishWallMs: a }, { driverFinishWallMs: b }],
});

test('R7 descriptive median follows strict A/B/B/A scheduling', () => {
  const report = summarizeR7Abba([
    trial('A', 10, 14),
    trial('B', 5, 7),
    trial('B', 6, 8),
    trial('A', 11, 13),
  ]);
  assert.deepEqual(report.order, R7_ORDER);
  assert.equal(report.baselineMedianMs, 12);
  assert.equal(report.candidateMedianMs, 6.5);
  assert.equal(report.medianWallRatio, 12 / 6.5);
  assert.equal(report.samplesPerPolicy, 4);
  assert.equal(report.gpuVramBytes, null);
  assert.equal(report.hardwareAcceptable, false);
  assert.match(report.metric, /not pure GPU timer/);
});

test('R7 fails closed on missing trials, wrong order, stale and invalid frame samples', () => {
  const good = [trial('A', 10, 12), trial('B', 9, 11), trial('B', 10, 11), trial('A', 11, 13)];
  assert.throws(() => summarizeR7Abba(good.slice(1)), /exactly four/);
  assert.throws(() => summarizeR7Abba([good[1], good[0], good[2], good[3]]), /A-B-B-A/);
  assert.throws(
    () => summarizeR7Abba([...good.slice(0, 3), { policy: 'A', samples: [] }]),
    /at least two/,
  );
  assert.throws(
    () =>
      summarizeR7Abba([
        ...good.slice(0, 3),
        { policy: 'A', samples: [{ driverFinishWallMs: 0 }, { driverFinishWallMs: NaN }] },
      ]),
    /finite positive/,
  );
});

test('R7 evaluates all six pairs, rejecting same-policy instability without relaxing A/B gate', () => {
  const identical = R7_PIXEL_PAIRS.map(({ pair, kind }) => ({
    pair,
    kind,
    pixelIdentical: true,
    differentPixels: 0,
  }));
  const passed = summarizeR7PixelParity(identical);
  assert.equal(passed.strictPixelParity, true);
  assert.equal(passed.baselineRepeatable, true);
  assert.equal(passed.candidateRepeatable, true);
  const baselineDrift = identical.map((row) => ({ ...row }));
  baselineDrift[2].pixelIdentical = false;
  baselineDrift[2].differentPixels = 12;
  const blocked = summarizeR7PixelParity(baselineDrift);
  assert.equal(blocked.strictPixelParity, false);
  assert.equal(blocked.baselineRepeatable, false);
  assert.equal(blocked.candidateRepeatable, true);
  assert.equal(blocked.optimizationAttributionPossible, false);
  assert.equal(blocked.mismatchCount, 1);
  assert.throws(() => summarizeR7PixelParity(baselineDrift.slice(0, 3)), /all six ordered/);
  assert.throws(
    () => summarizeR7PixelParity([...identical.slice(0, 5), identical[4]]),
    /all six ordered/,
  );
  assert.throws(
    () => summarizeR7PixelParity([{ ...identical[0], differentPixels: 1 }, ...identical.slice(1)]),
    /all six ordered/,
  );
});

test('R7 isolates policy-stable pixels from baseline and candidate fresh-context drift', () => {
  const pixels = (values) => ({
    width: 4,
    height: 1,
    rgba: Uint8Array.from(values.flatMap((v) => [v, 0, 0, 255])),
  });
  const frames = [
    pixels([10, 20, 30, 40]), // A1
    pixels([11, 20, 32, 40]), // B1: policy-stable difference at x=0
    pixels([11, 22, 32, 40]), // B2: B/B drift at x=1
    pixels([10, 20, 31, 40]), // A2: A/A drift at x=2
  ];
  const report = classifyR7PixelSignatures(frames);
  assert.equal(report.totalPixels, 4);
  assert.equal(report.anyChangedPixels, 3);
  assert.equal(report.samePolicyDriftPixels, 2);
  assert.equal(report.stablePolicyPixels, 1);
  assert.equal(report.stablePolicyMaxChannelDelta, 1);
  assert.deepEqual(report.stablePolicyBoundingBox, {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  });
  assert.equal(report.strictPixelParity, false);
  const identical = classifyR7PixelSignatures([frames[0], frames[0], frames[0], frames[0]]);
  assert.equal(identical.anyChangedPixels, 0);
  assert.equal(identical.stablePolicyPixels, 0);
  assert.equal(identical.strictPixelParity, true);
  assert.throws(() => classifyR7PixelSignatures(frames.slice(1)), /four same-size RGBA/);
});
