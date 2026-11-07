import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { compactMaterialArrayStorage } from '../../scripts/material-array-compaction.mjs';
await loadGeometryKernel();
const api = await import('../model.js');
const v = await import('../vector-geometry.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { arrayParts, translateGeometry } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');

test('exact template deduplication preserves every physical slab, instance ID and global counter', () => {
  const model = tileMaterialModel(
    api.createModel({ shape: 'rect', width: 12, height: 4, thickness: 1 }),
    { cellSizeUm: 4 },
  );
  const duplicate = structuredClone(model.array.templates[0]);
  duplicate.id = 'different-local-ids';
  duplicate.model.nextRegionId = 500;
  duplicate.model.regions[0].id = 'region-499';
  const ring = duplicate.model.regions[0].geom[0][0];
  ring.splice(1, 0, [(ring[0][0] + ring[1][0]) / 2, (ring[0][1] + ring[1][1]) / 2]);
  ring.reverse();
  const different = structuredClone(model.array.templates[0]);
  different.id = 'different-physical-layer';
  api.applyOperation(different.model, {
    type: 'add',
    name: 'Nb',
    thickness: 0.0001,
    area: different.model.boundary,
  });
  model.layers = structuredClone(different.model.layers);
  model.nextLayerId = different.model.nextLayerId;
  model.nextRegionId = 600;
  model.array.templates.push(duplicate, different);
  model.array.instances[1].templateId = duplicate.id;
  model.array.instances[2].templateId = different.id;
  validateProcessModel(model);
  const original = structuredClone(model);
  const near = structuredClone(model);
  near.array.templates[1].model.regions[0].geom[0][0][0][0] += 1e-12;
  near.array.templates[1].model.regions[0].geom[0][0].at(-1)[0] += 1e-12;
  assert.equal(
    compactMaterialArrayStorage(near).templatesAfter,
    3,
    'even a sub-grid physical difference must not merge',
  );
  const result = compactMaterialArrayStorage(model);
  assert.equal(result.templatesBefore, 3);
  assert.equal(result.templatesAfter, 2);
  assert.equal(model.nextRegionId, 600);
  assert.deepEqual(
    model.array.instances.map(({ templateId: _id, ...rest }) => rest),
    original.array.instances.map(({ templateId: _id, ...rest }) => rest),
  );
  const slabs = (root) => {
    const result = new Map();
    for (const part of arrayParts(root))
      for (const region of part.model.regions)
        for (const segment of region.stack) {
          const key = JSON.stringify(segment);
          if (!result.has(key)) result.set(key, []);
          result.get(key).push(translateGeometry(region.geom, part.x, part.y));
        }
    return new Map([...result].map(([key, shapes]) => [key, v.unionGeometries(shapes)]));
  };
  const before = slabs(original),
    after = slabs(model);
  assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort());
  for (const [key, geom] of before) {
    assert.equal(api.geometryArea(v.difference(geom, after.get(key))), 0);
    assert.equal(api.geometryArea(v.difference(after.get(key), geom)), 0);
  }
  validateProcessModel(model);
  const saved = structuredClone(model);
  assert.equal(compactMaterialArrayStorage(model).changed, false);
  assert.deepEqual(model, saved);
});
