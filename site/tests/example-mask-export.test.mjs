import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const { readProjectFile } = await import('../project-io.js');
const { collectMaskExportElements, serializeGDS, serializeOASIS } =
  await import('../layout-export.js');
const { flattenGDS, parseGDS } = await import('../gds.js');
const { parseOAS } = await import('../oasis.js');

for (const example of BUNDLED_EXAMPLES) {
  test(`${example.id}: project Mask really exports and round-trips as GDSII and OASIS`, async () => {
    const filename = example.path.split('/').at(-1);
    const bytes = await readFile(new URL(`../examples/${filename}`, import.meta.url));
    const project = await readProjectFile({
      size: bytes.byteLength,
      text: async () => bytes.toString('utf8'),
    });
    const draw = project.maskSourceMode === 'draw';
    const cells = new Set((project.layout.elements || [])
      .map((element) => element.sourceCell || project.layout.root || 'ROOT'));
    const layers = new Set((project.layout.elements || [])
      .map((element) => `${element.layer}|${element.datatype ?? 0}`));
    const exported = collectMaskExportElements({
      layout: project.layout,
      maskSourceMode: project.maskSourceMode,
      drawMask: project.drawMask,
      maskTransform: project.maskTransform,
      // Independently ensure that every supplied Mask has meaningful geometry;
      // ROI-specific crop behavior is covered by the layout-export suite.
      maskRoi: null,
      selectedCells: cells,
      selectedLayerKeys: layers,
    });
    assert.ok(exported.elements.length > 0,
      `${example.id}: ${draw ? 'Draw' : 'File'} Mask produced no exportable geometry`);
    const gdsBytes = serializeGDS(exported.elements);
    const oasBytes = serializeOASIS(exported.elements);
    assert.ok(gdsBytes.byteLength > 0);
    assert.ok(oasBytes.byteLength > 0);
    const gds = parseGDS(gdsBytes.buffer);
    const oas = await parseOAS(oasBytes.buffer);
    assert.ok(flattenGDS(gds, gds.root).elements.length > 0);
    assert.ok(flattenGDS(oas, oas.root).elements.length > 0);
  });
}
