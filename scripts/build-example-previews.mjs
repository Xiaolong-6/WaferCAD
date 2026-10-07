import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';
await loadGeometryKernel();
const { expandProjectStorage, prepareProjectForWorkspaceStorage, readProjectFile } =
  await import('../site/project-io.js');
const { validateProjectFile } = await import('../site/project-schema.js');
const write = process.argv.includes('--write');
const reports = [];
await mkdir(new URL('../site/examples/previews/', import.meta.url), { recursive: true });
for (const example of BUNDLED_EXAMPLES) {
  const sourcePath = new URL('../site/' + example.path.replace(/^\.\//, ''), import.meta.url);
  const sourceBytes = await readFile(sourcePath);
  const source = expandProjectStorage(JSON.parse(sourceBytes));
  const preview = structuredClone(source);
  const sourceBranch = source.snapshotBranches.branches.find(
    (branch) => branch.id === source.snapshotBranches.activeBranchId,
  );
  const last = source.snapshotBranches.nodes.find((node) => node.id === sourceBranch.headNodeId);
  assert.ok(last, example.id + ': final Step');
  const state = structuredClone(source);
  delete state.snapshots;
  delete state.snapshotBranches;
  delete state.name;
  preview.snapshots = [];
  preview.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: last.id,
    cursorSnapshotId: null,
    nodes: [{ ...structuredClone(last), branchId: 'main', parentId: null, state }],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootNodeId: last.id,
        headNodeId: last.id,
        rootSnapshotId: null,
        headSnapshotId: null,
        createdAt: sourceBranch.createdAt,
        headState: structuredClone(state),
      },
    ],
  };
  validateProjectFile(preview);
  const text = JSON.stringify(
    prepareProjectForWorkspaceStorage(preview, { geometryTemplates: false }),
  );
  const reopened = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  assert.deepEqual(reopened.model, source.model);
  assert.deepEqual(reopened.layout, source.layout);
  assert.equal(reopened.snapshotBranches.nodes.length, 1);
  const target = new URL('../site/examples/previews/' + example.id + '.wafercad', import.meta.url);
  if (write) await writeFile(target, text);
  else assert.equal(await readFile(target, 'utf8'), text, example.id + ': rebuild preview');
  assert.deepEqual(await readFile(sourcePath), sourceBytes, 'Complete original is preserved');
  reports.push({
    id: example.id,
    fullBytes: sourceBytes.length,
    previewBytes: Buffer.byteLength(text),
    fullSteps: source.snapshotBranches.nodes.length,
    previewSteps: 1,
    finalModelAndLayoutExactlyEqual: true,
    fullFileSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  });
}
console.log(JSON.stringify(reports, null, 2));
