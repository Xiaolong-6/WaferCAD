import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');

async function savedExample(name) {
  const bytes = await readFile(new URL('../examples/' + name + '.wafercad', import.meta.url));
  return readProjectFile({
    size: bytes.byteLength,
    text: async () => bytes.toString('utf8'),
  });
}

function segmentsOf(model, name) {
  const layer = model.layers.find((entry) => entry.name === name);
  assert.ok(layer, 'Missing saved physical layer ' + name);
  const segments = model.regions.flatMap((region) =>
    region.stack.filter((segment) => segment.layerId === layer.id),
  );
  assert.ok(segments.length > 0, 'Empty saved material footprint ' + name);
  return segments;
}

test('Ghosh M3D saved transfer films match Recipe thickness and zero support gap', async () => {
  const { model, processRecipe } = await savedExample('m3d-selfpowered-full-replay');
  for (const [name, kind, thickness] of [
    ['WSe2', 'bilayer', 0.0014],
    ['MoS2', 'monolayer', 0.0007],
    ['Graphene', 'monolayer', 0.00035],
  ]) {
    const layer = model.layers.find(
      (entry) =>
        entry.name.toLowerCase().includes(name.toLowerCase()) &&
        entry.name.toLowerCase().includes(kind),
    );
    assert.ok(layer, 'Missing transferred channel ' + name + ' ' + kind);
    const recipeStep = processRecipe.steps.find(
      (step) => step.command === 'deposit' && step.params?.material === layer.name,
    );
    assert.ok(recipeStep, name + ': missing editable transferred-film Recipe');
    assert.equal(recipeStep.params.coverage, 'transfer');
    assert.ok(
      Math.abs(recipeStep.params.thicknessUm - thickness) < 1e-12,
      name + ': saved Recipe thickness differs from the published project geometry',
    );
    let checked = 0;
    for (const region of model.regions) {
      for (let index = 0; index < region.stack.length; index++) {
        const film = region.stack[index];
        if (film.layerId !== layer.id) continue;
        const support = region.stack[index - 1];
        assert.ok(support, name + ': transferred material without physical support');
        assert.ok(
          Math.abs(film.z0 - support.z1) < 1e-7,
          name + ': artificial support gap in saved final model',
        );
        assert.ok(
          Math.abs(film.z1 - film.z0 - thickness) < 1e-9,
          name + ': transferred film thickness drift',
        );
        checked++;
      }
    }
    assert.ok(checked > 0, name + ': no saved channel segments');
  }
});

test('Ghosh M3D both power via landings and the data via have contiguous conductor stacks', async () => {
  const { model } = await savedExample('m3d-selfpowered-full-replay');
  const { pointInMulti } = await import('../vector-geometry.js');
  const names = new Map(model.layers.map((layer) => [layer.id, layer.name]));
  for (const [point, lowerName] of [
    [[16, -5.3], 'M3D Ti power via 120nm'],
    [[16, 5.3], 'M3D Ti power via 120nm'],
    [[16, 0], 'M3D MoS2 bridge Au 10nm'],
  ]) {
    const owners = model.regions.filter((region) => pointInMulti(point, region.geom));
    assert.equal(owners.length, 1, 'One physical material owner expected at ' + point);
    const stack = owners[0].stack;
    const segmentOf = (name) => stack.find((segment) => names.get(segment.layerId) === name);
    const bottom = segmentOf(lowerName);
    const ti = segmentOf('M3D via2 Ti 2nm');
    const ni = segmentOf('M3D via2 Ni 28nm');
    const au = segmentOf('M3D via2 Au 30nm');
    assert.ok(bottom && ti && ni && au, 'Missing via conductor at ' + point);
    assert.ok(
      Math.abs(bottom.z1 - ti.z0) < 1e-9,
      'Insulating film breaks actual metal continuity at ' + point,
    );
    assert.ok(Math.abs(ti.z1 - ni.z0) < 1e-9, 'Discontinuous Ti/Ni at ' + point);
    assert.ok(Math.abs(ni.z1 - au.z0) < 1e-9, 'Discontinuous Ni/Au at ' + point);
  }
});

test('Fan MAGIC local via ladders connect M4 through M1 and their transistor gates', async () => {
  const { model } = await savedExample('magic-1000-mos2-beol');
  const { pointInMulti } = await import('../vector-geometry.js');
  const names = new Map(model.layers.map((layer) => [layer.id, layer.name]));
  const stackAt = (point) => {
    const owners = model.regions.filter((region) => pointInMulti(point, region.geom));
    assert.equal(owners.length, 1, 'MAGIC point must have one physical owner: ' + point);
    return owners[0].stack;
  };
  const layerAt = (stack, name) =>
    stack.find((segment) => names.get(segment.layerId) === name);

  for (const point of [
    [-7, -4],
    [7, 4],
  ]) {
    const stack = stackAt(point);
    for (const [lower, upper] of [
      ['M4 Ti capping', 'V34 W fill'],
      ['V34 W fill', 'M3 Ti adhesion'],
      ['M3 Ti capping', 'V23 W fill'],
      ['V23 W fill', 'M2 Ti adhesion'],
      ['M2 Ti capping', 'V12 W fill'],
      ['V12 W fill', 'M1 Ti adhesion'],
    ]) {
      const bottom = layerAt(stack, lower);
      const top = layerAt(stack, upper);
      assert.ok(bottom && top, 'Missing BEOL conductor ' + lower + ' or ' + upper);
      assert.ok(
        Math.abs(bottom.z1 - top.z0) < 1e-9,
        'Dielectric gap at MAGIC ' + point + ' between ' + lower + ' and ' + upper,
      );
    }
  }
  const eMode = stackAt([7, 4]);
  for (const [lower, upper] of [
    ['M1 Ti capping', 'Via (to W gate) W fill'],
    ['Via (to W gate) W fill', 'W bottom gate 400nm'],
    ['W bottom gate 400nm', 'ALD HfO2 10nm'],
    ['ALD HfO2 10nm', 'Monolayer MoS2 (0.7nm illustrated)'],
  ]) {
    const bottom = layerAt(eMode, lower);
    const top = layerAt(eMode, upper);
    assert.ok(bottom && top, 'Missing physical gate boundary ' + lower + ' / ' + upper);
    assert.ok(Math.abs(bottom.z1 - top.z0) < 1e-9);
  }
  assert.ok(layerAt(stackAt([-7, 4]), 'D-mode AlOx coating (10nm surrogate)'));
  assert.ok(!layerAt(eMode, 'D-mode AlOx coating (10nm surrogate)'));
});

test('Fan MAGIC local reconstruction preserves four 250 nm Al levels and transistor films', async () => {
  const { model } = await savedExample('magic-1000-mos2-beol');
  assert.equal(model.width, 40, 'This asset is only the 40 um local representative');
  assert.equal(model.height, 24);
  for (const level of ['M4', 'M3', 'M2', 'M1']) {
    const metal = segmentsOf(model, level + ' Al conductor');
    assert.ok(
      metal.every((segment) => Math.abs(segment.z1 - segment.z0 - 0.25) < 1e-9),
      level + ': aluminum conductor differs from nominal 250 nm',
    );
  }
  for (const [name, thickness] of [
    ['W bottom gate 400nm', 0.4],
    ['ALD HfO2 10nm', 0.01],
    ['Monolayer MoS2 (0.7nm illustrated)', 0.0007],
  ]) {
    const film = segmentsOf(model, name);
    assert.ok(
      film.some((segment) => Math.abs(segment.z1 - segment.z0 - thickness) < 1e-9),
      name + ': no physical interval retains paper/illustrative nominal thickness',
    );
  }
});
