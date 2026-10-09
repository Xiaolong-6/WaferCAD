import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetalensLocal,
  makeFullApertureIllustration,
  PAPER_SITES,
  DOI,
} from '../../scripts/build-tio2-metalens-example.mjs';
import { validateProcessModel, validateProjectFile } from '../project-schema.js';
import { pointInMulti } from '../vector-geometry.js';

test('paper-derived TiO2 local project is physically rebuilt, with four mask topologies', async () => {
  const { project, json, report } = await buildMetalensLocal();
  assert.equal(report.doi, DOI);
  assert.equal(report.bookmarks, 6);
  assert.equal(project.processRecipe.steps.at(-1).command, 'etch');
  assert.equal(project.processRecipe.steps.some((step) => step.command === 'liftoff'), true);
  assert.equal(project.layout.root, 'TIO2_METALENS');
  assert.deepEqual(project.layout.combos.map((layer) => layer.layer), [1]);
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.ok(json.length > 100);
  const physical = (pt) => {
    const region = project.model.regions.find((entry) => pointInMulti(pt, entry.geom));
    assert.ok(region, 'missing sampled region');
    return region.stack.map((layer) => project.model.layers.find((item) => item.id === layer.layerId)?.name);
  };
  assert.ok(physical([-1.1, -1.1]).includes('TiO2'), 'circle survives');
  assert.ok(physical([1.1, -1.1]).includes('TiO2'), 'square survives');
  assert.ok(physical([-1.1 + 0.135, 1.1]).includes('TiO2'), 'ring wall survives');
  assert.equal(physical([-1.1, 1.1]).includes('TiO2'), false, 'ring hole stays empty');
  assert.ok(physical([1.1, 1.1]).includes('TiO2'), 'bipolar central disk survives');
  assert.equal(physical([1.1 + 0.078, 1.1]).includes('TiO2'), false, 'bipolar gap stays void');
  assert.equal(project.model.regions.some((r) => r.stack.some((s) =>
    project.model.layers.find((x) => x.id === s.layerId)?.name === 'PMMA')), false);
  assert.equal(project.model.regions.some((r) => r.stack.some((s) =>
    project.model.layers.find((x) => x.id === s.layerId)?.name === 'Cr')), false);
});

test('full aperture generator keeps 4725 explicitly illustrative sites and four families', () => {
  const { sites, elements, note } = makeFullApertureIllustration();
  assert.equal(sites.length, PAPER_SITES);
  assert.ok(elements.length > PAPER_SITES);
  assert.equal(new Set(sites.map((s) => s.id)).size, PAPER_SITES);
  assert.deepEqual(new Set(sites.map((s) => s.type)), new Set([
    'circle', 'square', 'ring', 'bipolar-concentric-ring',
  ]));
  assert.ok(sites.every((s) => Math.hypot(s.x, s.y) < 15));
  assert.match(note, /NOT original GDS/);
});
