import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Paper-to-geometry probes. These inspect canonical Z intervals and Mask geometry,
// not the 3D shader, roughness appearance or a screenshot of a saved stage.
async function example(id) {
  return JSON.parse(
    await readFile(new URL(`../examples/${id}.wafercad`, import.meta.url), 'utf8'),
  );
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInMulti(point, multi) {
  return multi.some(
    (polygon) =>
      pointInRing(point, polygon[0]) &&
      !polygon.slice(1).some((hole) => pointInRing(point, hole)),
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
        snapshot.historyNodeId === 'process-microdisk-07' &&
        snapshot.name === prep.params.label,
    ),
  );
  assert.equal(steps[3].params.area, 'invert');
  assert.deepEqual(steps[3].params.mask.layerKeys, ['1|0']);
  assert.equal(steps[3].params.thicknessUm, 2);
  assert.equal(steps[6].params.profile, 'isotropic');
  assert.equal(steps[6].params.thicknessUm, 36);
  assert.equal(project.layout.elements.length, 7);

  const center = materialAt(project, [0, 0]);
  const released = materialAt(project, [100, 0]);
  const outside = materialAt(project, [150, 0]);
  assert.ok(Math.abs(thickness(center, 'Thermal SiO₂') - 1.8) < 1e-9);
  assert.ok(Math.abs(segment(center, 'Silicon').z1 - segment(center, 'Thermal').z0) < 1e-9);
  assert.ok(
    segment(released, 'Thermal').z0 - segment(released, 'Silicon').z1 >= 35.9,
    'A canonical released void must separate silica from silicon',
  );
  assert.equal(outside.some((entry) => entry.name.includes('SiO₂')), false);
});

test('PERC point contacts expose silicon but nearby rear regions remain insulated', async () => {
  const project = await example('perc-solar-cells-point-contacts');
  assert.equal(project.layout.combos.find((combo) => combo.layer === 5)?.count, 100);
  const steps = project.processRecipe.steps;
  assert.equal(steps.length, 17);
  const backWindow = steps.find(
    (step) => step.command === 'etch' && step.params.face === 'back',
  );
  assert.deepEqual(backWindow.params.mask.layerKeys, ['5|0']);
  const passivation = steps.find(
    (step) => step.command === 'deposit' && step.params.face === 'both',
  );
  assert.equal(passivation.params.thicknessUm, 0.11);
  assert.ok(steps.some((step) => step.command === 'implant' && /250 Ω/.test(step.params.name)));
  assert.ok(steps.some((step) => step.command === 'implant' && /25 Ω/.test(step.params.name)));

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
  assert.equal(steps.find((step) => step.command === 'etch').params.face, 'both');
  assert.ok(steps.some((step) => step.command === 'deposit' && step.params.thicknessUm === 0.001));
  const active = materialAt(project, [0, 0]);
  const finger = materialAt(project, [0, 2000]);
  assert.ok(Math.abs(thickness(active, 'Perovskite') - 0.44) < 1e-9);
  assert.ok(Math.abs(thickness(active, 'LiF') - 0.001) < 1e-9);
  assert.ok(Math.abs(thickness(active, 'IZO active') - 0.11) < 1e-9);
  assert.ok(Math.abs(thickness(finger, 'Ag grid') - 0.12) < 1e-9);
  assert.equal(active.some((entry) => entry.name.includes('Ag grid')), false);
  assert.ok(Math.abs(thickness(finger, 'MgF2') - 0.1) < 1e-9);
  const validIntervals = project.model.regions.every((region) =>
    region.stack.every((s) => s.z1 > s.z0),
  );
  assert.ok(validIntervals, 'Saved material intervals must have positive physical thickness');
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
