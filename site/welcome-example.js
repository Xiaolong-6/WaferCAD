import { applyOperation, createModel, recolorLayer } from './model.js';
import { circleMulti, difference, unionGeometries } from './vector-geometry.js';

const SITES = [
  [-5, -35, 1],
  [5, -35, 2],
  [15, -35, 3],
  [25, -35, 4],
  [-25, -35, 4],
  [-15, -35, 5],
  [5, -25, 1],
  [15, -25, 2],
  [25, -25, 3],
  [35, -25, 4],
  [-35, -25, 2],
  [-25, -25, 3],
  [-15, -25, 4],
  [-5, -25, 5],
  [15, -15, 1],
  [25, -15, 2],
  [35, -15, 3],
  [-35, -15, 1],
  [-25, -15, 2],
  [-15, -15, 3],
  [-5, -15, 4],
  [5, -15, 5],
  [25, -5, 1],
  [35, -5, 2],
  [45, -5, 3],
  [-25, -5, 1],
  [-15, -5, 2],
  [-5, -5, 3],
  [5, -5, 4],
  [15, -5, 5],
  [35, 5, 1],
  [45, 5, 2],
  [-45, -5, 4],
  [-35, -5, 5],
  [-15, 5, 1],
  [-5, 5, 2],
  [5, 5, 3],
  [15, 5, 4],
  [25, 5, 5],
  [-45, 5, 3],
  [-35, 5, 4],
  [-25, 5, 5],
  [-5, 15, 1],
  [5, 15, 2],
  [15, 15, 3],
  [25, 15, 4],
  [35, 15, 5],
  [-35, 15, 3],
  [-25, 15, 4],
  [-15, 15, 5],
  [5, 25, 1],
  [15, 25, 2],
  [25, 25, 3],
  [35, 25, 4],
  [-35, 25, 2],
  [-25, 25, 3],
  [-15, 25, 4],
  [-5, 25, 5],
  [15, 35, 1],
  [25, 35, 2],
  [-25, 35, 2],
  [-15, 35, 3],
  [-5, 35, 4],
  [5, 35, 5],
  [-5, 45, 3],
  [5, 45, 4],
];

const COMBOS = [
  ['50mm', 1, 1],
  ['ITO', 1, 66],
  ['ITO', 3, 66],
  ['Metal', 1, 66],
  ['Metal', 4, 66],
  ['Opening', 1, 66],
  ['Opening', 2, 66],
];

function circlePoints(cx, cy, diameter, segments = 24) {
  const radius = diameter / 2;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function squarePoints(cx, cy, size = 10000) {
  const half = size / 2;
  return [
    [cx - half, cy - half],
    [cx - half, cy + half],
    [cx + half, cy + half],
    [cx + half, cy - half],
  ];
}

function polygon(sourceCell, layer, points) {
  return { kind: 'polygon', sourceCell, layer, datatype: 0, points };
}

function layerArea(layout, sourceCell, layer) {
  return unionGeometries(
    layout.elements
      .filter((element) => element.sourceCell === sourceCell && element.layer === layer)
      .map((element) => [[element.points]]),
  );
}

export function createVisualizationLayout() {
  const elements = [polygon('50mm', 1, circlePoints(0, 0, 100000, 64))];

  for (const [xMm, yMm, openingMm] of SITES) {
    const x = xMm * 1000;
    const y = yMm * 1000;
    const opening = openingMm * 1000;
    const contact = (openingMm + 2) * 1000;

    elements.push(polygon('Opening', 1, squarePoints(x, y)));
    elements.push(polygon('Opening', 2, circlePoints(x, y, opening)));
    elements.push(polygon('ITO', 1, squarePoints(x, y)));
    elements.push(polygon('ITO', 3, circlePoints(x, y, contact)));
    elements.push(polygon('Metal', 1, squarePoints(x, y)));
    elements.push(polygon('Metal', 4, circlePoints(x, y, contact)));
  }

  return {
    name: 'Visualization example',
    root: 'Wafer',
    elements,
    linework: [],
    bounds: {
      minX: -50000,
      minY: -50000,
      maxX: 50000,
      maxY: 50000,
      width: 100000,
      height: 100000,
    },
    combos: COMBOS.map(([cell, layer, count]) => ({
      key: `${cell}|${layer}|0`,
      cell,
      layer,
      datatype: 0,
      count,
    })),
    hierarchy: {
      Metal: [],
      ITO: [],
      Opening: [],
      '50mm': [],
      Wafer: [
        { name: '50mm', count: 1 },
        { name: 'Opening', count: 1 },
        { name: 'ITO', count: 1 },
        { name: 'Metal', count: 1 },
      ],
    },
    units: {
      xy: 'µm',
      userUnitsPerDbu: 0.001,
      metersPerDbu: 1e-9,
      dbuToMicron: 0.001,
      hasPhysicalUnits: true,
    },
  };
}

function addLayer(model, { name, thickness, area, growth = 'direct', face = 'front', color }) {
  const result = applyOperation(model, {
    type: 'add',
    name,
    thickness,
    area,
    growth,
    face,
  });
  if (!result.changed || !result.layerId) {
    throw new Error(result.error || `Could not create example layer ${name}.`);
  }
  recolorLayer(model, result.layerId, color);
  return result.layerId;
}

export function createVisualizationExample() {
  const layout = createVisualizationLayout();
  const model = createModel({
    shape: 'circle',
    width: 100000,
    height: 100000,
    thickness: 1000,
  });
  const wafer = circleMulti(100000, 100000, 96);
  const openings = layerArea(layout, 'Opening', 2);
  const ito = layerArea(layout, 'ITO', 3);
  const metal = layerArea(layout, 'Metal', 4);

  addLayer(model, {
    name: 'SiO2',
    thickness: 100,
    area: difference(wafer, openings),
    color: '#CB776C',
  });
  addLayer(model, {
    name: 'Perovskite',
    thickness: 100,
    area: wafer,
    color: '#7BD5A0',
  });
  addLayer(model, {
    name: 'ETL',
    thickness: 100,
    area: wafer,
    color: '#B164D3',
  });
  addLayer(model, {
    name: 'ITO',
    thickness: 150,
    area: ito,
    color: '#D2D17F',
  });
  addLayer(model, {
    name: 'Metal',
    thickness: 200,
    area: metal,
    color: '#68B2CF',
  });
  addLayer(model, {
    name: 'Back metal',
    thickness: 200,
    area: wafer,
    face: 'back',
    color: '#D978A1',
  });

  return {
    format: 'WaferCAD-vector',
    version: 4,
    model,
    layout,
    selectedLayerKeys: ['4|0'],
    activeCell: 'Wafer',
    maskTransform: { scale: 1, rotation: 0, x: 0, y: 0 },
    activeFace: 'front',
    roi: {
      type: 'rect',
      a: [-7943.736, -5810.844],
      b: [-2062.006, -2162.941],
    },
    roiAnchor: 'center',
    section: {
      a: [4042.207, 26885.086],
      b: [6030.997, 23152.389],
    },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: {
      xyUnit: 'mm',
      structurePalette: 'balanced',
      customStructurePalette: [
        '#CB776C',
        '#7BD5A0',
        '#B164D3',
        '#D2D17F',
        '#68B2CF',
        '#D978A1',
        '#79CB6C',
        '#897BD5',
        '#D39664',
        '#7FD2BC',
      ],
      threeOpacity: 0.9,
      threeShowBorders: true,
    },
    snapshots: [],
  };
}
