import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRendererPhaseEvidence } from '../test-helpers/renderer-v3-phase-parity.mjs';

const checkpoints = (hashes) =>
  hashes.map((hash, index) => ({
    hash,
    kind: index === 0 ? 'substrate' : 'electrical-surface',
    afterDraw: index === 0 ? 10 : 100,
    status: 'valid',
  }));
const arm = (hashes, skipped = 0) => ({
  phaseCheckpoints: checkpoints(hashes),
  phaseCoverage: {
    complete: skipped === 0,
    finalFrameCaptured: true,
    transitionsSkipped: skipped,
  },
});

test('phase parity reports first mismatching observed stage and final capture', () => {
  const result = compareRendererPhaseEvidence(arm(['a', 'b']), arm(['a', 'c']));
  assert.equal(result.status, 'checkpoint-mismatch');
  assert.deepEqual(result.firstDifferentPhase, {
    index: 1,
    afterDraw: 100,
    kind: 'electrical-surface',
    finalFrame: true,
    precedingMatchingCheckpoint: { index: 0, afterDraw: 10, kind: 'substrate' },
  });
  assert.equal(result.coverageComplete, true);
});

test('bounded checkpoints do not pretend to cover skipped owner transitions', () => {
  const result = compareRendererPhaseEvidence(arm(['a', 'b'], 12), arm(['a', 'b'], 9));
  assert.equal(result.status, 'bounded-checkpoints-identical');
  assert.equal(result.coverageComplete, false);
  assert.deepEqual(result.skippedTransitions, [12, 9]);
  assert.equal(result.firstDifferentPhase, null);
});

test('different native phase sequences are explicitly incomparable', () => {
  const changed = arm(['a', 'b']);
  changed.phaseCheckpoints[1].afterDraw = 99;
  const result = compareRendererPhaseEvidence(arm(['a', 'b']), changed);
  assert.equal(result.status, 'sequence-mismatch');
  assert.equal(result.sequenceIdentical, false);
  assert.equal(result.firstDifferentPhase, null);
});

test('unarmed software controls report missing evidence without fabrication', () => {
  const result = compareRendererPhaseEvidence({}, {});
  assert.equal(result.status, 'not-captured');
  assert.equal(result.firstDifferentPhase, null);
});

test('a first-checkpoint mismatch has no inferred matching lower bound', () => {
  const result = compareRendererPhaseEvidence(arm(['a', 'b']), arm(['different', 'b']));
  assert.equal(result.status, 'checkpoint-mismatch');
  assert.equal(result.firstDifferentPhase.afterDraw, 10);
  assert.equal(result.firstDifferentPhase.precedingMatchingCheckpoint, null);
});

test('missing hashes cannot masquerade as identical native framebuffers', () => {
  const left = arm(['a', 'b']);
  const right = arm(['a', 'b']);
  left.phaseCheckpoints[0].hash = null;
  right.phaseCheckpoints[0].hash = null;
  const result = compareRendererPhaseEvidence(left, right);
  assert.equal(result.status, 'invalid-checkpoints');
  assert.equal(result.firstDifferentPhase, null);
});
