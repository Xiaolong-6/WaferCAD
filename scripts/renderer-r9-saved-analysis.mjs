// Analyze an extracted, already captured R9 preservation report.
// Usage: node scripts/renderer-r9-saved-analysis.mjs <extracted/v4-preserved-msaa>
// Pure offline evidence inspection: no browser, GPU or product policy changes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { compareScreenshotPngPixels, decodeScreenshotPng } from './test-helpers/png-pixel-diff.mjs';
import { summarizeRendererR9SpatialDrift } from './test-helpers/renderer-r9-spatial-drift.mjs';

const folder = process.argv[2];
assert.ok(
  folder && !folder.startsWith('-') && process.argv.length === 3,
  'Pass one extracted R9 evidence directory',
);
const directory = resolve(folder);
const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
assert.equal(report.diagnosticPreservedMsaa, true, 'requires preserved 4-sample R9 evidence');
assert.equal(report.stage, 'completed');
assert.equal(report.acceptanceEligible, false);
assert.equal(report.passed, false);
assert.deepEqual(
  report.trials?.map((trial) => trial.label),
  ['1-OFF', '2-OFF', '3-ON', '4-ON'],
  'requires four complete fresh-context captures',
);
const adapter = report.trials[0].backend?.adapter;
assert.ok(adapter && report.trials.every((trial) => trial.backend?.hardwareVerified === true));
assert.ok(report.trials.every((trial) => trial.backend.adapter === adapter));
for (const trial of report.trials) {
  assert.equal(trial.native?.contextAntialias, true);
  assert.equal(trial.native?.contextPreserveDrawingBuffer, true);
  assert.equal(trial.native?.defaultFramebufferSamples, 4);
  assert.equal(trial.native?.glState?.framebuffer, 'default');
  assert.equal(trial.native?.glError, 0);
}
const results = [];
for (const [first, second] of [
  ['1-OFF', '2-OFF'],
  ['3-ON', '4-ON'],
]) {
  const pngA = await readFile(join(directory, first + '.png'));
  const pngB = await readFile(join(directory, second + '.png'));
  const pixels = compareScreenshotPngPixels(pngA, pngB);
  const original = report.comparisons?.find(
    (item) => item.first === first && item.second === second && item.samePolicy === true,
  );
  assert.ok(original, 'missing native same-policy comparison');
  assert.equal(pixels.differentPixels, original.pixelDifference?.differentPixels);
  assert.equal(pixels.maxChannelDelta, original.pixelDifference?.maxChannelDelta);
  assert.equal(pixels.pixelIdentical, original.pixelDifference?.pixelIdentical);
  const summary = report.observedDriftWindows?.find(
    (item) => item.pair?.[0] === first && item.pair?.[1] === second,
  );
  assert.equal(summary?.status, 'checkpoint-mismatch');
  assert.ok(summary.observedInterval && summary.nextDiagnosticWindow);
  results.push({
    pair: [first, second],
    pixels: { different: pixels.differentPixels, total: pixels.totalPixels },
    boundingBox: pixels.boundingBox,
    phaseWindow: summary.observedInterval,
    nextDiagnosticWindow: summary.nextDiagnosticWindow,
    locality: summarizeRendererR9SpatialDrift(decodeScreenshotPng(pngA), decodeScreenshotPng(pngB)),
  });
}
console.log(
  'RENDERER_R9_OFFLINE_LOCALITY',
  JSON.stringify({
    source: 'previously-captured-private-R9-PNGs-only',
    gpu: adapter,
    strictParity: report.strictParity,
    acceptanceEligible: false,
    rasterSettingsUnchanged: true,
    comparisons: results,
  }),
);
