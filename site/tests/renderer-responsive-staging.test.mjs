import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SupersededRendererBuild,
  isRendererBuildSuperseded,
  shouldStageRendererScene,
} from '../renderer-responsive-staging.js';

test('P0 model staging only retains a committed presentation behind explicit opt-in', () => {
  const ready = { enabled: true, hasCommittedGroup: true, hasPresentation: true, variant: 'transparent' };
  assert.equal(shouldStageRendererScene(ready), true);
  assert.equal(shouldStageRendererScene({ ...ready, variant: 'opaque' }), true);
  for (const override of [
    { enabled: false }, { hasCommittedGroup: false }, { hasPresentation: false },
    { variant: null }, { variant: 'corrupt' },
  ]) assert.equal(shouldStageRendererScene({ ...ready, ...override }), false);
  assert.equal(shouldStageRendererScene(), false);
});

test('P0 aborts only when a pending newer model, ROI signature or mode differs', () => {
  const model = { revision: 4 };
  const other = { revision: 5 };
  const current = {
    pending: true, originalModel: model, currentModel: model,
    originalSignature: 'roi:x', currentSignature: 'roi:x',
    originalVariant: 'transparent', currentVariant: 'transparent',
  };
  assert.equal(isRendererBuildSuperseded(current), false);
  assert.equal(isRendererBuildSuperseded({ ...current, pending: false, currentModel: other }), false);
  assert.equal(isRendererBuildSuperseded({ ...current, currentModel: other }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentSignature: 'roi:y' }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentVariant: 'opaque' }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentModel: null }), true);
  const error = new SupersededRendererBuild();
  assert.equal(error.name, 'SupersededRendererBuild');
  assert.match(error.message, /superseded/);
});
