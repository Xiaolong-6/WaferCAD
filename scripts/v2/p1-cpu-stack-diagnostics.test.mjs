import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLongTaskCpuStacks } from './p1-cpu-stack-diagnostics.mjs';

test('root native program samples stay unattributed instead of being mislabeled WebGL', () => {
  const nodes = [
    { id: 1, callFrame: { functionName: '(root)' }, children: [2, 3] },
    { id: 2, callFrame: { functionName: '(program)' } },
    { id: 3, callFrame: { functionName: 'animation callback' }, children: [4] },
    { id: 4, callFrame: { functionName: 'WebGLRenderer.render' }, children: [5] },
    { id: 5, callFrame: { functionName: 'bufferData' } },
  ];
  const counts = new Map();
  counts.set(2, 90);
  counts.set(5, 10);
  const result = classifyLongTaskCpuStacks(nodes, counts);
  assert.deepEqual(result, {
    totalSamples: 100,
    rootProgramSamples: 90,
    rootProgramFraction: 0.9,
    webglCallStackSamples: 10,
    webglCallStackFraction: 0.1,
  });
});

test('missing parents, invalid counts and empty profiles fail conservative attribution', () => {
  const counts = new Map();
  counts.set(3, 4);
  counts.set(99, -2);
  counts.set(5, NaN);
  const result = classifyLongTaskCpuStacks(
    [{ id: 3, callFrame: { functionName: '(program)' } }],
    counts,
  );
  assert.equal(result.rootProgramSamples, 0);
  assert.equal(result.webglCallStackSamples, 0);
  assert.equal(result.totalSamples, 4);
  assert.deepEqual(classifyLongTaskCpuStacks(), {
    totalSamples: 0,
    rootProgramSamples: 0,
    rootProgramFraction: 0,
    webglCallStackSamples: 0,
    webglCallStackFraction: 0,
  });
});
