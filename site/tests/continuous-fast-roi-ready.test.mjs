import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../three-view.js', import.meta.url), 'utf8');
const begin = source.indexOf(
  "    if (\n      physicalSceneModel === model &&\n      physicalSceneSignature === 'continuous-etch-v1'",
);
const end = source.indexOf('    // Native continuous geometry is exact', begin);
assert.ok(begin >= 0 && end > begin, 'Native Continuous ROI presentation branch exists');
const branch = source.slice(begin, end);

test('Continuous cached ROI/style updates release building state and preserve fidelity', () => {
  const model = { revision: 5 };
  const called = [];
  const scope = {
    physicalSceneModel: model,
    physicalSceneSignature: 'continuous-etch-v1',
    presentationObjects: new Set([{}]),
    host: {
      dataset: {
        renderState: 'building',
        renderPhase: 'building',
        renderFidelity: 'exact-continuous-etch',
      },
    },
    performance: { now: () => 17.25 },
    applyPresentationState: () => called.push('appearance'),
    cropMaterialMeshes: () => called.push('crop'),
    updateRoiCaps: () => true,
    updateZBreakCaps: () => called.push('z-caps'),
    updateMaterialAppearance: () => called.push('restyle'),
    fit: (options) => called.push(['fit', options]),
  };
  const run = new Function('scope', 'model', `with (scope) { return function () { ${branch} }; }`)(
    scope,
    model,
  );
  run();
  assert.equal(scope.host.dataset.renderState, 'ready');
  assert.equal(scope.host.dataset.renderPhase, 'complete');
  assert.equal(scope.host.dataset.renderFidelity, 'exact-continuous-etch');
  assert.equal(scope.host.dataset.continuousEtchRoiUpdateMs, '0');
  assert.deepEqual(called, [
    'appearance',
    'crop',
    'z-caps',
    'restyle',
    ['fit', { notify: false, preserveOrientation: true }],
  ]);
});
