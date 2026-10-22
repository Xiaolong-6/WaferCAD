import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExactThreePngReady,
  runTemporaryRendererCapture,
} from '../renderer-capture-transaction.js';

function setup({ failure = null } = {}) {
  const calls = [];
  const mainRenderer = {
    ratio: 1.25,
    getPixelRatio() {
      return this.ratio;
    },
    setPixelRatio(value) {
      calls.push('main-ratio-' + value);
      this.ratio = value;
    },
  };
  const camera = {
    aspect: 1.4,
    updateProjectionMatrix() {
      calls.push('projection-' + this.aspect);
    },
  };
  const options = {
    mainRenderer,
    camera,
    pixelRatio: 3,
    aspect: 2,
    createRenderer: () => {
      calls.push('create');
      return {
        dispose() {
          calls.push('dispose');
          if (failure === 'dispose') throw new Error('dispose failed');
        },
      };
    },
    configureRenderer: () => {
      calls.push('configure');
      if (failure === 'configure') throw new Error('configure failed');
    },
    prepareScene: async () => {
      calls.push('prepare');
      if (failure === 'prepare') throw new Error('rough build failed');
    },
    capture: async () => {
      calls.push('capture');
      if (failure === 'capture') throw new Error('PNG encoding failed');
      return 'png-bytes';
    },
    restoreScene: async () => {
      calls.push('restore-rough');
      if (failure === 'restore') throw new Error('rough restore failed');
    },
    scheduleFrame: () => calls.push('frame'),
  };
  return { options, calls, mainRenderer, camera };
}

test('successful PNG restores interactive ratio and original camera aspect', async () => {
  const h = setup();
  assert.equal(await runTemporaryRendererCapture(h.options), 'png-bytes');
  assert.equal(h.mainRenderer.ratio, 1.25);
  assert.equal(h.camera.aspect, 1.4);
  assert.deepEqual(h.calls, [
    'create',
    'configure',
    'main-ratio-3',
    'projection-2',
    'prepare',
    'capture',
    'dispose',
    'main-ratio-1.25',
    'projection-1.4',
    'restore-rough',
    'frame',
  ]);
});

for (const failure of ['prepare', 'capture']) {
  test(
    'PNG ' + failure + ' failure always restores interactive scene and disposes capture GL',
    async () => {
      const h = setup({ failure });
      await assert.rejects(
        runTemporaryRendererCapture(h.options),
        failure === 'prepare' ? /rough build failed/ : /PNG encoding failed/,
      );
      assert.equal(h.mainRenderer.ratio, 1.25);
      assert.equal(h.camera.aspect, 1.4);
      assert.ok(h.calls.includes('dispose'));
      assert.ok(h.calls.includes('restore-rough'));
      assert.equal(h.calls.at(-1), 'frame');
      assert.equal(h.calls.includes('capture'), failure === 'capture');
    },
  );
}

test('failed temporary WebGL setup disposes resources without modifying main view', async () => {
  const h = setup({ failure: 'configure' });
  await assert.rejects(runTemporaryRendererCapture(h.options), /configure failed/);
  assert.deepEqual(h.calls, ['create', 'configure', 'dispose']);
  assert.equal(h.mainRenderer.ratio, 1.25);
  assert.equal(h.camera.aspect, 1.4);
});

test('restoration remains attempted even when capture WebGL dispose fails', async () => {
  const h = setup({ failure: 'dispose' });
  await assert.rejects(
    runTemporaryRendererCapture(h.options),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 1 &&
      /dispose failed/.test(error.errors[0].message),
  );
  assert.equal(h.mainRenderer.ratio, 1.25);
  assert.equal(h.camera.aspect, 1.4);
  assert.ok(h.calls.includes('restore-rough'));
  assert.equal(h.calls.at(-1), 'frame');
});

test('failed rough restoration still schedules main view redraw', async () => {
  const h = setup({ failure: 'restore' });
  await assert.rejects(runTemporaryRendererCapture(h.options), /cleanup failed/);
  assert.equal(h.mainRenderer.ratio, 1.25);
  assert.equal(h.camera.aspect, 1.4);
  assert.equal(h.calls.at(-1), 'frame');
});

test('PNG export cannot publish approximate, pending, superseded or unpainted geometry', () => {
  const exact = ['exact-surface-plan', 'exact-physical-facet', 'exact-continuous-etch'];
  for (const fidelity of exact) {
    assert.doesNotThrow(() =>
      assertExactThreePngReady({ fidelity, renderState: 'ready', exactFirstFrameMs: '12.5' }),
    );
    for (const renderState of ['building', 'refining', 'error', 'updating']) {
      assert.throws(
        () => assertExactThreePngReady({ fidelity, renderState, exactFirstFrameMs: '12.5' }),
        /painted exact 3D frame/,
      );
    }
    assert.throws(
      () => assertExactThreePngReady({ fidelity, renderState: 'ready', exactFirstFrameMs: '' }),
      /painted exact 3D frame/,
    );
  }
  for (const fidelity of ['approximate', 'pending-exact', 'pending-continuous-etch', undefined]) {
    assert.throws(
      () => assertExactThreePngReady({ fidelity, renderState: 'ready', exactFirstFrameMs: '12.5' }),
      /painted exact 3D frame/,
    );
  }
});

test('scene becoming approximate during PNG preparation refuses capture and restores GL', async () => {
  const h = setup();
  let fidelity = 'exact-surface-plan';
  h.options.prepareScene = async () => {
    h.calls.push('prepare');
    fidelity = 'approximate';
  };
  h.options.capture = async () => {
    assertExactThreePngReady({ fidelity, renderState: 'refining', exactFirstFrameMs: '1' });
    h.calls.push('capture');
    return 'not-allowed';
  };
  await assert.rejects(runTemporaryRendererCapture(h.options), /painted exact 3D frame/);
  assert.equal(h.calls.includes('capture'), false);
  assert.equal(h.calls.includes('dispose'), true);
  assert.equal(h.calls.includes('restore-rough'), true);
  assert.equal(h.mainRenderer.ratio, 1.25);
  assert.equal(h.camera.aspect, 1.4);
});
