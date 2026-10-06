import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { readProjectFile, serializeProject } = await import('../project-io.js');

function projectAround(model) {
  return {
    format: 'WaferCAD-vector',
    model,
    layout: {
      name: 'm3d-roundtrip.gds',
      root: 'TOP',
      elements: [],
      linework: [],
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 20, height: 20 },
      combos: [],
      hierarchy: { TOP: [] },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [],
    activeCell: 'TOP',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    section: { a: [-10, 0], b: [10, 0] },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: { xyUnit: 'um', structurePalette: 'balanced', customStructurePalette: null },
  };
}

test('repeated conformal stack remains processable after real .wafercad storage quantization', async () => {
  const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const ridge = modelApi.applyOperation(model, {
    type: 'add',
    name: 'M3D ridge',
    thickness: 2.00003,
    face: 'front',
    area: vectorApi.rectMulti(6.00003, 20),
    growth: 'direct',
  });
  assert.equal(ridge.changed, true, ridge.error);

  for (let index = 0; index < 3; index++) {
    const film = modelApi.applyOperation(model, {
      type: 'add',
      name: `ILD ${index + 1}`,
      thickness: 0.10003,
      face: 'front',
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(film.changed, true, film.error);
  }

  const text = serializeProject(projectAround(model));
  const fileLike = {
    size: new TextEncoder().encode(text).byteLength,
    text: async () => text,
  };
  const reopened = await readProjectFile(fileLike);
  assert.ok(reopened.model.regions.length > 0);

  const nextFilm = modelApi.applyOperation(reopened.model, {
    type: 'add',
    name: 'Post reopen ILD',
    thickness: 0.10003,
    face: 'front',
    area: reopened.model.boundary,
    growth: 'conformal',
  });
  assert.equal(nextFilm.changed, true, nextFilm.error);
});
