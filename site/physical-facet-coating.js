// Experimental local facet-normal coating solid for #297/#300.
// One planar triangular patch only. A full conformal coating requires
// ridge/valley joins, corner offsets, Boolean ownership and collision tests.
import { squarePyramidSample } from './physical-facet-math.js';
import { restorePhysicalPyramidOwner } from './physical-facet-owner.js';

export const PHYSICAL_FACET_COATING_PATCH_KIND = 'wafercad-local-facet-normal-coating-v1';

function sector(owner, point) {
  const [x, y] = point;
  const { pitch, originX, originY, domain } = owner;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x <= domain.minX ||
    x >= domain.maxX ||
    y <= domain.minY ||
    y >= domain.maxY
  ) {
    throw new RangeError('Facet patch must remain strictly inside the material domain');
  }
  const ix = Math.round((x - originX) / pitch);
  const iy = Math.round((y - originY) / pitch);
  const dx = x - (originX + ix * pitch);
  const dy = y - (originY + iy * pitch);
  if (Math.abs(Math.abs(dx) - Math.abs(dy)) <= pitch * 1e-12) {
    throw new RangeError('Physical facet normal undefined at a ridge or apex');
  }
  if (
    Math.abs(Math.abs(dx) - pitch / 2) <= pitch * 1e-12 ||
    Math.abs(Math.abs(dy) - pitch / 2) <= pitch * 1e-12
  ) {
    throw new RangeError('Physical facet normal undefined at a cell edge');
  }
  const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'north' : 'south';
  return `${ix}:${iy}:${side}`;
}

function signedArea(a, b, c) {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

export function physicalFacetNormalCoatingPatch(
  owner,
  { layerId, face = 'front', triangleXY, thicknessUm },
) {
  const valid = restorePhysicalPyramidOwner(owner);
  if (!layerId || typeof layerId !== 'string' || layerId === valid.layerId) {
    throw new RangeError('Coating layer requires a distinct material layerId');
  }
  if (face !== 'front' && face !== 'back') throw new RangeError('Unknown physical coating face');
  if (!Number.isFinite(thicknessUm) || thicknessUm <= 0) {
    throw new RangeError('Physical normal thickness must be positive and finite');
  }
  if (!Array.isArray(triangleXY) || triangleXY.length !== 3) {
    throw new RangeError('Physical coating requires one triangle of three XY vertices');
  }
  for (const p of triangleXY) {
    if (!Array.isArray(p) || p.length !== 2) {
      throw new RangeError('Physical coating requires finite XY point pairs');
    }
  }
  const areaXY = signedArea(...triangleXY);
  if (!(areaXY > 0)) throw new RangeError('Physical facet patch must have positive XY area');

  const region = sector(valid, triangleXY[0]);
  // The sector of a pyramid is a convex triangular domain. Equal cell,
  // quadrant and edge strictness at the three vertices proves the entire
  // source triangle is inside one affine facet; no false join is created.
  if (triangleXY.some((p) => sector(valid, p) !== region)) {
    throw new RangeError('Facet coating cannot cross pyramid creases or cell boundaries');
  }
  const faceArgs = {
    pitch: valid.pitch,
    height: valid.height,
    originX: valid.originX,
    originY: valid.originY,
    planeZ: face === 'front' ? valid.topPlaneZ : valid.bottomPlaneZ,
    face,
  };
  const samples = triangleXY.map(([x, y]) => squarePyramidSample(x, y, faceArgs));
  if (samples.some((p) => p.crease || !p.normal || !p.gradient)) {
    throw new RangeError('No unique normal at a physical facet edge');
  }
  const normal = samples[0].normal;
  const slope = samples[0].gradient;
  if (
    samples.some(
      (p) =>
        p.normal.some((v, i) => v !== normal[i]) ||
        p.gradient.some((v, i) => v !== slope[i]),
    )
  ) {
    throw new RangeError('A coating patch cannot span different planar facets');
  }

  const inner = triangleXY.map(([x, y], i) => [x, y, samples[i].z]);
  const outer = inner.map((p) => p.map((v, i) => v + thicknessUm * normal[i]));
  for (const p of outer) {
    // The adjoining ridge/valley construction is intentionally absent.
    // Coating normals remain valid only when every shifted endpoint also
    // projects onto the same open affine facet of the original owner.
    if (sector(valid, p) !== region) {
      throw new RangeError('Coating offset reaches an unsupported facet junction');
    }
  }
  const outward = face === 'front' ? 1 : -1;
  const triangles = [];
  function add(points, role) {
    triangles.push({ face: role, layerId, vertices: points.map((p) => [...p]) });
  }
  if (outward === 1) {
    add([inner[0], inner[2], inner[1]], 'substrate-interface');
    add([outer[0], outer[1], outer[2]], 'outer-interface');
  } else {
    add([inner[0], inner[1], inner[2]], 'substrate-interface');
    add([outer[0], outer[2], outer[1]], 'outer-interface');
  }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (outward === 1) {
      add([inner[i], inner[j], outer[j]], 'edge');
      add([inner[i], outer[j], outer[i]], 'edge');
    } else {
      add([inner[j], inner[i], outer[i]], 'edge');
      add([inner[j], outer[i], outer[j]], 'edge');
    }
  }
  return {
    kind: PHYSICAL_FACET_COATING_PATCH_KIND,
    sourceOwnerKind: valid.kind,
    substrateLayerId: valid.layerId,
    layerId,
    face,
    sourceSector: region,
    thicknessUm,
    triangleAreaXY: areaXY,
    physicalVolumeUm3: areaXY * Math.hypot(...slope, 1) * thicknessUm,
    normal: [...normal],
    inner,
    outer,
    triangles,
    // Not a complete Conformal Model layer. These edge triangles are the
    // local patch's artificial cut faces, NOT physical inter-facet joins.
    completeFacetCoating: false,
  };
}
