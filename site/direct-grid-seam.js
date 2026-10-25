import { bufferPolyline, difference, isEmpty, unionGeometries } from './vector-geometry.js';

/**
 * A safe-to-reassign Direct Boolean seam must be narrow everywhere, not just
 * have low average area/perimeter. Long thin tails can hide a real 2D pocket.
 *
 * Fail closed if any polygon retains an interior core after buffering every
 * exterior/hole boundary by 1.5 persistence-grid cells. The polygonal buffer
 * is an inward approximation of the ideal circular offset, so a surviving core
 * cannot be discarded as a grid seam. The area/perimeter screen avoids the
 * relatively expensive offset computation for obviously broad polygons.
 */
export function isFixedDirectGridSeam(geometry, gridUm, polygonArea) {
  if (!(Number.isFinite(gridUm) && gridUm > 0)) throw new RangeError('Positive grid required.');
  if (typeof polygonArea !== 'function') throw new TypeError('Area function required.');
  if (!Array.isArray(geometry) || geometry.length === 0) return false;
  const radius = gridUm * 1.5;
  for (const polygon of geometry) {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    let perimeter = 0;
    const buffers = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      for (let i = 1; i < ring.length; i++) {
        const [x0, y0] = ring[i - 1];
        const [x1, y1] = ring[i];
        if (![x0, y0, x1, y1].every(Number.isFinite)) return false;
        perimeter += Math.hypot(x1 - x0, y1 - y0);
      }
      buffers.push(bufferPolyline(ring.slice(0, -1), radius, 8, true));
    }
    if (!(perimeter > 0)) return false;
    const area = polygonArea([polygon]);
    if (!(Number.isFinite(area) && area > 0)) return false;
    if ((2 * area) / perimeter > gridUm * 2 + 1e-10) return false;
    if (!isEmpty(difference([polygon], unionGeometries(buffers)))) return false;
  }
  return true;
}
