import {
  canonicalLineInterval,
  lineIntervalKey,
  localParameterAtLineT,
  partitionLineIntervals,
  pointAtLineT,
} from './line-intervals.js';
import { adaptiveRoughMeshLod, roughProfileOffsetAtPoint } from './surface-rendering.js';
import { isEmpty } from './vector-geometry.js';

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
    const rings = poly.map((ring) =>
        ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)),
      ),
      points = rings.flat();
    if (!rings[0]?.length) continue;
    for (const indices of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
      let [a, b, c] = indices.map((index) => [points[index].x, points[index].y, z]);
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

function subdivideTriangles(triangles, depth) {
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

function roughPoint(point, z, profileNormal, appearance) {
  return [
    point[0],
    point[1],
    z + profileNormal * roughProfileOffsetAtPoint(point[0], point[1], appearance),
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

export function geometryFromRoughCap(
  THREE,
  {
    z,
    normal,
    polys,
    appearance,
    closeToIdeal = true,
    lodContext = {},
    lodZones = null,
    profileNormal = normal,
  },
) {
  const zones = Array.isArray(lodZones) && lodZones.length ? lodZones : [{ polys, lodContext }],
    positions = [],
    normals = [],
    roughBorderPositions = [],
    zoneResults = [];
  let maxDepth = 0;

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
      line.forward
        ? line.t0 + (line.t1 - line.t0) * t
        : line.t1 - (line.t1 - line.t0) * t,
    pushTriangle = (a, b, c) => {
      const faceNormal = triangleNormal(a, b, c);
      positions.push(...a, ...b, ...c);
      normals.push(...faceNormal, ...faceNormal, ...faceNormal);
    },
    pushRoughTriangle = (a, b, c) => {
      positions.push(...a, ...b, ...c);
      normals.push(
        ...roughPointNormal(a, normal, profileNormal, appearance),
        ...roughPointNormal(b, normal, profileNormal, appearance),
        ...roughPointNormal(c, normal, profileNormal, appearance),
      );
    },
    pointAlongEdge = (p, q, t) => [
      p[0] + (q[0] - p[0]) * t,
      p[1] + (q[1] - p[1]) * t,
      z,
    ],
    roughAlongEdge = (p, q, t) =>
      roughPoint(pointAlongEdge(p, q, t), z, profileNormal, appearance),
    coarseApproxAlongEdge = (p, q, t, coarseDepth) => {
      const segments = 2 ** coarseDepth,
        scaled = Math.max(0, Math.min(segments, t * segments)),
        index = Math.min(segments - 1, Math.floor(scaled)),
        local = Math.max(0, Math.min(1, scaled - index)),
        a = roughAlongEdge(p, q, index / segments),
        b = roughAlongEdge(p, q, (index + 1) / segments);
      return [
        a[0] + (b[0] - a[0]) * local,
        a[1] + (b[1] - a[1]) * local,
        a[2] + (b[2] - a[2]) * local,
      ];
    };

  for (const zone of zones) {
    if (isEmpty(zone.polys)) continue;
    const base =
        Array.isArray(zone.baseTriangles) && Number.isFinite(zone.maxEdge)
          ? { triangles: zone.baseTriangles, maxEdge: zone.maxEdge }
          : roughCapBaseTriangles(THREE, z, normal, zone.polys),
      baseTriangles = base.triangles,
      maxEdge = base.maxEdge,
      lod = adaptiveRoughMeshLod({
        triangleCount: baseTriangles.length,
        maxEdge,
        featureSize: appearance?.featureSize,
        ...(zone.lodContext || lodContext),
        triangleBudget: zone.triangleBudget ?? null,
      }),
      depth = lod.depth,
      triangles = subdivideTriangles(baseTriangles, depth),
      edges = polygonEdges(zone.polys);
    maxDepth = Math.max(maxDepth, depth);
    zoneResults.push({ ...zone, depth, lod, edges });

    for (const [a, b, c] of triangles) {
      pushRoughTriangle(
        roughPoint(a, z, profileNormal, appearance),
        roughPoint(b, z, profileNormal, appearance),
        roughPoint(c, z, profileNormal, appearance),
      );
    }
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
      edgeSeams(edge).some(
        (span) => globalT >= span.t0 - 1e-10 && globalT <= span.t1 + 1e-10,
      );

  if (closeToIdeal) {
    zoneResults.forEach((zone) => {
      const edgeSegments = 2 ** zone.depth;
      for (const edge of zone.edges) {
        const params = new Set(
          Array.from({ length: edgeSegments + 1 }, (_, index) => index / edgeSegments),
        );
        for (const seam of edgeSeams(edge)) {
          if (seam.t0 > edge.line.t0 + 1e-10 && seam.t0 < edge.line.t1 - 1e-10) {
            params.add(localParameterAtLineT(edge.line, seam.t0));
          }
          if (seam.t1 > edge.line.t0 + 1e-10 && seam.t1 < edge.line.t1 - 1e-10) {
            params.add(localParameterAtLineT(edge.line, seam.t1));
          }
        }
        const ordered = [...params].sort((a, b) => a - b);
        for (let index = 0; index < ordered.length - 1; index++) {
          const t0 = ordered[index],
            t1 = ordered[index + 1],
            middleGlobalT = globalTAtLocal(edge.line, (t0 + t1) / 2);
          if (isSeamAt(edge, middleGlobalT)) continue;
          const base0 = pointAlongEdge(edge.p, edge.q, t0),
            base1 = pointAlongEdge(edge.p, edge.q, t1),
            top0 = roughAlongEdge(edge.p, edge.q, t0),
            top1 = roughAlongEdge(edge.p, edge.q, t1);
          pushTriangle(base0, base1, top1);
          pushTriangle(base0, top1, top0);
          roughBorderPositions.push(...top0, ...top1);
        }
      }
    });
  }

  for (const seam of seamSpans) {
    const uniqueOwners = seam.covering.filter(
      (owner, index) =>
        seam.covering.findIndex((entry) => entry.zoneIndex === owner.zoneIndex) === index,
    );
    if (uniqueOwners.length < 2) continue;

    const sorted = uniqueOwners.sort(
        (a, b) => zoneResults[b.zoneIndex].depth - zoneResults[a.zoneIndex].depth,
      ),
      fine = sorted[0],
      coarse = sorted.at(-1),
      fineDepth = zoneResults[fine.zoneIndex].depth,
      coarseDepth = zoneResults[coarse.zoneIndex].depth;
    if (fineDepth <= coarseDepth) continue;

    const fineSpan = Math.max(1e-12, fine.edge.line.t1 - fine.edge.line.t0),
      seamFraction = Math.max(0, Math.min(1, (seam.t1 - seam.t0) / fineSpan)),
      fineSegments = Math.max(1, Math.ceil(2 ** fineDepth * seamFraction));
    for (let step = 0; step < fineSegments; step++) {
      const g0 = seam.t0 + ((seam.t1 - seam.t0) * step) / fineSegments,
        g1 = seam.t0 + ((seam.t1 - seam.t0) * (step + 1)) / fineSegments,
        xy0 = pointAtLineT(fine.edge.line, g0),
        xy1 = pointAtLineT(fine.edge.line, g1),
        fine0 = roughPoint([xy0[0], xy0[1], z], z, profileNormal, appearance),
        fine1 = roughPoint([xy1[0], xy1[1], z], z, profileNormal, appearance),
        coarse0 = coarseApproxAlongEdge(
          coarse.edge.p,
          coarse.edge.q,
          localParameterAtLineT(coarse.edge.line, g0),
          coarseDepth,
        ),
        coarse1 = coarseApproxAlongEdge(
          coarse.edge.p,
          coarse.edge.q,
          localParameterAtLineT(coarse.edge.line, g1),
          coarseDepth,
        );
      pushTriangle(coarse0, coarse1, fine1);
      pushTriangle(coarse0, fine1, fine0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.userData.roughSubdivisionDepth = maxDepth;
  geometry.userData.roughLod = zoneResults.map((zone) => zone.lod);
  geometry.userData.roughBorderPositions = roughBorderPositions;
  geometry.userData.roughLodZoneCount = zoneResults.length;
  geometry.userData.roughLodStitchCount = seamSpans.length;
  geometry.userData.roughSubdivisionTriangleCount = zoneResults.reduce(
    (sum, zone) => sum + zone.lod.estimatedTriangles,
    0,
  );
  return geometry;
}
