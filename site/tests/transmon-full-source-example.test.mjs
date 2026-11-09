import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { constructSourceProject } from '../../scripts/build-transmon-full-source-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const projects = new URL(
  '../../examples/projects/transmon-nature-communications-2025-candidate/',
  import.meta.url,
);
const source = process.env.WAFERCAD_TRANSMON_GDS;

test('Transmon source regeneration rejects unverified GDS input', async () => {
  await assert.rejects(constructSourceProject(Buffer.from('not original GDS')), /hash mismatch/);
});

for (const [file, root, count, bounds] of [
  ['chip2', 'chip2', 39487, [-5000, -5000, 5000, 5000]],
  ['reticle', '2024-04-07_EITR2_1', 157950, [-20000, -20000, 20000, 20000]],
]) {
  const readAsset = async () =>
    gunzipSync(await readFile(new URL(`${file}-full-source-mask-only.wafercad.gz`, projects)));

  test(`stored Transmon ${file} opens as a complete source Mask`, async () => {
    const project = await readProjectFile(new Blob([await readAsset()]));
    const { layout, model, selectedLayerKeys, snapshotBranches } = project;
    assert.equal(layout.root, root);
    assert.equal(layout.elements.length, count);
    assert.deepEqual(
      [layout.bounds.minX, layout.bounds.minY, layout.bounds.maxX, layout.bounds.maxY],
      bounds,
    );
    assert.deepEqual(
      [...new Set(layout.elements.map(({ layer, datatype }) => `${layer}/${datatype}`))].sort(),
      ['0/0', '2/0', '8/0', '8/1'],
    );
    assert.deepEqual(selectedLayerKeys, ['2|0']);
    assert.equal(model.processRevision, 0);
    assert.equal(model.layers.length, 1);
    assert.equal(snapshotBranches.nodes.length, 1);
    if (file === 'reticle')
      assert.equal(
        layout.elements.filter(({ sourceCell }) => sourceCell.startsWith('boolean_e1ef2d48/'))
          .length,
        1,
      );
  });

  test(
    `stored Transmon ${file} regenerates from the author GDS`,
    { skip: !source && 'Set WAFERCAD_TRANSMON_GDS to the public author sample.gds' },
    async () => {
      const { content } = await constructSourceProject(await readFile(source), { root });
      assert.equal(Buffer.from(content).equals(await readAsset()), true);
    },
  );
}
