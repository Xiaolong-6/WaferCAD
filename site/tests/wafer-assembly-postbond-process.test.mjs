import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, fullFaceGeometry } = await import('../model.js');
const { applyProcessFaces } = await import('../process-face-execution.js');
const { migrateProjectFile, validateProcessModel } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const {
  normalizePostBondGeometryStep,
  replayPostBondGeometry,
  appendPostBondGeometryStep,
  MAX_POST_BOND_STEPS,
} = await import('../wafer-assembly-postbond-process.js');

function wafer(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}
function bonded() {
  const a = createWaferAssembly(wafer('A'), 'A');
  const b = appendWaferToAssembly(a, wafer('B'), { donorId: 'B' });
  return createBondedAssemblyProject(b.assembly);
}
const deposit = (face = 'front', thickness = 2) => ({
  command: 'deposit',
  params: { material: 'SiO2', thicknessUm: thickness, coverage: 'direct', area: 'full', face },
});
const etch = (face = 'front', depth = 1) => ({
  command: 'etch',
  params: { profile: 'directional', thicknessUm: depth, area: 'full', face },
});

test('post-Bond full-face Deposit + Etch replays from original immutable source stack', () => {
  const project = bonded();
  const original = structuredClone(project);
  const first = appendPostBondGeometryStep(project, [], deposit('front', 2));
  assert.equal(first.steps.length, 1);
  assert.equal(first.model.layers.length, project.model.layers.length + 1);
  validateProcessModel(first.model);
  const second = appendPostBondGeometryStep(project, first.steps, etch('front', 1));
  assert.equal(second.steps.length, 2);
  assert.deepEqual(replayPostBondGeometry(project, second.steps).model, second.model);
  assert.deepEqual(project, original, 'source projects and assembled baseline may never mutate');
  assert.equal(project.waferAssembly.sources.length, 2);
  assert.deepEqual(second.steps[0].params, normalizePostBondGeometryStep(deposit()).params);
  assert.equal(JSON.stringify(second.steps).includes('regions'), false);
});

test('post-Bond replay yields exact same material as the existing Process Worker geometry contract', () => {
  const project = bonded();
  const step = deposit('back', 1);
  const candidate = structuredClone(project.model);
  const params = {
    type: 'add',
    name: 'SiO2',
    thickness: 1,
    growth: 'direct',
    face: 'back',
    area: fullFaceGeometry(candidate),
  };
  const expected = applyProcessFaces(candidate, params, (model, face) =>
    applyOperation(model, face),
  );
  assert.equal(expected.result.changed, true);
  const result = appendPostBondGeometryStep(project, [], step);
  assert.deepEqual(result.model, expected.model);
  assert.deepEqual(replayPostBondGeometry(project, result.steps).model, expected.model);
});

test('post-Bond replay rejects corrupted material checksum and tampered command provenance', () => {
  const project = bonded();
  const result = appendPostBondGeometryStep(project, [], deposit());
  const corrupted = structuredClone(result.steps);
  corrupted[0].modelFingerprint = '00000000';
  assert.throws(() => replayPostBondGeometry(project, corrupted), /checksum differs/);
  corrupted[0].modelFingerprint = result.steps[0].modelFingerprint;
  corrupted[0].params.material = 'Al';
  assert.throws(() => replayPostBondGeometry(project, corrupted), /checksum differs/);
  corrupted[0].params.unknownProcessParameter = true;
  assert.throws(() => replayPostBondGeometry(project, corrupted), /canonical geometry parameters/);
  assert.deepEqual(replayPostBondGeometry(project, []), { model: project.model, stages: [] });
});

test('unsupported masked, conformal, transfer, implant and arbitrary Process steps fail closed', () => {
  const project = bonded();
  for (const step of [
    { command: 'deposit', params: { ...deposit().params, area: 'mask' } },
    { command: 'deposit', params: { ...deposit().params, coverage: 'conformal' } },
    { command: 'deposit', params: { ...deposit().params, coverage: 'transfer' } },
    { command: 'deposit', params: { ...deposit().params, face: 'both' } },
    { command: 'etch', params: { ...etch().params, profile: 'isotropic', target: 'Si' } },
    { command: 'etch', params: { ...etch().params, target: 'base' } },
    { command: 'implant', params: { name: 'B', depthUm: 0.2 } },
    { command: 'record', params: { process: 'plm' } },
  ]) {
    assert.throws(() => appendPostBondGeometryStep(project, [], step), /Post-Bond/);
  }
  assert.equal(project.waferAssembly.bonds.length, 1);
});

test('failed out-of-range or excessive etching retains prior Process replay and source models', () => {
  const project = bonded();
  const prior = appendPostBondGeometryStep(project, [], deposit('front', 0.05));
  const before = structuredClone(prior);
  assert.throws(
    () => appendPostBondGeometryStep(project, prior.steps, etch('front', -1)),
    /etch\.depth|greater than zero|thickness/,
  );
  assert.deepEqual(prior, before);
  assert.deepEqual(project.waferAssembly.sources[0].project.model, wafer('A').model);
});

test('post-Bond Recipe size bound rejects out-of-range replay without mutation', () => {
  const project = bonded();
  assert.equal(MAX_POST_BOND_STEPS, 16);
  assert.throws(
    () =>
      replayPostBondGeometry(
        project,
        Array.from({ length: 17 }, () => null),
      ),
    /bounded step count/,
  );
  assert.throws(() => replayPostBondGeometry(wafer('standalone'), []), /source provenance/);
});
