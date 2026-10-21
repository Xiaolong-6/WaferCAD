import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSnapshotManager } from '../workspace-snapshots.js';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const modelApi = await import('../model.js');
const { createModel } = modelApi;
const { applyOperation } = await import('../model.js');
const { validateProcessModel, validateProjectFile } = await import('../project-schema.js');
const { resolveSectionCollapse, createCollapsedZDisplayTransform } =
  await import('../section-z-collapse.js');
const {
  attachContinuousEtchModel,
  validateContinuousEtchModel,
  continuousModelMaterialAt,
  continuousModelColumnAtXY,
  assertContinuousEtchNotProcessed,
  assertContinuousEtchNotRendered,
  continuousEtchDisplayCollapse,
} = await import('../continuous-etch-model.js');

function fixture() {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 20 });
  return model;
}
const operation = {
  face: 'front',
  targetLayerIds: ['base'],
  lateralUm: 4,
  verticalUm: 4,
  shape: 'circular',
};

test('explicit dedicated kernel persists one analytic release without flat surrogate', () => {
  const base = fixture();
  const before = structuredClone(base);
  const model = attachContinuousEtchModel(base, operation);
  assert.deepEqual(base, before);
  assert.equal(model.kernel, 'vector-continuous-etch-v1');
  assert.equal(model.revision, base.revision + 1);
  assert.equal(validateProcessModel(model), model);
  assert.equal(continuousModelMaterialAt(model, [0, 0, 7]), null);
  assert.equal(continuousModelMaterialAt(model, [0, 0, 1]), 'base');
  assert.throws(() => assertContinuousEtchNotRendered(model), /flat material surrogate/);
  assert.match(assertContinuousEtchNotProcessed(model).error, /not yet supported/);
});

test('serialized kernel preserves material, rejects tampered mask and source', () => {
  const model = attachContinuousEtchModel(fixture(), operation);
  const saved = JSON.parse(JSON.stringify(model));
  assert.equal(continuousModelMaterialAt(saved, [0, 0, 7]), null);
  assert.deepEqual(
    continuousModelColumnAtXY(saved, [0, 0]),
    continuousModelColumnAtXY(model, [0, 0]),
  );
  const changedRegion = structuredClone(saved);
  changedRegion.regions[0].stack[0].z1 += 0.5;
  assert.throws(() => validateProcessModel(changedRegion), /reference material changed/);
  const changedSeed = structuredClone(saved);
  changedSeed.continuousEtchOwner.fronts[0].seedZ += 0.1;
  assert.throws(() => validateProcessModel(changedSeed), /disagrees/);
  const changedRevision = structuredClone(saved);
  changedRevision.revision++;
  assert.throws(() => validateProcessModel(changedRevision), /revision/);
  const wrongKernel = structuredClone(saved);
  wrongKernel.kernel = 'vector-2.5d-v1';
  assert.throws(() => validateProcessModel(wrongKernel), /dedicated/);
});

test('lossless Workspace geometry dictionaries preserve exact continuous material across key reorder', async () => {
  const { expandProjectStorage, prepareProjectForWorkspaceStorage } =
    await import('../project-io.js');
  // Use a real project envelope while constructing a simple, physical region
  // whose geom precedes stack. Packing moves geom after stack on expansion.
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const released = attachContinuousEtchModel(fixture(), operation);
  assert.deepEqual(Object.keys(released.regions[0]), ['id', 'geom', 'stack']);
  project.model = released;
  const stored = prepareProjectForWorkspaceStorage(project);
  assert.equal(stored.storage.lossless, true);
  const reopened = expandProjectStorage(structuredClone(stored));
  assert.deepEqual(Object.keys(reopened.model.regions[0]), ['id', 'stack', 'geom']);
  assert.deepEqual(reopened.model.regions, released.regions);
  assert.doesNotThrow(() => validateProcessModel(reopened.model));
  assert.doesNotThrow(() => validateProjectFile(reopened));
  assert.equal(continuousModelMaterialAt(reopened.model, [0, 0, 7]), null);
  assert.equal(continuousModelMaterialAt(reopened.model, [0, 0, 1]), 'base');
  const tampered = structuredClone(reopened.model);
  // The geometry dictionary may share immutable XY arrays between Boundary
  // and regions. Detach the region before simulating a localized corruption.
  tampered.regions[0].geom = structuredClone(tampered.regions[0].geom);
  tampered.regions[0].geom[0][0][0][0] += 0.125;
  assert.throws(
    () => validateContinuousEtchModel(tampered),
    /reference material changed: regions/,
    'Lossless restoration may reorder object keys but cannot alter actual geometry',
  );
});

test('continuous owner rejects changes to future physical fields beyond the legacy whitelist', () => {
  const original = fixture();
  // Optional forward-compatible scientific fields must be protected too.
  original.futureMaterialExtension = { effectiveLayerThicknessUm: 1.8, mode: 'exact' };
  const released = attachContinuousEtchModel(original, operation);
  assert.doesNotThrow(() => validateContinuousEtchModel(released));
  const restored = structuredClone(released);
  restored.futureMaterialExtension.effectiveLayerThicknessUm = 0.8;
  assert.throws(
    () => validateContinuousEtchModel(restored),
    /reference material changed: futureMaterialExtension/,
  );
  assert.equal(released.futureMaterialExtension.effectiveLayerThicknessUm, 1.8);
});

test('continuous appearance edits preserve physical revisions, round-trip and scientific guard', () => {
  const released = attachContinuousEtchModel(fixture(), operation);
  const initialRevision = released.revision;
  const initialProcessRevision = released.processRevision;
  const columns = continuousModelColumnAtXY(released, [0, 0]);
  const source = JSON.stringify(released.continuousEtchOwner.sourceModel);
  assert.equal(modelApi.setLayerVisible(released, 'base', false), true);
  assert.equal(modelApi.recolorLayer(released, 'base', '#123abc'), true);
  assert.equal(released.revision, initialRevision);
  assert.equal(released.processRevision, initialProcessRevision);
  assert.equal(JSON.stringify(released.continuousEtchOwner.sourceModel), source);
  assert.deepEqual(continuousModelColumnAtXY(released, [0, 0]), columns);
  const restored = JSON.parse(JSON.stringify(released));
  assert.doesNotThrow(() => validateProcessModel(restored));
  assert.equal(modelApi.setLayerVisible(restored, 'base', true), true);
  assert.equal(modelApi.recolorLayer(restored, 'base', '#abcdef'), true);
  assert.equal(restored.revision, initialRevision);
  assert.deepEqual(continuousModelColumnAtXY(restored, [0, 0]), columns);
  const changedName = structuredClone(restored);
  changedName.layers[0].name = 'material identity changed';
  assert.throws(
    () => validateContinuousEtchModel(changedName),
    /reference material changed: layers/,
  );
  const changedFields = structuredClone(restored);
  changedFields.layers[0].futureMaterialProperty = 'silicon';
  assert.throws(
    () => validateContinuousEtchModel(changedFields),
    /reference material changed: layers/,
  );
  const changedSource = structuredClone(restored);
  changedSource.continuousEtchOwner.sourceModel.regions[0].stack[0].z1 -= 0.25;
  assert.throws(() => validateContinuousEtchModel(changedSource), /disagrees|reference|material/);
});

test('existing 2.5D model and its Process behavior remain unchanged', () => {
  const model = fixture();
  const before = structuredClone(model);
  assert.equal(validateContinuousEtchModel(model), null);
  assert.equal(assertContinuousEtchNotProcessed(model), null);
  assert.doesNotThrow(() => assertContinuousEtchNotRendered(model));
  assert.deepEqual(model, before);
});

test('published Microdisk M07 continuous kernel round-trips the lossless .wafercad codec', async () => {
  const { readFileSync } = await import('node:fs');
  const { expandProjectStorage, prepareProjectForExport, readProjectFile, serializeProject } =
    await import('../project-io.js');
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
  assert.ok(m07);
  project.model = attachContinuousEtchModel(m07, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  const scienceRevision = project.model.revision;
  modelApi.recolorLayer(project.model, 'layer-1', '#ef852f');
  modelApi.setLayerVisible(project.model, 'base', false);
  assert.equal(project.model.revision, scienceRevision);
  const materialBefore = continuousModelColumnAtXY(project.model, [50, 0]);
  const saved = prepareProjectForExport(project);
  assert.equal(saved.mode, 'lossless');
  // Generic serialization is used by Workstation and History callers too.
  // The exact analytical owner must never enter the compact 2.5D codec.
  const text = serializeProject(project);
  assert.deepEqual(JSON.parse(text), saved.stored);
  const file = { size: Buffer.byteLength(text), text: async () => text };
  const read = await readProjectFile(file);
  assert.equal(read.model.layers.find((layer) => layer.id === 'layer-1').color, '#ef852f');
  assert.equal(read.model.layers.find((layer) => layer.id === 'base').visible, false);
  assert.equal(read.model.revision, scienceRevision);
  assert.deepEqual(continuousModelColumnAtXY(read.model, [50, 0]), materialBefore);
  assert.equal(continuousModelMaterialAt(read.model, [50, 0, 15]), null);
  assert.equal(continuousModelMaterialAt(read.model, [0, 0, 39]), 'base');
  assert.equal(continuousModelMaterialAt(read.model, [145, 0, 40.5]), 'layer-1');
});

test('unsupported follow-on Process rejects continuous material atomically', () => {
  const model = attachContinuousEtchModel(fixture(), operation);
  const original = JSON.stringify(model);
  const response = applyOperation(model, {
    type: 'etch',
    etchProfile: 'directional',
    etchTargetLayerIds: ['base'],
    thickness: 0.5,
    area: model.boundary,
    face: 'front',
  });
  assert.equal(response.changed, false);
  assert.match(response.error, /not yet supported/);
  assert.equal(JSON.stringify(model), original);
});

test('continuous release cannot inherit implicit or Workstation default Z Break', () => {
  const continuous = { kernel: 'vector-continuous-etch-v1' };
  const plain = { kernel: 'vector-2.5d-v1' };
  const workstationDefault = { enabled: true, top: 36.8, bottom: -36.8 };
  assert.deepEqual(continuousEtchDisplayCollapse(continuous, null), { enabled: false });
  assert.deepEqual(continuousEtchDisplayCollapse(continuous, workstationDefault), {
    enabled: false,
  });
  assert.equal(continuousEtchDisplayCollapse(plain, workstationDefault), workstationDefault);
  const explicit = { ...workstationDefault, continuousEtchExplicit: true };
  assert.equal(continuousEtchDisplayCollapse(continuous, explicit), explicit);
  const resolved = resolveSectionCollapse(
    continuousEtchDisplayCollapse(continuous, workstationDefault),
    continuous,
    [-40, 41.8],
  );
  const map = createCollapsedZDisplayTransform({
    zMin: -40,
    zMax: 41.8,
    collapse: resolved,
    breakFraction: 0,
  });
  // The real outer residual Si hill and cavity valley must remain physically
  // separated on screen. The implicit default previously mapped both to 0.
  assert.ok(Math.abs(map.mapZ(25.59) - map.mapZ(4.349) - 21.241) < 1e-9);
});

test('Workstation import validates continuous owners hidden in any History or Recovery state', async () => {
  const { createHash } = await import('node:crypto');
  const { expandProjectStorage, prepareProjectForExport, readProjectFile } =
    await import('../project-io.js');
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
  assert.ok(m07);
  const released = attachContinuousEtchModel(m07, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  assert.equal(project.model.kernel, 'vector-2.5d-v1');
  for (const variant of ['snapshot', 'historyNode', 'branchHead']) {
    const candidate = structuredClone(project);
    if (variant === 'snapshot') candidate.snapshots[0].state.model = released;
    else if (variant === 'historyNode') candidate.snapshotBranches.nodes[0].state.model = released;
    else candidate.snapshotBranches.branches[0].headState.model = released;
    const exported = prepareProjectForExport(candidate);
    assert.equal(exported.mode, 'lossless');
    const bytes = JSON.stringify(exported.stored);
    const file = new Blob([bytes], { type: 'application/json' });
    // A trusted receipt must not bypass exact continuous ownership validation.
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const opened = await readProjectFile(file, { trustedBundledExample: { sha256 } });
    const saved =
      variant === 'snapshot'
        ? opened.snapshots[0].state.model
        : variant === 'historyNode'
          ? opened.snapshotBranches.nodes[0].state.model
          : opened.snapshotBranches.branches[0].headState.model;
    assert.equal(validateContinuousEtchModel(saved).kind, 'wafercad-continuous-material-owner-v1');
  }
});

test('generic serialization preserves an exact continuous owner buried in History', async () => {
  const { expandProjectStorage, serializeProject } = await import('../project-io.js');
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
  assert.ok(m07);
  const released = attachContinuousEtchModel(m07, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  assert.equal(project.model.kernel, 'vector-2.5d-v1');
  const original = JSON.stringify(released);
  project.snapshots[0].state.model = released;
  const stored = JSON.parse(serializeProject(project));
  assert.equal(stored.storage?.lossless, true);
  const reopened = expandProjectStorage(stored);
  assert.deepEqual(reopened.snapshots[0].state.model, JSON.parse(original));
  assert.equal(
    continuousModelMaterialAt(reopened.snapshots[0].state.model, [145, 0, 40.5]),
    'layer-1',
  );
});

test('History Manager restores M07 and exact continuous release across lossless reload', async () => {
  const { expandProjectStorage, serializeProject, readProjectFile } =
    await import('../project-io.js');
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const originalM07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
  assert.ok(originalM07);
  let current = structuredClone({ ...project, model: originalM07 });
  delete current.snapshots;
  delete current.snapshotBranches;
  let id = 0;
  const options = {
    capture: () => current,
    restore: (state) => {
      current = structuredClone(state);
    },
    validateState: (state) => {
      try {
        validateProcessModel(state.model);
        return true;
      } catch {
        return false;
      }
    },
    now: () => new Date('2026-10-20T00:00:00.000Z'),
    idFactory: () => 'continuous-snapshot-' + ++id,
  };
  const manager = createSnapshotManager(options);
  const before = manager.create('M07 before release');
  current.model = attachContinuousEtchModel(current.model, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  const after = manager.create('M08 continuous release');
  const expectedModel = JSON.stringify(current.model);
  assert.equal(continuousModelMaterialAt(current.model, [50, 0, 15]), null);
  assert.equal(manager.restore(before.id), true);
  assert.equal(current.model.kernel, 'vector-2.5d-v1');
  assert.equal(manager.restore(after.id), true);
  assert.equal(JSON.stringify(current.model), expectedModel);
  assert.equal(continuousModelMaterialAt(current.model, [0, 0, 39]), 'base');

  const saved = {
    ...current,
    snapshots: manager.exportRecords(),
    snapshotBranches: manager.exportBranchState(),
  };
  const text = serializeProject(saved);
  const packed = JSON.parse(text);
  assert.equal(packed.storage?.lossless, true);
  const serializedFile = new Blob([text], { type: 'application/json' });
  const reopened = await readProjectFile(serializedFile);
  current = reopened;
  const revived = createSnapshotManager(options);
  revived.importRecords(reopened.snapshots, reopened.snapshotBranches);
  const savedBytes = JSON.stringify(reopened);
  assert.equal(revived.restore(before.id), true);
  assert.equal(current.model.kernel, 'vector-2.5d-v1');
  assert.equal(revived.restore(after.id), true);
  assert.deepEqual(current.model, JSON.parse(expectedModel));
  assert.equal(continuousModelMaterialAt(current.model, [50, 0, 15]), null);
  assert.equal(continuousModelMaterialAt(current.model, [145, 0, 40.5]), 'layer-1');
  assert.equal(
    JSON.stringify(reopened),
    savedBytes,
    'Historical inspection must not modify saved data',
  );
});

test('process History nodes replay continuous M07 material across exact project reload', async () => {
  const { expandProjectStorage, serializeProject, readProjectFile } =
    await import('../project-io.js');
  const project = expandProjectStorage(
    JSON.parse(
      readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
    ),
  );
  const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
  assert.ok(m07);
  const preservedSource = JSON.stringify(m07);
  let active = structuredClone({ ...project, model: m07 });
  delete active.snapshots;
  delete active.snapshotBranches;
  let id = 0;
  const options = {
    capture: () => active,
    restore: (state) => {
      active = structuredClone(state);
    },
    validateState: (state) => {
      try {
        validateProcessModel(state.model);
        return true;
      } catch {
        return false;
      }
    },
    now: () => new Date('2026-10-20T00:00:00.000Z'),
    nodeIdFactory: () => `continuous-node-${++id}`,
    idFactory: () => `continuous-bookmark-${++id}`,
  };
  const manager = createSnapshotManager(options);
  const before = manager.recordOperation({ kind: 'etch', label: 'M07 pre-release' });
  manager.create('M07 pre-release bookmark');
  active.model = attachContinuousEtchModel(active.model, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  const after = manager.recordOperation({ kind: 'etch', label: 'M08 continuous release' });
  manager.create('M08 release bookmark');
  const expectedRelease = JSON.stringify(active.model);
  assert.equal(continuousModelMaterialAt(active.model, [50, 0, 15]), null);
  assert.equal(continuousModelMaterialAt(active.model, [0, 0, 39]), 'base');
  assert.equal(manager.restoreProcessNode(before.id), true);
  assert.equal(active.model.kernel, 'vector-2.5d-v1');
  assert.equal(JSON.stringify(active.model), preservedSource);
  assert.equal(manager.restoreProcessNode(after.id), true);
  assert.equal(JSON.stringify(active.model), expectedRelease);

  const storedProject = {
    ...active,
    snapshots: manager.exportRecords(),
    snapshotBranches: manager.exportBranchState(),
  };
  const bytes = serializeProject(storedProject);
  const packed = JSON.parse(bytes);
  assert.equal(packed.storage?.lossless, true);
  const file = new Blob([bytes], { type: 'application/json' });
  const reopened = await readProjectFile(file);
  const savedState = JSON.stringify(reopened);
  active = reopened;
  const revived = createSnapshotManager(options);
  revived.importRecords(reopened.snapshots, reopened.snapshotBranches);
  assert.equal(revived.listHistory().length, 2);
  assert.equal(revived.restoreProcessNode(before.id), true);
  assert.equal(active.model.kernel, 'vector-2.5d-v1');
  assert.deepEqual(active.model, JSON.parse(preservedSource));
  assert.equal(revived.restoreProcessNode(after.id), true);
  assert.deepEqual(active.model, JSON.parse(expectedRelease));
  assert.equal(continuousModelMaterialAt(active.model, [145, 0, 40.5]), 'layer-1');
  assert.equal(JSON.stringify(reopened), savedState);
});
