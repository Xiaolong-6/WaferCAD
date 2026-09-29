import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProjectFile } from '../project-schema.js';

function validProject() {
  return {
    format: 'WaferCAD-vector',
    model: {
      kernel: 'vector-2.5d-v1',
      shape: 'rect',
      width: 200,
      height: 100,
      thickness: 8,
      boundary: [[[[ -100, -50 ], [100, -50], [100, 50], [-100, 50], [-100, -50]]]],
      units: { xy: 'µm', z: 'relative' },
      layers: [{ id: 'base', name: 'Base', color: '#C3CBD4' }],
      regions: [{
        id: 'region-1',
        geom: [[[[ -100, -50 ], [100, -50], [100, 50], [-100, 50], [-100, -50]]]],
        stack: [{ layerId: 'base', z0: -4, z1: 4 }],
      }],
      nextLayerId: 1,
      nextRegionId: 2,
      revision: 1,
      processRevision: 0,
    },
    layout: {
      name: 'fixture.gds',
      root: 'TOP',
      elements: [],
      linework: [],
      bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5, width: 20, height: 10 },
      combos: [],
      hierarchy: { TOP: [] },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: ['1|0', '2|0'],
    activeCell: 'TOP',
    maskTransform: { x: 2, y: -3, scale: 1.5, rotation: 12 },
    activeFace: 'back',
    roi: { type: 'rect', a: [-1, -2], b: [3, 4] },
    section: { a: [-20, 0], b: [20, 0] },
    planViews: {
      mask: { zoom: 2, panX: 1, panY: 2 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: { xyUnit: 'mm', structurePalette: 'balanced', customStructurePalette: null },
  };
}

test('project JSON round-trip remains valid', () => {
  const source = validProject();
  const loaded = JSON.parse(JSON.stringify(source));
  assert.equal(validateProjectFile(loaded), loaded);
  assert.deepEqual(loaded, source);
});

test('project validator rejects malformed stack structure', () => {
  const source = validProject();
  source.model.regions[0].stack[0].z1 = -5;
  assert.throws(() => validateProjectFile(source), /z1 > z0/);
});

test('project validator rejects unknown layer references', () => {
  const source = validProject();
  source.model.regions[0].stack[0].layerId = 'missing';
  assert.throws(() => validateProjectFile(source), /unknown layer/);
});

test('project validator rejects malformed layout structure', () => {
  const source = validProject();
  source.layout.elements = {};
  assert.throws(() => validateProjectFile(source), /layout\.elements must be an array/);
});


test('project validator accepts non-recursive snapshot records', () => {
  const source = validProject();
  const snapshotState = validProject();
  source.snapshots = [{
    id: 'snapshot-1',
    name: 'Before etch',
    createdAt: '2026-09-29T12:00:00.000Z',
    state: snapshotState,
  }];
  assert.equal(validateProjectFile(source), source);
});

test('project validator rejects recursive snapshot payloads', () => {
  const source = validProject();
  const snapshotState = validProject();
  snapshotState.snapshots = [];
  source.snapshots = [{
    id: 'snapshot-1',
    name: 'Recursive',
    createdAt: '2026-09-29T12:00:00.000Z',
    state: snapshotState,
  }];
  assert.throws(() => validateProjectFile(source), /must not be nested/);
});
