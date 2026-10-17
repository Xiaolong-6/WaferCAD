import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMaskSvg } from '../../scripts/offline-mask-svg.mjs';
const rect = (x0, y0, x1, y1) => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
];
const model = { boundary: rect(-10, -10, 10, 10) };
const opts = {
  model,
  source: 'file',
  fileElements: [
    {
      kind: 'polygon',
      layer: 1,
      datatype: 0,
      selected: true,
      points: [
        [1, 1],
        [4, 1],
        [4, 4],
        [1, 4],
      ],
    },
    {
      kind: 'path',
      layer: 2,
      datatype: 0,
      selected: false,
      points: [
        [0, 0],
        [5, 0],
      ],
      width: 1,
    },
  ],
};
test('file selection and path width use native transformed points', () => {
  const r = renderMaskSvg(opts);
  assert.match(r.svg, /data-mask-layer="1\|0"/);
  assert.match(r.svg, /data-mask-layer="2\|0"/);
  assert.equal(r.evidence.selectedElements, 1);
  assert.equal(r.evidence.unselectedElements, 1);
  assert.match(r.svg, /stroke-width="[0-9.]+"/);
});
test('draw source omits file and renders native union-less mask hole', () => {
  const r = renderMaskSvg({
    ...opts,
    source: 'draw',
    drawGeometries: [{ id: 'ring1', geom: [[...rect(-7, -7, 7, 7)[0], ...rect(-2, -2, 2, 2)[0]]] }],
  });
  assert.match(r.svg, /data-mask-shape="ring1"/);
  assert.match(r.svg, /fill-rule="evenodd"/);
  assert.doesNotMatch(r.svg, /data-mask-layer=/);
});
test('ROI and back reference are segregated from File mask alignment', () => {
  const patch = rect(2, -4, 5, 4);
  const r = renderMaskSvg({
    ...opts,
    face: 'back',
    referencePatches: [{ geom: patch }],
    roiGeometry: rect(-4, -4, -2, -2),
  });
  assert.match(r.svg, /data-mask-roi="true"/);
  assert.equal(r.evidence.activeFace, 'back');
  assert.ok(r.evidence.boundsUm.minX < -10 && r.evidence.boundsUm.maxX > 10);
});
test('rejects nonfinite, bad sizes, invalid paths, invalid opacity', () => {
  assert.throws(() => renderMaskSvg({ ...opts, width: 2 }), /dimensions/);
  assert.throws(() => renderMaskSvg({ ...opts, opacity: NaN }), /opacity/);
  assert.throws(
    () =>
      renderMaskSvg({
        ...opts,
        fileElements: [
          {
            ...opts.fileElements[0],
            points: [
              [1, 2],
              [2, 3],
              [NaN, 5],
            ],
          },
        ],
      }),
    /Mask point/,
  );
  assert.throws(
    () => renderMaskSvg({ ...opts, fileElements: [{ ...opts.fileElements[1], width: -2 }] }),
    /path width/,
  );
});
test('source isolation on empty mask does not masquerade as process geometry', () => {
  const r = renderMaskSvg({ model, source: 'file' });
  assert.equal(r.evidence.sourceElementCount, 0);
  assert.equal(r.evidence.selectedElements, 0);
  assert.doesNotMatch(r.svg, /data-mask-shape=/);
});
