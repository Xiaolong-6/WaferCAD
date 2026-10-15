import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, replayWaferAssembly } =
  await import('../wafer-assembly.js');
const { pointInMulti } = await import('../vector-geometry.js');

const project = (label = 'wafer') => {
  const model = modelApi.createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const source = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  source.name = label;
  return source;
};

const stack = (model, x = 0, y = 0) =>
  model.regions.find((region) => pointInMulti([x, y], region.geom))?.stack || [];
const volume = (model) => stack(model).reduce((sum, segment) => sum + segment.z1 - segment.z0, 0);

test('Assembly preserves two independent full source projects with deterministic replay', () => {
  const a = project('receiver source');
  const b = project('donor source');
  const beforeA = structuredClone(a);
  const beforeB = structuredClone(b);
  const initial = createWaferAssembly(a, 'wafer-A');
  const joined = appendWaferToAssembly(initial, b, {
    donorId: 'wafer-B',
    receiverFace: 'front',
    donorFace: 'front',
  });
  assert.equal(joined.assembly.version, 1);
  assert.equal(joined.assembly.sources.length, 2);
  assert.equal(joined.assembly.bonds.length, 1);
  assert.equal(joined.assembly.sources[0].project.name, 'receiver source');
  assert.equal(joined.assembly.sources[1].project.name, 'donor source');
  assert.deepEqual(joined.assembly.sources[1].project.layout, b.layout);
  assert.deepEqual(joined.assembly.sources[1].project.section, b.section);
  assert.deepEqual(replayWaferAssembly(joined.assembly), joined.model);
  assert.deepEqual(initial.sources[0].project, a);
  assert.deepEqual(a, beforeA);
  assert.deepEqual(b, beforeB);
  assert.equal(stack(joined.model).length, 2);
  assert.equal(volume(joined.model), 800);
});

test('Assembly supports third wafer and JSON round-trip without external donor paths', () => {
  const first = appendWaferToAssembly(createWaferAssembly(project(), 'A'), project(), {
    donorId: 'B',
  });
  const second = appendWaferToAssembly(first.assembly, project(), { donorId: 'C' });
  assert.equal(second.assembly.sources.length, 3);
  assert.equal(second.assembly.bonds.length, 2);
  assert.equal(stack(second.model).length, 3);
  assert.equal(volume(second.model), 1200);
  const loaded = JSON.parse(JSON.stringify(second.assembly));
  assert.deepEqual(replayWaferAssembly(loaded), second.model);
  assert.deepEqual(replayWaferAssembly(first.assembly), first.model);
});

test('Assembly source cloning isolates later source edits and failed donor validation', () => {
  const a = project('receiver');
  const initial = createWaferAssembly(a, 'A');
  const preserved = structuredClone(initial);
  a.model.regions[0].stack[0].z0 = -150; // outside mutation does not affect the source snapshot
  assert.deepEqual(initial, preserved);
  const brokenDonor = project('broken');
  brokenDonor.model.regions[0].stack[0].z1 = -300;
  const beforeBad = structuredClone(brokenDonor);
  assert.throws(() => appendWaferToAssembly(initial, brokenDonor, { donorId: 'B' }), /z1 > z0/);
  assert.deepEqual(initial, preserved);
  assert.deepEqual(brokenDonor, beforeBad);
});

test('Assembly rejects duplicate source IDs, invalid ordering and replay tampering', () => {
  const first = appendWaferToAssembly(createWaferAssembly(project(), 'A'), project(), {
    donorId: 'B',
  });
  const before = structuredClone(first.assembly);
  assert.throws(
    () => appendWaferToAssembly(first.assembly, project(), { donorId: 'B' }),
    /Duplicate/,
  );
  const altered = structuredClone(first.assembly);
  altered.bonds[0].contactAreaUm2 = 1;
  assert.throws(() => replayWaferAssembly(altered), /replay differs/);
  const wrong = structuredClone(first.assembly);
  wrong.sources[1].id = 'not-B';
  assert.throws(() => replayWaferAssembly(wrong), /order is invalid/);
  const truncated = structuredClone(first.assembly);
  truncated.sources[1].bytes += 1;
  assert.throws(() => replayWaferAssembly(truncated), /size\/provenance/);
  assert.deepEqual(first.assembly, before);
});

test('Assembly fails atomically on missing overlap or malformed identity', () => {
  const first = createWaferAssembly(project('source'), 'A');
  const before = structuredClone(first);
  assert.throws(
    () => appendWaferToAssembly(first, project('donor'), { donorId: 'B', dx: 1000 }),
    /no finite-area/,
  );
  assert.throws(
    () => appendWaferToAssembly(first, project('donor'), { donorId: '../bad' }),
    /safe ASCII/,
  );
  assert.throws(
    () => appendWaferToAssembly(first, project('donor'), { donorId: 'B', method: 'adhesive' }),
    /only direct/,
  );
  assert.deepEqual(first, before);
});

test('Assembly explicitly rejects nested source projects and unsupported source versions', () => {
  const a = project();
  a.waferAssembly = { arbitrary: true };
  assert.throws(() => createWaferAssembly(a), /independent projects/);
  const b = project();
  b.version = 100000;
  assert.throws(() => createWaferAssembly(b), /version/);
});
