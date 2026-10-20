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
const originalPreviewPath = new URL(
  '../examples/previews/suspended-silica-microdisk.wafercad',
  import.meta.url,
);

test('Welcome Microdisk opens the byte-exact released 72-band project with both History variants', async () => {
  const entry = BUNDLED_EXAMPLES.find((item) => item.id === 'suspended-silica-microdisk');
  assert.ok(entry);
  assert.equal(entry.path, './examples/suspended-silica-microdisks-adaptive.wafercad');
  assert.equal(entry.filename, 'suspended-silica-microdisks-adaptive.wafercad');
  assert.match(entry.summary, /72-band/);
  assert.match(entry.summary, /36 µm assumed/);
  const bytes = await readFile(adaptivePath);
  // Saved geometry is unchanged; this blob also fixes the adaptive Recipe/History parity.
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '5e6bfca245cdc739d62338711fd55317bf7bead1f67999bef02f1546364aaa60',
  );
  const original = await readProjectFile(new Blob([await readFile(originalPath)]));
  const adaptive = await readProjectFile(new Blob([bytes]));
  assert.deepEqual(adaptive.layout, original.layout, 'paper-derived 7 mask polygons changed');
  assert.deepEqual(
    adaptive.processRecipe.steps.slice(0, 6),
    original.processRecipe.steps.slice(0, 6),
    'the first six approved process stages were modified',
  );
  assert.equal(adaptive.processRecipe.steps.length, 7, 'adaptive XeF₂ step missing from Recipe');
  assert.equal(adaptive.processRecipe.steps.at(-1).command, 'etch');
  assert.equal(adaptive.processRecipe.steps.at(-1).params.isotropicLateralErrorUm, 0.25);
  assert.equal(adaptive.model.kernel, 'vector-2.5d-v1');
  assert.equal(adaptive.model.regions.length, 74);
  assert.equal(adaptive.snapshotBranches.nodes.length, 10);
  assert.equal(adaptive.snapshotBranches.branches.length, 2);
  assert.equal(adaptive.snapshotBranches.activeBranchId, 'microdisk-adaptive-72-band');
  const main = adaptive.snapshotBranches.branches.find((branch) => branch.id === 'main'),
    detailed = adaptive.snapshotBranches.branches.find(
      (branch) => branch.id === 'microdisk-adaptive-72-band',
    );
  assert.ok(main?.headState?.model);
  assert.equal(main.headState.model.regions.length, original.model.regions.length);
  assert.ok(detailed?.headState?.model);
  assert.equal(detailed.headState.model.regions.length, 74);
  assert.deepEqual(detailed.headState.processRecipe, adaptive.processRecipe);
  assert.match(detailed.name, /72-band/);
  assert.match(detailed.name, /assumed/);
});

test('Welcome uses real 72-band 3D cover and retains the fast original interactive preview', async () => {
  const entry = BUNDLED_EXAMPLES.find((item) => item.id === 'suspended-silica-microdisk');
  assert.equal(entry.previewSourcePath, './examples/suspended-silica-microdisks.wafercad');
  assert.equal(
    entry.previewProject.path,
    './examples/previews/suspended-silica-microdisk.wafercad',
  );
  assert.equal(entry.preview.coverSource, 'full', 'the cover must hash the actual adaptive file');
  assert.match(entry.preview.alt, /72-band/);
  assert.match(entry.preview.label, /72-band adaptive 3D/);
  assert.match(entry.preview.label, /interactive preview uses original lightweight geometry/);
  assert.match(entry.summary, /3D cover shows the 72-band release/);
  const original = await readProjectFile(new Blob([await readFile(originalPath)]));
  const preview = await readProjectFile(new Blob([await readFile(originalPreviewPath)]));
  assert.deepEqual(preview.model, original.model);
  assert.deepEqual(preview.layout, original.layout);
  assert.equal(preview.snapshotBranches.nodes.length, 1);
  assert.equal(preview.snapshotBranches.branches.length, 1);
  assert.ok(original.snapshotBranches.nodes.length > 1);
  assert.notDeepEqual(
    preview.model,
    (await readProjectFile(new Blob([await readFile(adaptivePath)]))).model,
  );
});
