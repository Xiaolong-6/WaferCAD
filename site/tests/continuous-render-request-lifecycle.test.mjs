// Exercise the actual Continuous branch of createThreeView.render with a
// controlled import/build suspension, without WebGL or a synthetic renderer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../three-view.js', import.meta.url), 'utf8');
const begin = source.indexOf(
  '    if (model.kernel === CONTINUOUS_ETCH_MODEL_KERNEL || model.continuousEtchOwner != null) {',
);
const end = source.indexOf('    if (model.kernel === PHYSICAL_FACET_MODEL_KERNEL)', begin);
assert.ok(begin >= 0 && end > begin, 'Expected native Continuous dispatcher');
const continuousDispatcher = source.slice(begin, end);

// The producer must not mutate the visible scene after awaiting the import
// until the shared request guard confirms this request is current.
const moduleWait = source.indexOf("await import('three/addons/objects/MarchingCubes.js')");
const staleCheck = source.indexOf('if (isSuperseded())', moduleWait);
const sceneDisposal = source.indexOf('disposeGroup();', moduleWait);
assert.ok(moduleWait > 0 && staleCheck > moduleWait && sceneDisposal > staleCheck);

function makeHarness() {
  const waits = [];
  const commits = [];
  const scope = {
    ready: true,
    rendering: false,
    pendingRender: false,
    sceneGeneration: 0,
    activeSurfaceAbort: null,
    current: { kernel: 'vector-continuous-etch-v1', revision: 1, processRevision: 1 },
    roi: 1,
    host: { dataset: {} },
    stats: { textContent: '' },
    CONTINUOUS_ETCH_MODEL_KERNEL: 'vector-continuous-etch-v1',
    getModel() {
      return scope.current;
    },
    async renderContinuousEtch(model, isSuperseded) {
      const roi = scope.roi;
      await new Promise((resolve) => waits.push(resolve));
      if (isSuperseded()) {
        const error = new Error('superseded');
        error.name = 'SceneVariantSuperseded';
        throw error;
      }
      commits.push({ model, roi });
      scope.host.dataset.renderState = 'ready';
    },
    disposeGroup() {
      scope.disposals++;
    },
    scheduleFrame() {
      scope.frames++;
    },
    disposals: 0,
    frames: 0,
    console: {
      error() {},
    },
    queueMicrotask,
  };
  // Only the real dispatch branch is evaluated. Heavy Three.js scene methods
  // are replaced by controlled waiting, with production shared state variables.
  const render = new Function(
    'scope',
    `with (scope) {
      return async function render() {
        if (!ready) return;
        if (rendering) {
          pendingRender = true;
          activeSurfaceAbort?.abort();
          return;
        }
        const model = getModel();
        if (!model) return;
        ${continuousDispatcher}
      };
    }`,
  )(scope);
  return { scope, render, waits, commits };
}

test('stale History scene cannot commit after newer Model/ROI requests', async () => {
  const { scope, render, waits, commits } = makeHarness();
  const oldRequest = render();
  assert.equal(scope.rendering, true);
  assert.equal(waits.length, 1);

  scope.current = { kernel: 'vector-continuous-etch-v1', revision: 2, processRevision: 2 };
  scope.roi = 3;
  await render();
  scope.roi = 4;
  await render(); // coalesce: only final model and ROI should be committed
  assert.equal(scope.pendingRender, true);
  assert.equal(waits.length, 1);

  waits.shift()();
  await oldRequest;
  await Promise.resolve();
  assert.equal(commits.length, 0, 'old model cannot resurrect its scene');
  assert.equal(scope.disposals, 0, 'a superseded build must not dispose the old scene');
  assert.equal(scope.host.dataset.renderState, 'building');
  assert.equal(waits.length, 1, 'one new scene request must be scheduled');

  waits.shift()();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(commits, [{ model: scope.current, roi: 4 }]);
  assert.equal(scope.host.dataset.renderState, 'ready');
  assert.equal(scope.rendering, false);
  assert.equal(Number(scope.host.dataset.rendererSupersededBuilds), 1);
});

test('latest Continuous build failure reports error and releases render lock', async () => {
  const { scope, render } = makeHarness();
  scope.renderContinuousEtch = async () => {
    throw new Error('actual build failure');
  };
  await render();
  assert.equal(scope.host.dataset.renderState, 'error');
  assert.equal(scope.host.dataset.rendererBuildFailure, 'actual build failure');
  assert.equal(scope.rendering, false);
  assert.equal(scope.disposals, 1);
});
