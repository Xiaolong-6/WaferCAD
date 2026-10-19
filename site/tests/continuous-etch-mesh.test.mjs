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
