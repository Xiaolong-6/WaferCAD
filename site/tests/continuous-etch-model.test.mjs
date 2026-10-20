import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel } = await import('../model.js');
const { applyOperation } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');
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
  const { expandProjectStorage, prepareProjectForExport, readProjectFile } =
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
  const materialBefore = continuousModelColumnAtXY(project.model, [50, 0]);
  const saved = prepareProjectForExport(project);
  assert.equal(saved.mode, 'lossless');
  const text = JSON.stringify(saved.stored);
  const file = { size: Buffer.byteLength(text), text: async () => text };
  await assert.rejects(() => readProjectFile(file), /no flat import/);
  const read = await readProjectFile(file, { experimentalContinuousEtchReadOnly: true });
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
  assert.deepEqual(continuousEtchDisplayCollapse(continuous, workstationDefault), { enabled: false });
  assert.equal(continuousEtchDisplayCollapse(plain, workstationDefault), workstationDefault);
  const explicit = { ...workstationDefault, continuousEtchExplicit: true };
  assert.equal(continuousEtchDisplayCollapse(continuous, explicit), explicit);
});
