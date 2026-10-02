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
