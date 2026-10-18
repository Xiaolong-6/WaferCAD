import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makePhysicalPyramidOwner,
  physicalOwnerVolume,
  restorePhysicalPyramidOwner,
} from '../experimental/physical-facets/physical-facet-owner.js';
import { samplePhysicalPyramidSlab } from '../experimental/physical-facets/physical-facet-math.js';
import {
  physicalPyramidSection,
  physicalPyramidSolidMesh,
  signedPhysicalMeshVolume,
} from '../experimental/physical-facets/physical-facet-surface.js';

const base = {
  layerId: 'Si-physical',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
};

function owner(domain, originX = 0, originY = 0) {
  return makePhysicalPyramidOwner({ ...base, domain, originX, originY });
}

const configurations = [
  ['one cell', { minX: -3.2, maxX: 3.2, minY: -3.2, maxY: 3.2 }, 0, 0],
  ['fractionally clipped', { minX: 0.1, maxX: 6.5, minY: -0.4, maxY: 6.0 }, 0, 0],
  ['several periodic cells', { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 }, 0, 0],
  ['shifted phase', { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 }, 1.5, -2],
];

function meshEdgeMultiplicity(mesh) {
  const edges = new Map();
  const key = (point) => point.map((value) => Math.round(value * 1e9)).join(',');
  for (const triangle of mesh.triangles) {
    for (let i = 0; i < 3; i++) {
      const a = key(triangle.vertices[i]);
      const b = key(triangle.vertices[(i + 1) % 3]);
      const edge = [a, b].sort().join('|');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  return [...edges.values()];
}

test('closed physical 3D surfaces conserve analytical XY/Z material volume', () => {
  for (const [label, domain, originX, originY] of configurations) {
    const source = owner(domain, originX, originY);
    const mesh = physicalPyramidSolidMesh(source);
    assert.equal(mesh.layerId, base.layerId);
    assert.ok(mesh.triangles.some((triangle) => triangle.face === 'top'));
    assert.ok(mesh.triangles.some((triangle) => triangle.face === 'bottom'));
    assert.ok(mesh.triangles.some((triangle) => triangle.face === 'side'));
    assert.ok(
      Math.abs(signedPhysicalMeshVolume(mesh) - physicalOwnerVolume(source)) < 1e-8,
      label + ': closed solid volume must match physical material owner',
    );
    assert.ok(
      meshEdgeMultiplicity(mesh).every((count) => count === 2),
      label + ': every triangle edge must have exactly one adjacent face',
    );
    for (const triangle of mesh.triangles) {
      for (const vertex of triangle.vertices) {
        const slab = samplePhysicalPyramidSlab(vertex[0], vertex[1], source);
        assert.ok(
          Math.abs(vertex[2] - slab.z0) < 1e-9 || Math.abs(vertex[2] - slab.z1) < 1e-9,
          label + ': mesh vertex must use the physical owner, not Renderer height',
        );
      }
    }
  }
});

test('physical Section corners and 3D triangle facets share exact source geometry', () => {
  const source = owner({ minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 });
  for (const [a, b] of [
    [
      [-6.4, 0],
      [6.4, 0],
    ],
    [
      [-6.4, -6.4],
      [6.4, 6.4],
    ],
    [
      [-6.4, 1.25],
      [6.4, -3.75],
    ],
    [
      [0.7, -6.4],
      [2.8, 6.4],
    ],
  ]) {
    const section = physicalPyramidSection(source, a, b);
    assert.equal(section.layerId, source.layerId);
    assert.equal(section.points[0].t, 0);
    assert.equal(section.points.at(-1).t, 1);
    assert.ok(section.points.length >= 2);
    for (let i = 0; i < section.points.length; i++) {
      const sample = section.points[i];
      const actual = samplePhysicalPyramidSlab(sample.x, sample.y, source);
      assert.ok(Math.abs(actual.z0 - sample.z0) < 1e-9);
      assert.ok(Math.abs(actual.z1 - sample.z1) < 1e-9);
      assert.ok(sample.z0 < sample.z1);
      if (i === 0) continue;
      const prev = section.points[i - 1];
      assert.ok(prev.t < sample.t, 'ordered facet intersections must never duplicate');
      const t = (prev.t + sample.t) / 2;
      const xy = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const midpoint = samplePhysicalPyramidSlab(...xy, source);
      assert.ok(
        Math.abs(midpoint.z0 - (prev.z0 + sample.z0) / 2) < 1e-8,
        'back Section cannot cross an unrecorded facet edge',
      );
      assert.ok(
        Math.abs(midpoint.z1 - (prev.z1 + sample.z1) / 2) < 1e-8,
        'front Section cannot cross an unrecorded facet edge',
      );
    }
  }
});

test('opt-in surface JSON round-trip preserves material Section and 3D volume', () => {
  const source = owner({ minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 });
  const reopened = restorePhysicalPyramidOwner(JSON.parse(JSON.stringify(source)));
  const a = [-6.4, 0.4];
  const b = [6.4, -1.9];
  assert.deepEqual(physicalPyramidSection(reopened, a, b), physicalPyramidSection(source, a, b));
  assert.equal(
    signedPhysicalMeshVolume(physicalPyramidSolidMesh(reopened)),
    signedPhysicalMeshVolume(physicalPyramidSolidMesh(source)),
  );
});

test('unsupported sections and expensive 3D tessellation fail closed', () => {
  const source = owner({ minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 });
  assert.throws(
    () => physicalPyramidSection(source, [-6.5, 0], [6.4, 0]),
    /outside physical owner/,
  );
  assert.throws(() => physicalPyramidSection(source, [0, 0], [0, 0]), /collapsed/);
  assert.throws(() => physicalPyramidSolidMesh(source, { maxCells: 2 }), /budget exceeded/);
  assert.throws(() => physicalPyramidSolidMesh(source, { maxCells: 0 }), /Invalid/);
});
