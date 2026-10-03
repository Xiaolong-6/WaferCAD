import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  serializeProject,
} from '../project-io.js';
import { validateProjectFile } from '../project-schema.js';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

function validProject(processRevision = 0) {
  return {
    format: 'WaferCAD-vector',
    model: {
      kernel: 'vector-2.5d-v1',
      shape: 'rect',
      width: 20,
      height: 10,
      thickness: 2,
      boundary: [
        [
          [
            [-10, -5],
            [10, -5],
            [10, 5],
            [-10, 5],
            [-10, -5],
          ],
        ],
      ],
      units: { xy: 'µm', z: 'µm' },
      layers: [{ id: 'base', name: 'Base', color: '#C3CBD4' }],
      regions: [
        {
          id: 'region-1',
          geom: [
            [
              [
                [-10, -5],
                [10, -5],
                [10, 5],
                [-10, 5],
                [-10, -5],
              ],
            ],
          ],
          stack: [{ layerId: 'base', z0: -1, z1: 1 }],
        },
      ],
      nextLayerId: 1,
      nextRegionId: 2,
      revision: processRevision + 1,
      processRevision,
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
    selectedLayerKeys: [],
    activeCell: 'TOP',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    section: { a: [-8, 0], b: [8, 0] },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      customStructurePalette: null,
    },
  };
}

test('V2 process history and branch HEAD state survive packed project storage', () => {
  const source = validProject(2);
  const milestoneState = validProject(1);
  const headState = validProject(2);

  source.snapshots = [
    {
      id: 'snapshot-oxide',
      name: 'After oxide',
      createdAt: '2026-10-03T10:01:00.000Z',
      branchId: 'main',
      parentId: null,
      historyNodeId: 'process-1',
      state: milestoneState,
    },
  ];
  source.snapshotBranches = {
    version: 2,
    activeBranchId: 'main',
    cursorNodeId: 'process-2',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Deposit oxide' },
        state: milestoneState,
      },
      {
        id: 'process-2',
        branchId: 'main',
        parentId: 'process-1',
        createdAt: '2026-10-03T10:02:00.000Z',
        processRevision: 2,
        operation: { kind: 'etch', label: 'Etch active window' },
        state: headState,
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: 'snapshot-oxide',
        rootNodeId: 'process-1',
        headNodeId: 'process-2',
        headState,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  };

  assert.equal(validateProjectFile(source), source);

  const stored = JSON.parse(serializeProject(source));
  assert.equal(stored.snapshotBranches.version, 2);
  assert.equal(stored.snapshotBranches.nodes[1].parentId, 'process-1');
  assert.equal(stored.snapshots[0].historyNodeId, 'process-1');
  assert.equal(stored.snapshotBranches.nodes[0].state.model, undefined);
  assert.ok(stored.snapshotBranches.nodes[0].state.modelRef != null);
  assert.equal(stored.snapshotBranches.branches[0].headState.model, undefined);
  assert.ok(stored.snapshotBranches.branches[0].headState.modelRef != null);

  expandProjectStorage(stored);
  assert.equal(stored.snapshotBranches.nodes[0].state.model.processRevision, 1);
  assert.equal(stored.snapshotBranches.branches[0].headState.model.processRevision, 2);
  assert.equal(validateProjectFile(stored), stored);

  const workspaceStored = prepareProjectForWorkspaceStorage(source);
  assert.ok(workspaceStored.snapshotBranches.nodes[0].state.modelRef != null);
  assert.ok(workspaceStored.snapshotBranches.branches[0].headState.modelRef != null);
  expandProjectStorage(workspaceStored);
  assert.equal(workspaceStored.snapshotBranches.nodes[0].state.model.processRevision, 1);
  assert.equal(workspaceStored.snapshotBranches.branches[0].headState.model.processRevision, 2);
});

test('V2 schema rejects dangling process history references', () => {
  const source = validProject(1);
  source.snapshotBranches = {
    version: 2,
    activeBranchId: 'main',
    cursorNodeId: 'missing',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Deposit oxide' },
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-1',
        headState: validProject(1),
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  };

  assert.throws(
    () => validateProjectFile(source),
    /cursorNodeId references an unknown process node/,
  );

  source.snapshotBranches.cursorNodeId = 'process-1';
  source.snapshotBranches.nodes[0].parentId = 'missing';
  assert.throws(
    () => validateProjectFile(source),
    /parentId references an unknown process node/,
  );
});
