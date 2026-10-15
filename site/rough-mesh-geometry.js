import {
  canonicalLineInterval,
  lineIntervalKey,
  localParameterAtLineT,
  partitionLineIntervals,
} from './line-intervals.js';
import { adaptiveRoughMeshLod, roughProfileOffsetAtPoint } from './surface-rendering.js';
import { triangulatePolygon } from './polygon-triangulation.js';

function triangleNormal(a, b, c) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2],
    nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx,
    length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

export function roughCapBaseTriangles(THREE, z, normal, polys) {
  const triangles = [];
  let maxEdge = 0;
  for (const poly of polys || []) {
    for (const triangle2d of triangulatePolygon(THREE, poly)) {
      let [a, b, c] = triangle2d.map(([x, y]) => [x, y, z]);
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross * normal < 0) [b, c] = [c, b];
      triangles.push([a, b, c]);
      maxEdge = Math.max(
        maxEdge,
        Math.hypot(a[0] - b[0], a[1] - b[1]),
        Math.hypot(b[0] - c[0], b[1] - c[1]),
        Math.hypot(c[0] - a[0], c[1] - a[1]),
      );
    }
  }
  return { triangles, maxEdge };
}

export function subdivideRoughBaseTriangles(triangles, depth) {
  let current = triangles;
  for (let level = 0; level < depth; level++) {
    const next = [];
    for (const [a, b, c] of current) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]],
        bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, b[2]],
        ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, c[2]];
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    current = next;
  }
  return current;
}

export function roughBoundaryEdgesFromTriangles(triangles) {
  const entries = new Map();
  const coordinateKey = (value) => Number(value).toPrecision(15);
  const pointKey = (point) => `${coordinateKey(point[0])},${coordinateKey(point[1])}`;

  for (const triangle of triangles || []) {
    if (!Array.isArray(triangle) || triangle.length !== 3) continue;
    for (const [p, q] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      const line = canonicalLineInterval(p, q);
      if (!line) continue;
      const a = pointKey(p),
        b = pointKey(q),
        segmentKey = a < b ? `${a}|${b}` : `${b}|${a}`,
        existing = entries.get(segmentKey);
      if (existing) {
        existing.count++;
      } else {
        entries.set(segmentKey, {
          count: 1,
          edge: { p, q, line, key: lineIntervalKey(line) },
        });
      }
    }
  }

  return [...entries.values()].filter((entry) => entry.count === 1).map((entry) => entry.edge);
}

function roughPoint(point, z, profileNormal, appearance) {
  return [
    Math.fround(point[0]),
    Math.fround(point[1]),
    Math.fround(
      z +
        profileNormal *
          roughProfileOffsetAtPoint(Math.fround(point[0]), Math.fround(point[1]), appearance),
    ),
  ];
}

function roughPointNormal(point, normal, profileNormal, appearance) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    step = Math.max(1e-6, feature * 0.08),
    dx =
      (roughProfileOffsetAtPoint(point[0] + step, point[1], appearance) -
        roughProfileOffsetAtPoint(point[0] - step, point[1], appearance)) /
      (2 * step),
    dy =
      (roughProfileOffsetAtPoint(point[0], point[1] + step, appearance) -
        roughProfileOffsetAtPoint(point[0], point[1] - step, appearance)) /
      (2 * step),
    length = Math.hypot(dx, dy, 1) || 1,
    slopeSign = normal * profileNormal;
  return [(-slopeSign * dx) / length, (-slopeSign * dy) / length, normal / length];
}

// Edge samples are already sorted by the canonical line parameter. A given
// spatial edge can be queried by many LOD subsegments: bound the search to the
// requested interval instead of repeatedly scanning the entire shared edge.
export function roughEdgeSamplesInInterval(samples, t0, t1, { interior = false } = {}) {
  if (!samples?.length) return [];
  const epsilon = 1e-10,
    lower = Math.min(t0, t1) + (interior ? epsilon : -epsilon),
    upper = Math.max(t0, t1) + (interior ? -epsilon : epsilon);
  if (lower > upper) return [];
  // Interior queries are strict; boundary queries are inclusive.
  const bound = (threshold, strict) => {
    let low = 0,
      high = samples.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (strict ? samples[middle][0] <= threshold : samples[middle][0] < threshold)
        low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const start = bound(lower, interior),
    end = bound(upper, !interior);
  return samples.slice(start, end);
}

export function roughMeshDataFromPreparedCap({
  z,
  normal,
  polys,
  appearance,
  closeToIdeal = true,
  sidewallBoundaryIntervals = [],
  lodContext = {},
  lodZones = null,
  profileNormal = normal,
  analyticNormals = true,
  gpuDisplacement = false,
}) {
  const zones = Array.isArray(lodZones) && lodZones.length ? lodZones : [{ polys, lodContext }],
    positions = [],
    normals = [],
    gpuDisplace = [],
    roughBorderPositions = [],
    roughBoundaryPositions = [],
    zoneResults = [],
    boundaryPoints = new Map(),
    boundaryByX = new Map(),
    pointKeys = new WeakMap(),
    keyForPoint = (point) => {
      let key = pointKeys.get(point);
      if (key == null) {
        key = `${Math.fround(point[0])},${Math.fround(point[1])}`;
        pointKeys.set(point, key);
      }
      return key;
    },
    pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  let maxDepth = 0,
    skippedDegenerateTriangles = 0;

  // Cap-local memoization only; canonical geometry and the heightfield are
  // unchanged. Cap entries are discarded with this mesh task and capped to
  // bound transient memory on large detailed rough surfaces.
  const roughSampleCache = new Map();
  const roughSample = (point) => {
    const x = Math.fround(point[0]),
      y = Math.fround(point[1]),
      key = `${x},${y}`;
    let sample = roughSampleCache.get(key);
    if (!sample) {
      sample = { point: roughPoint([x, y, z], z, profileNormal, appearance), normal: null };
      if (roughSampleCache.size < 131072) {
        roughSampleCache.set(key, sample);
      }
    }
    return sample.point;
  };
  const roughNormal = (point) => {
    const key = `${Math.fround(point[0])},${Math.fround(point[1])}`;
    const sample = roughSampleCache.get(key);
    if (!sample) return roughPointNormal(point, normal, profileNormal, appearance);
    if (!sample.normal) {
      sample.normal = roughPointNormal(sample.point, normal, profileNormal, appearance);
    }
    return sample.normal;
  };

  const polygonEdges = (zonePolys) => {
      const edges = [];
      for (const poly of zonePolys || []) {
        for (const closed of poly || []) {
          const ring =
            closed.length > 1 &&
            closed[0][0] === closed.at(-1)[0] &&
            closed[0][1] === closed.at(-1)[1]
              ? closed.slice(0, -1)
              : closed.slice();
          for (let index = 0; index < ring.length; index++) {
            const p = ring[index],
              q = ring[(index + 1) % ring.length],
              line = canonicalLineInterval(p, q);
            if (!line) continue;
            edges.push({ p, q, line, key: lineIntervalKey(line) });
          }
        }
      }
      return edges;
    },
    globalTAtLocal = (line, t) =>
      line.forward ? line.t0 + (line.t1 - line.t0) * t : line.t1 - (line.t1 - line.t0) * t,
    pushTriangle = (a, b, c) => {
      [a, b, c] = [a, b, c].map((point) => point.map(Math.fround));
      const faceNormal = triangleNormal(a, b, c);
      if (faceNormal.every((value) => value === 0)) {
        skippedDegenerateTriangles++;
        return;
      }
      positions.push(...a, ...b, ...c);
      normals.push(...faceNormal, ...faceNormal, ...faceNormal);
      gpuDisplace.push(-1, -1, -1);
    },
    pushRoughTriangle = (a, b, c) => {
      if (!analyticNormals) {
        pushTriangle(a, b, c);
        return;
      }
      positions.push(...a, ...b, ...c);
      normals.push(...roughNormal(a), ...roughNormal(b), ...roughNormal(c));
      gpuDisplace.push(0, 0, 0);
    },
    pushGpuRoughTriangle = (a, b, c) => {
      const av = boundaryByX.get(Math.fround(a[0]))?.get(Math.fround(a[1])),
        bv = boundaryByX.get(Math.fround(b[0]))?.get(Math.fround(b[1])),
        cv = boundaryByX.get(Math.fround(c[0]))?.get(Math.fround(c[1]));
      positions.push(...(av || a), ...(bv || b), ...(cv || c));
      normals.push(0, 0, normal, 0, 0, normal, 0, 0, normal);
      gpuDisplace.push(av ? 0 : 1, bv ? 0 : 1, cv ? 0 : 1);
    },
    pointAlongEdge = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, z];

  for (const zone of zones) {
    if (!Array.isArray(zone.baseTriangles) || !zone.baseTriangles.length) continue;
    const baseTriangles = zone.baseTriangles,
      maxEdge = Math.max(0, Number(zone.maxEdge) || 0),
      lod = adaptiveRoughMeshLod({
        triangleCount: baseTriangles.length,
        maxEdge,
        featureSize: appearance?.featureSize,
        ...(zone.lodContext || lodContext),
        triangleBudget: zone.triangleBudget ?? null,
      }),
      depth = lod.depth,
      edges = Array.isArray(zone.edges) ? zone.edges : polygonEdges(zone.polys);
    maxDepth = Math.max(maxDepth, depth);
    zoneResults.push({ ...zone, depth, lod, edges });
  }

  const edgeOwners = new Map();
  zoneResults.forEach((zone, zoneIndex) => {
    for (const edge of zone.edges) {
      if (!edgeOwners.has(edge.key)) edgeOwners.set(edge.key, []);
      edgeOwners.get(edge.key).push({ zoneIndex, edge, line: edge.line });
    }
  });

  const seamSpans = [],
    seamSpansByKey = new Map();
  for (const [key, owners] of edgeOwners) {
    for (const span of partitionLineIntervals(owners)) {
      const zonesOnSpan = new Set(span.covering.map((owner) => owner.zoneIndex));
      if (zonesOnSpan.size < 2) continue;
      const seam = { key, ...span };
      seamSpans.push(seam);
      if (!seamSpansByKey.has(key)) seamSpansByKey.set(key, []);
      seamSpansByKey.get(key).push(seam);
    }
  }

  const edgeSeams = (edge) => seamSpansByKey.get(edge.key) || [],
    isSeamAt = (edge, globalT) =>
      edgeSeams(edge).some((span) => globalT >= span.t0 - 1e-10 && globalT <= span.t1 + 1e-10),
    hasPhysicalSidewallAt = (edge, globalT) =>
      (sidewallBoundaryIntervals || []).some(
        (span) =>
          span?.key === edge.key &&
          globalT >= Number(span.t0) - 1e-10 &&
          globalT <= Number(span.t1) + 1e-10,
      );

  // Adjacent patches share the same Float32 boundary samples. Refine only
  // triangles touching another patch's edge; never add a vertical seam sheet.
  const samplesByKey = new Map();
  for (const zone of zoneResults) {
    for (const edge of zone.edges) {
      if (!samplesByKey.has(edge.key)) samplesByKey.set(edge.key, new Map());
      const samples = samplesByKey.get(edge.key),
        segments = 2 ** zone.depth;
      for (let step = 0; step <= segments; step++) {
        const t = step / segments,
          globalT = globalTAtLocal(edge.line, t);
        samples.set(globalT, pointAlongEdge(edge.p, edge.q, t));
      }
      for (const span of sidewallBoundaryIntervals || []) {
        if (span.key !== edge.key) continue;
        for (const globalT of [span.t0, span.t1]) {
          if (globalT < edge.line.t0 || globalT > edge.line.t1) continue;
          samples.set(
            globalT,
            pointAlongEdge(edge.p, edge.q, localParameterAtLineT(edge.line, globalT)),
          );
        }
      }
    }
  }
  const orderedSamples = new Map(
    [...samplesByKey].map(([key, samples]) => [key, [...samples].sort((a, b) => a[0] - b[0])]),
  );
  for (const samples of orderedSamples.values()) {
    for (const [, point] of samples) {
      const key = keyForPoint(point);
      if (!boundaryPoints.has(key)) {
        const value = roughPoint(point, z, profileNormal, appearance);
        boundaryPoints.set(key, value);
        if (!boundaryByX.has(value[0])) boundaryByX.set(value[0], new Map());
        boundaryByX.get(value[0]).set(value[1], value);
      }
    }
  }
  let conformingExtraTriangles = 0;
  for (const zone of zoneResults) {
    const splitEdges = new Map(),
      segments = 2 ** zone.depth;
    for (const edge of zone.edges) {
      for (let step = 0; step < segments; step++) {
        const a = pointAlongEdge(edge.p, edge.q, step / segments),
          b = pointAlongEdge(edge.p, edge.q, (step + 1) / segments),
          t0 = globalTAtLocal(edge.line, step / segments),
          t1 = globalTAtLocal(edge.line, (step + 1) / segments),
          samples = roughEdgeSamplesInInterval(orderedSamples.get(edge.key), t0, t1, {
            interior: true,
          });
        if (!samples.length) continue;
        if (!edge.line.forward) samples.reverse();
        const aKey = keyForPoint(a),
          bKey = keyForPoint(b);
        splitEdges.set(pairKey(aKey, bKey), {
          from: aKey,
          points: samples.map(([, point]) => point),
        });
      }
    }
    for (const triangle of subdivideRoughBaseTriangles(zone.baseTriangles, zone.depth)) {
      const polygon = splitEdges.size ? [] : triangle;
      if (splitEdges.size)
        for (let index = 0; index < 3; index++) {
          const a = triangle[index],
            b = triangle[(index + 1) % 3],
            aKey = keyForPoint(a),
            split = splitEdges.get(pairKey(aKey, keyForPoint(b)));
          polygon.push(a);
          if (split)
            polygon.push(...(aKey === split.from ? split.points : split.points.slice().reverse()));
        }
      // A center fan avoids collinear ears when more than one edge is split.
      const triangles =
        polygon.length === 3
          ? [triangle]
          : polygon.map((point, index) => [
              point,
              polygon[(index + 1) % polygon.length],
              [
                (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
                (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
                z,
              ],
            ]);
      conformingExtraTriangles += triangles.length - 1;
      for (const [a, b, c] of triangles) {
        if (gpuDisplacement) pushGpuRoughTriangle(a, b, c);
        else pushRoughTriangle(roughSample(a), roughSample(b), roughSample(c));
      }
    }
    for (const edge of zone.edges) {
      const samples = roughEdgeSamplesInInterval(
        orderedSamples.get(edge.key),
        edge.line.t0,
        edge.line.t1,
      );
      if (!edge.line.forward) samples.reverse();
      for (let index = 0; index < samples.length - 1; index++) {
        const [g0, point0] = samples[index],
          [g1, point1] = samples[index + 1],
          middleGlobalT = (g0 + g1) / 2;
        if (isSeamAt(edge, middleGlobalT)) continue;
        const top0 = boundaryPoints.get(keyForPoint(point0)),
          top1 = boundaryPoints.get(keyForPoint(point1));
        roughBoundaryPositions.push(...top0, ...top1);
        if (!closeToIdeal) continue;
        if (!hasPhysicalSidewallAt(edge, middleGlobalT)) {
          pushTriangle(point0, point1, top1);
          pushTriangle(point0, top1, top0);
        }
        roughBorderPositions.push(...top0, ...top1);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    gpuDisplace: gpuDisplacement ? new Float32Array(gpuDisplace) : new Float32Array(),
    roughBorderPositions: new Float32Array(roughBorderPositions),
    roughBoundaryPositions: new Float32Array(roughBoundaryPositions),
    metadata: {
      roughGpuDisplacement: Boolean(gpuDisplacement),
      roughConformingExtraTriangles: conformingExtraTriangles,
      roughSkippedDegenerateTriangles: skippedDegenerateTriangles,
      roughSubdivisionDepth: maxDepth,
      roughLod: zoneResults.map((zone) => zone.lod),
      roughLodZoneCount: zoneResults.length,
      roughLodStitchCount: seamSpans.length,
      roughSubdivisionTriangleCount: zoneResults.reduce(
        (sum, zone) => sum + zone.lod.estimatedTriangles,
        0,
      ),
    },
  };
}

export function geometryFromRoughMeshData(THREE, data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(data?.positions || new Float32Array(), 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(data?.normals || new Float32Array(), 3),
  );
  const gpuDisplace = data?.gpuDisplace || new Float32Array(),
    positionCount = Math.floor((data?.positions?.length || 0) / 3);
  if (gpuDisplace.length > 0 && gpuDisplace.length === positionCount) {
    geometry.setAttribute('waferCadGpuDisplace', new THREE.Float32BufferAttribute(gpuDisplace, 1));
  }
  const metadata = data?.metadata || {};
  geometry.userData.roughSubdivisionDepth = Number(metadata.roughSubdivisionDepth) || 0;
  geometry.userData.roughGpuDisplacement = Boolean(metadata.roughGpuDisplacement);
  geometry.userData.roughLod = Array.isArray(metadata.roughLod) ? metadata.roughLod : [];
  geometry.userData.roughBorderPositions = data?.roughBorderPositions || new Float32Array();
  geometry.userData.roughBoundaryPositions = data?.roughBoundaryPositions || new Float32Array();
  geometry.userData.roughConformingExtraTriangles =
    Number(metadata.roughConformingExtraTriangles) || 0;
  geometry.userData.roughSkippedDegenerateTriangles =
    Number(metadata.roughSkippedDegenerateTriangles) || 0;
  geometry.userData.roughLodZoneCount = Number(metadata.roughLodZoneCount) || 0;
  geometry.userData.roughLodStitchCount = Number(metadata.roughLodStitchCount) || 0;
  geometry.userData.roughSubdivisionTriangleCount =
    Number(metadata.roughSubdivisionTriangleCount) || 0;
  return geometry;
}

export function geometryFromRoughCap(
  THREE,
  {
    z,
    normal,
    polys,
    appearance,
    closeToIdeal = true,
    sidewallBoundaryIntervals = [],
    lodContext = {},
    lodZones = null,
    profileNormal = normal,
    analyticNormals = true,
    gpuDisplacement = false,
  },
) {
  const sourceZones =
      Array.isArray(lodZones) && lodZones.length ? lodZones : [{ polys, lodContext }],
    preparedZones = sourceZones.map((zone) => {
      if (
        Array.isArray(zone.baseTriangles) &&
        zone.baseTriangles.length &&
        Number.isFinite(zone.maxEdge)
      ) {
        return {
          ...zone,
          edges: Array.isArray(zone.edges)
            ? zone.edges
            : roughBoundaryEdgesFromTriangles(zone.baseTriangles),
        };
      }
      const base = roughCapBaseTriangles(THREE, z, normal, zone.polys);
      return {
        ...zone,
        baseTriangles: base.triangles,
        maxEdge: base.maxEdge,
        edges: roughBoundaryEdgesFromTriangles(base.triangles),
      };
    }),
    data = roughMeshDataFromPreparedCap({
      z,
      normal,
      polys,
      appearance,
      closeToIdeal,
      sidewallBoundaryIntervals,
      lodContext,
      lodZones: preparedZones,
      profileNormal,
      analyticNormals,
      gpuDisplacement,
    });
  return geometryFromRoughMeshData(THREE, data);
}
