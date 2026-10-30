import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fullSourceLayout,
  constructSourceProject,
} from '../../scripts/build-transmon-full-source-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { pointInMulti } = await import('../vector-geometry.js');
const ROOT = '2024-04-07_EITR2_1';
const sourcePath = process.env.WAFERCAD_TRANSMON_GDS;

function originalRef(name, xy) {
  return { kind: 'sref', name, xy, angle: 0, mag: 1, reflect: false };
}
function rect(name) {
  return {
    name,
    elements: [
      {
        kind: 'polygon',
        layer: 2,
        datatype: 0,
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      },
    ],
  };
}
function minimalParsed() {
  return {
    cells: new Map([
      [
        ROOT,
        {
          name: ROOT,
          elements: [
            originalRef('chip0', [-5, 5]),
            originalRef('chip1', [5, 5]),
            originalRef('chip2', [-5, -5]),
            originalRef('chip3', [5, -5]),
            originalRef('boolean_e1ef2d48', [0, 0]),
          ],
        },
      ],
      ...['chip0', 'chip1', 'chip2', 'chip3', 'boolean_e1ef2d48'].map((n) => [n, rect(n)]),
    ]),
    units: { xy: 'µm', dbuToMicron: 0.001, hasPhysicalUnits: true },
  };
}

test('whole reticle source layout preserves the four actual SREF offsets and auxiliary fifth child', () => {
  const layout = fullSourceLayout(minimalParsed());
  assert.equal(layout.root, ROOT);
  assert.equal(layout.elements.length, 5);
  assert.deepEqual(
    layout.elements.map((x) => x.points[0]),
    [
      [-5, 5],
      [5, 5],
      [-5, -5],
      [5, -5],
      [0, 0],
    ],
  );
  assert.deepEqual(
    layout.elements.map((x) => x.sourceCell),
    [
      'chip0/chip0',
      'chip1/chip1',
      'chip2/chip2',
      'chip3/chip3',
      'boolean_e1ef2d48/boolean_e1ef2d48',
    ],
  );
  assert.equal(fullSourceLayout(minimalParsed(), 'chip2').elements.length, 1);
  assert.throws(
    () => fullSourceLayout(minimalParsed(), 'jj_width0p18'),
    /Specify an original root/,
  );
  const bad = minimalParsed();
  bad.cells.get(ROOT).elements[0].angle = 90;
  assert.throws(() => fullSourceLayout(bad), /non-translational SREF/);
});

test('wrong source hash cannot be relabeled as original Tuokkola GDS', async () => {
  await assert.rejects(constructSourceProject(Buffer.from('not original GDS')), /hash mismatch/);
});

test(
  'original full chip2 mask drives real Nb/Si 250 nm native process, with honest three checkpoints',
  {
    skip: !sourcePath && 'Public author GDS supplied through WAFERCAD_TRANSMON_GDS',
  },
  async () => {
    const result = await constructSourceProject(await readFile(sourcePath), { root: 'chip2' });
    const p = await readProjectFile(new Blob([result.content]));
    assert.equal(
      result.report.sourceSha256,
      '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
    );
    assert.equal(p.layout.root, 'chip2');
    assert.equal(p.layout.elements.length, 39487);
    assert.equal(result.report.sourceMaskPolygonCount, 39235);
    assert.equal(p.model.processRevision, 2);
    assert.equal(p.snapshotBranches.nodes.length, 3);
    assert.equal(p.snapshotBranches.nodes[0].processRevision, 0);
    assert.equal(p.snapshotBranches.nodes[1].processRevision, 1);
    assert.equal(p.snapshotBranches.nodes[2].processRevision, 2);
    const etched = p.model.regions.find((r) => pointInMulti([1400, 2513], r.geom));
    const intact = p.model.regions.find((r) => pointInMulti([0, 0], r.geom));
    assert.equal(etched.stack.at(-1).layerId, 'base');
    assert.equal(etched.stack.at(-1).z1, 337.45);
    assert.equal(intact.stack.at(-1).z1, 337.7);
    assert.equal(p.model.regions.length, 2);
    assert.equal(p.model.layers.length, 2);
    assert.equal(p.layout.elements.filter((e) => e.layer === 8).length, 228);
  },
);

test(
  'four-chip reticle retains entire source: 157950 polygons plus original auxiliary boolean cell',
  {
    skip: !sourcePath && 'Public author GDS supplied through WAFERCAD_TRANSMON_GDS',
  },
  async () => {
    const result = await constructSourceProject(await readFile(sourcePath));
    const p = await readProjectFile(new Blob([result.content]));
    assert.equal(p.layout.elements.length, 157950);
    assert.deepEqual(
      [p.layout.bounds.minX, p.layout.bounds.minY, p.layout.bounds.maxX, p.layout.bounds.maxY],
      [-20000, -20000, 20000, 20000],
    );
    assert.equal(
      p.layout.elements.filter((x) => x.sourceCell.startsWith('boolean_e1ef2d48/')).length,
      1,
    );
    assert.equal(p.snapshotBranches.nodes.length, 2);
    assert.equal(p.model.processRevision, 1, 'Do not etch uncertain reticle auxiliary cell');
    assert.ok(result.report.materialPatterned === false);
  },
);