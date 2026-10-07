import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createModel, setLayerVisible } = await import('../model.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');
const { rectMulti } = await import('../vector-geometry.js');

test('renderer reuses topology plan while model and clip are unchanged', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  const first = buildRenderSurfacePlan(model, null);
  const second = buildRenderSurfacePlan(model, null);
  assert.strictEqual(second, first);

  const clipA = rectMulti(10, 10);
  const clippedFirst = buildRenderSurfacePlan(model, clipA);
  const clippedSecond = buildRenderSurfacePlan(model, structuredClone(clipA));
  assert.strictEqual(
    clippedSecond,
    clippedFirst,
    'equivalent ROI geometry should share the cached plan',
  );
  assert.notStrictEqual(clippedFirst, first);
});

test('renderer topology cache invalidates on revision and visibility changes', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  const first = buildRenderSurfacePlan(model, null);

  model.revision++;
  const afterRevision = buildRenderSurfacePlan(model, null);
  assert.notStrictEqual(afterRevision, first);

  const beforeVisibility = buildRenderSurfacePlan(model, null);
  assert.equal(setLayerVisible(model, 'base', false), true);
  const afterVisibility = buildRenderSurfacePlan(model, null);
  assert.notStrictEqual(afterVisibility, beforeVisibility);
});

test('renderer topology cache invalidates on process revision independently of model revision', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  const first = buildRenderSurfacePlan(model, null);
  const revision = model.revision;

  model.processRevision = (model.processRevision || 0) + 1;
  assert.equal(model.revision, revision);
  const afterProcessRevision = buildRenderSurfacePlan(model, null);
  assert.notStrictEqual(afterProcessRevision, first);
});

test('renderer topology cache distinguishes physical ROI geometry but reuses equivalent clones', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  const clipA = rectMulti(10, 10, -3, 0);
  const clipB = rectMulti(10, 10, 3, 0);

  const a = buildRenderSurfacePlan(model, clipA);
  const aClone = buildRenderSurfacePlan(model, structuredClone(clipA));
  assert.strictEqual(aClone, a);

  const b = buildRenderSurfacePlan(model, clipB);
  assert.notStrictEqual(b, a);
  const bClone = buildRenderSurfacePlan(model, structuredClone(clipB));
  assert.strictEqual(bClone, b);
});

test('array parent revisions cannot reuse stale full-wafer topology', async () => {
  const { ARRAY_MODEL_KERNEL } = await import('../model-array.js');
  const leaf = createModel({ shape: 'rect', width: 10, height: 10, thickness: 2 });
  const model = {
    ...structuredClone(leaf),
    kernel: ARRAY_MODEL_KERNEL,
    width: 20,
    boundary: rectMulti(20, 10),
    regions: [],
    array: {
      version: 1,
      templates: [{ id: 'cell', model: leaf }],
      instances: [
        { id: 'left', templateId: 'cell', x: -5, y: 0 },
        { id: 'right', templateId: 'cell', x: 5, y: 0 },
      ],
    },
  };

  const first = buildRenderSurfacePlan(model, null);
  assert.equal(first.arrayInstances, 2);
  model.revision++;
  const second = buildRenderSurfacePlan(model, null);
  assert.notStrictEqual(second, first);
  assert.equal(second.arrayInstances, 2);
});
