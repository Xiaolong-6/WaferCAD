import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const api = await import('../model.js'),
  v = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { resolveArrayModel } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');
const apply = (m, p) =>
  applyAdvancedProcessOperation(m, p, p.area, api, v) ?? api.applyOperation(m, p);
const base = () => api.createModel({ shape: 'rect', width: 8, height: 4, thickness: 2 });
function coat(m, area = m.boundary) {
  return [
    ['MMA', 0.5],
    ['PMMA', 0.4],
  ].map(([name, thickness]) => apply(m, { type: 'add', name, thickness, area }).layerId);
}
const release = (m, ids) =>
  apply(m, { type: 'liftoff', face: 'front', sacrificialLayerIds: ids, area: m.boundary });
const at = (m, x, y) => m.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack || [];

test('bilayer release preserves a device spanning a tile edge and removes globally connected topcoat', () => {
  const m = base(),
    ids = coat(m);
  for (const [id, thickness] of [
    [ids[1], 0.4],
    [ids[0], 0.5],
  ])
    apply(m, {
      type: 'etch',
      etchProfile: 'develop',
      etchTargetLayerIds: [id],
      thickness,
      area: v.rectMulti(2, 2),
    });
  const al = apply(m, { type: 'add', name: 'Al', thickness: 0.04, area: m.boundary });
  const tiled = tileMaterialModel(m, { cellSizeUm: 4 });
  const result = release(tiled, ids);
  assert.ok(result.changed, result.error);
  assert.equal(result.removedComponents, 1);
  validateProcessModel(tiled);
  const resolved = resolveArrayModel(tiled);
  for (const x of [-0.5, 0.5])
    assert.deepEqual(
      at(resolved, x, 0).map((s) => s.layerId),
      ['base', al.layerId],
    );
  for (const x of [-3, 3])
    assert.deepEqual(
      at(resolved, x, 0).map((s) => s.layerId),
      ['base'],
    );
});

test('a real metal bridge across two tiles rejects the entire transaction', () => {
  const m = base();
  apply(m, { type: 'add', name: 'Nb', thickness: 0.9, area: v.rectMulti(4, 4, 2, 0) });
  const ids = coat(m, v.rectMulti(4, 4, -2, 0));
  apply(m, { type: 'add', name: 'Al', thickness: 0.04, area: m.boundary });
  const tiled = tileMaterialModel(m, { cellSizeUm: 4 }),
    before = structuredClone(tiled);
  const result = release(tiled, ids);
  assert.equal(result.changed, false);
  assert.match(result.error, /bridge across/);
  assert.deepEqual(tiled, before);
});

test('a membrane supported by resist in a different tile is removed as one component', () => {
  const m = base(),
    ids = coat(m, v.rectMulti(4, 4, 2, 0));
  const film = apply(m, {
    type: 'add',
    growth: 'transfer',
    transferMode: 'flat',
    name: 'Al membrane',
    thickness: 0.04,
    area: m.boundary,
  });
  assert.ok(film.changed, film.error);
  const tiled = tileMaterialModel(m, { cellSizeUm: 4 });
  const result = release(tiled, ids);
  assert.ok(result.changed, result.error);
  validateProcessModel(tiled);
  const resolved = resolveArrayModel(tiled);
  assert.ok(resolved.regions.every((r) => r.stack.every((s) => s.layerId === 'base')));
});
