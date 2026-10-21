import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ BUNDLED_EXAMPLES }, { readProjectFile }] = await Promise.all([
  import('../bundled-examples.js'),
  import('../project-io.js'),
]);

const originalPath = new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url);
const adaptivePath = new URL(
  '../examples/suspended-silica-microdisks-adaptive.wafercad',
  import.meta.url,
);
const continuousPath = new URL(
  '../examples/suspended-silica-microdisks-continuous.wafercad',
  import.meta.url,
);
const previewPath = new URL(
  '../examples/previews/suspended-silica-microdisk.wafercad',
  import.meta.url,
);

// Keep the previous publication byte-exact as an auditable comparison project.
test('archived Microdisk 72-band adaptive release retains its unchanged scientific History', async () => {
  const bytes = await readFile(adaptivePath);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '5e6bfca245cdc739d62338711fd55317bf7bead1f67999bef02f1546364aaa60',
  );
  const original = await readProjectFile(new Blob([await readFile(originalPath)]));
  const adaptive = await readProjectFile(new Blob([bytes]));
  assert.deepEqual(adaptive.layout, original.layout);
  assert.deepEqual(
    adaptive.processRecipe.steps.slice(0, 6),
    original.processRecipe.steps.slice(0, 6),
  );
  assert.equal(adaptive.processRecipe.steps.length, 7);
  assert.equal(adaptive.processRecipe.steps.at(-1).params.isotropicLateralErrorUm, 0.25);
  assert.equal(adaptive.model.kernel, 'vector-2.5d-v1');
  assert.equal(adaptive.model.regions.length, 74);
  assert.equal(adaptive.snapshotBranches.nodes.length, 10);
  assert.equal(adaptive.snapshotBranches.branches.length, 2);
  assert.equal(adaptive.snapshotBranches.activeBranchId, 'microdisk-adaptive-72-band');
});

test('Welcome opens exact Continuous M08/M09 with historical lightweight preview', async () => {
  const entry = BUNDLED_EXAMPLES.find((item) => item.id === 'suspended-silica-microdisk');
  assert.ok(entry);
  assert.equal(entry.path, './examples/suspended-silica-microdisks-continuous.wafercad');
  assert.equal(entry.filename, 'suspended-silica-microdisks-continuous.wafercad');
  assert.match(entry.summary, /continuous circular/i);
  assert.match(entry.summary, /36 µm/);
  assert.equal(entry.previewSourcePath, './examples/suspended-silica-microdisks.wafercad');
  assert.equal(
    entry.previewProject.path,
    './examples/previews/suspended-silica-microdisk.wafercad',
  );
  assert.equal(entry.preview.coverSource, 'full');
  assert.match(entry.preview.alt, /continuous circular/i);
  assert.match(entry.preview.label, /historical 2.5D/);
  const [original, continuous, preview] = await Promise.all([
    readProjectFile(new Blob([await readFile(originalPath)])),
    readProjectFile(new Blob([await readFile(continuousPath)])),
    readProjectFile(new Blob([await readFile(previewPath)])),
  ]);
  assert.equal(continuous.model.kernel, 'vector-continuous-etch-v1');
  assert.deepEqual(continuous.layout, original.layout);
  assert.deepEqual(
    continuous.processRecipe.steps.slice(0, 6),
    original.processRecipe.steps.slice(0, 6),
  );
  assert.equal(continuous.processRecipe.steps.length, 8);
  assert.equal(continuous.processRecipe.steps[6].params.profile, 'continuous');
  assert.equal(continuous.processRecipe.steps[6].params.area, 'invert');
  assert.equal(continuous.processRecipe.steps[6].params.continuousShape, 'circular');
  assert.equal(continuous.processRecipe.steps[7].command, 'record');
  assert.equal(continuous.snapshotBranches.nodes.length, 9);
  assert.equal(continuous.snapshotBranches.branches.length, 1);
  assert.equal(continuous.snapshotBranches.activeBranchId, 'main');
  assert.deepEqual(preview.model, original.model);
  assert.deepEqual(preview.layout, original.layout);
  assert.equal(preview.snapshotBranches.nodes.length, 1);
  assert.ok(original.snapshotBranches.nodes.length > 1);
  assert.notDeepEqual(preview.model, continuous.model);
});
