import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRendererR9PhasePatterns } from '../../scripts/test-helpers/renderer-r9-phase-patterns.mjs';

const labels = ['1-OFF', '2-OFF', '3-ON', '4-ON'];

function trials(patterns) {
  return labels.map((label, arm) => ({
    label,
    phaseCheckpoints: patterns.map((pattern, index) => ({
      afterDraw: index === patterns.length - 1 ? (arm < 2 ? 1408 : 1291) : [128, 154, 384][index],
      kind: 'material-exterior',
      width: 530,
      height: 273,
      status: 'valid',
      hash: pattern[arm].repeat(64),
    })),
  }));
}

test('hash groups identify replicate-index drift ahead of policy effects', () => {
  const evidence = trials(['aaaa', 'abab', 'abcd', 'abcd']);
  const result = summarizeRendererR9PhasePatterns(evidence);
  assert.equal(result.sampleCount, 3);
  assert.equal(result.firstSamePolicyDriftDraw, 154);
  assert.equal(result.firstReplicateIndexGroupingDraw, 154);
  assert.equal(result.firstAllDistinctDraw, 384);
  assert.deepEqual(
    result.checkpoints.map((entry) => entry.pattern),
    ['all-identical', 'replicate-index-grouped', 'all-distinct'],
  );
  assert.deepEqual(result.checkpoints[1].groups, [
    ['1-OFF', '3-ON'],
    ['2-OFF', '4-ON'],
  ]);
  assert.equal(result.source, 'native-framebuffer-hash-partitions-only');
  assert.deepEqual(result.terminal.drawsByPolicy, { off: 1408, on: 1291 });
});

test('same-policy and cross-policy partitions stay distinct', () => {
  const evidence = trials(['aaaa', 'aabb', 'aabb', 'aabb']);
  const result = summarizeRendererR9PhasePatterns(evidence);
  assert.equal(result.firstSamePolicyDriftDraw, null);
  assert.equal(result.firstReplicateIndexGroupingDraw, null);
  assert.equal(result.checkpoints[1].pattern, 'policy-grouped');
});

test('missing arms, reordered draws and incomplete hashes fail closed', () => {
  const source = trials(['aaaa', 'abab', 'abcd', 'abcd']);
  assert.throws(() => summarizeRendererR9PhasePatterns([]), /four complete/);
  const reordered = structuredClone(source);
  reordered.reverse();
  assert.throws(() => summarizeRendererR9PhasePatterns(reordered), /ordered/);
  const malformed = structuredClone(source);
  malformed[1].phaseCheckpoints[1].hash = null;
  assert.throws(() => summarizeRendererR9PhasePatterns(malformed), /malformed/);
  const incomplete = structuredClone(source);
  incomplete[1].phaseCheckpoints.pop();
  assert.throws(() => summarizeRendererR9PhasePatterns(incomplete), /malformed/);
  const misalignedTerminal = structuredClone(source);
  misalignedTerminal[1].phaseCheckpoints[3].afterDraw = 1407;
  assert.throws(() => summarizeRendererR9PhasePatterns(misalignedTerminal), /malformed/);
  const wrongIndex = structuredClone(source);
  wrongIndex[3].phaseCheckpoints[1].afterDraw = 153;
  assert.throws(() => summarizeRendererR9PhasePatterns(wrongIndex), /malformed/);
});
