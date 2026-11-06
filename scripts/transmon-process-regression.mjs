import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { buildTransmonProcess } from './build-transmon-process.mjs';
import { readProjectFile } from '../site/project-io.js';
import { parseProcessRecipeSource } from '../site/process-recipe.js';
import { referencedModelParts } from '../site/model-array.js';

const roi = { x: 1400, y: 2513, width: 40, height: 40 };

test('checkpoint resume preserves the full project, Recipe and all History states', async (t) => {
  const parent = resolve(tmpdir());
  const directory = mkdtempSync(join(parent, 'wafercad-transmon-builder-'));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(parent + sep));
    assert.ok(directory.length > parent.length + 10);
    rmSync(directory, { recursive: true, force: true });
  });
  const options = { roi, sidewalls: false, heightStepUm: 0.05 };
  await assert.rejects(
    buildTransmonProcess({
      ...options,
      checkpointDirectory: directory,
      onStage: (s) => {
        if (s.step === 18) throw Error('simulated interruption');
      },
    }),
    /simulated interruption/,
  );
  const resumed = await buildTransmonProcess({ ...options, checkpointDirectory: directory });
  assert.equal(resumed.report.stages.filter((s) => s.execution === 'checkpoint').length, 18);
  const replay = await buildTransmonProcess({ ...options, checkpointDirectory: directory });
  assert.equal(replay.content, resumed.content);
  const cold = await buildTransmonProcess(options);
  assert.deepEqual(resumed.project.model, cold.project.model);
  assert.deepEqual(resumed.project.processRecipe, cold.project.processRecipe);
  assert.equal(resumed.project.snapshotBranches.nodes.length, 28);
  assert.deepEqual(
    resumed.project.snapshotBranches.nodes.map((n) => [n.operation, n.state.model]),
    cold.project.snapshotBranches.nodes.map((n) => [n.operation, n.state.model]),
  );
  await readProjectFile(new Blob([resumed.content]));
});
test('horizontal-only Q2 scaffold preserves actual bilayer undercuts, all six doses and restored checkpoints', async () => {
  const result = await buildTransmonProcess({ roi, sidewalls: false, heightStepUm: 0.05 });
  const saved = await readProjectFile(new Blob([result.content]));
  assert.match(saved.name, /horizontal-only scaffold/);
  assert.equal(saved.layout.elements.length, 39487);
  const doses = saved.processRecipe.steps.filter(
    (s) => s.command === 'deposit' && /^Al[1-6]/.test(s.params.material),
  );
  assert.deepEqual(
    doses.map((s) => [s.params.thicknessUm, s.params.tiltDeg, s.params.azimuthDeg]),
    [
      [0.04, 45, 45],
      [0.03, 45, 135],
      [0.03, 45, -45],
      [0.03, 45, 270],
      [0.06, 45, 90],
      [0.06, 45, 270],
    ],
  );
  assert.ok(doses.every((s) => s.params.sidewalls === false));
  const ids = saved.model.layers.filter((l) => ['MMA', 'PMMA'].includes(l.name)).map((l) => l.id);
  assert.equal(ids.length, 2);
  assert.ok(saved.model.regions.every((r) => r.stack.every((s) => !ids.includes(s.layerId))));
  const developed = saved.snapshotBranches.nodes.find((n) =>
    /Develop lower MMA/.test(n.operation.label),
  ).state.model;
  const mma = developed.layers.find((l) => l.name === 'MMA').id,
    pmma = developed.layers.find((l) => l.name === 'PMMA').id;
  assert.ok(
    developed.regions.some(
      (r) => r.stack.some((s) => s.layerId === pmma) && !r.stack.some((s) => s.layerId === mma),
    ),
    'actual PMMA overhang above removed MMA',
  );
  assert.deepEqual(parseProcessRecipeSource(result.recipeSource).steps, saved.processRecipe.steps);
  assert.equal(saved.snapshotBranches.nodes.length, 28);
  assert.equal(result.report.status, 'incomplete: sidewall growth omitted');
});

// A horizontal scaffold cannot stand in for the complete sidewall-enabled
// nominal process. Undercut and AlOx remain explicit geometry assumptions.
test('Q2 six-dose nominal process reaches lift-off with assumed undercut and actual sidewalls', async () => {
  const result = await buildTransmonProcess({ roi, sidewalls: true, heightStepUm: 0.05 });
  const saved = await readProjectFile(new Blob([result.content]));
  assert.ok(saved.snapshotBranches.nodes.some((n) => /bilayer lift-off/.test(n.operation.label)));
  assert.equal(result.report.sidewalls, true);
  assert.equal(result.report.mmaUndercutUm, 0.3);
  assert.equal(result.report.planetaryZeroDeg, 90);
  for (const name of ['Al1', 'Al2', 'Al3', 'Al4 contact', 'Al5 contact', 'Al6 contact']) {
    const id = saved.model.layers.find((l) => l.name === name).id;
    assert.ok(
      referencedModelParts(saved.model).some((part) =>
        part.regions.some((r) => r.stack.some((s) => s.layerId === id)),
      ),
      `${name} must retain device material after lift-off`,
    );
  }
});
