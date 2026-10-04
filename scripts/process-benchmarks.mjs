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

export async function isotropicReleaseBenchmark({ released = true } = {}) {
  await loadGeometryKernel();
  const { applyOperation, createModel } = await import('../site/model.js');
  const { circleMulti, difference, rectMulti, unionGeometries } =
    await import('../site/vector-geometry.js');

  const model = createModel({ shape: 'rect', width: 400, height: 400, thickness: 80 });
  const oxide = applyOperation(model, {
    type: 'add',
    name: 'Thermal SiO2',
    thickness: 1.8,
    face: 'front',
    area: model.boundary,
    growth: 'direct',
  });

  const outer = circleMulti(296, 296, 128),
    inner = circleMulti(164, 164, 128),
    annulus = difference(outer, inner),
    hub = circleMulti(110, 110, 96),
    horizontalSpokes = rectMulti(180, 10),
    verticalSpokes = rectMulti(10, 180),
    silicaPad = unionGeometries([annulus, hub, horizontalSpokes, verticalSpokes]),
    oxideOpen = difference(model.boundary, silicaPad);

  const patterned = applyOperation(model, {
    type: 'etch',
    etchProfile: 'directional',
    etchTargetLayerIds: [oxide.layerId],
    thickness: 2,
    face: 'front',
    area: oxideOpen,
  });
  if (!patterned.changed) throw new Error(patterned.error || 'Microdisk oxide patterning failed.');

  const releaseRadius = 36;
  if (released) {
    const release = applyOperation(model, {
      type: 'etch',
      etchProfile: 'isotropic',
      etchTargetLayerIds: ['base'],
      thickness: releaseRadius,
      face: 'front',
      area: model.boundary,
    });
    if (!release.changed) throw new Error(release.error || 'Microdisk release failed.');
  }

  return {
    model,
    oxideLayerId: oxide.layerId,
    releaseRadius,
    section: { a: [-180, 0], b: [180, 0] },
    probes: {
      hub: [0, 0],
      ring: [115, 0],
      exposed: [170, 0],
    },
  };
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
      bounds: {
        minX: -model.width / 2,
        minY: -model.height / 2,
        maxX: model.width / 2,
        maxY: model.height / 2,
        width: model.width,
        height: model.height,
      },
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
