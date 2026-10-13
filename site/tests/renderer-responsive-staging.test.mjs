import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SupersededRendererBuild,
  isRendererBuildSuperseded,
  shouldStageRendererScene,
  shouldHideRendererPreviewMesh,
} from '../renderer-responsive-staging.js';

test('P0 model staging only retains a committed presentation behind explicit opt-in', () => {
  const ready = {
    enabled: true,
    hasCommittedGroup: true,
    hasPresentation: true,
    variant: 'transparent',
  };
  assert.equal(shouldStageRendererScene(ready), true);
  assert.equal(shouldStageRendererScene({ ...ready, variant: 'opaque' }), true);
  for (const override of [
    { enabled: false },
    { hasCommittedGroup: false },
    { hasPresentation: false },
    { variant: null },
    { variant: 'corrupt' },
  ])
    assert.equal(shouldStageRendererScene({ ...ready, ...override }), false);
  assert.equal(shouldStageRendererScene(), false);
});

test('P0 aborts only when a pending newer model, ROI signature or mode differs', () => {
  const model = { revision: 4 };
  const other = { revision: 5 };
  const current = {
    pending: true,
    originalModel: model,
    currentModel: model,
    originalSignature: 'roi:x',
    currentSignature: 'roi:x',
    originalVariant: 'transparent',
    currentVariant: 'transparent',
  };
  assert.equal(isRendererBuildSuperseded(current), false);
  assert.equal(
    isRendererBuildSuperseded({ ...current, pending: false, currentModel: other }),
    false,
  );
  assert.equal(isRendererBuildSuperseded({ ...current, currentModel: other }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentSignature: 'roi:y' }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentVariant: 'opaque' }), true);
  assert.equal(isRendererBuildSuperseded({ ...current, currentModel: null }), true);
  const error = new SupersededRendererBuild();
  assert.equal(error.name, 'SupersededRendererBuild');
  assert.match(error.message, /superseded/);
});

test('P1 display-only preview hides only heavy internal transparent meshes and restores exact inspection eligibility', () => {
  const eligible = {
    enabled: true,
    sceneVariant: 'transparent',
    arrayInstances: '1885',
    kind: 'material-interface',
    visible: true,
    hasRoi: false,
  };
  assert.equal(shouldHideRendererPreviewMesh(eligible), true);
  for (const kind of [
    'electrical-internal',
    'electrical-depth',
    'implant-internal',
    'implant-depth',
  ]) {
    assert.equal(shouldHideRendererPreviewMesh({ ...eligible, kind }), true);
  }
  for (const kind of [
    'material-exterior',
    'electrical-surface',
    'implant-surface',
    'border',
    'implant-cut',
  ]) {
    assert.equal(shouldHideRendererPreviewMesh({ ...eligible, kind }), false);
  }
  for (const patch of [
    { enabled: false },
    { sceneVariant: 'opaque' },
    { hasRoi: true },
    { visible: false },
    { arrayInstances: 63 },
    { arrayInstances: 'invalid' },
  ])
    assert.equal(shouldHideRendererPreviewMesh({ ...eligible, ...patch }), false);
});

test('P2.7 exact export accepts only the current committed presentation', async () => {
  const { assertRendererExactCaptureReady } = await import('../renderer-responsive-staging.js');
  const valid = {
    rendererReady: true,
    contextStatus: 'ready',
    assembling: false,
    hasCommittedGroup: true,
    stale: false,
    modelMatches: true,
    signatureMatches: true,
    variantMatches: true,
  };
  assert.doesNotThrow(() => assertRendererExactCaptureReady(valid));
  for (const patch of [
    { rendererReady: false },
    { contextStatus: 'lost' },
    { contextStatus: 'restoring' },
    { assembling: true },
    { hasCommittedGroup: false },
    { stale: true },
    { modelMatches: false },
    { signatureMatches: false },
    { variantMatches: false },
  ]) {
    assert.throws(() => assertRendererExactCaptureReady({ ...valid, ...patch }), /Exact 3D/);
  }
  assert.throws(() => assertRendererExactCaptureReady(), /ready WebGL renderer/);
});
