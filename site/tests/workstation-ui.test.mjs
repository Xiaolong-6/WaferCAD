import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKSTATION_TOOL_ORDER,
  getAdjacentToolName,
  isCompactWorkstationViewport,
  preferredWorkstationViewMode,
} from '../workstation-ui.js';

test('workstation tool navigation moves one section and clamps at ends', () => {
  assert.equal(getAdjacentToolName('project', -1), 'project');
  assert.equal(getAdjacentToolName('project', 1), 'base');
  assert.equal(getAdjacentToolName('mask', 1), 'process');
  assert.equal(getAdjacentToolName('snapshots', 1), 'snapshots');
});

test('workstation tool order keeps the continuous function flow', () => {
  assert.deepEqual(WORKSTATION_TOOL_ORDER, [
    'project',
    'base',
    'mask',
    'process',
    'snapshots',
  ]);
});

test('mobile prefers a focused single Main view while desktop opens overview', () => {
  assert.equal(preferredWorkstationViewMode(390), 'main');
  assert.equal(preferredWorkstationViewMode(820), 'main');
  assert.equal(preferredWorkstationViewMode(821), 'overview');
  assert.equal(preferredWorkstationViewMode(1440), 'overview');
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
