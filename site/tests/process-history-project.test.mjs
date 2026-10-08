import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  readProjectFile,
  serializeProject,
} from '../project-io.js';
import { validateProjectFile, validateProjectFiles } from '../project-schema.js';
import { createSnapshotManager } from '../workspace-snapshots.js';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { applyOperation } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');

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

test('V3 restorable process history survives packed project storage', () => {
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
    version: 3,
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
  assert.equal(stored.snapshotBranches.version, 3);
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

test('V3 Variant parent linkage survives validation and packed storage', () => {
  const source = validProject(1);
  const step = validProject(1);
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'variant-1',
    cursorNodeId: 'process-1',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-04T00:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Origin Step' },
        state: step,
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-1',
        headState: step,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      {
        id: 'variant-1',
        name: 'Detector path',
        parentBranchId: 'main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-1',
        headState: step,
        createdAt: '2026-10-04T00:01:00.000Z',
      },
    ],
  };

  assert.equal(validateProjectFile(source), source);
  const stored = JSON.parse(serializeProject(source));
  assert.equal(stored.snapshotBranches.branches[1].parentBranchId, 'main');
  assert.equal(stored.snapshotBranches.branches[1].rootNodeId, 'process-1');
  expandProjectStorage(stored);
  assert.equal(validateProjectFile(stored), stored);

  source.snapshotBranches.branches[1].parentBranchId = 'missing';
  assert.throws(() => validateProjectFile(source), /parentBranchId.*unknown parent variant/i);
});

test('V3 schema rejects Variant cycles and mismatched origin ownership', () => {
  const source = validProject(1);
  const step = validProject(1);
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'variant-a',
    cursorNodeId: 'process-main',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-main',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-04T00:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Main Step' },
        state: step,
      },
      {
        id: 'process-a',
        branchId: 'variant-a',
        parentId: 'process-main',
        createdAt: '2026-10-04T00:01:30.000Z',
        processRevision: 2,
        operation: { kind: 'add', label: 'A Step' },
        state: validProject(2),
      },
      {
        id: 'process-b',
        branchId: 'variant-b',
        parentId: 'process-a',
        createdAt: '2026-10-04T00:02:00.000Z',
        processRevision: 3,
        operation: { kind: 'etch', label: 'B Step' },
        state: validProject(3),
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-main',
        headNodeId: 'process-main',
        headState: step,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      {
        id: 'variant-a',
        name: 'A',
        parentBranchId: 'main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-main',
        headNodeId: 'process-a',
        headState: validProject(2),
        createdAt: '2026-10-04T00:01:00.000Z',
      },
      {
        id: 'variant-b',
        name: 'B',
        parentBranchId: 'variant-a',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-b',
        headNodeId: 'process-b',
        headState: validProject(3),
        createdAt: '2026-10-04T00:02:00.000Z',
      },
    ],
  };

  assert.throws(() => validateProjectFile(source), /rootNodeId.*owned by the parent Variant/i);

  source.snapshotBranches.branches[2].rootNodeId = 'process-a';
  source.snapshotBranches.branches[2].parentBranchId = 'variant-a';
  source.snapshotBranches.branches[1].rootNodeId = 'process-b';
  source.snapshotBranches.branches[1].parentBranchId = 'variant-b';
  assert.throws(() => validateProjectFile(source), /parentBranchId.*ancestry cycle/i);
});

test('V3 schema rejects a Variant HEAD path that does not descend from its origin Step', () => {
  const source = validProject(3);
  const originState = validProject(1);
  const childState = validProject(2);
  const foreignState = validProject(3);
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'variant-a',
    cursorNodeId: 'process-a',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-main',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-04T00:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Origin' },
        state: originState,
      },
      {
        id: 'process-a',
        branchId: 'variant-a',
        parentId: 'process-main',
        createdAt: '2026-10-04T00:01:00.000Z',
        processRevision: 2,
        operation: { kind: 'add', label: 'A Step' },
        state: childState,
      },
      {
        id: 'process-foreign',
        branchId: 'main',
        parentId: 'process-main',
        createdAt: '2026-10-04T00:02:00.000Z',
        processRevision: 3,
        operation: { kind: 'etch', label: 'Foreign Step' },
        state: foreignState,
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-main',
        headNodeId: 'process-foreign',
        headState: foreignState,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      {
        id: 'variant-a',
        name: 'A',
        parentBranchId: 'main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-main',
        headNodeId: 'process-a',
        headState: childState,
        createdAt: '2026-10-04T00:01:00.000Z',
      },
    ],
  };

  assert.equal(validateProjectFile(source), source);

  source.snapshotBranches.branches[1].headNodeId = 'process-foreign';
  source.snapshotBranches.branches[1].headState = foreignState;
  assert.throws(
    () => validateProjectFile(source),
    /headNodeId.*owned by this Variant|headNodeId.*origin Step/i,
  );
});

test('V3 process-node restore states survive the project Open path', async () => {
  const source = validProject(2);
  const stepOne = validProject(1);
  const stepTwo = validProject(2);
  source.snapshotBranches = {
    version: 3,
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
        operation: { kind: 'add', label: 'Step one' },
        state: stepOne,
      },
      {
        id: 'process-2',
        branchId: 'main',
        parentId: 'process-1',
        createdAt: '2026-10-03T10:01:00.000Z',
        processRevision: 2,
        operation: { kind: 'etch', label: 'Step two' },
        state: stepTwo,
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-2',
        headState: stepTwo,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  };

  const text = serializeProject(source);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(text),
    text: async () => text,
  });
  assert.equal(loaded.snapshotBranches.version, 3);
  assert.equal(loaded.snapshotBranches.nodes[0].state.model.processRevision, 1);
  assert.equal(loaded.snapshotBranches.nodes[1].state.model.processRevision, 2);

  let live = loaded;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => {
      try {
        validateProjectFile(value);
        return true;
      } catch {
        return false;
      }
    },
  });
  manager.importRecords(loaded.snapshots || [], loaded.snapshotBranches);
  assert.equal(manager.restoreProcessNode('process-1'), true);
  assert.equal(live.model.processRevision, 1);
});

test('V2 process history without node restore states remains backward compatible', () => {
  const source = validProject(1);
  source.snapshotBranches = {
    version: 2,
    activeBranchId: 'main',
    cursorNodeId: 'process-1',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Legacy process step' },
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

  assert.equal(validateProjectFile(source), source);
});

test('V3 schema rejects process nodes without restore states', () => {
  const source = validProject(1);
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: 'process-1',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Missing state' },
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
    /state.*required for restorable process history/i,
  );
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
  assert.throws(() => validateProjectFile(source), /parentId references an unknown process node/);
});

test('shared geometry round-trip preserves all Steps and isolates restored edits', async () => {
  let current = validProject(0);
  let batchCalls = 0;
  const options = {
    capture: () => current,
    restore: (state) => {
      current = state;
    },
    validateState: (state) => {
      validateProjectFile(state);
      return true;
    },
    validateStates: (states) => {
      batchCalls++;
      validateProjectFiles(states);
      return true;
    },
  };
  const original = createSnapshotManager(options);
  for (let index = 1; index <= 4; index++) {
    current = validProject(index);
    current.model.regions[0].stack[0].z1 += index * 0.1;
    original.recordOperation({ kind: 'record', label: `Tier step ${index}` });
    if (index % 2 === 0) original.bookmarkCurrentStep(`Tier bookmark ${index}`);
  }
  const source = {
    ...current,
    snapshots: original.exportRecords(),
    snapshotBranches: original.exportBranchState(),
  };
  const text = serializeProject(source);
  const loaded = await readProjectFile({ size: new Blob([text]).size, text: async () => text });
  assert.equal(loaded.snapshotBranches.nodes.length, 4);
  assert.equal(loaded.snapshots.length, 2);
  current = loaded;
  const imported = createSnapshotManager(options);
  imported.importRecords(loaded.snapshots, loaded.snapshotBranches);
  assert.equal(batchCalls, 1);
  const before = imported.exportBranchState();
  const sourceBefore = structuredClone(loaded);
  const first = before.nodes[0];
  assert.equal(imported.restoreProcessNode(first.id), true);
  current.model.boundary[0][0][0][0] += 0.01;
  current.model.layers[0].name = 'Edited live material';
  const after = imported.exportBranchState();
  assert.deepEqual(after.nodes[1].state, before.nodes[1].state);
  assert.deepEqual(after.branches[0].headState, before.branches[0].headState);
  assert.deepEqual(loaded, sourceBefore);
});

test('batch History validation falls back to filtering invalid states', () => {
  const good = validProject(1);
  const bad = validProject(2);
  bad.model.regions[0].stack[0].z1 = -2;
  const manager = createSnapshotManager({
    capture: () => good,
    restore: () => {},
    validateStates: () => false,
    validateState: (state) => {
      try {
        validateProjectFile(state);
        return true;
      } catch {
        return false;
      }
    },
  });
  const count = manager.importRecords(
    [
      { id: 'good', name: 'Good', createdAt: '2026-10-06T00:00:00.000Z', state: good },
      { id: 'bad', name: 'Bad', createdAt: '2026-10-06T00:00:00.000Z', state: bad },
    ],
    { nodes: {}, branches: {} },
  );
  assert.equal(count, 1);
  assert.equal(manager.exportRecords()[0].id, 'good');
});

test('reopened History process replay sanitizes zero-area boolean sweep artifacts', async () => {
  const source = validProject(1),
    restoredState = validProject(1);
  source.model = structuredClone(restoredState.model);
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: 'process-1',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-07T00:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'record', label: 'Persisted predecessor' },
        state: restoredState,
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-1',
        headState: restoredState,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  };

  const text = serializeProject(source),
    loaded = await readProjectFile({ size: new Blob([text]).size, text: async () => text });
  let live = loaded;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => {
      validateProjectFile(value);
      return true;
    },
  });
  manager.importRecords([], loaded.snapshotBranches);
  assert.equal(manager.restoreProcessNode('process-1'), true);

  const originalDifference = globalThis.polygonClipping.difference;
  let injected = false;
  globalThis.polygonClipping.difference = (...args) => {
    const result = originalDifference(...args);
    if (injected || !Array.isArray(result) || !result.length) return result;
    injected = true;
    return [
      ...result,
      [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ],
      ],
    ];
  };

  try {
    const operation = applyOperation(live.model, {
      type: 'etch',
      thickness: 0.2,
      face: 'front',
      area: rectMulti(8, 4),
      etchProfile: 'directional',
      etchTargetLayerIds: ['base'],
    });
    assert.equal(operation.changed, true, operation.error);
    assert.equal(injected, true, 'fixture must inject a zero-area boolean fragment');
    assert.equal(validateProjectFile(live), live);
  } finally {
    globalThis.polygonClipping.difference = originalDifference;
  }
});
