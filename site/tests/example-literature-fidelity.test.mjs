import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Paper-to-geometry probes. These inspect canonical Z intervals and Mask geometry,
// not the 3D shader, roughness appearance or a screenshot of a saved stage.
async function example(id) {
  return JSON.parse(await readFile(new URL(`../examples/${id}.wafercad`, import.meta.url), 'utf8'));
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInMulti(point, multi) {
  return multi.some(
    (polygon) =>
      pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

function materialAt(project, point) {
  const matches = project.model.regions.filter((region) =>
    pointInMulti(point, project.sharedGeometries[region.geomRef]),
  );
  assert.equal(matches.length, 1, `Expected one material owner at ${point}`);
  return matches[0].stack.map((segment) => ({
    name: project.model.layers.find((layer) => layer.id === segment.layerId)?.name,
    z0: segment.z0,
    z1: segment.z1,
  }));
}

function segment(stack, name) {
  const result = stack.find((entry) => entry.name?.includes(name));
  assert.ok(result, `Missing ${name}`);
  return result;
}

function thickness(stack, name) {
  const entry = segment(stack, name);
  return entry.z1 - entry.z0;
}

test('Basiri-Esfahani microdisk preserves process chronology and a real void', async () => {
  const project = await example('suspended-silica-microdisks');
  const steps = project.processRecipe.steps;
  assert.deepEqual(
    steps.map((step) => step.command),
    ['deposit', 'record', 'record', 'etch', 'record', 'record', 'etch', 'record'],
  );
  const prep = steps[5];
  assert.match(prep.params.label, /protective resist recoat.*dicing.*resist strip/i);
  assert.match(prep.params.note, /before XeF2 release/i);
  assert.match(project.snapshotBranches.nodes[6].operation.note, /mechanically separate/i);
  assert.ok(
    project.snapshots.some(
      (snapshot) =>
        snapshot.historyNodeId === 'process-microdisk-07' && snapshot.name === prep.params.label,
    ),
  );
  assert.equal(steps[3].params.area, 'invert');
  assert.deepEqual(steps[3].params.mask.layerKeys, ['1|0']);
  assert.equal(steps[3].params.thicknessUm, 2);
  assert.equal(steps[6].params.profile, 'isotropic');
  assert.equal(steps[6].params.thicknessUm, 36);
  assert.equal(project.layout.elements.length, 7);

  const center = materialAt(project, [0, 0]);
  const inner = materialAt(project, [100, 0]);
  const middle = materialAt(project, [120, 0]);
  const rim = materialAt(project, [140, 0]);
  const outside = materialAt(project, [150, 0]);
  assert.ok(Math.abs(thickness(center, 'Thermal SiO₂') - 1.8) < 1e-9);
  assert.ok(Math.abs(segment(center, 'Silicon').z1 - segment(center, 'Thermal').z0) < 1e-9);
  const siliconTop = (stack) => segment(stack, 'Silicon').z1;
  assert.ok(siliconTop(center) > siliconTop(middle));
  assert.ok(siliconTop(middle) > siliconTop(inner));
  assert.ok(siliconTop(inner) > siliconTop(rim));
  assert.ok(Math.abs(siliconTop(rim) - 4) < 1e-9);
  assert.ok(
    segment(inner, 'Thermal').z0 - siliconTop(inner) >= 30,
    'The release must leave a real void beneath the silica annulus',
  );
  assert.equal(
    outside.some((entry) => entry.name.includes('SiO₂')),
    false,
  );
});

test('PERC point contacts expose silicon but nearby rear regions remain insulated', async () => {
  const project = await example('perc-solar-cells-point-contacts');
  assert.equal(project.layout.combos.find((combo) => combo.layer === 5)?.count, 100);
  const rearOpenings = project.layout.elements.filter(
    (element) => element.layer === 5 && element.datatype === 0,
  );
  assert.equal(rearOpenings.length, 100);
  const steps = project.processRecipe.steps;
  assert.equal(steps.length, 17);
  const backWindow = steps.find((step) => step.command === 'etch' && step.params.face === 'back');
  assert.deepEqual(backWindow.params.mask.layerKeys, ['5|0']);
  const passivation = steps.find(
    (step) => step.command === 'deposit' && step.params.face === 'both',
  );
  assert.equal(passivation.params.thicknessUm, 0.11);
  assert.ok(steps.some((step) => step.command === 'implant' && /250 Ω/.test(step.params.name)));
  assert.ok(steps.some((step) => step.command === 'implant' && /25 Ω/.test(step.params.name)));

  for (const [index, opening] of rearOpenings.entries()) {
    const center = [
      opening.points.reduce((sum, point) => sum + point[0], 0) / opening.points.length,
      opening.points.reduce((sum, point) => sum + point[1], 0) / opening.points.length,
    ];
    const stack = materialAt(project, center);
    assert.ok(
      Math.abs(segment(stack, 'Al rear').z1 - segment(stack, 'Base').z0) < 1e-9,
      `Rear contact ${index + 1} must reach silicon`,
    );
    const silicon = segment(stack, 'Base');
    const rearMetal = segment(stack, 'Al rear');
    assert.equal(
      stack.some(
        (entry) =>
          entry.name.includes('passivation') && entry.z0 < silicon.z0 && entry.z1 > rearMetal.z0,
      ),
      false,
      `Rear contact ${index + 1} must have no interposed backside oxide`,
    );
  }
  const contact = materialAt(project, [-9000, -9000]);
  const insulated = materialAt(project, [-8500, -8500]);
  const frontStripe = materialAt(project, [0, -7500]);
  assert.ok(Math.abs(segment(contact, 'Al rear').z1 - segment(contact, 'Base').z0) < 1e-9);
  assert.ok(
    Math.abs(thickness(insulated, 'passivation') - 0.11) < 1e-9,
    'Backside oxide must remain between rear Al and Si off the point contacts',
  );
  assert.ok(frontStripe.some((entry) => entry.name.includes('Ti-Pd front contact')));
  assert.ok(frontStripe.some((entry) => entry.name.includes('Plated Ag front contact')));
});

test('Sahli tandem retains a nanometre top-cell stack with a localized Ag stripe', async () => {
  const project = await example('fully-textured-perovskite-silicon-tandem');
  const steps = project.processRecipe.steps;
  const izo = steps.find((step) => step.params.material?.startsWith('IZO active'));
  const ag = steps.find((step) => step.params.material?.startsWith('Ag grid'));
  assert.equal(izo.params.mask.cell, 'M01_IZO_ACTIVE');
  assert.equal(ag.params.mask.cell, 'M02_AG_GRID_SURROGATE');
  assert.notEqual(izo.params.mask.cell, ag.params.mask.cell);
  assert.equal(
    project.layout.elements.filter((element) => element.sourceCell === ag.params.mask.cell).length,
    6,
  );
  assert.equal(steps.find((step) => step.command === 'etch').params.face, 'both');
  assert.ok(steps.some((step) => step.command === 'deposit' && step.params.thicknessUm === 0.001));
  const active = materialAt(project, [0, 0]);
  const finger = materialAt(project, [0, 2000]);
  assert.ok(Math.abs(thickness(active, 'Perovskite') - 0.44) < 1e-9);
  assert.ok(Math.abs(thickness(active, 'LiF') - 0.001) < 1e-9);
  assert.ok(Math.abs(thickness(active, 'IZO active') - 0.11) < 1e-9);
  assert.ok(Math.abs(thickness(finger, 'Ag grid') - 0.12) < 1e-9);
  assert.equal(
    active.some((entry) => entry.name.includes('Ag grid')),
    false,
  );
  assert.ok(Math.abs(thickness(finger, 'MgF2') - 0.1) < 1e-9);
  const validIntervals = project.model.regions.every((region) =>
    region.stack.every((s) => s.z1 > s.z0),
  );
  assert.ok(validIntervals, 'Saved material intervals must have positive physical thickness');
  const nominalZ = new Map([
    ['layer-15', 0.12],
    ['layer-16', 0.1],
  ]);
  // A thicker Z interval in a narrow edge band is a *sidewall* geometric
  // surrogate spanning a step, not a horizontally deposited over-thick film.
  for (const region of project.model.regions) {
    for (const entry of region.stack) {
      const nominal = nominalZ.get(entry.layerId);
      if (nominal !== undefined && entry.z1 - entry.z0 > nominal + 1e-8) {
        assert.equal(entry.role, 'conformal-sidewall');
      }
    }
  }
});

test('Photodetector variants distinguish Implant from Electrical Region', async () => {
  const project = await example('photodetector-literature-examples');
  const branches = new Map(project.snapshotBranches.branches.map((b) => [b.id, b]));
  const black = branches.get('black-si-fig1a-final').headState.processRecipe.steps;
  const geA = branches.get('ge-fig15-a').headState.processRecipe.steps;
  const geB = branches.get('ge-fig15-b').headState.processRecipe.steps;
  assert.equal(black[0].command, 'deposit');
  assert.equal(black[0].params.face, 'both');
  assert.equal(black[0].params.thicknessUm, 0.65);
  assert.ok(black.some((step) => step.command === 'deposit' && step.params.thicknessUm === 0.05));
  assert.ok(black.some((step) => step.command === 'implant' && step.params.face === 'back'));
  assert.equal(geA.filter((step) => step.command === 'electrical').length, 1);
  assert.equal(geB.filter((step) => step.command === 'electrical').length, 2);
  assert.equal(geB.filter((step) => step.command === 'implant').length, 2);
  assert.ok(geB.some((step) => step.command === 'record' && /500°C/.test(step.params.label)));
  for (const step of [...black, ...geA, ...geB]) {
    if (step.params?.area !== 'mask' && step.params?.area !== 'invert') continue;
    assert.equal(step.params.mask.sourceMode, 'draw');
    assert.ok(step.params.mask.drawMask.shapes.length > 0);
  }
});

function ringArea(ring) {
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea / 2);
}

function materialVolume(project, model, material) {
  const ids = new Set(
    model.layers.filter((layer) => layer.name.includes(material)).map((layer) => layer.id),
  );
  assert.ok(ids.size > 0, `Missing material ${material}`);
  let volume = 0;
  for (const region of model.regions) {
    const geometry = project.sharedGeometries[region.geomRef];
    assert.ok(geometry, `Unknown shared geometry ${region.geomRef}`);
    const area = geometry.reduce(
      (sum, polygon) =>
        sum +
        ringArea(polygon[0]) -
        polygon.slice(1).reduce((holeSum, ring) => holeSum + ringArea(ring), 0),
      0,
    );
    for (const interval of region.stack) {
      if (ids.has(interval.layerId)) volume += area * (interval.z1 - interval.z0);
    }
  }
  return volume;
}

test('Black-Si metal removal keeps ALD; destructive QA removes part of ALD and Si', async () => {
  const project = await example('photodetector-literature-examples');
  const branches = new Map(project.snapshotBranches.branches.map((branch) => [branch.id, branch]));
  function savedModel(id) {
    const ref = branches.get(id).headState.modelRef;
    return ref === 'project' ? project.model : project.sharedModels[ref];
  }
  const source = savedModel('black-si-fig1a');
  const final = savedModel('black-si-fig1a-final');
  const qa = savedModel('black-si-fig1a-qa');
  const volume = (model, material) => materialVolume(project, model, material);
  const initialAl = volume(source, 'Front sputtered Al');
  const protectedAl = volume(final, 'Front sputtered Al');
  const ald = volume(source, 'ALD Al2O3');
  assert.ok(protectedAl < initialAl * 0.2, 'Final strip must remove most blanket metal');
  assert.ok(Math.abs(volume(final, 'ALD Al2O3') - ald) < 1e-5);
  assert.ok(Math.abs(volume(final, 'n- Si (111)') - volume(source, 'n- Si (111)')) < 1e-5);
  assert.ok(volume(qa, 'ALD Al2O3') < ald * 0.6);
  assert.ok(volume(qa, 'n- Si (111)') < volume(final, 'n- Si (111)'));
});

test('Record-only closing steps preserve the last real physical structure', async () => {
  for (const id of [
    'suspended-silica-microdisks',
    'perc-solar-cells-point-contacts',
    'fully-textured-perovskite-silicon-tandem',
  ]) {
    const project = await example(id);
    const graph = project.snapshotBranches;
    const active = graph.branches.find((branch) => branch.id === graph.activeBranchId);
    const finalNode = graph.nodes.find((node) => node.id === active.headNodeId);
    const physicalNode = graph.nodes.find((node) => node.id === finalNode.parentId);
    assert.equal(finalNode.operation.kind, 'record', id);
    assert.equal(physicalNode.processRevision + 1, finalNode.processRevision);
    assert.equal(finalNode.state.modelRef, 'project');
    const physicalModel = project.sharedModels[physicalNode.state.modelRef];
    assert.ok(physicalModel, id + ': missing last physical step model');
    assert.deepEqual(
      physicalModel.regions,
      project.model.regions,
      id + ': a Record-only step must leave the physical XY/Z material unchanged',
    );
    assert.equal(physicalModel.processRevision, physicalNode.processRevision);
    const bookmarks = project.snapshots.filter(
      (snapshot) => snapshot.historyNodeId === physicalNode.id,
    );
    assert.ok(bookmarks.length > 0, id + ': missing physical process-step bookmark');
    for (const snapshot of bookmarks) {
      assert.equal(snapshot.state.modelRef, physicalNode.state.modelRef);
    }
  }
});

test('PERC GDS Variant has no mask-edge Ag curtain and a geometry-neutral sinter', async () => {
  const project = await example('perc-solar-cells-point-contacts');
  const graph = project.snapshotBranches;
  const branch = graph.branches.find((entry) => entry.id === 'branch-mutknd4v-hcdg7q');
  assert.ok(branch, 'Missing literature GDS-contact Variant');
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const sinter = nodes.get(branch.headNodeId);
  const rearMetal = nodes.get(sinter.parentId);
  const platedSilver = nodes.get(rearMetal.parentId);
  assert.deepEqual(
    [platedSilver.operation.kind, rearMetal.operation.kind, sinter.operation.kind],
    ['add', 'add', 'record'],
  );
  const silverModel = project.sharedModels[platedSilver.state.modelRef];
  const rearModel = project.sharedModels[rearMetal.state.modelRef];
  const finalModel = project.sharedModels[sinter.state.modelRef];
  const silverLayer = silverModel.layers.find((layer) =>
    layer.name.includes('Front silver-plated contact fingers'),
  );
  assert.ok(silverLayer);
  const silverSegments = silverModel.regions.flatMap((region) =>
    region.stack.filter((interval) => interval.layerId === silverLayer.id),
  );
  assert.ok(silverSegments.length > 0);
  for (const interval of silverSegments) {
    assert.ok(Math.abs(interval.z1 - interval.z0 - 0.2) < 1e-9);
    assert.notEqual(interval.role, 'conformal-sidewall');
  }
  assert.ok(materialVolume(project, silverModel, 'Front silver-plated contact') > 0);
  assert.ok(
    Math.abs(
      materialVolume(project, rearModel, 'Front silver-plated contact') -
        materialVolume(project, silverModel, 'Front silver-plated contact'),
    ) < 1e-5,
    'Rear metal must not change front plated silver occupancy',
  );
  assert.deepEqual(finalModel.regions, rearModel.regions);
  assert.deepEqual(project.sharedModels[branch.headState.modelRef].regions, finalModel.regions);
  for (const node of [platedSilver, rearMetal, sinter]) {
    const bookmarks = project.snapshots.filter((entry) => entry.historyNodeId === node.id);
    assert.ok(bookmarks.length > 0);
    for (const bookmark of bookmarks) assert.equal(bookmark.state.modelRef, node.state.modelRef);
  }
});
