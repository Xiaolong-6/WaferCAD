// Read a previously captured R9 native trace with no GPU or browser work.
// Usage: node scripts/renderer-r9-phase-readout.mjs <extracted/report.json>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { summarizeRendererR9PhasePatterns } from './test-helpers/renderer-r9-phase-patterns.mjs';

const path = process.argv[2];
assert.ok(path && process.argv.length === 3, 'Provide one saved R9 phase report.json');
const report = JSON.parse(await readFile(resolve(path), 'utf8'));
assert.equal(report.phaseWindowDiagnostic, true);
assert.deepEqual(report.phaseWindow, { low: 128, high: 384 });
assert.equal(report.stage, 'completed');
assert.equal(report.acceptanceEligible, false);
assert.equal(report.passed, false);
assert.equal(report.trials?.length, 4);

const adapter = report.trials[0].backend?.adapter;
assert.ok(adapter, 'Missing real hardware adapter');
for (const trial of report.trials) {
  assert.equal(trial.backend?.hardwareVerified, true);
  assert.equal(trial.backend.adapter, adapter);
  assert.equal(trial.native?.contextAntialias, true);
  assert.equal(trial.native?.contextPreserveDrawingBuffer, false);
  assert.equal(trial.native?.defaultFramebufferSamples, 4);
  assert.equal(trial.native?.glError, 0);
  assert.equal(trial.native?.glState?.framebuffer, 'default');
}

const patterns = summarizeRendererR9PhasePatterns(report.trials);
const off = report.observedDriftWindows?.find((item) => item.pair?.[0] === '1-OFF');
const on = report.observedDriftWindows?.find((item) => item.pair?.[0] === '3-ON');
assert.equal(off?.status, 'checkpoint-mismatch');
assert.equal(on?.status, 'checkpoint-mismatch');
assert.equal(off.observedInterval?.byDifferentDraw, patterns.firstSamePolicyDriftDraw);
assert.equal(on.observedInterval?.byDifferentDraw, patterns.firstSamePolicyDriftDraw);

console.log(
  'RENDERER_R9_PHASE_READOUT',
  JSON.stringify({
    source: 'previously-recorded-native-GL-checkpoints-only',
    adapter,
    strictParity: report.strictParity,
    passed: false,
    acceptanceEligible: false,
    observedDriftWindows: [off, on],
    patterns,
  }),
);
