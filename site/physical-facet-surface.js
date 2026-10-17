// Experimental canonical facet geometry for #297.
// Pure opt-in owner adapter: does not change production Model/Renderer/History.
import { restorePhysicalPyramidOwner } from './physical-facet-owner.js';
import { samplePhysicalPyramidSlab } from './physical-facet-math.js';

const EPS = 1e-11;

function area2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function clip(poly, axis, limit, direction) {
  if (!poly.length) return [];
  const inside = (p) => direction * (p[axis] - limit) >= -EPS;
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length];
    const b = poly[i];
    const wasInside = inside(a);
    const isInside = inside(b);
    if (wasInside !== isInside) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < EPS) throw new RangeError('Degenerate physical clipping');
      const t = (limit - a[axis]) / delta;
      const crossing = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      crossing[axis] = limit;
      result.push(crossing);
    }
    if (isInside) result.push(b);
  }
  return result.filter(
    (p, i, all) =>
      Math.hypot(
        p[0] - all[(i + all.length - 1) % all.length][0],
        p[1] - all[(i + all.length - 1) % all.length][1],
      ) > EPS,
  );
}

function clipDomain(face, d) {
  let poly = clip(face, 0, d.minX, 1);
  poly = clip(poly, 0, d.maxX, -1);
  poly = clip(poly, 1, d.minY, 1);
  return clip(poly, 1, d.maxY, -1);
}

function onPerimeter(a, b, d) {
  return (
    (Math.abs(a[0] - d.minX) < EPS && Math.abs(b[0] - d.minX) < EPS) ||
    (Math.abs(a[0] - d.maxX) < EPS && Math.abs(b[0] - d.maxX) < EPS) ||
    (Math.abs(a[1] - d.minY) < EPS && Math.abs(b[1] - d.minY) < EPS) ||
    (Math.abs(a[1] - d.maxY) < EPS && Math.abs(b[1] - d.maxY) < EPS)
  );
}

function vertex(xy, owner, face) {
  const slab = samplePhysicalPyramidSlab(xy[0], xy[1], owner);
  return [xy[0], xy[1], face === 'top' ? slab.z1 : slab.z0];
}

// Closed experimental Si solid; no planar surrogate and no internal wall
// between neighboring cells. The mesh budget prevents accidental huge arrays.
export function physicalPyramidSolidMesh(owner, { maxCells = 256 } = {}) {
  const valid = restorePhysicalPyramidOwner(owner);
  const { domain, pitch, originX, originY } = valid;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 4096) {
    throw new RangeError('Invalid physical mesh cell budget');
  }
  const x0 = Math.floor((domain.minX - originX) / pitch + 0.5);
  const x1 = Math.ceil((domain.maxX - originX) / pitch + 0.5) - 1;
  const y0 = Math.floor((domain.minY - originY) / pitch + 0.5);
  const y1 = Math.ceil((domain.maxY - originY) / pitch + 0.5) - 1;
  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > maxCells) {
    throw new RangeError('Physical mesh cell budget exceeded');
  }

  const triangles = [];
  function add(face, points) {
    if (face !== 'side' && Math.abs(area2(...points)) <= EPS * EPS) return;
    triangles.push({ face, vertices: points });
  }

  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const x = originX + ix * pitch;
      const y = originY + iy * pitch;
      const half = pitch / 2;
      const center = [x, y];
      const ne = [x + half, y + half];
      const nw = [x - half, y + half];
      const sw = [x - half, y - half];
      const se = [x + half, y - half];
      for (const wedge of [
        [center, se, ne],
        [center, ne, nw],
        [center, nw, sw],
        [center, sw, se],
      ]) {
        const polygon = clipDomain(wedge, domain);
        if (polygon.length < 3) continue;
        for (let i = 1; i + 1 < polygon.length; i++) {
          const a = polygon[0];
          const b = polygon[i];
          const c = polygon[i + 1];
          if (area2(a, b, c) <= EPS * EPS) continue;
          add('top', [a, b, c].map((xy) => vertex(xy, valid, 'top')));
          add('bottom', [c, b, a].map((xy) => vertex(xy, valid, 'bottom')));
        }
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i];
          const b = polygon[(i + 1) % polygon.length];
          if (!onPerimeter(a, b, domain) || Math.hypot(b[0] - a[0], b[1] - a[1]) <= EPS) {
            continue;
          }
          const ta = vertex(a, valid, 'top');
          const tb = vertex(b, valid, 'top');
          const ba = vertex(a, valid, 'bottom');
          const bb = vertex(b, valid, 'bottom');
          add('side', [ta, ba, tb]);
          add('side', [ba, bb, tb]);
        }
      }
    }
  }
  return {
    kind: 'wafercad-physical-pyramid-mesh-v1',
    layerId: valid.layerId,
    domain: { ...domain },
    sourceCells: count,
    triangles,
  };
}

function segmentIntersections(a, b, c, d) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ex = d[0] - c[0];
  const ey = d[1] - c[1];
  const det = dx * ey - dy * ex;
  const rx = c[0] - a[0];
  const ry = c[1] - a[1];
  if (Math.abs(det) <= EPS) {
    if (Math.abs(rx * dy - ry * dx) > EPS) return [];
    const lengthSquared = dx * dx + dy * dy;
    return lengthSquared
      ? [(rx * dx + ry * dy) / lengthSquared, ((d[0] - a[0]) * dx + (d[1] - a[1]) * dy) / lengthSquared]
      : [];
  }
  const t = (rx * ey - ry * ex) / det;
  const u = (rx * dy - ry * dx) / det;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [t] : [];
}

// A/B must lie in the owner domain. Every returned breakpoint is a real
// 3D mesh facet-edge intersection, so intermediate heights are exact linear.
export function physicalPyramidSection(owner, a, b, options = {}) {
  const valid = restorePhysicalPyramidOwner(owner);
  for (const p of [a, b]) {
    if (!Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v))) {
      throw new RangeError('Finite Section XY endpoints required');
    }
    if (
      p[0] < valid.domain.minX ||
      p[0] > valid.domain.maxX ||
      p[1] < valid.domain.minY ||
      p[1] > valid.domain.maxY
    ) {
      throw new RangeError('Section endpoint outside physical owner');
    }
  }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.hypot(dx, dy) <= EPS) throw new RangeError('Section A-B collapsed');
  const mesh = physicalPyramidSolidMesh(valid, options);
  const parameters = [0, 1];
  for (const triangle of mesh.triangles) {
    if (triangle.face !== 'top') continue;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      for (const t of segmentIntersections(a, b, triangle.vertices[i], triangle.vertices[j])) {
        if (Number.isFinite(t) && t >= -EPS && t <= 1 + EPS) {
          parameters.push(Math.max(0, Math.min(1, t)));
        }
      }
    }
  }
  parameters.sort((x, y) => x - y);
  const unique = [];
  for (const t of parameters) {
    if (!unique.length || t - unique[unique.length - 1] > EPS) unique.push(t);
  }
  return {
    kind: 'wafercad-physical-pyramid-section-v1',
    layerId: valid.layerId,
    a: [...a],
    b: [...b],
    points: unique.map((t) => {
      const x = a[0] + dx * t;
      const y = a[1] + dy * t;
      const slab = samplePhysicalPyramidSlab(x, y, valid);
      return { t, x, y, z0: slab.z0, z1: slab.z1 };
    }),
  };
}

// Divergence theorem on a closed, consistently wound triangle boundary.
export function signedPhysicalMeshVolume(mesh) {
  let volume = 0;
  for (const { vertices: [a, b, c] } of mesh.triangles) {
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return volume;
}
