// Exact-section cut faces for a rectangular 3D inspection ROI. The analytic
// material owner remains untouched; these triangles are disposable display data.
import { continuousSectionContours } from './continuous-etch-section.js';

export function buildContinuousRectRoiCaps(THREE, model, bounds) {
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;
  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const byLayer = new Map();
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge],
      b = corners[(edge + 1) % 4];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    const normal = [dy / length, -dx / length, 0];
    for (const { layerId, polys } of continuousSectionContours(model, a, b, {
      maxStepUm: 0.6,
    })) {
      if (!byLayer.has(layerId)) byLayer.set(layerId, { positions: [], normals: [] });
      const part = byLayer.get(layerId);
      for (const polygon of polys) {
        const rings = polygon.map((ring) =>
          ring.slice(0, -1).map(([t, z]) => new THREE.Vector2(t, z)),
        );
        if (rings[0]?.length < 3) continue;
        const vertices = rings.flat();
        for (const triangle of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
          for (const i of triangle) {
            const p = vertices[i];
            part.positions.push(a[0] + p.x * dx, a[1] + p.x * dy, p.y);
            part.normals.push(...normal);
          }
        }
      }
    }
  }
  return [...byLayer]
    .map(([layerId, value]) => ({
      layerId,
      positions: Float32Array.from(value.positions),
      normals: Float32Array.from(value.normals),
      triangles: value.positions.length / 9,
    }))
    .filter((part) => part.triangles > 0);
}
