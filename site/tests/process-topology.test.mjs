import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel, geometryArea } = await import('../model.js');
const {
  appearanceSurfaceGroupsFromTopology,
  classifyCoverageVoids,
  conformalMaterialWallTargets,
  conformalWallTargets,
  deriveProcessTopology,
  exposedLayerIdsFromTopology,
  exposedSurfaceGroups,
  materialInterfaceGroups,
  materialSolidsFromTopology,
  ownedMaterialSurfacesFromTopology,
  sectionSlicesFromTopology,
  uncoveredDomain,
  visibleSurfaceGroups,
} = await import('../process-topology.js');
const { rectMulti } = await import('../vector-geometry.js');

test('surface topology collapses computational partitions at equal height', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    {
      id: 'right',
      geom: rectMulti(10, 10, 5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];

  const groups = visibleSurfaceGroups(model, { face: 'front' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].layerId, 'base');
  assert.equal(groups[0].z, 4);
  assert.ok(Math.abs(geometryArea(groups[0].geom) - 200) < 1e-8);
  assert.deepEqual(exposedLayerIdsFromTopology(model, model.boundary, 'front'), ['base']);
  assert.equal(uncoveredDomain(model).length, 0);
});

test('uncoveredDomain propagates polygon-kernel failures instead of hiding conformal voids', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 });
  const originalDifference = globalThis.polygonClipping.difference;
  globalThis.polygonClipping.difference = () => {
    throw new Error('synthetic difference failure');
  };
  try {
    assert.throws(
      () => uncoveredDomain(model),
      /Coverage topology failed.*synthetic difference failure/,
    );
  } finally {
    globalThis.polygonClipping.difference = originalDifference;
  }
});

test('topology distinguishes exposed faces from buried material interfaces', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  const added = applyOperation(model, {
    type: 'add',
    name: 'Film',
    thickness: 1,
    face: 'front',
    area: model.boundary,
    growth: 'direct',
  });
  assert.equal(added.changed, true);

  const faces = exposedSurfaceGroups(model, { face: 'front' }),
    interfaces = materialInterfaceGroups(model);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].layerId, added.layerId);
  assert.equal(faces[0].z, 5);
  assert.equal(interfaces.length, 1);
  assert.equal(interfaces[0].lowerLayerId, 'base');
  assert.equal(interfaces[0].upperLayerId, added.layerId);
  assert.equal(interfaces[0].z, 4);
});

test('rough buried appearance ownership is explicit in topology', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  const rough = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.5,
    meanHeight: 0.4,
    featureCv: 0.2,
    heightCv: 0.2,
    seed: 7,
    profileId: 'topology-rough',
    geometryMode: 'ideal',
  };
  model.layers.push({ id: 'film', name: 'Film', color: '#55aacc' });
  model.regions[0].stack = [
    { layerId: 'base', z0: -4, z1: 0, frontSurface: rough },
    { layerId: 'film', z0: 0, z1: 1, frontSurface: rough },
  ];

  const groups = appearanceSurfaceGroupsFromTopology(model),
    buried = groups.filter((group) => group.z === 0),
    outer = groups.find((group) => group.layerId === 'film' && group.z === 1);
  assert.equal(buried.length, 2);
  assert.ok(buried.every((group) => group.buried === true));
  assert.equal(outer?.buried, false);
  assert.deepEqual(
    new Set(buried.map((group) => group.kind)),
    new Set(['buried-appearance-interface']),
  );
});

test('conformal wall targets select only the physically lower neighbor', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.regions = [
    {
      id: 'high',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 6 }],
    },
    {
      id: 'low',
      geom: rectMulti(10, 10, 5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];

  const band = rectMulti(1, 10, 0, 0),
    targets = conformalMaterialWallTargets(model, band, {
      face: 'front',
      sourceZ: 6,
    });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].regionId, 'low');
  assert.equal(targets[0].localZ, 4);
  assert.equal(targets[0].sourceZ, 6);
  assert.ok(geometryArea(targets[0].geom) > 0);
});

test('coverage topology distinguishes numerical cracks from true voids', () => {
  const crackModel = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 }),
    gap = 5e-5,
    half = 10 - gap / 2;
  crackModel.regions = [
    {
      id: 'left',
      geom: rectMulti(half, 10, -5 - gap / 4, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    {
      id: 'right',
      geom: rectMulti(half, 10, 5 + gap / 4, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];
  const crackCoverage = classifyCoverageVoids(crackModel, { crackTolerance: 1e-4 });
  assert.equal(crackCoverage.cracks.length, 1);
  assert.equal(crackCoverage.voids.length, 0);

  const voidModel = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  voidModel.regions = [
    {
      id: 'left-half',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];
  const voidCoverage = classifyCoverageVoids(voidModel, { crackTolerance: 1e-4 });
  assert.equal(voidCoverage.cracks.length, 0);
  assert.equal(voidCoverage.voids.length, 1);
  assert.ok(voidCoverage.voids[0].area > 40);
});

test('conformal wall topology emits material-wall and void-wall explicitly', () => {
  const stepped = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  stepped.regions = [
    {
      id: 'high',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 6 }],
    },
    {
      id: 'low',
      geom: rectMulti(10, 10, 5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];
  const band = rectMulti(1, 10, 0, 0),
    stepTargets = conformalWallTargets(stepped, band, {
      face: 'front',
      source: { z: 6, oppositeZ: -4 },
      voidDomain: [],
    });
  assert.equal(stepTargets.materialWalls.length, 1);
  assert.equal(stepTargets.materialWalls[0].kind, 'material-wall');
  assert.equal(stepTargets.voidWalls.length, 0);

  const open = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  open.regions = [
    {
      id: 'left',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 6 }],
    },
  ];
  const openTargets = conformalWallTargets(open, band, {
    face: 'front',
    source: { z: 6, oppositeZ: -4 },
    voidDomain: uncoveredDomain(open),
  });
  assert.equal(openTargets.materialWalls.length, 0);
  assert.equal(openTargets.voidWalls.length, 1);
  assert.equal(openTargets.voidWalls[0].kind, 'void-wall');
  assert.deepEqual([openTargets.voidWalls[0].z0, openTargets.voidWalls[0].z1], [-4, 6]);
});

test('Section slices and 3D solid caps share topology v2 boundaries', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  applyOperation(model, {
    type: 'add',
    name: 'Step',
    thickness: 2,
    face: 'front',
    area: rectMulti(10, 10, -5, 0),
    growth: 'direct',
  });

  const slices = sectionSlicesFromTopology(model, [-9, 0], [9, 0]),
    solids = materialSolidsFromTopology(model),
    stepSlice = slices.find((slice) => slice.layerId !== 'base');
  assert.ok(stepSlice);
  assert.deepEqual([stepSlice.z0, stepSlice.z1], [4, 6]);

  const base = solids.find((solid) => solid.layerId === 'base'),
    step = solids.find((solid) => solid.layerId !== 'base');
  assert.ok(base);
  assert.ok(step);
  assert.equal(
    base.caps.some((cap) => cap.z === 4 && cap.normal === 1),
    true,
  );
  assert.equal(
    step.caps.some((cap) => cap.z === 4 && cap.normal === -1),
    true,
  );
  assert.equal(
    step.caps.some((cap) => cap.z === 6 && cap.normal === 1),
    true,
  );
});

test('material solid topology removes internal caps across computational partitions', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    {
      id: 'right',
      geom: rectMulti(10, 10, 5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];

  const [solid] = materialSolidsFromTopology(model);
  assert.equal(solid.slabs.length, 1);
  assert.equal(solid.caps.length, 2);
  assert.ok(Math.abs(geometryArea(solid.slabs[0].polys) - 200) < 1e-8);
});

test('material slab derivation falls back when polygon union rejects a complex set', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(9.5, 10, -5.25, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    {
      id: 'right',
      geom: rectMulti(9.5, 10, 5.25, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
  ];

  const originalUnion = globalThis.polygonClipping.union;
  globalThis.polygonClipping.union = () => {
    throw new Error('synthetic union rejection');
  };
  try {
    const [solid] = materialSolidsFromTopology(model);
    assert.equal(solid.slabs.length, 1);
    assert.ok(Math.abs(geometryArea(solid.slabs[0].polys) - 190) < 1e-8);
  } finally {
    globalThis.polygonClipping.union = originalUnion;
  }
});

test('owned material surfaces emit one horizontal owner for a shared material interface', () => {
  const model = createModel({ shape: 'rect', width: 4, height: 4, thickness: 2 });
  model.layers.push({ id: 'film', name: 'Film', color: '#999999' });
  model.regions = [
    {
      id: 'stack',
      geom: rectMulti(4, 4, 0, 0),
      stack: [
        { layerId: 'base', z0: -1, z1: 0 },
        { layerId: 'film', z0: 0, z1: 1 },
      ],
    },
  ];

  const plan = ownedMaterialSurfacesFromTopology(model),
    shared = plan.caps.filter((cap) => Math.abs(cap.z) < 1e-12 && cap.ownership === 'interface');

  assert.equal(shared.length, 1);
  assert.equal(shared[0].buried, true);
  assert.ok(['base', 'film'].includes(shared[0].layerId));
  assert.ok(['base', 'film'].includes(shared[0].interfaceLayerId));
  assert.notEqual(shared[0].layerId, shared[0].interfaceLayerId);
  assert.ok(Math.abs(geometryArea(shared[0].polys) - 16) < 1e-8);
});

test('owned material surfaces reconcile partial-height shared sidewalls once', () => {
  const model = createModel({ shape: 'rect', width: 2, height: 2, thickness: 2 });
  model.layers.push({ id: 'right', name: 'Right', color: '#999999' });
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(1, 2, -0.5, 0),
      stack: [{ layerId: 'base', z0: 0, z1: 1 }],
    },
    {
      id: 'right',
      geom: rectMulti(1, 2, 0.5, 0),
      stack: [{ layerId: 'right', z0: 0, z1: 2 }],
    },
  ];

  const plan = ownedMaterialSurfacesFromTopology(model),
    shared = plan.sidewalls.filter(
      (part) => Math.abs(part.p[0]) < 1e-12 && Math.abs(part.q[0]) < 1e-12,
    ),
    summary = new Map();
  for (const part of shared) {
    const key = `${part.z0}:${part.z1}:${part.ownership}`,
      length = Math.hypot(part.q[0] - part.p[0], part.q[1] - part.p[1]);
    summary.set(key, (summary.get(key) || 0) + length);
  }
  assert.deepEqual([...summary].sort(), [
    ['0:1:interface', 2],
    ['1:2:exterior', 2],
  ]);
});

test('topology derivation is pure after a mixed Etch and Conformal sequence', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  applyOperation(model, {
    type: 'etch',
    thickness: 1.5,
    face: 'front',
    area: rectMulti(8, 6),
    surface: {
      kind: 'rough',
      featureSize: 0.5,
      meanHeight: 0.4,
      featureCv: 0.2,
      heightCv: 0.2,
      morphology: 'stochastic',
      polarity: 'inverted',
    },
  });
  applyOperation(model, {
    type: 'add',
    name: 'Coat',
    thickness: 0.6,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });

  const before = structuredClone(model);
  deriveProcessTopology(model, { face: 'front' });
  deriveProcessTopology(model, { face: 'back' });
  sectionSlicesFromTopology(model, [-9, 0], [9, 0]);
  materialSolidsFromTopology(model);
  appearanceSurfaceGroupsFromTopology(model);
  assert.deepEqual(model, before);
});

test('deriveProcessTopology reports one coherent 2.5D fact set', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  const topology = deriveProcessTopology(model);
  assert.equal(topology.kernel, 'surface-topology-v2');
  assert.equal(topology.face, 'front');
  assert.equal(topology.exposedFaces.length, 1);
  assert.equal(topology.materialInterfaces.length, 0);
  assert.equal(topology.appearanceFaces.length, 0);
  assert.equal(topology.voids.length, 0);
});
