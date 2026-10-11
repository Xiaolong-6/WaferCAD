import assert from 'node:assert/strict';
import test from 'node:test';
import {
  R7_ORDER,
  R7_PIXEL_PAIRS,
  summarizeR7Abba,
  summarizeR7PixelParity,
} from '../test-helpers/renderer-r7-abba.mjs';

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
  assert.throws(
    () => summarizeR7PixelParity(baselineDrift.slice(0, 3)),
    /all six ordered/,
  );
  assert.throws(
    () => summarizeR7PixelParity([...identical.slice(0, 5), identical[4]]),
    /all six ordered/,
  );
  assert.throws(
    () => summarizeR7PixelParity([{ ...identical[0], differentPixels: 1 }, ...identical.slice(1)]),
    /all six ordered/,
  );
});
