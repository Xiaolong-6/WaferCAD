// Read-only Mask inspection SVG. Geometry is supplied by WaferCAD's native
// drawShapeGeometry, maskLocalToWorld and surfaceGroups adapters.
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const fmt = (n) => {
  if (!Number.isFinite(n)) throw Error('Non-finite Mask coordinate');
  return Number(n.toFixed(5));
};
const palette = [
  '#4f86c6',
  '#4faf9f',
  '#e6a23c',
  '#d96c5f',
  '#8a72be',
  '#57a6c7',
  '#6c8e5e',
  '#c5678b',
];
const layerColor = (key) => {
  let hash = 0;
  for (const c of key) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
};
const validGeometry = (geometry) => {
  if (!Array.isArray(geometry)) throw Error('Expected MultiPolygon');
  for (const poly of geometry)
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 3) throw Error('Degenerate polygon ring');
      for (const p of ring)
        if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite))
          throw Error('Invalid polygon point');
    }
  return geometry;
};
function allBounds(geometries) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const geom of geometries)
    for (const poly of geom || [])
      for (const ring of poly || [])
        for (const [x, y] of ring || []) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Non-finite Mask bounds');
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
  if (![minX, maxX, minY, maxY].every(Number.isFinite))
    throw Error('Mask viewport has no valid bounds');
  const pad = Math.max(0.01, Math.max(maxX - minX, maxY - minY) * 0.03);
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}
function geometryPath(geometry, point) {
  return validGeometry(geometry)
    .map((poly) =>
      poly
        .map((ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${point(p).join(' ')}`).join(' ') + ' Z')
        .join(' '),
    )
    .join(' ');
}
// `fileElements` already carry native-aligned world points and physical path
// widths. Draw shapes are pre-converted by native drawShapeGeometry.
export function renderMaskSvg({
  model,
  fileElements = [],
  drawGeometries = [],
  referencePatches = [],
  roiGeometry = null,
  source = 'file',
  width = 1100,
  height = 760,
  opacity = 0.65,
  face = 'front',
  title = 'WaferCAD / Mask',
}) {
  if (!['file', 'draw'].includes(source)) throw Error('Invalid Mask source');
  if (!['front', 'back'].includes(face)) throw Error('Invalid face');
  if (![width, height].every((n) => Number.isInteger(n) && n >= 320 && n <= 4096))
    throw Error('Invalid Mask raster dimensions');
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw Error('Invalid mask opacity');
  const boundary = validGeometry(model?.boundary);
  const elements = source === 'file' ? fileElements : drawGeometries;
  if (!Array.isArray(elements) || elements.length > 200000)
    throw Error('Invalid Mask element budget');
  const geometries = [boundary, ...referencePatches.map((p) => p.geom)];
  if (source === 'draw') geometries.push(...elements.map((e) => e.geom));
  else
    for (const e of elements) {
      if (!['polygon', 'path'].includes(e.kind) || !Array.isArray(e.points) || e.points.length < 2)
        throw Error('Invalid File Mask element');
      if (
        e.points.some(
          (p) => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite),
        )
      )
        throw Error('Invalid Mask point');
      if (e.kind === 'polygon' && e.points.length < 3) throw Error('Invalid Mask polygon');
      if (e.kind === 'path' && (!Number.isFinite(e.width) || e.width < 0))
        throw Error('Invalid Mask path width');
      geometries.push([[e.points]]);
    }
  if (roiGeometry) geometries.push(roiGeometry);
  // Reference contours use back-view X mirroring, unlike mask shapes.
  if (face === 'back') {
    geometries.push(boundary.map((poly) => poly.map((ring) => ring.map(([x, y]) => [-x, y]))));
    for (const patch of referencePatches)
      geometries.push(patch.geom.map((poly) => poly.map((ring) => ring.map(([x, y]) => [-x, y]))));
  }
  const b = allBounds(geometries),
    plot = { x: 65, y: 85, w: width - 130, h: height - 202 };
  const spanX = Math.max(1e-12, b.maxX - b.minX),
    spanY = Math.max(1e-12, b.maxY - b.minY);
  const scale = Math.min(plot.w / spanX, plot.h / spanY);
  const ox = plot.x + (plot.w - spanX * scale) / 2,
    oy = plot.y + (plot.h - spanY * scale) / 2;
  // Align active back face reference in the same mirrored convention as Main.
  const point = ([x, y], mirror = false) => [
    fmt(ox + ((mirror ? -x : x) - b.minX) * scale),
    fmt(oy + (b.maxY - y) * scale),
  ];
  const backRef = face === 'back';
  const referencePoint = (p) => point(p, backRef);
  // Back reference bounds must also be mirrored, or it can be off-screen.
  const nativeMaskPoint = (p) => point(p);
  const patches = referencePatches
    .map(
      (p) =>
        `<path d="${geometryPath(p.geom, referencePoint)}" fill="none" stroke="#8d99a5" stroke-width=".75" stroke-dasharray="4 3"/>`,
    )
    .join('');
  const outline = `<path d="${geometryPath(boundary, referencePoint)}" fill="none" stroke="#64748b" stroke-width=".85" stroke-dasharray="7 4"/>`;
  const layers = new Set();
  let selected = 0,
    unselected = 0;
  const shapes = elements
    .map((e, i) => {
      if (source === 'draw') {
        selected++;
        return `<path data-mask-shape="${esc(e.id || String(i))}" d="${geometryPath(e.geom, nativeMaskPoint)}" fill="#4f86c6" fill-rule="evenodd" fill-opacity="${fmt(opacity * 0.65)}" stroke="#316caa" stroke-opacity="${fmt(opacity)}" stroke-width="1"/>`;
      }
      const key = `${e.layer}|${e.datatype}`;
      layers.add(key);
      const chosen = e.selected === true;
      chosen ? selected++ : unselected++;
      const color = layerColor(key);
      if (e.kind === 'path')
        return `<path data-mask-layer="${esc(key)}" d="${e.points.map((p, i) => `${i ? 'L' : 'M'}${nativeMaskPoint(p).join(' ')}`).join(' ')}" fill="none" stroke="${chosen ? color : '#94a3b8'}" stroke-opacity="${fmt(opacity * (chosen ? 1 : 0.6))}" stroke-width="${fmt(Math.max(0.75, e.width * scale))}" stroke-linejoin="round"/>`;
      return `<path data-mask-layer="${esc(key)}" d="${geometryPath([[e.points]], nativeMaskPoint)}" fill="${chosen ? color : '#94a3b8'}" fill-opacity="${fmt(opacity * (chosen ? 0.58 : 0.1))}" stroke="${chosen ? color : '#94a3b8'}" stroke-opacity="${fmt(opacity)}" stroke-width="${chosen ? 1 : 0.6}"/>`;
    })
    .join('');
  const roi = roiGeometry
    ? `<path data-mask-roi="true" d="${geometryPath(roiGeometry, nativeMaskPoint)}" fill="#e8590c" fill-opacity=".04" stroke="#e8590c" stroke-width="1.5" stroke-dasharray="6 4"/>`
    : '';
  const legend = `${source === 'file' ? `${selected} selected / ${unselected} unselected elements, ${layers.size} layers` : `${selected} drawn shapes`} · ${esc(face)} face · opacity ${Math.round(opacity * 100)}%`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="40" y="38" font-family="sans-serif" font-size="20" font-weight="600" fill="#192b3b">${esc(title)}</text><text x="40" y="58" font-family="sans-serif" font-size="12" fill="#64748b">Native Mask data · offline vector inspection</text><rect x="40" y="70" width="${width - 80}" height="${height - 160}" rx="8" fill="white" stroke="#cbd5e1"/><defs><clipPath id="mask-offline-plot-clip"><rect x="40" y="70" width="${width - 80}" height="${height - 160}"/></clipPath></defs><g clip-path="url(#mask-offline-plot-clip)">${outline}${patches}${shapes}${roi}</g><text x="40" y="${height - 60}" font-family="sans-serif" font-size="13" fill="#334155">${legend}</text><text x="40" y="${height - 36}" font-family="sans-serif" font-size="11" fill="#64748b">XY fit: ${fmt(scale)} px/µm · ${source === 'file' ? 'File alignment: project transform' : 'Draw geometry: world coordinates'} · ROI: ${roiGeometry ? 'yes' : 'no'}</text></svg>`;
  return {
    svg,
    evidence: {
      view: 'mask',
      maskSourceMode: source,
      activeFace: face,
      selectedElements: selected,
      unselectedElements: unselected,
      sourceElementCount: elements.length,
      layerKeys: [...layers],
      opacity,
      roiPresent: Boolean(roiGeometry),
      boundsUm: b,
      pxPerUm: scale,
      renderer: 'offline-mask-svg',
      limitations: [
        'Mask schematic only; no canvas interaction, live snapping, or grid overlays',
        'File element selection is layer-key based; cell filtering must be verified against source project',
      ],
    },
  };
}
