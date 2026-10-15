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

test('Ghosh M3D saved transfer films retain paper-derived thickness and zero support gap', async () => {
  const { model } = await savedExample('m3d-selfpowered-full-replay');
  for (const [name, kind, thickness] of [
    ['WSe2', 'bilayer', 0.0014],
    ['MoS2', 'monolayer', 0.0007],
    ['Graphene', 'monolayer', 0.0003],
  ]) {
    const layer = model.layers.find(
      (entry) =>
        entry.name.toLowerCase().includes(name.toLowerCase()) &&
        entry.name.toLowerCase().includes(kind),
    );
    assert.ok(layer, 'Missing transferred channel ' + name + ' ' + kind);
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
