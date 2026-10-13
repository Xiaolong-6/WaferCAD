import assert from 'node:assert/strict';
import test from 'node:test';
import { planHistoryKeyframes } from '../report-keyframe-plan.js';

function fixture(
  count = 1000,
  { restorable = () => true, kind = (index) => (index % 5 === 0 ? 'record' : 'add') } = {},
) {
  const history = Array.from({ length: count }, (_, index) => ({
    id: `step-${index + 1}`,
    number: index + 1,
    branchId: index < count / 2 ? 'main' : 'variant-a',
    restorable: restorable(index),
    operation: { kind: kind(index) },
  }));
  return {
    history,
    branches: [
      { id: 'main', name: 'Main', rootNodeId: null, headNodeId: history.at(count / 2 - 1)?.id },
      {
        id: 'variant-a',
        name: 'Variant A',
        rootNodeId: history.at(count / 2 - 1)?.id,
        headNodeId: history.at(-1)?.id,
      },
    ],
    bookmarks: [
      { id: 'b1', historyNodeId: history[20]?.id },
      { id: 'b2', historyNodeId: history[700]?.id },
    ],
  };
}

test('compact keyframes respect exact image cap and preserve signed anchors', () => {
  const data = fixture();
  const plan = planHistoryKeyframes(data);
  assert.equal(plan.historyNodeCount, 1000);
  assert.equal(plan.imageBudget, 24);
  assert.equal(plan.plannedImages, plan.keyframes.length);
  assert.ok(plan.plannedImages <= 24);
  assert.equal(plan.generatedImages, 0, 'Plan is not a rendering result');
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-1'));
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-1000'));
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-21'));
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-701'));
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-500'));
  assert.ok(plan.keyframes.some((item) => item.nodeId === 'step-501'));
  assert.deepEqual(
    plan.keyframes.map((item) => item.number),
    [...plan.keyframes.map((item) => item.number)].sort((a, b) => a - b),
  );
  assert.deepEqual(planHistoryKeyframes(data), plan, 'Planning must be deterministic');
  assert.ok(plan.keyframes.every((item) => item.status === 'planned'));
});

test('standard mode budgets both selected views and never invents figure output', () => {
  const plan = planHistoryKeyframes({ ...fixture(), mode: 'standard' });
  assert.deepEqual(plan.views, ['main', 'section']);
  assert.equal(plan.keyframeBudget, 48);
  assert.equal(plan.plannedImages, plan.keyframes.length * 2);
  assert.ok(plan.plannedImages <= 96);
  assert.equal(plan.generatedImages, 0);
});

test('missing restorable states are disclosed, not substituted with current geometry', () => {
  const data = fixture(1000, {
    restorable: (index) => index % 100 === 1,
  });
  const plan = planHistoryKeyframes({ ...data, maxImages: 10 });
  assert.ok(plan.unavailableAnchors.some((item) => item.nodeId === 'step-1000'));
  assert.ok(plan.unavailableAnchors.some((item) => item.nodeId === 'step-701'));
  assert.ok(
    plan.keyframes.every((item) => data.history.find((node) => node.id === item.nodeId).restorable),
  );
  assert.ok(plan.plannedImages <= 10);
});

test('oversubscribed bookmarks do not silently bypass the budget', () => {
  const data = fixture(1000);
  data.bookmarks = data.history.slice(100, 200).map((step) => ({ historyNodeId: step.id }));
  const plan = planHistoryKeyframes({ ...data, maxImages: 8 });
  assert.equal(plan.keyframes.length, 8);
  assert.ok(plan.omittedAnchors.length > 90);
  assert.ok(plan.omittedAnchors.every((item) => item.reason === 'image-budget-exceeded'));
});

test('deleted Bookmark and Variant pointers are reported, never invented', () => {
  const data = fixture(50);
  data.branches.push({ id: 'orphan', headNodeId: 'deleted-history-node' });
  data.bookmarks.push({ id: 'orphan-bookmark', historyNodeId: 'deleted-history-node' });
  const plan = planHistoryKeyframes(data);
  assert.equal(plan.unresolvedReferences.length, 1);
  assert.equal(plan.unresolvedReferences[0].nodeId, 'deleted-history-node');
  assert.deepEqual(plan.unresolvedReferences[0].reasons, ['bookmark', 'variant-head']);
  assert.ok(plan.keyframes.every((entry) => entry.nodeId !== 'deleted-history-node'));
});

test('Record-only filler is excluded and zero budget gives zero images', () => {
  const data = fixture(50, { kind: () => 'record' });
  const selected = planHistoryKeyframes({ ...data, maxImages: 50, bookmarks: [], branches: [] });
  assert.ok(selected.keyframes.length <= 3);
  const none = planHistoryKeyframes({ ...data, maxImages: 0 });
  assert.equal(none.keyframes.length, 0);
  assert.equal(none.plannedImages, 0);
  assert.ok(none.omittedAnchors.length > 0);
});

test('invalid and duplicate view, history and budgets are handled safely', () => {
  const data = fixture(10);
  assert.throws(() => planHistoryKeyframes({ ...data, mode: 'full' }));
  assert.throws(() => planHistoryKeyframes({ ...data, views: ['main', 'invalid'] }));
  assert.throws(() => planHistoryKeyframes({ ...data, maxImages: -1 }));
  assert.throws(() => planHistoryKeyframes({ ...data, maxImages: 1.5 }));
  assert.throws(() =>
    planHistoryKeyframes({ ...data, history: [...data.history, data.history[0]] }),
  );
  const dupViews = planHistoryKeyframes({
    ...data,
    maxImages: 8,
    views: ['main', 'main', 'section'],
  });
  assert.deepEqual(dupViews.views, ['main', 'section']);
  assert.ok(dupViews.plannedImages <= 8);
});
