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
  assert.strictEqual(clippedSecond, clippedFirst, 'equivalent ROI geometry should share the cached plan');
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
