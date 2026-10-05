import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKSTATION_TOOL_ORDER,
  getAdjacentToolName,
  isCompactWorkstationViewport,
  normalizeSplitViews,
  preferredWorkstationViewMode,
  replaceSplitSlotView,
} from '../workstation-ui.js';

test('workstation tool navigation moves one section and clamps at ends', () => {
  assert.equal(getAdjacentToolName('project', -1), 'project');
  assert.equal(getAdjacentToolName('project', 1), 'base');
  assert.equal(getAdjacentToolName('mask', 1), 'process');
  assert.equal(getAdjacentToolName('snapshots', 1), 'snapshots');
});

test('workstation tool order keeps the continuous function flow', () => {
  assert.deepEqual(WORKSTATION_TOOL_ORDER, ['project', 'base', 'mask', 'process', 'snapshots']);
});

test('workstation defaults wide screens to Overview and restores explicit remembered views', () => {
  assert.equal(preferredWorkstationViewMode(390), 'main');
  assert.equal(preferredWorkstationViewMode(820), 'main');
  assert.equal(preferredWorkstationViewMode(821), 'main');
  assert.equal(preferredWorkstationViewMode(1120), 'main');
  assert.equal(preferredWorkstationViewMode(1121), 'overview');
  assert.equal(preferredWorkstationViewMode(1440), 'overview');
  assert.equal(preferredWorkstationViewMode(1440, 'main'), 'main');
  assert.equal(preferredWorkstationViewMode(1440, 'overview'), 'overview');
  assert.equal(preferredWorkstationViewMode(1440, 'split'), 'split');
  assert.equal(preferredWorkstationViewMode(1440, 'three'), 'three');
  assert.equal(preferredWorkstationViewMode(390, 'three'), 'three');
  assert.equal(preferredWorkstationViewMode(390, 'overview'), 'main');
});

test('compact detection survives a desktop-sized CSS viewport on a phone', () => {
  const mobileDesktopSite = {
    innerWidth: 980,
    screen: { width: 390 },
    matchMedia: () => ({ matches: true }),
  };
  const desktopTouchscreen = {
    innerWidth: 1440,
    screen: { width: 1440 },
    matchMedia: () => ({ matches: true }),
  };
  const narrowMouse = {
    innerWidth: 700,
    screen: { width: 700 },
    matchMedia: () => ({ matches: false }),
  };

  assert.equal(isCompactWorkstationViewport(mobileDesktopSite), true);
  assert.equal(isCompactWorkstationViewport(desktopTouchscreen), false);
  assert.equal(isCompactWorkstationViewport(narrowMouse), true);
});

test('Split view keeps two distinct panes and allows arbitrary left/right replacement', () => {
  assert.deepEqual(normalizeSplitViews(), ['main', 'three']);
  assert.deepEqual(normalizeSplitViews(['mask', 'main']), ['mask', 'main']);
  assert.deepEqual(normalizeSplitViews(['main', 'main']), ['main', 'mask']);

  assert.deepEqual(replaceSplitSlotView(['main', 'three'], 'left', 'mask'), ['mask', 'three']);
  assert.deepEqual(replaceSplitSlotView(['main', 'three'], 'right', 'mask'), ['main', 'mask']);

  // Choosing the view already used by the other side swaps the panes instead
  // of creating an impossible duplicate DOM view.
  assert.deepEqual(replaceSplitSlotView(['main', 'three'], 'left', 'three'), ['three', 'main']);
  assert.deepEqual(replaceSplitSlotView(['main', 'three'], 'right', 'main'), ['three', 'main']);
});
