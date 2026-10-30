import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDenseSidewallMotionLod,
  shouldUseDenseInteractionSinglePass,
} from '../renderer-interaction-pass.js';

const denseModel = {
  regions: [{ geom: Array.from({ length: 1500 }) }, { geom: Array.from({ length: 2000 }) }],
};

test('large imported geometry drops extra WebGL outline passes only while moving', () => {
  assert.equal(shouldUseDenseInteractionSinglePass({ model: denseModel, interacting: true }), true);
  assert.equal(
    shouldUseDenseInteractionSinglePass({ model: denseModel, interacting: false }),
    false,
    'The settled frame retains exact structural depth',
  );
  assert.equal(
    shouldUseDenseInteractionSinglePass({
      model: denseModel,
      interacting: true,
      primaryRenderer: false,
    }),
    false,
    'Offscreen export/capture never inherits an interactive approximation',
  );
});

test('small scenes always retain existing multi-pass Border rendering', () => {
  assert.equal(
    shouldUseDenseInteractionSinglePass({
      model: { regions: [{ geom: Array.from({ length: 100 }) }] },
      interacting: true,
    }),
    false,
  );
  assert.equal(shouldUseDenseInteractionSinglePass({ interacting: true }), false);
});

test('dense sidewall motion LOD hides only tagged walls and restores exact visibility', () => {
  const motion = createDenseSidewallMotionLod();
  const group = {};
  const wall = {
    parent: group,
    visible: true,
    userData: { waferCadPresentation: { displayRole: 'sidewall' } },
  };
  const cap = {
    parent: group,
    visible: true,
    userData: { waferCadPresentation: { planarCap: true } },
  };
  const hiddenWall = {
    parent: group,
    visible: false,
    userData: { waferCadPresentation: { displayRole: 'sidewall' } },
  };
  assert.equal(motion.update({ enabled: true, objects: [wall, cap, hiddenWall] }), 1);
  assert.equal(wall.visible, false);
  assert.equal(cap.visible, true);
  assert.equal(hiddenWall.visible, false);
  assert.equal(motion.update({ enabled: true, objects: [wall, cap, hiddenWall] }), 1);
  assert.equal(motion.update({ enabled: false, resolveVisibility: () => true }), 0);
  assert.equal(wall.visible, true);
  assert.equal(hiddenWall.visible, false, 'Previously hidden geometry must stay hidden');
});

test('motion LOD never restores a disposed sidewall to an obsolete scene', () => {
  const motion = createDenseSidewallMotionLod();
  const wall = {
    parent: {},
    visible: true,
    userData: { waferCadPresentation: { displayRole: 'sidewall' } },
  };
  motion.update({ enabled: true, objects: [wall] });
  wall.parent = null;
  motion.restore();
  assert.equal(wall.visible, false);
  assert.equal(motion.hiddenCount, 0);
});
