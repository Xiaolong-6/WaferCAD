import assert from 'node:assert/strict';
import test from 'node:test';
import { disposeRendererSceneResources } from '../renderer-v4-resource-lifetime.js';

function disposable(label, calls) {
  return {
    dispose() {
      calls.push(label);
    },
  };
}
function group(children, retired = undefined) {
  return {
    children,
    userData: retired ? { waferCadRetiredFlatGeometries: retired } : {},
    clear() {
      this.children = [];
    },
  };
}

test('R5 disposes nested scene resources exactly once, including shared template references', () => {
  const calls = [];
  const shared = disposable('shared', calls);
  const privateMesh = disposable('private', calls);
  const texture = disposable('texture', calls);
  const material = { ...disposable('material', calls), bumpMap: texture };
  const retired = disposable('retired', calls);
  const scene = group(
    [
      { geometry: shared, material, children: [] },
      {
        children: [
          { geometry: shared, material, children: [] },
          { geometry: privateMesh, material: [material, material], children: [] },
        ],
      },
    ],
    new Set([retired, shared]),
  );
  const before = scene.userData.waferCadRetiredFlatGeometries;
  const result = disposeRendererSceneResources(scene);
  assert.deepEqual(result, {
    objects: 4,
    geometries: 3,
    materials: 1,
    textures: 1,
    retiredFlatTemplates: 1,
  });
  assert.equal(before.size, 0);
  assert.deepEqual(calls.sort(), ['material', 'private', 'retired', 'shared', 'texture']);
  assert.deepEqual(disposeRendererSceneResources(scene), {
    objects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    retiredFlatTemplates: 0,
  });
  assert.equal(calls.length, 5, 'no double disposal after group clear');
});

test('R5 retires copy-on-write templates no longer referenced by live meshes', () => {
  const calls = [];
  const retired = disposable('original', calls);
  const a = disposable('detached-a', calls);
  const b = disposable('detached-b', calls);
  const scene = group([{ geometry: a }, { geometry: b }], new Set([retired]));
  assert.equal(disposeRendererSceneResources(scene).retiredFlatTemplates, 1);
  assert.deepEqual(calls.sort(), ['detached-a', 'detached-b', 'original']);
});

test('R5 fails closed on missing groups, cyclic descendants and missing optional resources', () => {
  assert.deepEqual(disposeRendererSceneResources(null), {
    objects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    retiredFlatTemplates: 0,
  });
  const loop = { geometry: null, material: null, children: [] };
  loop.children.push(loop);
  const scene = group([loop]);
  assert.equal(disposeRendererSceneResources(scene).objects, 1);
  assert.equal(scene.children.length, 0);
});

test('R5 cleanup does not mutate canonical geometry before dispose', () => {
  let observed;
  const physical = new Float32Array([0, 0, 0.25]);
  const geometry = {
    attributes: { position: { array: physical } },
    dispose() {
      observed = [...physical];
    },
  };
  const scene = group([{ geometry, material: null }]);
  assert.equal(disposeRendererSceneResources(scene).geometries, 1);
  assert.deepEqual(observed, [0, 0, 0.25]);
  assert.deepEqual([...physical], [0, 0, 0.25]);
});

test('R5 keeps allocation counts bounded over 100 independent variant cycles', () => {
  const disposal = new Map();
  const resource = (id) => ({
    dispose() {
      disposal.set(id, (disposal.get(id) || 0) + 1);
    },
  });
  let sum = 0;
  for (let cycle = 0; cycle < 100; cycle++) {
    const shared = resource('geo-' + cycle);
    const retired = resource('retired-' + cycle);
    const material = resource('mat-' + cycle);
    const scene = group(
      [
        { geometry: shared, material, children: [] },
        { geometry: shared, material, children: [] },
      ],
      new Set([retired]),
    );
    const report = disposeRendererSceneResources(scene);
    sum += report.geometries;
    assert.equal(report.geometries, 2);
    assert.equal(report.materials, 1);
    assert.equal(report.retiredFlatTemplates, 1);
    assert.equal(scene.children.length, 0);
    assert.equal(scene.userData.waferCadRetiredFlatGeometries.size, 0);
    assert.equal(disposeRendererSceneResources(scene).geometries, 0);
  }
  assert.equal(sum, 200);
  assert.equal(disposal.size, 300);
  assert.ok([...disposal.values()].every((count) => count === 1));
});

test('R5 finishes every independent resource retirement after one dispose throws', () => {
  const calls = [];
  const broken = {
    dispose() {
      calls.push('broken-geometry');
      throw new Error('lost GL allocation');
    },
  };
  const shared = disposable('good-geometry', calls);
  const texture = disposable('good-texture', calls);
  const material = { ...disposable('good-material', calls), bumpMap: texture };
  const retired = disposable('retired-geometry', calls);
  const scene = group(
    [
      { geometry: broken, material, children: [] },
      { geometry: shared, material, children: [] },
    ],
    new Set([retired]),
  );

  assert.throws(
    () => disposeRendererSceneResources(scene),
    (error) => {
      assert.equal(error.name, 'AggregateError');
      assert.match(error.message, /geometry/);
      assert.equal(error.errors.length, 1);
      assert.match(error.errors[0].message, /lost GL allocation/);
      return true;
    },
  );
  assert.deepEqual(
    calls.sort(),
    ['broken-geometry', 'good-geometry', 'good-material', 'good-texture', 'retired-geometry'],
  );
  assert.equal(scene.children.length, 0);
  assert.equal(scene.userData.waferCadRetiredFlatGeometries.size, 0);
  assert.equal(disposeRendererSceneResources(scene).geometries, 0);
});

test('R5 collects multiple independent disposal failures after group removal', () => {
  const calls = [];
  const faulty = (kind) => ({
    dispose() {
      calls.push(kind);
      throw new Error(kind + ' failure');
    },
  });
  const scene = group([
    { geometry: faulty('geometry'), material: { ...faulty('material'), bumpMap: faulty('texture') } },
  ]);
  assert.throws(
    () => disposeRendererSceneResources(scene),
    (error) => {
      assert.equal(error.name, 'AggregateError');
      assert.equal(error.errors.length, 3);
      assert.match(error.message, /geometry, texture, material/);
      return true;
    },
  );
  assert.deepEqual(calls, ['geometry', 'texture', 'material']);
  assert.equal(scene.children.length, 0);
});
