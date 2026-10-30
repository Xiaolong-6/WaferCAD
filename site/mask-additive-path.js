/**
 * Build one additive Canvas path for a GDS layer without modifying the
 * original polygons. GDS BOUNDARY elements have one contour each; normalizing
 * winding prevents a nonzero fill from canceling overlapping source shapes.
 * This is a view-only silhouette, not a Boolean geometry replacement.
 *
 * Caller owns beginPath() and a SINGLE fill() after appending all elements.
 */
export function appendAdditiveMaskPolygons(ctx, elements, projectPoint) {
  let appended = 0;
  for (const element of elements) {
    if (element.kind !== 'polygon' || element.points?.length < 3) continue;
    const points = element.points;
    let signedTwiceArea = 0;
    for (let index = 0; index < points.length; index++) {
      const [ax, ay] = points[index];
      const [bx, by] = points[(index + 1) % points.length];
      signedTwiceArea += ax * by - bx * ay;
    }
    for (let index = 0; index < points.length; index++) {
      const point = points[signedTwiceArea < 0 ? points.length - 1 - index : index];
      const [x, y] = projectPoint(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    appended++;
  }
  return appended;
}

/**
 * Append topology-merged physical GDS layer contours, including true holes.
 * The geometry is precomputed once from the original author polygons by the
 * example generator. Never re-run Boolean union on interactive zoom/pan.
 */
export function appendUnionMaskPolygons(ctx, silhouette, projectPoint) {
  let rings = 0;
  for (const polygon of silhouette || []) {
    for (const ring of polygon || []) {
      if (ring.length < 4) continue;
      ring.forEach((point, index) => {
        const [x, y] = projectPoint(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      rings++;
    }
  }
  return rings;
}

/**
 * Keep display-only merged GDS outlines in a native world-coordinate Path2D.
 * This avoids reprojecting 176k Layer-12 union vertices on every pan/zoom.
 * Cache entries are tied to the imported silhouette array's identity.
 * The original GDS elements and material model are never altered.
 */
const nativeUnionPathCache = new WeakMap();

export function cachedUnionMaskPath(silhouette) {
  if (typeof Path2D !== 'function' || !Array.isArray(silhouette)) return null;
  const cached = nativeUnionPathCache.get(silhouette);
  if (cached) return cached;
  const path = new Path2D();
  let rings = 0;
  for (const polygon of silhouette) {
    for (const ring of polygon || []) {
      if (ring.length < 4) continue;
      ring.forEach(([x, y], index) => {
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
      rings++;
    }
  }
  const result = { path, rings };
  nativeUnionPathCache.set(silhouette, result);
  return result;
}
