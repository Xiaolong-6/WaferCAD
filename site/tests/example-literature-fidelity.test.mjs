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
  // Basiri-Esfahani et al., Nature Communications 10, 132 (2019),
  // Results / Fig. 2a: 148 µm outer radius and 82 µm inner radius.
  for (const [index, sector] of project.layout.elements.slice(0, 4).entries()) {
    const radii = sector.points.map(([x, y]) => Math.hypot(x, y));
    assert.ok(
      Math.abs(Math.max(...radii) - 148) < 1e-5,
      `Source outer 148 µm radius lost at mask sector ${index + 1}`,
    );
    assert.ok(
      Math.abs(Math.min(...radii) - 82) < 1e-5,
      `Source inner 82 µm radius lost at mask sector ${index + 1}`,
    );
  }

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
  // Paper Results: approximately 230 ng. Derive mass independently from
  // every saved SiO₂ polygon and physical thickness, not render pixels.
  // 2.2 g/cm³ fused silica density = 0.0022 ng/µm³.
  const silicaVolume = materialVolume(project, project.model, 'Thermal SiO₂');
  const silicaMassNg = silicaVolume * 0.0022;
  assert.ok(
    Math.abs(silicaMassNg - 230) / 230 < 0.05,
    `Physical SiO₂ mass ${silicaMassNg.toFixed(2)} ng differs from the paper's ~230 ng`,
  );
});

test('PERC point contacts expose silicon but nearby rear regions remain insulated', async () => {
  const project = await example('perc-solar-cells-point-contacts');
  assert.equal(project.layout.combos.find((combo) => combo.layer === 5)?.count, 100);
  const rearOpenings = project.layout.elements.filter(
    (element) => element.layer === 5 && element.datatype === 0,
  );
  assert.equal(rearOpenings.length, 100);
  // These are the saved engineering-mask grid coordinates, not author GDS.
  // A count-only assertion would miss duplicate, shifted or missing cells.
  const rearMetalPattern = project.layout.elements.filter(
    (element) => element.layer === 6 && element.datatype === 0,
  );
  const gridPositions = Array.from({ length: 10 }, (_, i) => -9000 + 2000 * i);
  const expectedCenters = new Set(
    gridPositions.flatMap((x) => gridPositions.map((y) => `${x},${y}`)),
  );
  const centerKey = (element) => {
    const count = element.points.length;
    const [x, y] = element.points.reduce(
      ([sumX, sumY], point) => [sumX + point[0], sumY + point[1]],
      [0, 0],
    );
    return `${Math.round((x / count) * 1000) / 1000},${Math.round((y / count) * 1000) / 1000}`;
  };
  assert.equal(rearMetalPattern.length, 100);
  assert.deepEqual(new Set(rearOpenings.map(centerKey)), expectedCenters);
  assert.deepEqual(new Set(rearMetalPattern.map(centerKey)), expectedCenters);
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

test('Sahli pyramid SEM remains outside the canonical 2.5D facet contract', async () => {
  // Original Sahli 2018 SI Fig. S3b/c shows a genuinely faceted Si ridge and
  // valley. Our saved base intervals remain planar despite the Section's
  // procedural pyramid appearance. Never certify SEM ridge/valley geometry
  // from the appearance-only screenshot or nominal conformal film heights.
  const project = await example('fully-textured-perovskite-silicon-tandem');
  const silicon = project.model.regions.flatMap((region) =>
    region.stack.filter((interval) => interval.layerId === 'base'),
  );
  assert.ok(silicon.length > 1);
  // The paper's 260 µm describes the incoming wafer, not the etched
  // canonical 2.5D slab. Both-face 4.5 µm etch removes 9 µm in total.
  const incomingThickness = project.processRecipe.base.thickness;
  const textured = project.processRecipe.steps.find(
    (step) => step.command === 'etch' && step.params.target === project.processRecipe.base.material,
  );
  assert.equal(incomingThickness, 260);
  assert.ok(textured, 'Missing the source-order silicon texturing etch');
  assert.equal(textured.params.face, 'both');
  assert.equal(textured.params.thicknessUm, 4.5);
  const remainingSlab = incomingThickness - 2 * textured.params.thicknessUm;
  assert.equal(remainingSlab, 251);
  for (const interval of silicon) {
    assert.ok(Math.abs(interval.z0 + remainingSlab / 2) < 1e-9);
    assert.ok(Math.abs(interval.z1 - remainingSlab / 2) < 1e-9);
  }
  assert.ok(
    silicon.every(
      (interval) =>
        interval.frontSurface?.morphology === 'pyramid' &&
        interval.frontSurface?.geometryMode === 'ideal' &&
        interval.backSurface?.morphology === 'pyramid',
    ),
    'The procedural front/back texture metadata must remain explicit',
  );
  const topPlanes = [...new Set(silicon.map((interval) => interval.z1))];
  assert.deepEqual(
    topPlanes,
    [125.5],
    'Current saved model has a single canonical Si top plane; true facets require a new contract',
  );
  for (const xy of [
    [-8, 0],
    [-4, 0],
    [0, 0],
    [4, 0],
    [8, 0],
  ]) {
    assert.equal(
      segment(materialAt(project, xy), 'n-type FZ c-Si').z1,
      125.5,
      'Appearance-only pyramids must not be misreported as physical XY/Z facets',
    );
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

test('Photodetector Variants keep distinct front material owners', async () => {
  const project = await example('photodetector-literature-examples');
  const branches = new Map(project.snapshotBranches.branches.map((branch) => [branch.id, branch]));
  const stackAt = (branchId, point) => {
    const branch = branches.get(branchId);
    assert.ok(branch, 'Missing photodetector Variant ' + branchId);
    const ref = branch.headState.modelRef;
    const model = ref === 'project' ? project.model : project.sharedModels[ref];
    assert.ok(model, 'Missing photodetector material model ' + branchId);
    return materialAt({ ...project, model }, point);
  };

  for (const id of ['black-si-fig1a-final', 'black-si-fig1a-qa']) {
    const outside = stackAt(id, [-3200, 0]);
    assert.ok(Math.abs(thickness(outside, 'ALD Al2O3') - 0.05) < 1e-9);
    assert.ok(Math.abs(thickness(outside, 'Thermal SiO2') - 0.65) < 1e-9);
  }
  const activeFinal = stackAt('black-si-fig1a-final', [0, 0]);
  const activeQa = stackAt('black-si-fig1a-qa', [0, 0]);
  assert.ok(Math.abs(thickness(activeFinal, 'ALD Al2O3') - 0.05) < 1e-9);
  assert.ok(!activeQa.some((material) => material.name?.includes('ALD Al2O3')));
  assert.ok(
    segment(activeQa, 'n- Si (111)').z1 < segment(activeFinal, 'n- Si (111)').z1,
    'QA overetch must recess real active silicon',
  );

  const inactiveA = stackAt('ge-fig15-a', [-3200, 0]);
  const inactiveB = stackAt('ge-fig15-b', [-3200, 0]);
  const activeB = stackAt('ge-fig15-b', [0, 0]);
  assert.ok(!inactiveA.some((material) => material.name?.includes('SiO2 inactive')));
  assert.ok(Math.abs(thickness(inactiveB, 'SiO2 inactive') - 0.045) < 1e-9);
  assert.ok(Math.abs(thickness(inactiveB, 'Passivation ALD') - 0.02) < 1e-9);
  assert.ok(!activeB.some((material) => material.name?.includes('SiO2 inactive')));
  assert.ok(Math.abs(thickness(activeB, 'Passivation ALD') - 0.02) < 1e-9);
  for (const [id, expectedCount] of [
    ['ge-fig15-a', 1],
    ['ge-fig15-b', 2],
  ]) {
    const ref = branches.get(id).headState.modelRef;
    const model = ref === 'project' ? project.model : project.sharedModels[ref];
    assert.equal(model.electricalRegions.length, expectedCount);
    assert.equal(model.implants.length, 2);
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

test('Regenerated literature projects retain restorable History and Variant ancestry', async () => {
  for (const id of [
    'suspended-silica-microdisks',
    'perc-solar-cells-point-contacts',
    'fully-textured-perovskite-silicon-tandem',
  ]) {
    const project = await example(id);
    const graph = project.snapshotBranches;
    const ids = graph.nodes.map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, id + ': duplicate History node ID');
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const branches = new Map(graph.branches.map((branch) => [branch.id, branch]));
    assert.equal(branches.size, graph.branches.length, id + ': duplicate Variant ID');
    assert.ok(branches.has(graph.activeBranchId), id + ': missing active Variant');

    for (const branch of graph.branches) {
      assert.ok(nodes.has(branch.headNodeId), id + ': dangling Variant head ' + branch.id);
      const visited = new Set();
      let cursor = branch.headNodeId;
      while (cursor != null) {
        assert.ok(!visited.has(cursor), id + ': cyclic History at ' + cursor);
        visited.add(cursor);
        const node = nodes.get(cursor);
        assert.ok(node, id + ': missing History ancestor ' + cursor);
        if (node.parentId != null) {
          const parent = nodes.get(node.parentId);
          assert.ok(parent, id + ': dangling History parent ' + node.parentId);
        }
        cursor = node.parentId;
      }
    }
    for (const snapshot of project.snapshots) {
      if (snapshot.historyNodeId == null) continue;
      const node = nodes.get(snapshot.historyNodeId);
      assert.ok(node, id + ': dangling step bookmark ' + snapshot.historyNodeId);
      if (snapshot.state?.modelRef !== undefined && node.state?.modelRef !== undefined) {
        assert.equal(
          snapshot.state.modelRef,
          node.state.modelRef,
          id + ': bookmark must restore the recorded material state',
        );
      }
    }
  }
});

test('All saved literature History material references resolve to valid physical intervals', async () => {
  for (const id of [
    'suspended-silica-microdisks',
    'perc-solar-cells-point-contacts',
    'fully-textured-perovskite-silicon-tandem',
  ]) {
    const project = await example(id);
    const models = new Map();
    for (const node of project.snapshotBranches.nodes) {
      const ref = node.state?.modelRef;
      if (ref === undefined || ref === null) continue;
      const model = ref === 'project' ? project.model : project.sharedModels[ref];
      assert.ok(model, id + ': missing saved model for ' + node.id);
      models.set(ref, model);
    }
    for (const [ref, model] of models) {
      const layers = new Set(model.layers.map((layer) => layer.id));
      for (const region of model.regions) {
        assert.ok(project.sharedGeometries[region.geomRef], id + ': missing footprint in ' + ref);
        for (const interval of region.stack) {
          assert.ok(layers.has(interval.layerId), id + ': dangling material layer in ' + ref);
          assert.ok(
            Number.isFinite(interval.z0) &&
              Number.isFinite(interval.z1) &&
              interval.z1 > interval.z0,
            id + ': invalid physical Z interval in ' + ref,
          );
        }
      }
    }
  }
});

test('Every recorded no-geometry step preserves its actual material geometry', async () => {
  for (const id of [
    'suspended-silica-microdisks',
    'perc-solar-cells-point-contacts',
    'fully-textured-perovskite-silicon-tandem',
    'photodetector-literature-examples',
  ]) {
    const project = await example(id);
    const nodes = new Map(project.snapshotBranches.nodes.map((node) => [node.id, node]));
    const resolve = (ref) => (ref === 'project' ? project.model : project.sharedModels[ref]);
    for (const node of nodes.values()) {
      if (node.operation?.kind !== 'record' || node.parentId == null) continue;
      const parent = nodes.get(node.parentId);
      assert.ok(parent, id + ': missing Record parent ' + node.parentId);
      const before = resolve(parent.state?.modelRef);
      const after = resolve(node.state?.modelRef);
      assert.ok(before && after, id + ': dangling Record material state ' + node.id);
      assert.deepEqual(
        after.regions,
        before.regions,
        id + ': Record changed the material XY/Z geometry at ' + node.id,
      );
      assert.deepEqual(
        after.layers,
        before.layers,
        id + ': Record added/removed physical materials at ' + node.id,
      );
    }
  }
});

test('Reconciled Tandem History explicitly uses a geometric precursor surrogate', async () => {
  const project = await example('fully-textured-perovskite-silicon-tandem');
  const nodes = new Map(project.snapshotBranches.nodes.map((node) => [node.id, node]));
  const modelAtStep = (stepIndex) => {
    const step = project.processRecipe.steps[stepIndex - 1];
    const node = nodes.get(step.id.slice(7));
    assert.ok(node, 'Missing scientific History step ' + stepIndex);
    const ref = node.state.modelRef;
    return ref === 'project' ? project.model : project.sharedModels[ref];
  };
  const baseName = project.processRecipe.base.material;
  assert.equal(modelAtStep(1).layers[0].name, baseName);
  assert.equal(modelAtStep(2).layers[0].name, baseName);

  for (const stepIndex of [12, 13, 14]) {
    const model = modelAtStep(stepIndex);
    const materials = model.layers.map((layer) => layer.name);
    assert.ok(
      materials.includes('Perovskite [paper final ~440 nm; converted]'),
      'Step ' + stepIndex + ' no longer matches the simulated geometric material',
    );
    assert.ok(
      !materials.some((name) => name.includes('porous PbI2/CsBr precursor')),
      'Step ' + stepIndex + ' falsely implies an explicit precursor conversion model',
    );
  }

  const beforeExtend = modelAtStep(14);
  const afterExtend = modelAtStep(15);
  const perovskiteHeight = (model) => {
    const layer = model.layers.find((item) => item.name.startsWith('Perovskite ['));
    assert.ok(layer);
    const segments = model.regions.flatMap((region) =>
      region.stack.filter((segment) => segment.layerId === layer.id),
    );
    assert.ok(segments.length > 0);
    return Math.max(...segments.map((segment) => segment.z1 - segment.z0));
  };
  assert.ok(Math.abs(perovskiteHeight(beforeExtend) - 0.235) < 1e-9);
  assert.ok(Math.abs(perovskiteHeight(afterExtend) - 0.44) < 1e-9);

  for (const stepIndex of [19, 20]) {
    const model = modelAtStep(stepIndex);
    assert.ok(model.regions.length > 1, 'Lost patterned contact geometry in Step ' + stepIndex);
  }
});

test('Microdisk History records preserve etched oxide geometry', async () => {
  const project = await example('suspended-silica-microdisks');
  const nodes = new Map(project.snapshotBranches.nodes.map((node) => [node.id, node]));
  const modelAt = (stepNumber) => {
    const id = project.processRecipe.steps[stepNumber - 1].id.slice(7);
    const ref = nodes.get(id)?.state?.modelRef;
    assert.ok(ref !== undefined, 'Missing Microdisk step ' + stepNumber);
    return ref === 'project' ? project.model : project.sharedModels[ref];
  };
  const patterned = modelAt(4);
  const oxide = patterned.layers.find((layer) => layer.name.startsWith('Thermal SiO₂'));
  assert.ok(oxide, 'Missing SiO₂ immediately after patterned etch');
  const containsOxide = (point) =>
    patterned.regions.some(
      (region) =>
        region.stack.some((segment) => segment.layerId === oxide.id) &&
        pointInMulti(point, project.sharedGeometries[region.geomRef]),
    );
  assert.equal(containsOxide([0, 0]), true, 'Center hub oxide must remain');
  assert.equal(containsOxide([170, 0]), false, 'Outside radius must be stripped');
  for (const stepNumber of [5, 6]) {
    assert.deepEqual(
      modelAt(stepNumber).regions,
      patterned.regions,
      'Record must preserve patterned oxide before XeF2 release',
    );
  }
});
