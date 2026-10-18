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
  // Exact input was used in the successful saved-project native Chromium and Recovery gate.
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '5fb8b245d933752f99f8559d6777c9d1d040c768ec2a513bc15ebb12c7255cc3',
  );
  const original = await readProjectFile(new Blob([await readFile(originalPath)]));
  const adaptive = await readProjectFile(new Blob([bytes]));
  assert.deepEqual(adaptive.layout, original.layout, 'paper-derived 7 mask polygons changed');
  assert.deepEqual(
    adaptive.processRecipe,
    original.processRecipe,
    'approved 8-step process changed while promoting adaptive saved model',
  );
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
  assert.match(detailed.name, /72-band/);
  assert.match(detailed.name, /assumed/);
});

test('Welcome keeps fast original thumbnail/preview without misrepresenting 72-band geometry', async () => {
  const entry = BUNDLED_EXAMPLES.find((item) => item.id === 'suspended-silica-microdisk');
  assert.equal(entry.previewSourcePath, './examples/suspended-silica-microdisks.wafercad');
  assert.equal(entry.previewProject.path, './examples/previews/suspended-silica-microdisk.wafercad');
  assert.match(entry.preview.alt, /Simplified original/);
  assert.match(entry.preview.label, /Lightweight original preview/);
  const original = await readProjectFile(new Blob([await readFile(originalPath)]));
  const preview = await readProjectFile(new Blob([await readFile(originalPreviewPath)]));
  assert.deepEqual(preview.model, original.model);
  assert.deepEqual(preview.layout, original.layout);
  assert.equal(preview.snapshotBranches.nodes.length, 1);
  assert.equal(preview.snapshotBranches.branches.length, 1);
  assert.ok(original.snapshotBranches.nodes.length > 1);
  assert.notDeepEqual(preview.model, (await readProjectFile(new Blob([await readFile(adaptivePath)]))).model);
});
