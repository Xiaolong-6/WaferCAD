import {
  adaptiveRoughMeshLod,
  allocateRoughTriangleBudgets,
} from './surface-rendering.js';
import {
  roughBoundaryEdgesFromTriangles,
  roughCapBaseTriangles,
  subdivideRoughBaseTriangles,
} from './rough-mesh-geometry.js';

export const MORPHOLOGY_EXPORT_TRIANGLE_HARD_CAP = 900000;

export function xyBoundsOfGeometry(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const polygon of geometry || []) {
    for (const ring of polygon || []) {
      for (const point of ring || []) {
        minX = Math.min(minX, Number(point?.[0]));
        minY = Math.min(minY, Number(point?.[1]));
        maxX = Math.max(maxX, Number(point?.[0]));
        maxY = Math.max(maxY, Number(point?.[1]));
      }
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite)
    ? { minX, minY, maxX, maxY }
    : null;
}

export function roughAxisDivisions(span, featureSize) {
  const features =
    Math.max(0, Number(span) || 0) / Math.max(1e-9, Number(featureSize) || 1);
  if (features >= 16) return 4;
  if (features >= 8) return 3;
  if (features >= 4) return 2;
  return 1;
}

export function triangleSetBounds(triangles) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const triangle of triangles || []) {
    for (const point of triangle || []) {
      minX = Math.min(minX, Number(point?.[0]));
      minY = Math.min(minY, Number(point?.[1]));
      maxX = Math.max(maxX, Number(point?.[0]));
      maxY = Math.max(maxY, Number(point?.[1]));
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite)
    ? { minX, minY, maxX, maxY }
    : null;
}

export function triangleSetMaxEdge(triangles) {
  let maxEdge = 0;
  for (const triangle of triangles || []) {
    for (const [a, b] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      maxEdge = Math.max(
        maxEdge,
        Math.hypot(Number(a?.[0]) - Number(b?.[0]), Number(a?.[1]) - Number(b?.[1])),
      );
    }
  }
  return maxEdge;
}

export function spatialBaseDepth(
  base,
  bounds,
  columns,
  rows,
  { maxDepth = 2, maxTriangles = 8192 } = {},
) {
  const cellSpan = Math.max(
      (bounds.maxX - bounds.minX) / Math.max(1, columns),
      (bounds.maxY - bounds.minY) / Math.max(1, rows),
      1e-9,
    ),
    desired = base.maxEdge > cellSpan ? Math.ceil(Math.log2(base.maxEdge / cellSpan)) : 0;
  let depth = Math.min(Math.max(0, Number(maxDepth) || 0), Math.max(0, desired));
  while (depth > 0 && base.triangles.length * 4 ** depth > maxTriangles) depth--;
  return depth;
}

export function buildRoughSpatialZones(THREE, cap) {
  const bounds = xyBoundsOfGeometry(cap?.polys),
    featureSize = cap?.appearance?.featureSize;
  if (!bounds || !cap?.polys?.length) return [];

  const base = roughCapBaseTriangles(THREE, cap.z, cap.normal, cap.polys);
  if (!base.triangles.length) return [];

  const columns = roughAxisDivisions(bounds.maxX - bounds.minX, featureSize),
    rows = roughAxisDivisions(bounds.maxY - bounds.minY, featureSize),
    depth = spatialBaseDepth(base, bounds, columns, rows),
    spatialTriangles = subdivideRoughBaseTriangles(base.triangles, depth),
    spanX = Math.max(1e-12, bounds.maxX - bounds.minX),
    spanY = Math.max(1e-12, bounds.maxY - bounds.minY),
    buckets = new Map();

  for (const triangle of spatialTriangles) {
    const cx = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      cy = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
      column = Math.max(
        0,
        Math.min(columns - 1, Math.floor(((cx - bounds.minX) / spanX) * columns)),
      ),
      row = Math.max(
        0,
        Math.min(rows - 1, Math.floor(((cy - bounds.minY) / spanY) * rows)),
      ),
      key = `${row}|${column}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(triangle);
  }

  return [...buckets.values()].map((baseTriangles) => ({
    polys: null,
    bounds: triangleSetBounds(baseTriangles),
    baseTriangles,
    maxEdge: triangleSetMaxEdge(baseTriangles),
    edges: roughBoundaryEdgesFromTriangles(baseTriangles),
  }));
}

function exportLodContext(appearance, zone) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1);
  return {
    distance: Math.max(feature * 3, 1e-9),
    viewportWidth: 4096,
    viewportHeight: 4096,
    pixelRatio: 1,
    fovDegrees: 34,
    visibleFraction: 1,
    roiFraction: 1,
    screenPriority: 1,
    maxDepth: 10,
    patchBounds: zone.bounds,
  };
}

export function prepareMorphologyExportTasks(
  THREE,
  roughCaps,
  { totalTriangleBudget = MORPHOLOGY_EXPORT_TRIANGLE_HARD_CAP } = {},
) {
  const tasks = [];
  for (const cap of roughCaps || []) {
    const zones = buildRoughSpatialZones(THREE, cap);
    if (!zones.length) continue;
    const zoneEntries = zones.map((zone) => {
      const context = exportLodContext(cap.appearance, zone),
        preview = adaptiveRoughMeshLod({
          triangleCount: zone.baseTriangles.length,
          maxEdge: zone.maxEdge,
          featureSize: cap.appearance?.featureSize,
          ...context,
        });
      return { zone, context, preview };
    });
    tasks.push({ cap, zoneEntries });
  }

  const requests = tasks.flatMap((task) =>
      task.zoneEntries.map(({ zone, preview }) => ({
        baseTriangles: zone.baseTriangles.length,
        desiredTriangles: preview.desiredTriangles,
        priority: 1,
      })),
    ),
    hardBudget = Math.max(
      1,
      Math.floor(Number(totalTriangleBudget) || MORPHOLOGY_EXPORT_TRIANGLE_HARD_CAP),
    ),
    minimumTriangles = requests.reduce(
      (sum, request) => sum + Math.max(1, Math.floor(Number(request.baseTriangles) || 1)),
      0,
    );

  if (minimumTriangles > hardBudget) {
    throw new RangeError(
      `Morphology export needs at least ${minimumTriangles.toLocaleString()} base triangles, exceeding the ${hardBudget.toLocaleString()} triangle hard cap. Narrow the 3D ROI or simplify the visible morphology before exporting.`,
    );
  }

  const budgets = allocateRoughTriangleBudgets(requests, { totalBudget: hardBudget });

  let index = 0;
  return tasks.map((task) => ({
    cap: task.cap,
    lodZones: task.zoneEntries.map(({ zone, context }) => ({
      ...zone,
      lodContext: context,
      triangleBudget: budgets[index++],
    })),
  }));
}
