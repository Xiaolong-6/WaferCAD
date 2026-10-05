import assert from 'node:assert/strict';

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
