import { readFile } from 'node:fs/promises';

export async function loadGeometryKernel() {
  if (globalThis.polygonClipping) return;
  const source = await readFile(
    new URL('../site/vendor/polygon-clipping.umd.js', import.meta.url),
    'utf8',
  );
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  globalThis.polygonClipping = module.exports;
}

export async function processBenchmark(kind, growth, face = 'front') {
  await loadGeometryKernel();
  const { applyOperation, createModel } = await import('../site/model.js');
  const { rectMulti } = await import('../site/vector-geometry.js');
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const footprint =
    kind === 'step'
      ? rectMulti(10, 20, -5, 0)
      : kind === 'trench'
        ? rectMulti(4, 20)
        : rectMulti(4, 4);
  applyOperation(model, {
    type: kind === 'trench' ? 'etch' : 'add',
    name: 'Feature',
    thickness: 2,
    area: footprint,
    face,
    growth: 'direct',
  });
  const result = applyOperation(model, {
    type: 'add',
    name: `${growth} coat`,
    thickness: 1,
    area: model.boundary,
    face,
    growth,
  });
  return { model, layerId: result.layerId, section: { a: [-9, 0], b: [9, 0] } };
}

export function projectForBenchmark({ model, section }) {
  return {
    format: 'WaferCAD-vector',
    version: 4,
    model,
    layout: {
      name: 'Benchmark',
      root: '',
      elements: [],
      linework: [],
      combos: [],
      hierarchy: {},
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 20, height: 20 },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [],
    activeCell: null,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    roiAnchor: 'center',
    section,
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      customStructurePalette: null,
      threeOpacity: 1,
      threeShowBorders: true,
    },
  };
}
