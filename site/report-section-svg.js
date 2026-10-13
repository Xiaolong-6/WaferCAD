import { sectionSlices } from './model-view-geometry.js';

const MAX_SECTION_SLICES = 100000;
const MAX_SVG_LENGTH = 12 * 1024 * 1024;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function n(value) {
  if (!Number.isFinite(value)) throw new RangeError('Non-finite Section coordinate.');
  return String(Number(value.toPrecision(12)));
}

function point(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function checkedOptions({ width, height, maxSlices }) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 160 ||
    width > 4096 ||
    height < 120 ||
    height > 4096
  ) {
    throw new RangeError('Invalid historical Section SVG viewport.');
  }
  if (!Number.isInteger(maxSlices) || maxSlices < 1 || maxSlices > MAX_SECTION_SLICES) {
    throw new RangeError('Invalid historical Section slice limit.');
  }
}

export function renderHistoricalSectionSvg({
  state,
  nodeId,
  width = 960,
  height = 480,
  maxSlices = 20000,
} = {}) {
  checkedOptions({ width, height, maxSlices });
  if (typeof nodeId !== 'string' || !nodeId) {
    throw new TypeError('A stable History node ID is required.');
  }
  const { model, section } = state || {};
  if (!model || !point(section?.a) || !point(section?.b)) {
    throw new Error('Historical model and A–B Section line are required.');
  }
  const lineLengthUm = Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]);
  if (!(lineLengthUm > 1e-9)) throw new RangeError('Historical A–B line is degenerate.');

  // Use the same physical topology as the live scientific Section. No live
  // renderer state, camera, DOM, Section Z break, or view cache is consulted.
  const sourceSlices = sectionSlices(model, section.a, section.b);
  if (sourceSlices.length > maxSlices) {
    throw new Error('Historical Section exceeds the bounded slice limit.');
  }
  const palette = new Map((model.layers || []).map((item) => [item.id, item]));
  const solids = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const slice of sourceSlices) {
    const { t0, t1, z0, z1, layerId } = slice;
    if (
      ![t0, t1, z0, z1].every(Number.isFinite) ||
      t0 < -1e-8 ||
      t1 > 1 + 1e-8 ||
      !(t1 > t0) ||
      !(z1 > z0)
    ) {
      throw new Error('Invalid physical interval in historical Section.');
    }
    const layer = palette.get(layerId);
    if (!layer) throw new Error('Section references an unknown material Layer ID.');
    if (layer.visible === false) continue;
    zMin = Math.min(zMin, z0);
    zMax = Math.max(zMax, z1);
    solids.push({ ...slice, color: COLOR_PATTERN.test(layer.color) ? layer.color : '#8896a6' });
  }
  if (!solids.length || !(zMax > zMin)) {
    throw new Error('No visible physical Section solids exist for this history node.');
  }

  const margin = 32;
  const horizontal = width - margin * 2;
  const vertical = height - margin * 2;
  const zSpan = zMax - zMin;
  const scale = Math.min(horizontal / lineLengthUm, vertical / zSpan);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError('Historical Section cannot be mapped at a physical scale.');
  }
  const contentWidth = lineLengthUm * scale;
  const contentHeight = zSpan * scale;
  const xOffset = (width - contentWidth) / 2;
  const yOffset = (height - contentHeight) / 2;
  const rectangles = solids.map(({ t0, t1, z0, z1, color, layerId }) => {
    const x = xOffset + t0 * lineLengthUm * scale;
    const y = yOffset + (zMax - z1) * scale;
    const w = (t1 - t0) * lineLengthUm * scale;
    const h = (z1 - z0) * scale;
    return `<rect data-layer-id="${xml(layerId)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${color}"/>`;
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historical physical Section">`,
    `<title>${xml(nodeId)} · Historical Section A–B</title>`,
    `<desc>Physical X and Z axes share the same scale. No Z break or inferred geometry.</desc>`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    ...rectangles,
    '</svg>',
    '',
  ].join('\n');
  if (svg.length > MAX_SVG_LENGTH) throw new Error('Historical Section SVG exceeds size limit.');
  return {
    svg,
    evidence: {
      nodeId,
      renderer: 'historical-section-physical-svg-v1',
      view: 'section',
      stateOrigin: 'caller-supplied-isolated-state',
      provenanceVerified: false,
      lineAUm: [...section.a],
      lineBUm: [...section.b],
      lineLengthUm,
      zMinUm: zMin,
      zMaxUm: zMax,
      pixelsPerUm: scale,
      xOffsetPx: xOffset,
      yOffsetPx: yOffset,
      layerIds: [...new Set(solids.map((solid) => solid.layerId))],
      physicalSliceCount: solids.length,
      width,
      height,
      zBreak: false,
      geometrySynthesized: false,
    },
  };
}
