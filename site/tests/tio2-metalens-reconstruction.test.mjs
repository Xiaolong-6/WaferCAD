import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetalensLocal,
  makeFullApertureIllustration,
  PAPER_SITES,
  DOI,
} from '../../scripts/build-tio2-metalens-example.mjs';
import { validateProcessModel, validateProjectFile } from '../project-schema.js';

test('paper-derived TiO2 local project is physically rebuilt, with four mask topologies', async () => {
  const { project, json, report } = await buildMetalensLocal();
  const { pointInMulti } = await import('../vector-geometry.js');
  assert.equal(report.doi, DOI);
  assert.equal(report.bookmarks, 6);
  assert.equal(project.processRecipe.steps.at(-1).command, 'etch');
  assert.equal(
    project.processRecipe.steps.some((step) => step.command === 'liftoff'),
    true,
  );
  assert.equal(project.layout.root, 'TIO2_METALENS');
  assert.deepEqual(
    project.layout.combos.map((layer) => layer.layer),
    [1],
  );
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.ok(json.length > 100);
  const physical = (pt) => {
    const region = project.model.regions.find((entry) => pointInMulti(pt, entry.geom));
    assert.ok(region, 'missing sampled region');
    return region.stack.map(
      (layer) => project.model.layers.find((item) => item.id === layer.layerId)?.name,
    );
  };
  assert.ok(physical([-1.1, -1.1]).includes('TiO2'), 'circle survives');
  assert.ok(physical([1.1, -1.1]).includes('TiO2'), 'square survives');
  assert.ok(physical([-1.1 + 0.135, 1.1]).includes('TiO2'), 'ring wall survives');
  assert.equal(physical([-1.1, 1.1]).includes('TiO2'), false, 'ring hole stays empty');
  assert.ok(physical([1.1, 1.1]).includes('TiO2'), 'bipolar central disk survives');
  assert.equal(physical([1.1 + 0.078, 1.1]).includes('TiO2'), false, 'bipolar gap stays void');
  assert.equal(
    project.model.regions.some((r) =>
      r.stack.some((s) => project.model.layers.find((x) => x.id === s.layerId)?.name === 'PMMA'),
    ),
    false,
  );
  assert.equal(
    project.model.regions.some((r) =>
      r.stack.some((s) => project.model.layers.find((x) => x.id === s.layerId)?.name === 'Cr'),
    ),
    false,
  );
});

test('full aperture generator keeps 4725 explicitly illustrative sites and four families', () => {
  const { sites, elements, note } = makeFullApertureIllustration();
  assert.equal(sites.length, PAPER_SITES);
  assert.ok(elements.length > PAPER_SITES);
  assert.equal(new Set(sites.map((s) => s.id)).size, PAPER_SITES);
  assert.deepEqual(
    new Set(sites.map((s) => s.type)),
    new Set(['circle', 'square', 'ring', 'bipolar-concentric-ring']),
  );
  assert.ok(sites.every((s) => Math.hypot(s.x, s.y) < 15));
  assert.match(note, /NOT original GDS/);
});

test('Welcome opens the complete matched array and retains compiled process stages', async () => {
  const { readFile } = await import('node:fs/promises');
  const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
  const { readProjectFile } = await import('../project-io.js');
  const { pointInMulti } = await import('../vector-geometry.js');
  const entry = BUNDLED_EXAMPLES.find((example) => example.id === 'tio2-metalens-four-unit');
  assert.equal(entry.path, './examples/tio2-metalens-full-array.wafercad');
  assert.equal(entry.previewSourcePath, './examples/tio2-metalens-four-unit-process.wafercad');
  const bytes = await readFile(new URL('../' + entry.path.slice(2), import.meta.url));
  const project = await readProjectFile({
    size: bytes.length,
    text: async () => bytes.toString('utf8'),
  });
  assert.equal(project.layout.root, 'TIO2_GRID');
  assert.equal(project.layout.elements.length, 60232);
  assert.equal(project.model.width, 30);
  assert.equal(project.model.height, 30);
  assert.equal(project.model.array.templates.length, 49);
  assert.equal(project.model.array.instances.length, 6400);
  assert.equal(
    project.model.array.instances.filter((instance) => instance.role === 'device').length,
    4725,
  );
  assert.equal(project.snapshotBranches.nodes.length, 10);
  assert.equal(project.snapshots.length, 6);
  assert.equal(project.processRecipe.steps.length, 9);
  assert.equal(project.processRecipe.base.width, 30);
  assert.equal(project.processRecipe.base.height, 30);
  assert.deepEqual(project.processRecipe.base.array, {
    kind: 'rect-grid', rows: 80, columns: 80, pitchX: 0.375, pitchY: 0.375, activeSites: 4725,
  });
  for (const step of project.processRecipe.steps.filter((step) => step.params.mask)) {
    assert.equal(step.params.mask.cell, 'TIO2_GRID');
  }
  for (const node of project.snapshotBranches.nodes) {
    assert.deepEqual(
      node.state.model.array.instances,
      project.model.array.instances,
      'History lost array coverage',
    );
    assert.equal(node.state.layout.elements.length, 60232, 'History lost matching full Mask');
    assert.equal(node.state.processRecipe.base.width, 30, 'History retained local Base');
  }
  const physical = (model, position) =>
    model.regions
      .find((region) => pointInMulti(position, region.geom))
      ?.stack.map((segment) => [
        model.layers.find((layer) => layer.id === segment.layerId)?.name,
        segment.z0,
        segment.z1,
      ]) || [];
  for (const { id, model } of project.model.array.templates) {
    const center = physical(model, [0, 0]);
    assert.equal(
      center.some(([name]) => name === 'TiO2'),
      id !== 'background' && !id.startsWith('ring-'),
      id,
    );
    const scale = Number(id.split('-').at(-1));
    if (id.startsWith('ring-'))
      assert.ok(
        physical(model, [0.135 * scale, 0]).some(([name]) => name === 'TiO2'),
        id + ' wall',
      );
    if (id.startsWith('bipolar-'))
      assert.equal(
        physical(model, [0.078 * scale, 0]).some(([name]) => name === 'TiO2'),
        false,
        id + ' gap',
      );
    for (const region of model.regions)
      for (const segment of region.stack) {
        const name = model.layers.find((layer) => layer.id === segment.layerId)?.name;
        assert.ok(!['Cr', 'PMMA'].includes(name), id + ': sacrificial film survived');
        if (name === 'TiO2') assert.ok(Math.abs(segment.z1 - segment.z0 - 1.5) < 1e-10);
      }
  }
  assert.deepEqual(
    project.snapshotBranches.nodes.map((node) => node.state.model.nextLayerId),
    [1, 1, 2, 3, 4, 4, 5, 5, 5, 5],
    'Restoring a Step must restore its entity counters',
  );
  const blanket = project.snapshotBranches.nodes[4].state.model;
  for (const { model } of blanket.array.templates) {
    assert.deepEqual(
      physical(model, [0, 0]).map(([name]) => name),
      ['Glass (2um illustration)', 'ITO', 'TiO2', 'PMMA'],
    );
  }
});
