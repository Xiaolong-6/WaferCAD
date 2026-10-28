import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { directApertureStackFromGds } = await import('../direct-aperture-from-gds.js');
const { rectMulti, pointInMulti, multiBounds, unionGeometries } =
  await import('../vector-geometry.js');
const polygon = (layer, datatype, x0, x1) => ({
  kind: 'polygon',
  layer,
  datatype,
  points: [
    [x0, -1],
    [x1, -1],
    [x1, 1],
    [x0, 1],
    [x0, -1],
  ],
});
const elements = [polygon(8, 0, -2, -0.5), polygon(8, 1, -0.5, 1)];
const stages = [
  {
    bottomZUm: 5,
    topZUm: 5.5,
    selectors: [
      { layer: 8, datatype: 0 },
      { layer: 8, datatype: 1 },
    ],
  },
  { bottomZUm: 5.5, topZUm: 5.9, selectors: [{ layer: 8, datatype: 1 }] },
];
test('explicit GDS selectors reconstruct two physical-Z openings without guessing datatype meaning', () => {
  const result = directApertureStackFromGds(elements, stages);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((x) => [x.bottomZUm, x.topZUm]),
    [
      [5, 5.5],
      [5.5, 5.9],
    ],
  );
  assert.equal(pointInMulti([-1, 0], result[0].opening), true);
  assert.equal(pointInMulti([-1, 0], result[1].opening), false);
  assert.equal(pointInMulti([0, 0], result[1].opening), true);
  assert.deepEqual(multiBounds(result[1].opening), {
    minX: -0.5,
    maxX: 1,
    minY: -1,
    maxY: 1,
    width: 1.5,
    height: 2,
  });
});
test('explicit 90-degree wafer-frame transformation applies consistently across stages', () => {
  const result = directApertureStackFromGds(elements, stages, {
    transformPoint: ([x, y]) => [-y, x],
  });
  assert.equal(pointInMulti([0, -1], result[0].opening), true);
  assert.equal(pointInMulti([0, -1], result[1].opening), false);
  assert.equal(pointInMulti([0, 0], result[1].opening), true);
});
test('missing selectors, non-contiguous heights and invalid polygons fail closed', () => {
  assert.throws(
    () =>
      directApertureStackFromGds(elements, [
        { ...stages[0], selectors: [{ layer: 99, datatype: 0 }] },
      ]),
    /no polygons/,
  );
  assert.throws(
    () => directApertureStackFromGds(elements, [stages[0], { ...stages[1], bottomZUm: 5.51 }]),
    /contiguous/,
  );
  assert.throws(
    () => directApertureStackFromGds(elements, [{ ...stages[0], bottomZUm: NaN }]),
    /physical-Z/,
  );
  assert.throws(
    () => directApertureStackFromGds(elements, [{ ...stages[0], selectors: [] }]),
    /selectors/,
  );
  assert.throws(
    () => directApertureStackFromGds(elements, stages, { transformPoint: () => [NaN, 0] }),
    /finite XY/,
  );
});
test(
  'original author Q2 GDS datatype-based apertures match the existing manual wafer-pose geometry',
  {
    skip: !process.env.WAFERCAD_TRANSMON_GDS,
  },
  async () => {
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const { parseGDS, flattenGDS } = await import('../gds.js');
    const { difference, isEmpty, transformMulti } = await import('../vector-geometry.js');
    const source = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
    );
    const parsed = parseGDS(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );
    const { elements: junction } = flattenGDS(parsed, 'jj_width0p18');
    assert.equal(junction.length, 17);
    const origin = 337.45;
    const explicit = directApertureStackFromGds(
      junction,
      [
        {
          bottomZUm: origin,
          topZUm: origin + 0.5,
          selectors: [
            { layer: 8, datatype: 0 },
            { layer: 8, datatype: 1 },
          ],
        },
        { bottomZUm: origin + 0.5, topZUm: origin + 0.9, selectors: [{ layer: 8, datatype: 1 }] },
      ],
      { transformPoint: ([x, y]) => [-y, x] },
    );
    const sourceManual = (datatypes) =>
      unionGeometries(
        junction
          .filter((e) => e.kind === 'polygon' && e.layer === 8 && datatypes.includes(e.datatype))
          .map((e) => transformMulti([[e.points]], ([x, y]) => [-y, x])),
      );
    for (const [i, selectors] of [[0, 1], [1]].entries()) {
      assert.equal(isEmpty(difference(explicit[i].opening, sourceManual(selectors))), true);
      assert.equal(isEmpty(difference(sourceManual(selectors), explicit[i].opening)), true);
    }
  },
);
