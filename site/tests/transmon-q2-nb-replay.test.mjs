import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { makeQ2NbProject, replayQ2Nb } = await import('../../scripts/transmon-replay-nb-q2.mjs');
const { parseLayoutFile } = await import('../layout-io.js');
const { pointInMulti } = await import('../vector-geometry.js');
const { serializeProject, expandProjectStorage } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');

function fixtureLayout() {
  const points = [
    [1390, 2508],
    [1410, 2508],
    [1410, 2518],
    [1390, 2518],
  ];
  return {
    name: 'Synthetic Q2 Nb-mask geometry',
    root: 'TOP',
    elements: [{ kind: 'polygon', sourceCell: 'NB_MASK', layer: 2, datatype: 0, points }],
    linework: [],
    bounds: { minX: 1390, minY: 2508, maxX: 1410, maxY: 2518, width: 20, height: 10 },
    combos: [{ key: 'NB_MASK|2|0', cell: 'NB_MASK', layer: 2, datatype: 0, count: 1 }],
    hierarchy: {},
    units: { xy: 'µm', dbuToMicron: 0.001, hasPhysicalUnits: true },
  };
}

test('native process replay retains 200 nm Nb and subtracts 50 nm Si only in the mask opening', () => {
  const { model, mask, report } = replayQ2Nb(fixtureLayout());
  assert.equal(model.regions.length, 2);
  assert.equal(model.processRevision, 2);
  assert.equal(pointInMulti([0, 0], mask), true);
  assert.equal(pointInMulti([0, 20], mask), false);
  assert.equal(report.initialNbThicknessUm, 0.2);
  assert.equal(report.totalDirectionalEtchDepthUm, 0.25);
  assert.equal(report.measuredSiRecessUm, 0.05);
  assert.equal(report.junctionShadowEvaporation, 'not simulated');
  assert.equal(report.openingTopUm, 337.45);
  assert.ok(Math.abs(report.retainedNbThicknessUm - 0.2) < 1e-9);
});

test('native replay exports a lossless schema-valid wafercad project with author-coordinate alignment', () => {
  const layout = fixtureLayout();
  const project = makeQ2NbProject(replayQ2Nb(layout), layout);
  assert.deepEqual(project.maskTransform, { x: -1400, y: -2513, scale: 1, rotation: 0 });
  const stored = JSON.parse(serializeProject(project));
  const restored = expandProjectStorage(stored);
  validateProjectFile(restored);
  assert.equal(restored.model.regions.length, 2);
  assert.equal(restored.model.thickness, 675);
});

test(
  'native replay on pinned author Q2 GDS when supplied',
  {
    skip: !process.env.WAFERCAD_TRANSMON_Q2_ROI_GDS,
  },
  async () => {
    const b = readFileSync(process.env.WAFERCAD_TRANSMON_Q2_ROI_GDS);
    const input = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const { layout } = await parseLayoutFile(input, 'transmon-Q2-ROI.gds');
    const { report } = replayQ2Nb(layout);
    assert.equal(report.sourcePolygons, 28);
    assert.equal(report.clippedNonemptyPolygonParts, 27);
    assert.equal(report.modelRegions, 2);
    assert.equal(report.openingTopUm, 337.45);
  },
);
