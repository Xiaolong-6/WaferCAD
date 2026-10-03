import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKSTATION_TOOL_ORDER,
  getAdjacentToolName,
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
