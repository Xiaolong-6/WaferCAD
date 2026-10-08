import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import { BUNDLED_EXAMPLES, bundledExampleById } from '../bundled-examples.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');

const id = 'm3d-selfpowered-heterogeneous-ic';
const projectPath = new URL('../examples/m3d-selfpowered-full-replay.wafercad', import.meta.url);

test('M3D welcome example points to a valid, distinct, losslessly stored project', async () => {
  const example = bundledExampleById(id);
  assert.ok(example, 'M3D welcome catalog entry missing');
  assert.equal(BUNDLED_EXAMPLES.filter((entry) => entry.id === id).length, 1);
  assert.equal(example.kind, 'project');
  assert.ok(example.preview.path.endsWith('.svg'), 'M3D uses a clearly labeled SVG schematic fallback');
  assert.equal(example.sources[0].doi, '10.1038/s41928-026-01624-1');
  assert.ok((await stat(projectPath)).size > 100_000);
  const text = await readFile(projectPath, 'utf8');
  const file = { size: Buffer.byteLength(text), text: async () => text };
  const project = await readProjectFile(file);
  validateProjectFile(project);
  assert.equal(project.snapshotBranches.nodes.length, 36);
  assert.equal(project.snapshots.length, 27);
  assert.equal(project.snapshotBranches.cursorNodeId, 'm3d-step-36');
  assert.ok(project.model.layers.some((layer) => /graphene/i.test(layer.name)));
  assert.ok(project.model.layers.some((layer) => /WSe2/i.test(layer.name)));
  assert.ok(project.model.layers.some((layer) => /MoS2/i.test(layer.name)));
});
