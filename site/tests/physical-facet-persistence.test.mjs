import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  attachExperimentalPhysicalFacetOwner,
  attachExperimentalPhysicalFacetShell,
  validateExperimentalPhysicalFacetModel,
} from '../physical-facet-model.js';
import { makePhysicalPyramidOwner, physicalOwnerVolume } from '../physical-facet-owner.js';
import { createPhysicalFacetShellQuery } from '../physical-facet-shell-owner.js';
import { physicalPyramidSection, physicalPyramidSolidMesh } from '../physical-facet-surface.js';
import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  readProjectFile,
  serializeProject,
} from '../project-io.js';
import { CURRENT_PROJECT_VERSION, validateProjectFile } from '../project-schema.js';
import { createSnapshotManager } from '../workspace-snapshots.js';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const vendor = { exports: {} };
new Function('module', 'exports', vendorSource)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel, applyOperation, modelBoundsZ } = await import('../model.js');
const { sectionSlices, materialSolids, sectionContours } =
  await import('../model-view-geometry.js');

const descriptor = {
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
};

function fixture(physical = true) {
  const flat = createModel({ shape: 'rect', width: 12.8, height: 12.8, thickness: 251 });
  const model = physical ? attachExperimentalPhysicalFacetOwner(flat, descriptor) : flat;
  return {
    format: 'WaferCAD-vector',
    version: CURRENT_PROJECT_VERSION,
    name: 'Experimental Si Facet Cell',
    model,
    layout: {
      name: 'empty.gds',
      root: 'TOP',
      elements: [],
      linework: [],
      bounds: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4, width: 12.8, height: 12.8 },
      combos: [],
      hierarchy: { TOP: [] },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [],
    activeCell: 'TOP',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    section: { a: [-6.4, 0], b: [6.4, 0] },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: { xyUnit: 'um', structurePalette: 'balanced', customStructurePalette: null },
  };
}

test('opt-in Base owner has physical Z bounds and conserves mass', () => {
  const project = fixture();
  const owner = validateExperimentalPhysicalFacetModel(project.model);
  assert.equal(owner.layerId, 'base');
  assert.equal(project.model.kernel, 'vector-physical-facet-experimental-v1');
  assert.deepEqual(modelBoundsZ(project.model), [-130, 130]);
  const mesh = physicalPyramidSolidMesh(owner);
  const cut = physicalPyramidSection(owner, [-6.4, 0], [6.4, 0]);
  assert.ok(cut.points.some((point) => point.z1 === 130));
  assert.equal(mesh.sourceCells > 0, true);
  assert.ok(physicalOwnerVolume(owner) > 12.8 * 12.8 * 251);
  assert.equal(validateProjectFile(project), project);
});

test('normal storage, workspace storage, Snapshot and History keep one true owner', () => {
  const source = fixture();
  const initial = structuredClone(source);
  const time = '2026-10-17T00:00:00.000Z';
  source.snapshots = [
    { id: 'physical-1', name: 'Physical Si', createdAt: time, state: structuredClone(initial) },
  ];
  source.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: 'physical-1',
    cursorSnapshotId: 'physical-1',
    nodes: [
      {
        id: 'physical-1',
        branchId: 'main',
        parentId: null,
        createdAt: time,
        processRevision: 0,
        operation: { kind: 'record', label: 'Read-only experimental geometry' },
        state: structuredClone(initial),
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: 'physical-1',
        headSnapshotId: 'physical-1',
        rootNodeId: 'physical-1',
        headNodeId: 'physical-1',
        headState: structuredClone(initial),
        createdAt: time,
      },
    ],
  };
  assert.equal(validateProjectFile(source), source);
  for (const packed of [
    JSON.parse(serializeProject(source)),
    prepareProjectForWorkspaceStorage(source),
  ]) {
    const restored = expandProjectStorage(packed);
    validateProjectFile(restored);
    const owner = source.model.experimentalPhysicalFacetOwner;
    for (const state of [
      restored,
      restored.snapshots[0].state,
      restored.snapshotBranches.nodes[0].state,
      restored.snapshotBranches.branches[0].headState,
    ]) {
      assert.deepEqual(state.model.experimentalPhysicalFacetOwner, owner);
      assert.deepEqual(
        physicalPyramidSection(state.model.experimentalPhysicalFacetOwner, [-6.4, 0], [6.4, 0]),
        physicalPyramidSection(owner, [-6.4, 0], [6.4, 0]),
      );
    }
  }
});

test('coated 3D material survives .wafercad, Workspace and History without false Si-only views', async () => {
  const project = fixture();
  project.model = attachExperimentalPhysicalFacetShell(project.model, {
    layerId: 'oxide',
    thicknessUm: 0.05,
  });
  validateProjectFile(project);
  const query = createPhysicalFacetShellQuery(project.model.experimentalPhysicalFacetShell);
  assert.equal(query.sample([0, 0, 130.02]).materialLayerId, 'oxide');
  assert.throws(
    () => sectionContours(project.model, [-6.4, 0], [6.4, 0]),
    /refusing Si-only surrogate/,
  );
  const poisoned = structuredClone(project);
  poisoned.model.experimentalPhysicalFacetShell.silicon.height = 2;
  assert.throws(() => validateProjectFile(poisoned), /coating and silicon descriptors/);
  const earlier = structuredClone(project);
  const time = '2026-10-17T00:00:00.000Z';
  project.snapshots = [
    {
      id: 'coated-unit',
      name: 'Full exterior oxide owner',
      createdAt: time,
      state: earlier,
    },
  ];
  const expected = earlier.model.experimentalPhysicalFacetShell;
  for (const stored of [
    JSON.parse(serializeProject(project)),
    prepareProjectForWorkspaceStorage(project),
  ]) {
    const reopened = expandProjectStorage(stored);
    validateProjectFile(reopened);
    for (const state of [reopened, reopened.snapshots[0].state]) {
      assert.deepEqual(state.model.experimentalPhysicalFacetShell, expected);
      const material = createPhysicalFacetShellQuery(state.model.experimentalPhysicalFacetShell);
      assert.equal(material.sample([0, 0, 130.02]).materialLayerId, 'oxide');
      assert.equal(material.sample([0, 0, 0]).materialLayerId, 'base');
      assert.equal(material.sample([6.42, 6.42, 0]).materialLayerId, 'oxide');
    }
  }
  const raw = serializeProject(project);
  await assert.rejects(
    readProjectFile({ size: Buffer.byteLength(raw), text: async () => raw }),
    /not yet supported in the production Workstation/,
  );
});

test('Snapshot Manager restores physical material and reopens two distinct facet phases', () => {
  const session = { live: fixture() };
  let serial = 0;
  const managerOptions = {
    capture: () => session.live,
    restore: (state) => {
      session.live = state;
    },
    validateState: (state) => {
      try {
        return Boolean(validateExperimentalPhysicalFacetModel(state.model));
      } catch {
        return false;
      }
    },
    idFactory: () => `physical-checkpoint-${++serial}`,
    now: () => new Date('2026-10-17T00:00:00.000Z'),
  };
  const manager = createSnapshotManager(managerOptions);
  const first = manager.create('Physical phase A');
  const a = [-6.4, 0.5];
  const b = [6.4, 0.5];
  const profileOf = (state) =>
    physicalPyramidSection(state.model.experimentalPhysicalFacetOwner, a, b);
  const firstCut = profileOf(session.live);

  const shifted = structuredClone(session.live);
  shifted.model.experimentalPhysicalFacetOwner = makePhysicalPyramidOwner({
    ...descriptor,
    originX: 1.6,
  });
  shifted.model.revision++;
  session.live = shifted;
  const second = manager.create('Physical phase B');
  const secondCut = profileOf(session.live);
  assert.notDeepEqual(secondCut, firstCut, 'Distinct phases must change physical topology');
  assert.equal(manager.restore(first.id), true);
  assert.deepEqual(profileOf(session.live), firstCut);
  assert.equal(manager.restore(second.id), true);
  assert.deepEqual(profileOf(session.live), secondCut);

  const stored = {
    ...session.live,
    snapshots: manager.exportRecords(),
    snapshotBranches: manager.exportBranchState(),
  };
  validateProjectFile(stored);
  const reopened = expandProjectStorage(JSON.parse(serializeProject(stored)));
  validateProjectFile(reopened);
  const sessionAfterOpen = { live: reopened };
  const restoredManager = createSnapshotManager({
    capture: () => sessionAfterOpen.live,
    restore: (state) => {
      sessionAfterOpen.live = state;
    },
    validateState: managerOptions.validateState,
  });
  restoredManager.importRecords(reopened.snapshots, reopened.snapshotBranches);
  assert.equal(restoredManager.restore(first.id), true);
  assert.deepEqual(profileOf(sessionAfterOpen.live), firstCut);
  assert.equal(restoredManager.restore(second.id), true);
  assert.deepEqual(profileOf(sessionAfterOpen.live), secondCut);
});

test('native Section contour consumes actual physical facet breakpoints', () => {
  const source = fixture();
  const a = [-6.4, 0];
  const b = [6.4, 0];
  const physical = physicalPyramidSection(source.model.experimentalPhysicalFacetOwner, a, b);
  const contours = sectionContours(source.model, a, b);
  assert.equal(contours.length, 1);
  assert.equal(contours[0].layerId, 'base');
  const ring = contours[0].polys[0][0];
  const top = physical.points.map(({ t, z1 }) => [t, z1]);
  const bottom = physical.points.toReversed().map(({ t, z0 }) => [t, z0]);
  assert.deepEqual(ring, [...top, ...bottom, top[0]]);
  assert.ok(ring.some(([, z]) => z === 130));
  assert.ok(ring.some(([, z]) => z === -130));
});

test('production Process and legacy 3D/Section fail closed for physical geometry', () => {
  const project = fixture();
  const before = structuredClone(project.model);
  const result = applyOperation(project.model, { type: 'add', name: 'Oxide', thickness: 0.05 });
  assert.equal(result.changed, false);
  assert.match(result.error, /Experimental physical facet/);
  assert.deepEqual(project.model, before);
  assert.throws(() => sectionSlices(project.model, [-6.4, 0], [6.4, 0]), /refusing flat surrogate/);
  assert.throws(() => materialSolids(project.model), /refusing flat surrogate/);
});

test('invalid physical descriptors, modified regions and unsupported UI import fail closed', async () => {
  const pristine = fixture();
  for (const edit of [
    (model) => {
      model.experimentalPhysicalFacetOwner.height = 0;
    },
    (model) => {
      model.experimentalPhysicalFacetOwner.layerId = 'fake';
    },
    (model) => {
      model.experimentalPhysicalFacetOwner.domain.maxX = 7;
    },
    (model) => {
      model.regions[0].stack[0].z1 = 126;
    },
    (model) => {
      model.regions[0].geom[0][0][1][0] += 0.2;
    },
    (model) => {
      model.layers.push({ id: 'oxide', name: 'Oxide', color: '#ffffff' });
    },
    (model) => {
      model.kernel = 'vector-2.5d-v1';
    },
    (model) => {
      delete model.experimentalPhysicalFacetOwner;
    },
  ]) {
    const mutated = structuredClone(pristine);
    edit(mutated.model);
    assert.throws(() => validateProjectFile(mutated), /physical facet|model geometry/i);
  }
  const text = serializeProject(pristine);
  await assert.rejects(
    readProjectFile({ size: Buffer.byteLength(text), text: async () => text }),
    /not yet supported in the production Workstation/,
  );
  const previewImport = await readProjectFile(
    { size: Buffer.byteLength(text), text: async () => text },
    { experimentalPhysicalFacetReadOnly: true },
  );
  assert.deepEqual(
    previewImport.model.experimentalPhysicalFacetOwner,
    pristine.model.experimentalPhysicalFacetOwner,
  );
  assert.deepEqual(
    sectionContours(previewImport.model, [-6.4, 0], [6.4, 0]),
    sectionContours(pristine.model, [-6.4, 0], [6.4, 0]),
  );
  const legacy = fixture(false);
  const data = serializeProject(legacy);
  assert.deepEqual(
    (await readProjectFile({ size: Buffer.byteLength(data), text: async () => data })).model,
    legacy.model,
  );
});
