import assert from 'node:assert/strict';
import { expandProjectStorage } from '../../site/project-io.js';

function modelForState(project, state) {
  if (state?.model) return state.model;
  if (Number.isInteger(state?.modelRef)) return project.sharedModels?.[state.modelRef] || null;
  return null;
}

export function materialTopologySignature(model) {
  return JSON.stringify({
    layers: model?.layers || [],
    regions: (model?.regions || []).map((region) => ({
      id: region.id,
      geom: region.geom,
      stack: region.stack,
    })),
  });
}

export function assertAnnotationKeepsMaterialTopology(project) {
  const nodes = project.snapshotBranches?.nodes || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let checked = 0;

  for (const node of nodes) {
    if (!['implant', 'electrical'].includes(node.operation?.kind)) continue;
    const parent = byId.get(node.parentId);
    const parentModel = modelForState(project, parent?.state);
    const resultModel = modelForState(project, node.state);

    assert.ok(parentModel, `${node.id}: annotation parent model is missing`);
    assert.ok(resultModel, `${node.id}: annotation result model is missing`);
    assert.equal(
      materialTopologySignature(resultModel),
      materialTopologySignature(parentModel),
      `${node.operation.kind} annotation must not repartition material geometry: ${node.operation.label}`,
    );
    checked += 1;
  }

  assert.ok(checked > 0, 'Expected at least one Implant/Electrical annotation contract');
  return checked;
}

export function assertTandemTextureContract(project) {
  const model = project.model;
  assert.ok(model?.regions?.length, 'Tandem final model is missing regions');

  const layerById = new Map(model.layers.map((layer) => [layer.id, layer]));
  const frontProfile = 'pyramid-front-2018';
  const backProfile = 'pyramid-back-2019';
  const seenFront = new Set();
  const seenBack = new Set();

  for (const region of model.regions) {
    for (const segment of region.stack || []) {
      if (segment.layerId === 'base') {
        assert.equal(segment.frontSurface?.profileId, frontProfile);
        assert.equal(segment.backSurface?.profileId, backProfile);
        assert.equal(segment.frontSurface?.morphology, 'pyramid');
        assert.equal(segment.backSurface?.morphology, 'pyramid');
        continue;
      }

      const layer = layerById.get(segment.layerId);
      assert.ok(layer, `Unknown tandem layer ${segment.layerId}`);
      const isBack = /^(back|rear)\b/i.test(layer.name);
      const surface = isBack ? segment.backSurface : segment.frontSurface;

      assert.ok(
        surface,
        `${layer.name}: textured tandem segment lost its ${isBack ? 'back' : 'front'} surface profile`,
      );
      assert.equal(surface.profileId, isBack ? backProfile : frontProfile);
      assert.equal(surface.morphology, 'pyramid');
      assert.equal(surface.polarity, 'normal');
      assert.equal(surface.seed, isBack ? 2019 : 2018);

      if (isBack) seenBack.add(segment.layerId);
      else seenFront.add(segment.layerId);
    }
  }

  const expectedBack = new Set(
    model.layers
      .filter((layer) => layer.id !== 'base' && /^(back|rear)\b/i.test(layer.name))
      .map((layer) => layer.id),
  );
  const expectedFront = new Set(
    model.layers
      .filter((layer) => layer.id !== 'base' && !/^(back|rear)\b/i.test(layer.name))
      .map((layer) => layer.id),
  );

  assert.deepEqual([...seenBack].sort(), [...expectedBack].sort());
  assert.deepEqual([...seenFront].sort(), [...expectedFront].sort());

  return {
    frontLayerCount: seenFront.size,
    backLayerCount: seenBack.size,
  };
}

export function assertNativeFig3Contract(project, pointInMulti) {
  assert.equal(typeof pointInMulti, 'function');
  const expanded = expandProjectStorage(structuredClone(project)),
    model = nativeDeviceModel(expanded.model),
    nodes = expanded.snapshotBranches.nodes.map((node) => ({
      ...node,
      state: node.state
        ? { ...node.state, model: nativeDeviceModel(node.state.model) }
        : node.state,
    })),
    names = new Map(model.layers.map((layer) => [layer.id, layer.name]));
  assert.equal(nodes.length, 40);
  assert.equal(model.width, 1600);
  assert.equal(model.height, 1600);
  assert.equal(model.electricalRegions.length, 3);
  function ownerAt(point) {
    const owners = model.regions.filter((region) => pointInMulti(point, region.geom));
    assert.equal(owners.length, 1, `One material owner at ${point}`);
    return owners[0];
  }
  for (const tier of [1, 2, 3]) {
    const gate = nodes.find((node) => node.operation?.name === `T${tier} HfO2 gate`);
    assert.equal(gate?.operation.growth, 'conformal', `T${tier} native gate`);
    for (const [point, pad] of [
      [[0, 0], false],
      [[-575, 0], true],
      [[575, 0], true],
    ]) {
      const stack = ownerAt(point).stack,
        thickness = (name) =>
          stack
            .filter((segment) => names.get(segment.layerId) === name)
            .reduce((sum, segment) => sum + segment.z1 - segment.z0, 0);
      for (const [name, expected] of [
        [`T${tier} Si membrane`, 0.01],
        [`T${tier} HfO2 gate`, pad ? 0 : 0.01],
        [`T${tier} ${pad ? 'S/D' : 'Gate'} metal`, pad ? 0.0414 : 0.0404],
      ])
        assert.ok(Math.abs(thickness(name) - expected) < 1e-9, `${name} at ${point}`);
    }
    assert.equal(
      ownerAt([0, 150]).stack.some(
        (segment) => names.get(segment.layerId) === `T${tier} Si membrane`,
      ),
      false,
      `T${tier} isolation outside the active mask`,
    );
  }
  for (const tier of [1, 2]) {
    const liner = nodes.find((node) => node.operation?.name === `ILD${tier} HfO2 liner`);
    assert.equal(liner?.operation.growth, 'conformal', `ILD${tier} native liner`);
  }
  const cmpSteps = nodes.filter((node) => node.operation?.etchProfile === 'planarize');
  assert.equal(cmpSteps.length, 2);
  for (const node of cmpSteps) {
    const target = node.operation.targetZ;
    assert.ok(Number.isFinite(target));
    for (const region of node.state.model.regions)
      assert.ok(
        Math.abs(Math.max(...region.stack.map((segment) => segment.z1)) - target) < 1e-9,
        'CMP leaves a uniform physical plane',
      );
  }
  for (const point of [
    [-700.005, 0],
    [700.005, 0],
  ]) {
    const wall = ownerAt(point).stack.find(
      (segment) => names.get(segment.layerId) === 'T3 HfO2 gate',
    );
    assert.equal(wall?.role, 'conformal-sidewall');
    assert.ok(wall.z1 - wall.z0 > 0.05, 'T3 finite-height S/D sidewall');
  }
  return { tiers: 3, nativeConformalGates: 3, nativeConformalLiners: 2, steps: 40 };
}

// Full-wafer assembly keeps the same verified local recipe at every device.
// Require all 625 device references and inspect each recorded Step's template.
function nativeDeviceModel(model) {
  if (model.kernel !== 'vector-2.5d-array-v1') return model;
  assert.equal(model.width, 76200);
  assert.equal(model.height, 76200);
  const sites = model.array.instances.filter((i) => i.role === 'device');
  assert.equal(sites.length, 625);
  const templateId = sites[0].templateId;
  assert.ok(
    sites.every((i) => i.templateId === templateId),
    'Every native device uses the verified recipe',
  );
  const leaf = model.array.templates.find((t) => t.id === templateId).model;
  return { ...leaf, layers: model.layers };
}
