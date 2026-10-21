import { simplifyDisplayPolygons } from './renderer-line-reduction.js';

// Display-only first-frame sketch. It MUST NOT be used as an owned surface plan,
// canonical geometry, collision/query input, or export geometry. In particular,
// intersecting regions and buried interfaces are not Boolean-resolved here.
const MAX_PREVIEW_CAPS = 4096;
const MAX_PREVIEW_POINTS = 120000;
const MAX_PREVIEW_LINES = 120000;
// Conservative 3 nm display-only reduction; scientific contours are untouched.
const PREVIEW_CONTOUR_TOLERANCE_UM = 0.003;

export function buildProgressiveSurfacePreview(model, clip = null) {
  // A clipped or array model needs its exact ownership/instance-aware path.
  // Never display uncut polygons when an ROI was requested.
  if (clip || !Array.isArray(model?.regions) || model?.array) return null;
  const visible = new Set(
    (model.layers || []).filter((layer) => layer.visible !== false).map((layer) => layer.id),
  );
  const caps = [];
  // Transferable display buffer: avoid thousands of nested JS line arrays
  // and their expensive Worker structured clone.
  const borderPositions = [];
  let lineCount = 0;
  let pointCount = 0;
  for (const region of model.regions) {
    const stack = (region.stack || []).filter((segment) => visible.has(segment.layerId));
    if (!stack.length) continue;
    const polys = region.geom;
    if (!Array.isArray(polys) || !polys.length) continue;
    if (caps.length + 2 > MAX_PREVIEW_CAPS) return null;
    // Each region is already an independently validated polygon. Select only
    // its outermost visible faces; exact interface ownership comes later.
    const bottom = stack[0];
    const top = stack[stack.length - 1];
    if (![bottom.z0, top.z1].every(Number.isFinite)) return null;
    // Validate the original model before any potentially expensive LOD work.
    // The caps and edge strokes below share only disposable reduced coordinates.
    for (const poly of polys) {
      if (!Array.isArray(poly) || !poly.length) return null;
      for (const ring of poly) {
        if (!Array.isArray(ring) || ring.length < 4) return null;
        pointCount += ring.length;
        if (pointCount > MAX_PREVIEW_POINTS) return null;
        for (const point of ring) {
          if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
            return null;
        }
      }
    }
    const previewPolys = simplifyDisplayPolygons(polys, PREVIEW_CONTOUR_TOLERANCE_UM);
    for (const poly of previewPolys) {
      for (const ring of poly) {
        // Dense contours are accurate caps, but their illustrative vertical
        // strokes are sampled to keep the approximate first frame responsive.
        const verticalStride = Math.max(1, Math.ceil((ring.length - 1) / 8));
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1],
            b = ring[i];
          borderPositions.push(a[0], a[1], top.z1, b[0], b[1], top.z1);
          lineCount++;
          // The vertical strokes communicate height but are not Boolean-owned
          // exterior walls. Use each polygon vertex once, not a sidewall mesh.
          if (top.z1 !== bottom.z0 && (i - 1) % verticalStride === 0) {
            borderPositions.push(a[0], a[1], bottom.z0, a[0], a[1], top.z1);
            lineCount++;
          }
          if (lineCount > MAX_PREVIEW_LINES) return null;
        }
      }
    }
    caps.push({ layerId: top.layerId, z: top.z1, normal: 1, polys: previewPolys });
    caps.push({ layerId: bottom.layerId, z: bottom.z0, normal: -1, polys: previewPolys });
  }
  if (!caps.length) return null;
  return {
    kind: 'approximate-caps-preview',
    caps,
    borderPositions: new Float32Array(borderPositions),
    lineCount,
  };
}
