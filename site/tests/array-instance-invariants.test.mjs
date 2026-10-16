import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel } = await import('../model.js');
const { createRectangularGridArrayModel } = await import('../model-array-construction.js');
const { arrayParts, resolveArrayModel } = await import('../model-array.js');
const { migrateProjectFile, validateProcessModel } = await import('../project-schema.js');
const { readProjectFile, serializeProject } = await import('../project-io.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

function grid(rows, pitch, activeSites = rows * rows) {
  const source = createModel({ shape: 'rect', width: pitch, height: pitch, thickness: 2 });
  return createRectangularGridArrayModel(source, {
    kind: 'rect-grid',
    rows,
    columns: rows,
    pitchX: pitch,
    pitchY: pitch,
    activeSites,
  });
}

function stackAtCenter(part) {
  const owners = part.model.regions.filter((region) => pointInMulti([0, 0], region.geom));
  assert.equal(owners.length, 1, 'Each device center must have exactly one physical owner');
  return owners[0].stack.map(({ layerId, z0, z1, role }) => [layerId, z0, z1, role || null]);
}

async function roundTrip(model) {
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-20, 0], b: [20, 0] } }),
  );
  const serialized = serializeProject(project);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(serialized),
    text: async () => serialized,
  });
  assert.deepEqual(loaded, project, 'Project IO must preserve the entire canonical array');
  return loaded.model;
}

test('625-site canonical Process keeps buried Z, selective ROI and Save/Reload exact', async () => {
  const model = grid(25, 2);
  validateProcessModel(model);
  const baseline = new Map(arrayParts(model).map((part) => [part.id, stackAtCenter(part)]));
  assert.equal(baseline.size, 625);

  const direct = applyOperation(model, {
    type: 'add',
    name: '10 nm film',
    thickness: 0.01,
    area: model.boundary,
    face: 'front',
    growth: 'direct',
  });
  assert.equal(direct.changed, true, direct.error);
  const conformal = applyOperation(model, {
    type: 'add',
    name: '10 nm conformal',
    thickness: 0.01,
    area: model.boundary,
    face: 'front',
    growth: 'conformal',
  });
  assert.equal(conformal.changed, true, conformal.error);
  validateProcessModel(model);

  const coated = new Map(arrayParts(model).map((part) => [part.id, stackAtCenter(part)]));
  assert.equal(coated.size, 625);
  for (const [id, stack] of coated) {
    assert.deepEqual(
      stack.filter((s) => s[0] === 'base'),
      baseline.get(id),
      id,
    );
    assert.deepEqual(
      stack.filter((s) => s[0] === direct.layerId),
      [[direct.layerId, 1, 1.01, null]],
      id,
    );
    assert.deepEqual(
      stack.filter((s) => s[0] === conformal.layerId),
      [[conformal.layerId, 1.01, 1.02, null]],
      id,
    );
  }

  const roi = applyOperation(model, {
    type: 'etch',
    thickness: 0.01,
    area: rectMulti(1, 1),
    face: 'front',
    etchTargetLayerIds: [conformal.layerId],
  });
  assert.equal(roi.changed, true, roi.error);
  validateProcessModel(model);
  const etched = new Map(arrayParts(model).map((part) => [part.id, stackAtCenter(part)]));
  assert.equal(etched.size, 625);
  const middleId = 'site-312';
  for (const [id, stack] of etched) {
    if (id === middleId) {
      assert.deepEqual(
        stack.filter((s) => s[0] !== conformal.layerId),
        coated.get(id).filter((s) => s[0] !== conformal.layerId),
      );
      assert.equal(
        stack.some((s) => s[0] === conformal.layerId),
        false,
        'Selective ROI removes only the top conformal film at the target center',
      );
    } else {
      assert.deepEqual(stack, coated.get(id), 'Unselected site changed: ' + id);
    }
  }

  const restored = await roundTrip(model);
  assert.deepEqual(
    arrayParts(restored).map((part) => [part.id, stackAtCenter(part)]),
    arrayParts(model).map((part) => [part.id, stackAtCenter(part)]),
    'Save/Reload must preserve all 625 physical stacks',
  );
});

test('6400-site GRID preserves roles and physical XY/Z through project IO', async () => {
  const model = grid(80, 0.375, 4725);
  validateProcessModel(model);
  const original = arrayParts(model);
  assert.equal(original.length, 6400);
  assert.equal(original.filter((part) => part.role === 'device').length, 4725);
  assert.equal(original.filter((part) => part.role === 'background').length, 1675);

  const restored = await roundTrip(model);
  const parts = arrayParts(restored);
  assert.equal(parts.length, 6400);
  assert.equal(new Set(parts.map((part) => part.id)).size, 6400);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    assert.equal(part.id, 'site-' + i);
    assert.equal(part.x, ((i % 80) - 39.5) * 0.375);
    assert.equal(part.y, (Math.floor(i / 80) - 39.5) * 0.375);
    assert.equal(part.role, original[i].role);
    assert.deepEqual(stackAtCenter(part), [['base', -1, 1, null]]);
  }
  const center = resolveArrayModel(restored, {
    minX: -0.1,
    maxX: 0.1,
    minY: -0.1,
    maxY: 0.1,
  });
  assert.equal(center.regions.length, 4, 'ROI expansion must include only four center sites');
});
