// Complete, exact *implicit* exterior coating material owner for a closed
// physical Si facet solid. Covers all exposed surfaces: open facets, convex
// ridges, concave valleys, 3D vertices, slab sidewalls and corners.
// The coating is the set of points outside Si whose Euclidean distance
// to the closed silicon triangle boundary is <= the normal film thickness.
// A closed triangulated *render mesh* is not supplied by this module.
import { restorePhysicalPyramidOwner } from './physical-facet-owner.js';
import { samplePhysicalPyramidSlab } from './physical-facet-math.js';
import { physicalPyramidSolidMesh } from './physical-facet-surface.js';

export const PHYSICAL_FACET_SHELL_KIND = 'wafercad-physical-implicit-shell-v1';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
const distance2 = (a, b) => {
  const d = sub(a, b);
  return dot(d, d);
};

// Ericson's closest point on a closed triangle: includes the face,
// all three edges and all three vertices, not a Z-only height offset.
export function closestPhysicalTrianglePoint(point, [a, b, c]) {
  if (!Array.isArray(point) || point.length !== 3 || point.some((v) => !Number.isFinite(v))) {
    throw new RangeError('A finite 3D query point is required');
  }
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: [...a], feature: 'vertex' };

  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: [...b], feature: 'vertex' };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return { point: mix(a, b, d1 / (d1 - d3)), feature: 'edge' };
  }

  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: [...c], feature: 'vertex' };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return { point: mix(a, c, d2 / (d2 - d6)), feature: 'edge' };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc = sub(c, b);
    return { point: mix(b, c, (d4 - d3) / ((d4 - d3) + (d5 - d6))), feature: 'edge' };
  }

  const denominator = va + vb + vc;
  if (!(denominator > 0)) throw new RangeError('Degenerate physical surface triangle');
  const v = vb / denominator;
  const w = vc / denominator;
  return {
    point: a.map((value, i) => value + v * ab[i] + w * ac[i]),
    feature: 'face',
  };
}

export function makePhysicalFacetShell({ silicon, layerId, thicknessUm }) {
  const valid = restorePhysicalPyramidOwner(silicon);
  if (typeof layerId !== 'string' || !layerId.trim() || layerId === valid.layerId) {
    throw new RangeError('Exterior shell requires a distinct material layerId');
  }
  if (
    !Number.isFinite(thicknessUm) ||
    thicknessUm <= 0 ||
    thicknessUm >= valid.pitch / 4
  ) {
    throw new RangeError('Exterior shell thickness exceeds the conservative quarter-pitch limit');
  }
  return {
    kind: PHYSICAL_FACET_SHELL_KIND,
    silicon: valid,
    layerId,
    thicknessUm,
  };
}

export function restorePhysicalFacetShell(input) {
  if (input?.kind !== PHYSICAL_FACET_SHELL_KIND) {
    throw new RangeError('Unsupported physical exterior shell descriptor');
  }
  const restored = makePhysicalFacetShell(input);
  if (JSON.stringify(restored) !== JSON.stringify(input)) {
    throw new RangeError('Physical exterior shell descriptor must be canonical JSON');
  }
  return restored;
}

// A complete volumetric material query for the entire finite closed Si
// unit, including outside its XY rectangle. The returned phase is mutually
// exclusive: solid Si, the exterior coating or void. No planar fallback.
export function createPhysicalFacetShellQuery(descriptor, { maxCells = 256 } = {}) {
  const shell = restorePhysicalFacetShell(descriptor);
  const surface = physicalPyramidSolidMesh(shell.silicon, { maxCells });
  const triangles = surface.triangles.map(({ face, vertices }) => ({ face, vertices }));
  const { silicon, layerId, thicknessUm } = shell;
  const d = silicon.domain;
  const bounds = {
    minX: d.minX - thicknessUm,
    maxX: d.maxX + thicknessUm,
    minY: d.minY - thicknessUm,
    maxY: d.maxY + thicknessUm,
    minZ: silicon.bottomPlaneZ - silicon.height - thicknessUm,
    maxZ: silicon.topPlaneZ + silicon.height + thicknessUm,
  };

  function closest(point) {
    let best = Infinity;
    let found = null;
    for (const triangle of triangles) {
      const hit = closestPhysicalTrianglePoint(point, triangle.vertices);
      const squared = distance2(point, hit.point);
      if (squared < best) {
        best = squared;
        found = { ...hit, face: triangle.face };
      }
    }
    return { ...found, distanceUm: Math.sqrt(best) };
  }

  function sample(point) {
    if (!Array.isArray(point) || point.length !== 3 || point.some((v) => !Number.isFinite(v))) {
      throw new RangeError('A finite 3D material query point is required');
    }
    const [x, y, z] = point;
    const inXY = x >= d.minX && x <= d.maxX && y >= d.minY && y <= d.maxY;
    if (inXY) {
      const source = samplePhysicalPyramidSlab(x, y, silicon);
      if (z >= source.z0 && z <= source.z1) {
        return {
          materialLayerId: silicon.layerId,
          phase: z === source.z0 || z === source.z1 ? 'interface' : 'silicon',
          distanceToSiliconUm: 0,
        };
      }
    }
    if (
      x < bounds.minX ||
      x > bounds.maxX ||
      y < bounds.minY ||
      y > bounds.maxY ||
      z < bounds.minZ ||
      z > bounds.maxZ
    ) {
      return { materialLayerId: null, phase: 'void', distanceToSiliconUm: Infinity };
    }
    const nearest = closest(point);
    return {
      materialLayerId: nearest.distanceUm <= thicknessUm ? layerId : null,
      phase: nearest.distanceUm <= thicknessUm ? 'coating' : 'void',
      distanceToSiliconUm: nearest.distanceUm,
      nearestSurface: nearest.face,
      nearestFeature: nearest.feature,
      closestSiliconPoint: nearest.point,
    };
  }

  // At each XY inside the Si domain, compute both coating/void interfaces
  // from the *full 3D nearest-surface query*, not the 2D-only oracle.
  // These roots are approximate to the requested search tolerance;
  // material classification itself is exact against the triangle mesh.
  function column(x, y, { accuracyUm = 1e-8 } = {}) {
    if (!(x > d.minX && x < d.maxX && y > d.minY && y < d.maxY)) {
      throw new RangeError('Coated columns require an interior XY coordinate');
    }
    if (!Number.isFinite(accuracyUm) || accuracyUm <= 0 || accuracyUm >= thicknessUm) {
      throw new RangeError('Invalid coating interface search accuracy');
    }
    const source = samplePhysicalPyramidSlab(x, y, silicon);
    function root(z, direction) {
      const coordinate = (h) => [x, y, z + h * direction];
      let lo = 0;
      let hi = thicknessUm;
      while (sample(coordinate(hi)).phase === 'coating') {
        hi *= 2;
        if (hi > silicon.pitch) {
          throw new RangeError('Unable to bracket exterior coating interface');
        }
      }
      while (hi - lo > accuracyUm) {
        const mid = (lo + hi) / 2;
        if (sample(coordinate(mid)).phase === 'coating') lo = mid;
        else hi = mid;
      }
      return z + ((lo + hi) / 2) * direction;
    }
    const frontOuterZ = root(source.z1, 1);
    const backOuterZ = root(source.z0, -1);
    if (!(backOuterZ < source.z0 && source.z0 < source.z1 && source.z1 < frontOuterZ)) {
      throw new RangeError('Exterior shell produces overlapping material columns');
    }
    return {
      x,
      y,
      substrateLayerId: silicon.layerId,
      coatingLayerId: layerId,
      backOuterZ,
      siliconZ0: source.z0,
      siliconZ1: source.z1,
      frontOuterZ,
    };
  }

  return {
    descriptor: shell,
    sourceTriangleCount: triangles.length,
    bounds,
    sample,
    closest,
    column,
  };
}
