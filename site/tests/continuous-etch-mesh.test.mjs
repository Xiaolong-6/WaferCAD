import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;
const { buildContinuousMaterialSurfaceMesh } = await import('../continuous-etch-mesh.js');
const { expandProjectStorage } = await import('../project-io.js');
const { exposedSurfaceGroups } = await import('../process-topology.js');
const project = expandProjectStorage(
  JSON.parse(
    readFileSync(
      new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url),
      'utf8',
    ),
  ),
);
const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07')?.state?.model;
const owner = () => {
  const model = structuredClone(m07);
  const exposed = exposedSurfaceGroups(model, {
    face: 'front',
    clip: model.boundary,
    preserveOppositeZ: false,
  }).filter((s) => s.layerId === 'base');
  assert.equal(exposed.length, 1);
  return {
    sourceModel: model,
    fronts: exposed.map((s) => ({
      kind: 'continuous-etch-front-v1',
      seedGeom: s.geom,
      seedZ: s.z,
      layerId: s.layerId,
      face: 'front',
      lateralUm: 36,
      verticalUm: 36,
      shape: 'circular',
    })),
  };
};

function assertClosed(mesh) {
  const counts = new Map();
  const label = (pos, index) => [0, 1, 2].map((j) => Math.round(pos[index + j] * 10000)).join(',');
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const labels = [
      label(mesh.positions, i),
      label(mesh.positions, i + 3),
      label(mesh.positions, i + 6),
    ];
    for (let j = 0; j < 3; j++) {
      const first = labels[j];
      const second = labels[(j + 1) % 3];
      const key = [first, second].sort().join('/');
      const value = counts.get(key) || { total: 0, winding: 0 };
      value.total++;
      value.winding += first < second ? 1 : -1;
      counts.set(key, value);
    }
  }
  assert.ok(counts.size, 'Expected at least one physical surface edge');
  const bad = [...counts].filter(([, edge]) => edge.total !== 2 || edge.winding !== 0);
  const countsByDegree = {};
  for (const edge of counts.values())
    countsByDegree[edge.total + '/' + edge.winding] =
      (countsByDegree[edge.total + '/' + edge.winding] || 0) + 1;
  assert.deepEqual(
    bad,
    [],
    `Nonmanifold edge degrees: ${JSON.stringify(countsByDegree)}; examples ${JSON.stringify(bad.slice(0, 10))}`,
  );
}

test('Microdisk M07 continuous Si and oxide display meshes form closed surfaces', () => {
  assert.ok(m07);
  const input = owner();
  const original = JSON.stringify(input);
  const result = buildContinuousMaterialSurfaceMesh(input);
  assert.equal(JSON.stringify(input), original, 'Rendering must not modify any source material');
  assert.equal(result.kind, 'continuous-etch-sampled-surface-v1');
  assert.equal(result.layers.length, 2);
  assert.deepEqual(
    result.layers.map((l) => l.layerId),
    ['base', 'layer-1'],
  );
  assert.ok(result.triangles > 10000);
  assert.ok(result.triangles <= 1500000);
  assert.ok(result.grid.voxels <= 4000000);
  for (const layer of result.layers) {
    assert.equal(layer.positions.length, layer.normals.length);
    assert.equal(layer.positions.length, layer.triangles * 9);
    assert.ok(layer.positions.every(Number.isFinite));
    assert.ok(layer.normals.every(Number.isFinite));
    assertClosed(layer);
  }
  const oxide = result.layers.find((l) => l.layerId === 'layer-1').positions;
  let lower = Infinity,
    upper = -Infinity;
  for (let i = 2; i < oxide.length; i += 3) {
    lower = Math.min(lower, oxide[i]);
    upper = Math.max(upper, oxide[i]);
  }
  assert.ok(Math.abs(lower - 40) <= 0.1, `Oxide interface drifted: ${lower}`);
  assert.ok(Math.abs(upper - 41.8) <= 0.1, `Oxide top drifted: ${upper}`);
});

test('Microdisk M07 cubic sampling yields consistently oriented closed Si and SiO2', () => {
  const input = owner();
  const original = JSON.stringify(input);
  const cubes = buildContinuousMaterialSurfaceMesh(input, { cubeTables: { edgeTable, triTable } });
  assert.ok(cubes.triangles > 10000 && cubes.triangles < 400000);
  assert.deepEqual(
    cubes.layers.map((p) => p.layerId),
    ['base', 'layer-1'],
  );
  for (const layer of cubes.layers) {
    assertClosed(layer);
    assert.ok(layer.positions.every(Number.isFinite));
    assert.ok(layer.normals.every(Number.isFinite));
  }
  const oxide = cubes.layers.find((p) => p.layerId === 'layer-1').positions;
  let lower = Infinity,
    upper = -Infinity;
  for (let i = 2; i < oxide.length; i += 3) {
    lower = Math.min(lower, oxide[i]);
    upper = Math.max(upper, oxide[i]);
  }
  assert.ok(Math.abs(lower - 40) <= 0.1 && Math.abs(upper - 41.8) <= 0.1);
  assert.equal(JSON.stringify(input), original);
});

test('Microdisk higher-quality cubic grid stays closed and within scientific budgets', () => {
  const result = buildContinuousMaterialSurfaceMesh(owner(), {
    cubeTables: { edgeTable, triTable },
    xyStepUm: 1.75,
  });
  assert.ok(result.triangles <= 1500000);
  assert.ok(result.grid.voxels <= 4000000);
  assert.equal(result.layers.length, 2);
  for (const layer of result.layers) assertClosed(layer);

  // A visually flat substrate can still be a closed, orientable mesh while
  // having silently lost the physical outer residual silicon rise. Verify
  // the actual mesh ray intersections against independent M07/36um witnesses.
  const si = result.layers.find((layer) => layer.layerId === 'base');
  assert.ok(si, 'Missing physical silicon');
  function topAtXY(x, y) {
    const positions = si.positions;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1];
      const bx = positions[i + 3], by = positions[i + 4];
      const cx = positions[i + 6], cy = positions[i + 7];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-9) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      maxZ = Math.max(maxZ, u * positions[i + 2] + v * positions[i + 5] +
        (1 - u - v) * positions[i + 8]);
    }
    return maxZ;
  }
  const expectedSiTop = [
    [0, 40],
    [45, 5.706],
    [60, 4.349],
    [115, 25.590],
    [145, 4.125],
    [175, 4],
  ];
  for (const [x, expectedZ] of expectedSiTop) {
    const actualZ = topAtXY(x, 0);
    assert.ok(Number.isFinite(actualZ), `Si disappeared at x=${x} um`);
    assert.ok(Math.abs(actualZ - expectedZ) < 0.75,
      `3D mesh material boundary at x=${x}: displayed ${actualZ} um, physical ${expectedZ} um`);
  }
  assert.ok(topAtXY(115, 0) - topAtXY(60, 0) > 18,
    'Continuous 3D must retain the real outer Si rise; never flatten it to hide band seams');
});

test('budget guard rejects unbounded resolution without changing source', () => {
  const input = owner();
  const original = JSON.stringify(input);
  assert.throws(() => buildContinuousMaterialSurfaceMesh(input, { xyStepUm: 0.02 }), /budget/);
  assert.throws(() => buildContinuousMaterialSurfaceMesh(input, { xyStepUm: 0 }), /precision/);
  assert.deepEqual(JSON.stringify(input), original);
});

// Adjacent canonical cells are bookkeeping, not separate physical solids.
// The display mesh must not introduce an internal material seam at their edge.
test('adjacent same-material cells render identically to their single merged solid', () => {
  const rect = (left, right) => [
    [
      [
        [left, -6],
        [right, -6],
        [right, 6],
        [left, 6],
        [left, -6],
      ],
    ],
  ];
  const segment = () => ({ layerId: 'base', z0: -3, z1: 3 });
  const makeInput = (regions) => ({
    sourceModel: {
      revision: 2,
      layers: [{ id: 'base', name: 'Si' }],
      regions: regions.map((geom, i) => ({ id: 'r' + i, geom, stack: [segment()] })),
    },
    fronts: [],
  });
  const one = buildContinuousMaterialSurfaceMesh(makeInput([rect(-10, 10)]), {
    xyStepUm: 1.5,
    zStepUm: 0.75,
  });
  const divided = buildContinuousMaterialSurfaceMesh(makeInput([rect(-10, 0), rect(0, 10)]), {
    xyStepUm: 1.5,
    zStepUm: 0.75,
  });
  assert.equal(divided.triangles, one.triangles);
  assert.deepEqual(divided.layers[0].positions, one.layers[0].positions);
  assert.deepEqual(divided.layers[0].normals, one.layers[0].normals);
  assertClosed(divided.layers[0]);
});

test('cubic surfaces preserve orientation and closure for circular, elliptic, vertical and opposing releases', () => {
  const rect = (size) => [
    [
      [
        [-size, -size],
        [size, -size],
        [size, size],
        [-size, size],
        [-size, -size],
      ],
    ],
  ];
  const sourceModel = {
    revision: 3,
    layers: [{ id: 'base' }],
    regions: [{ id: 'base', geom: rect(9), stack: [{ layerId: 'base', z0: -6, z1: 6 }] }],
  };
  const seed = rect(2);
  const front = (shape, lateralUm, verticalUm, face = 'front') => ({
    kind: 'continuous-etch-front-v1',
    seedGeom: seed,
    layerId: 'base',
    seedZ: face === 'front' ? 6 : -6,
    face,
    lateralUm,
    verticalUm,
    shape,
  });
  const cases = [
    [front('circular', 5, 5)],
    [front('elliptical', 6, 4)],
    [front('vertical', 5, 3)],
    [front('elliptical', 6, 5), front('elliptical', 6, 4, 'back')],
  ];
  for (const fronts of cases) {
    const mesh = buildContinuousMaterialSurfaceMesh(
      { sourceModel, fronts },
      {
        cubeTables: { edgeTable, triTable },
        xyStepUm: 0.8,
        zStepUm: 0.65,
      },
    );
    assert.equal(mesh.layers.length, 1);
    assertClosed(mesh.layers[0]);
    assert.ok(mesh.triangles > 100);
  }
});
