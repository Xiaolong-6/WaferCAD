import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileWorkspaceController } from '../ui-v2/mobile-workspace-controller.js';

function fixture() {
  const state = {
    domain: 'project',
    mobile: 'view',
    view: 'main',
    mode: 'single',
    maximize: null,
  };
  let compact = true;
  let position = 0;
  const frames = [];
  const restores = [];
  const controller = createMobileWorkspaceController({
    state,
    compact: () => compact,
    readScroll: () => position,
    restoreScroll: (value) => restores.push(value),
    nextFrame: (callback) => frames.push(callback),
  });
  const drain = () => {
    while (frames.length) frames.shift()();
  };
  return {
    state,
    controller,
    restores,
    drain,
    scrollTo: (value) => {
      position = value;
    },
    setCompact: (value) => {
      compact = value;
    },
  };
}

test('mobile View/Edit and domain scrolling retain independent document offsets', () => {
  const f = fixture();
  assert.equal(f.controller.handleAction('show-editor'), true);
  f.drain();
  f.scrollTo(174);
  f.controller.handleAction('domain:process');
  f.drain();
  assert.equal(f.restores.at(-1), 0);
  f.scrollTo(392);
  f.controller.handleAction('domain:project');
  f.drain();
  assert.equal(f.restores.at(-1), 174);
  f.controller.handleAction('domain:process');
  f.drain();
  assert.equal(f.restores.at(-1), 392);
  f.controller.handleAction('return-results');
  f.drain();
  assert.equal(f.state.mobile, 'view');
  assert.equal(f.restores.at(-1), 0);
  f.controller.handleAction('show-editor');
  f.drain();
  assert.equal(f.restores.at(-1), 392);
});

test('Mask coupling and scientific view selection preserve existing navigation semantics', () => {
  const f = fixture();
  f.controller.handleAction('domain:mask');
  assert.equal(f.state.domain, 'mask');
  assert.equal(f.state.mobile, 'edit');
  assert.equal(f.state.view, 'mask');
  assert.equal(f.state.maximize, 'mask');
  f.controller.handleAction('view:three');
  assert.equal(f.state.view, 'three');
  assert.equal(f.state.mode, 'single');
  assert.equal(f.state.maximize, null);
  f.controller.handleAction('mobile-section');
  assert.equal(f.state.view, 'section');
  assert.equal(f.state.mode, 'single');
  f.controller.handleAction('domain:history');
  assert.equal(f.state.domain, 'history');
  assert.equal(f.state.maximize, null);
});

test('pending restoration is canceled by newer mode changes or compact breakpoint exits', () => {
  const f = fixture();
  f.controller.handleAction('show-editor');
  f.controller.handleAction('return-results');
  f.drain();
  assert.deepEqual(f.restores, [0]);
  f.controller.handleAction('show-editor');
  f.setCompact(false);
  f.drain();
  assert.deepEqual(f.restores, [0]);
  assert.equal(f.controller.handleAction('return-results'), false);
  f.setCompact(true);
  f.controller.handleAction('show-editor');
  f.controller.destroy();
  f.drain();
  assert.deepEqual(f.restores, [0]);
});

test('non-navigation commands stay with scientific and desktop controllers', () => {
  const f = fixture();
  assert.equal(f.controller.handleAction('section'), false);
  assert.equal(f.controller.handleAction('dock:view:mask'), false);
  assert.equal(f.controller.handleAction('face:main'), false);
  assert.equal(f.state.view, 'main');
  f.setCompact(false);
  assert.equal(f.controller.handleAction('domain:mask'), false);
  assert.equal(f.state.domain, 'project');
});
