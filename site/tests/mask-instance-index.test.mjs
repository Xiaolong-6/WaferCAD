import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileMaskInstanceIndex,
  queryMaskInstances,
  prepareMaskInstanceIndex,
  selectedMaskInstanceIndex,
  attachArrayMaskQuery,
} from '../mask-instance-index.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { localGeometry } = await import('../model-array-context.js');
const { rectMulti, unionGeometries, intersection, difference, bufferPolyline } =
  await import('../vector-geometry.js');
const { translateGeometry } = await import('../model-array.js');
const polys = Array.from({ length: 625 }, (_, i) => ({
  kind: 'polygon',
  layer: 9,
  points: rectMulti(
    2.0002,
    3,
    ((i % 25) - 12) * 1600,
    (Math.floor(i / 25) - 12) * 1600,
  )[0][0].slice(0, -1),
}));
test('mask import discovers 625 exact translation matches once and selections reuse the index', () => {
  const layout = { elements: polys };
  const first = prepareMaskInstanceIndex(layout);
  assert.equal(first.index.templates.length, 1);
  assert.equal(first.index.instances.length, 625);
  assert.equal(prepareMaskInstanceIndex(layout), first);
  const selected = selectedMaskInstanceIndex(layout, (e) => e.layer === 9);
  assert.equal(
    selectedMaskInstanceIndex(layout, (e) => e.layer === 9),
    selected,
  );
  for (const instance of selected.instances)
    assert.deepEqual(
      translateGeometry(
        [[selected.templates[instance.templateId].points]],
        instance.x,
        instance.y,
      )[0][0],
      polys[instance.elementIndex].points,
    );
});
test('indexed mask queries reproduce physical clipped and inverted regions without global array expansion', () => {
  const index = compileMaskInstanceIndex(polys),
    boundary = rectMulti(40000, 40000),
    area = unionGeometries(polys.map((e) => [[e.points]]));
  for (const x of [-19200, 0, 19200]) {
    const part = { x, y: 0 },
      domain = rectMulti(1600, 1600, x, 0);
    for (const mode of ['mask', 'invert']) {
      const full = mode === 'invert' ? difference(boundary, area) : area;
      const metadata = attachArrayMaskQuery(structuredClone(full), {
        index,
        mode,
        boundary,
        limiter: null,
      });
      assert.deepEqual(
        localGeometry(metadata, part, domain),
        translateGeometry(intersection(full, domain), -x, 0),
      );
    }
  }
});
test('mask indexing preserves sub-grid coordinates, path widths and arbitrary transforms', () => {
  const source = [
    {
      kind: 'polygon',
      points: [
        [0.0000001, 0],
        [1.0000001, 0],
        [1, 1],
      ],
    },
    {
      kind: 'path',
      width: 0.0041,
      points: [
        [1, 2],
        [3, 4],
      ],
    },
  ];
  const transform = { x: 0.12345, y: -0.3, scale: 2, rotation: 31 };
  const index = compileMaskInstanceIndex(source, transform);
  assert.equal(index.templates.find((t) => t.kind === 'path').width, 0.0082);
  const boundary = rectMulti(30, 30),
    domain = rectMulti(10, 10),
    part = { x: 0, y: 0 };
  const mask = attachArrayMaskQuery(boundary, {
    index,
    mode: 'mask',
    boundary,
    limiter: rectMulti(3, 3),
  });
  const geoms = index.instances.map((i) => {
    const t = index.templates[i.templateId],
      points = translateGeometry([[t.points]], i.x, i.y)[0][0];
    return t.kind === 'polygon' ? [[points]] : bufferPolyline(points, t.width / 2, 28, false);
  });
  const expected = intersection(unionGeometries(geoms), rectMulti(3, 3));
  // Local path buffering differs from world buffering only by IEEE roundoff.
  const actual = localGeometry(mask, part, domain);
  assert.ok(difference(actual, expected).length === 0 && difference(expected, actual).length === 0);
});

test('selected-layer spatial lookup is rebuilt for filtered instances and layout replacement', () => {
  const layout = { elements: polys.map((e, i) => ({ ...e, layer: i % 2 ? 9 : 10 })) };
  const selected = selectedMaskInstanceIndex(layout, (e) => e.layer === 9);
  for (const item of selected.instances) {
    const hits = queryMaskInstances(selected, item.bounds);
    assert.deepEqual(
      hits.map((i) => i.elementIndex),
      [item.elementIndex],
    );
  }
  const previous = prepareMaskInstanceIndex(layout);
  layout.elements = [polys[0]];
  assert.notEqual(prepareMaskInstanceIndex(layout), previous);
  assert.equal(selectedMaskInstanceIndex(layout, () => true).instances.length, 1);
});

test('canonical array Process uses deferred Mask envelopes for masked, inverse and empty selections', async () => {
  const { createModel } = await import('../model.js');
  const { createRectangularGridArrayModel } = await import('../model-array-construction.js');
  const { createSelectionGeometry } = await import('../selection-geometry.js');
  const model = createRectangularGridArrayModel(
    createModel({ shape: 'rect', width: 1, height: 1, thickness: 2 }),
    { kind: 'rect-grid', rows: 8, columns: 8, pitchX: 1, pitchY: 1, activeSites: 48 },
  );
  const maskElements = model.array.instances
    .filter((_, i) => i % 2 === 0)
    .map((site) => ({
      kind: 'polygon',
      layer: 1,
      datatype: 0,
      sourceCell: 'GRID',
      points: rectMulti(0.2, 0.2, site.x, site.y)[0][0].slice(0, -1),
    }));
  const state = {
    model,
    maskSourceMode: 'file',
    maskRoi: null,
    maskTransform: { x: 0, y: 0, rotation: 0, scale: 1 },
    layout: { root: 'GRID', elements: maskElements },
  };
  const geometry = createSelectionGeometry({
    getState: () => state,
    selectedElement: (e) => e.layer === 1,
    maskPoint: (p) => p,
  });
  const site = model.array.instances[0],
    domain = rectMulti(1, 1, site.x, site.y),
    mask = translateGeometry([[maskElements[0].points]], -site.x, -site.y),
    localDomain = rectMulti(1, 1);
  const canonicalBoundary = structuredClone(model.boundary);
  for (const mode of ['mask', 'invert', 'full']) {
    const area = geometry.operationAreaGeometry(mode);
    assert.notStrictEqual(
      area,
      model.boundary,
      'The shared project boundary must not be a query envelope',
    );
    assert.equal(Object.hasOwn(model.boundary, 'arrayMaskQuery'), false);
    assert.deepEqual(model.boundary, canonicalBoundary);
    assert.ok(area.arrayMaskQuery, mode + ' must remain an indexed query envelope');
    assert.equal(area.arrayMaskQuery.mode, mode);
    assert.deepEqual(area, model.boundary, 'No global Mask union may be stored on the envelope');
    const actual = localGeometry(area, site, domain);
    const expected =
      mode === 'mask' ? mask : mode === 'invert' ? difference(localDomain, mask) : localDomain;
    assert.equal(difference(actual, expected).length, 0, mode + ': missing local area');
    assert.equal(difference(expected, actual).length, 0, mode + ': extra local area');
  }
  // A cell with no matching mask polygons is skipped, while its inverse
  // remains the entire cell. An empty selected Mask is rejected for both.
  const unmaskedSite = model.array.instances[1],
    unmaskedDomain = rectMulti(1, 1, unmaskedSite.x, unmaskedSite.y);
  assert.deepEqual(
    localGeometry(geometry.operationAreaGeometry('mask'), unmaskedSite, unmaskedDomain),
    [],
  );
  assert.equal(
    difference(
      localGeometry(geometry.operationAreaGeometry('invert'), unmaskedSite, unmaskedDomain),
      rectMulti(1, 1),
    ).length,
    0,
  );
  state.layout = { ...state.layout, elements: [] };
  assert.deepEqual(geometry.operationAreaGeometry('mask'), []);
  assert.deepEqual(geometry.operationAreaGeometry('invert'), []);
});
