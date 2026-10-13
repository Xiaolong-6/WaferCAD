import assert from 'node:assert/strict';
import test from 'node:test';
import { captureHistorySections, historicalSectionPath } from '../report-history-captures.js';

function fixture(count = 12) {
  const steps = Array.from({ length: count }, (_, index) => ({
    id: `saved-${index + 1}`,
    number: index + 1,
    processRevision: index + 1,
    restorable: true,
    branchId: 'main',
    operation: { kind: 'add' },
  }));
  const states = new Map(
    steps.map((step) => [
      step.id,
      {
        model: {
          processRevision: step.processRevision,
          layers: [{ id: 'base', name: 'Base', color: '#8899aa' }],
        },
        section: { a: [-9, 0], b: [9, 0] },
      },
    ]),
  );
  const data = {
    steps,
    branches: [{ id: 'main', headNodeId: steps.at(-1).id }],
    bookmarks: [{ historyNodeId: steps[Math.min(4, steps.length - 1)].id }],
  };
  return { data, states };
}

function renderer({ state, nodeId }) {
  return {
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>\n',
    evidence: {
      nodeId,
      view: 'section',
      provenanceVerified: false,
      lineAUm: [...state.section.a],
      lineBUm: [...state.section.b],
      pixelsPerUm: 12,
      physicalSliceCount: 1,
      geometrySynthesized: false,
      zBreak: false,
      layerIds: ['base'],
    },
  };
}

test('valid saved states produce a capped collection with authenticated node/revision evidence', async () => {
  const { data, states } = fixture();
  const before = structuredClone([...states]);
  const visited = [];
  const result = await captureHistorySections({
    data,
    readNodeState: async (id) => structuredClone(states.get(id)),
    render: (args) => {
      visited.push(args.nodeId);
      return renderer(args);
    },
    maxImages: 6,
  });
  assert.equal(result.aborted, false);
  assert.equal(result.figures.length, 6);
  assert.deepEqual(result.failures, []);
  assert.equal(new Set(visited).size, 6);
  assert.equal(result.figures[0].path, historicalSectionPath(result.figures[0].number));
  assert.ok(
    result.figures.every(
      (item) =>
        item.evidence.provenanceVerified &&
        item.evidence.sourceNodeId === item.nodeId &&
        item.evidence.sourceProcessRevision === item.processRevision,
    ),
  );
  assert.deepEqual([...states], before, 'Saving report figures must not mutate History states');
});

test('revision mismatch, false Worker evidence and missing states never enter the ZIP', async () => {
  const { data, states } = fixture(5);
  const result = await captureHistorySections({
    data,
    readNodeState: (id) => {
      if (id === 'saved-1') return null;
      const state = structuredClone(states.get(id));
      if (id === 'saved-5') state.model.processRevision = 99;
      return state;
    },
    render: (args) =>
      args.nodeId === 'saved-3'
        ? { ...renderer(args), evidence: { ...renderer(args).evidence, nodeId: 'different' } }
        : renderer(args),
    maxImages: 5,
  });
  assert.equal(result.aborted, false);
  assert.ok(result.failures.some((item) => item.reason === 'saved-state-unavailable'));
  assert.ok(result.failures.some((item) => item.reason === 'process-revision-mismatch'));
  assert.ok(result.failures.some((item) => item.reason === 'section-evidence-mismatch'));
  assert.ok(
    result.figures.every((item) => !['saved-1', 'saved-3', 'saved-5'].includes(item.nodeId)),
  );
});

test('unsafe markup and oversized figures are rejected without invalidating valid captures', async () => {
  const { data, states } = fixture(4);
  const output = await captureHistorySections({
    data,
    readNodeState: (id) => states.get(id),
    render: (args) => {
      if (args.nodeId === 'saved-4') {
        return { ...renderer(args), svg: '<svg onload="attack()"></svg>' };
      }
      if (args.nodeId === 'saved-2') {
        return {
          ...renderer(args),
          svg: `<svg xmlns="http://www.w3.org/2000/svg">${'x'.repeat(2 * 1024 * 1024 + 1)}</svg>`,
        };
      }
      return renderer(args);
    },
    maxImages: 4,
  });
  assert.ok(output.figures.length >= 1);
  assert.ok(output.failures.some((item) => item.reason === 'invalid-section-svg'));
  assert.ok(output.failures.some((item) => item.reason === 'svg-size-limit'));
});

test('Abort causes atomic discard and zero-budget selection schedules nothing', async () => {
  const { data, states } = fixture();
  const aborted = new AbortController();
  let completed = 0;
  const result = await captureHistorySections({
    data,
    readNodeState: (id) => states.get(id),
    render: (args) => {
      completed++;
      if (completed === 2) aborted.abort();
      return renderer(args);
    },
    signal: aborted.signal,
    maxImages: 6,
  });
  assert.deepEqual(result, { aborted: true, figures: [], failures: [] });
  let calls = 0;
  const none = await captureHistorySections({
    data,
    readNodeState: () => {
      calls++;
    },
    render: () => {
      calls++;
    },
    maxImages: 0,
  });
  assert.equal(calls, 0);
  assert.deepEqual(none.figures, []);
});
