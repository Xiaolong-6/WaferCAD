// Read-only vector presentation for offline WaferCAD evidence.
// Derived geometry must come from WaferCAD surfaceGroups/sectionSlices, not this module.
const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
};
const fmt = (value) => Number(finite(value, 'coordinate').toFixed(5));
const palette = ['#64748b', '#4d8d9f', '#d29b57', '#b77783', '#8275ab'];
function layerLegend(layers, used) {
  return [...used].map((id, index) => {
    const layer = layers.find((item) => item.id === id);
    return { id, name: layer?.name || id, color: layer?.color || palette[index % palette.length] };
  });
}
function frame({ width, height, title, subtitle, content, legend }) {
  const elements = legend
    .map((item, i) => {
      const x = 54 + (i % 4) * 245;
      const y = height - 53 + Math.floor(i / 4) * 17;
      return `<rect x="${x}" y="${y - 10}" width="12" height="12" rx="2" fill="${escapeXml(item.color)}"/><text x="${x + 18}" y="${y}" font-size="12" fill="#344054">${escapeXml(item.name)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="40" y="39" fill="#192b3b" font-size="20" font-family="sans-serif" font-weight="600">${escapeXml(title)}</text><text x="40" y="59" fill="#64748b" font-size="12" font-family="sans-serif">${escapeXml(subtitle)}</text><rect x="40" y="78" width="${width - 80}" height="${height - 169}" rx="8" fill="#fff" stroke="#cbd5e1"/>${content}<g font-family="sans-serif">${elements}</g></svg>`;
}
function boundsOfPolygons(polygons) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const polygon of polygons || [])
    for (const ring of polygon || [])
      for (const [x, y] of ring || []) {
        minX = Math.min(minX, finite(x, 'x'));
        maxX = Math.max(maxX, finite(x, 'x'));
        minY = Math.min(minY, finite(y, 'y'));
        maxY = Math.max(maxY, finite(y, 'y'));
      }
  if (![minX, maxX, minY, maxY].every(Number.isFinite))
    throw new Error('No finite polygon bounds.');
  return { minX, maxX, minY, maxY };
}
const pathOf = (geom, point) =>
  (geom || [])
    .map((poly) =>
      poly
        .map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${point(p).join(' ')}`).join(' ') + ' Z')
        .join(' '),
    )
    .join(' ');
export function renderMainSvg({
  model,
  patches,
  title = 'Main',
  width = 1100,
  height = 760,
  face = 'front',
  borders = true,
}) {
  if (
    !Number.isInteger(width) ||
    width < 300 ||
    width > 4096 ||
    !Number.isInteger(height) ||
    height < 300 ||
    height > 4096
  )
    throw new Error('Invalid image dimensions.');
  if (!Array.isArray(patches) || !patches.length)
    throw new Error('No actual material surface groups to render.');
  const bounds = boundsOfPolygons(model.boundary);
  const plot = { x: 70, y: 95, w: width - 140, h: height - 213 };
  const xSize = Math.max(1e-12, bounds.maxX - bounds.minX),
    ySize = Math.max(1e-12, bounds.maxY - bounds.minY);
  const scale = Math.min(plot.w / xSize, plot.h / ySize);
  const offsetX = plot.x + (plot.w - scale * xSize) / 2,
    offsetY = plot.y + (plot.h - scale * ySize) / 2;
  const point = ([x, y]) => [
    fmt(offsetX + (x - bounds.minX) * scale),
    fmt(offsetY + (bounds.maxY - y) * scale),
  ];
  const legend = layerLegend(model.layers || [], new Set(patches.map((p) => p.layerId)));
  const color = new Map(legend.map((item) => [item.id, item.color]));
  const shapes = [...patches]
    .sort((a, b) => (face === 'back' ? b.z - a.z : a.z - b.z))
    .map(
      (item) =>
        `<path d="${pathOf(item.geom, point)}" fill="${escapeXml(color.get(item.layerId) || '#94a3b8')}" fill-rule="evenodd" ${borders ? 'stroke="#334155" stroke-opacity=".55" stroke-width=".75"' : ''}/>`,
    )
    .join('');
  return {
    svg: frame({
      width,
      height,
      title,
      subtitle: `WaferCAD native surface topology · ${face} · XY in µm`,
      content: shapes,
      legend,
    }),
    evidence: {
      view: 'main',
      face,
      boundsUm: bounds,
      pixelsPerUm: scale,
      materialSurfaces: patches.length,
      layerIds: legend.map((x) => x.id),
      renderer: 'offline-svg-native-topology',
      limitations: [
        'No roughness tessellation, annotation shading, interactive overlays, or UI compositor validation.',
      ],
    },
  };
}
export function renderSectionSvg({
  model,
  slices,
  a,
  b,
  title = 'Section A–B',
  width = 1100,
  height = 760,
  scaleMode = 'auto',
  borders = true,
}) {
  if (
    !Number.isInteger(width) ||
    width < 300 ||
    width > 4096 ||
    !Number.isInteger(height) ||
    height < 300 ||
    height > 4096
  )
    throw new Error('Invalid image dimensions.');
  if (!Array.isArray(slices) || !slices.length)
    throw new Error('No actual material section slices to render.');
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2)
    throw new Error('Invalid Section endpoints.');
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > 0)) throw new Error('Section A and B must differ.');
  const zMin = Math.min(...slices.map((s) => finite(s.z0, 'z0'))),
    zMax = Math.max(...slices.map((s) => finite(s.z1, 'z1')));
  if (!(zMax > zMin)) throw new Error('Section has no positive vertical span.');
  const plot = { x: 90, y: 95, w: width - 180, h: height - 213 };
  const pxX =
    scaleMode === 'physical' ? Math.min(plot.w / length, plot.h / (zMax - zMin)) : plot.w / length;
  const pxZ = scaleMode === 'physical' ? pxX : plot.h / (zMax - zMin);
  if (!['physical', 'auto'].includes(scaleMode))
    throw new Error('scaleMode must be physical or auto.');
  const top = plot.y + (plot.h - (zMax - zMin) * pxZ) / 2;
  const legend = layerLegend(model.layers || [], new Set(slices.map((s) => s.layerId)));
  const color = new Map(legend.map((item) => [item.id, item.color]));
  const shapes = slices
    .map((s) => {
      if (
        ![s.t0, s.t1, s.z0, s.z1].every(Number.isFinite) ||
        s.t1 <= s.t0 ||
        s.z1 <= s.z0 ||
        s.t0 < -1e-8 ||
        s.t1 > 1 + 1e-8
      )
        throw Error('Malformed scientific Section slice.');
      const x = plot.x + (plot.w - length * pxX) / 2 + s.t0 * length * pxX,
        y = top + (zMax - s.z1) * pxZ;
      return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt((s.t1 - s.t0) * length * pxX)}" height="${fmt((s.z1 - s.z0) * pxZ)}" fill="${escapeXml(color.get(s.layerId) || '#94a3b8')}" ${borders ? 'stroke="#475569" stroke-opacity=".6" stroke-width=".7"' : ''}/>`;
    })
    .join('');
  const axisStart = plot.x + (plot.w - length * pxX) / 2;
  const axis = `<text x="${fmt(axisStart)}" y="${height - 105}" fill="#64748b" font-size="12">A</text><text x="${fmt(axisStart + length * pxX - 8)}" y="${height - 105}" fill="#64748b" font-size="12">B</text>`;
  return {
    svg: frame({
      width,
      height,
      title,
      subtitle: `WaferCAD native Section slices · ${scaleMode === 'physical' ? 'physical X:Z 1:1' : 'independent X/Z autoscale'} · no Z break`,
      content: shapes + axis,
      legend,
    }),
    evidence: {
      view: 'section',
      endpointsUm: { a, b },
      lineLengthUm: length,
      zMinUm: zMin,
      zMaxUm: zMax,
      pixelsPerUmX: pxX,
      pixelsPerUmZ: pxZ,
      scaleMode,
      materialSlices: slices.length,
      layerIds: legend.map((x) => x.id),
      renderer: 'offline-svg-native-topology',
      limitations: ['No roughness profile, Z break, implant overlay, or UI compositor validation.'],
    },
  };
}
