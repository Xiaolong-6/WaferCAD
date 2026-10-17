import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  attachExperimentalPhysicalFacetOwner,
  validateExperimentalPhysicalFacetModel,
} from '../physical-facet-model.js';
import { physicalOwnerVolume } from '../physical-facet-owner.js';
import { physicalPyramidSection, physicalPyramidSolidMesh } from '../physical-facet-surface.js';
import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  readProjectFile,
  serializeProject,
} from '../project-io.js';
import { CURRENT_PROJECT_VERSION, validateProjectFile } from '../project-schema.js';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const vendor = { exports: {} };
new Function('module', 'exports', vendorSource)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel, applyOperation, modelBoundsZ } = await import('../model.js');
const { sectionSlices, materialSolids } = await import('../model-view-geometry.js');

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

test('production Process and legacy 3D/Section fail closed for physical geometry', () => {
  const project = fixture();
  const before = structuredClone(project.model);
  const result = applyOperation(project.model, { type: 'add', name: 'Oxide', thickness: 0.05 });
  assert.equal(result.changed, false);
  assert.match(result.error, /Experimental physical facet/);
  assert.deepEqual(project.model, before);
  assert.throws(
    () => sectionSlices(project.model, [-6.4, 0], [6.4, 0]),
    /refusing flat surrogate/,
  );
  assert.throws(() => materialSolids(project.model), /refusing flat surrogate/);
});

test('invalid physical descriptors, modified regions and unsupported UI import fail closed', async () => {
  const pristine = fixture();
  for (const edit of [
    (model) => { model.experimentalPhysicalFacetOwner.height = 0; },
    (model) => { model.experimentalPhysicalFacetOwner.layerId = 'fake'; },
    (model) => { model.experimentalPhysicalFacetOwner.domain.maxX = 7; },
    (model) => { model.regions[0].stack[0].z1 = 126; },
    (model) => { model.regions[0].geom[0][0][1][0] += 0.2; },
    (model) => { model.layers.push({ id: 'oxide', name: 'Oxide', color: '#ffffff' }); },
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
  const legacy = fixture(false);
  const data = serializeProject(legacy);
  assert.deepEqual(
    (await readProjectFile({ size: Buffer.byteLength(data), text: async () => data })).model,
    legacy.model,
  );
});
