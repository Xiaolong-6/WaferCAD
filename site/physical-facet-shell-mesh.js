// Experimental triangulated oxide envelope of the canonical Si solid.
// This is a material-surface approximation, not an exact Minkowski-offset
// boundary or production-quality Conformal mesh. Physical membership always
// comes from the exact implicit owner; this mesh never changes the Model.
import { createPhysicalFacetShellQuery } from './physical-facet-shell-owner.js';
import { physicalPyramidSolidMesh, signedPhysicalMeshVolume } from './physical-facet-surface.js';

const minus = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (vector) => {
  const length = Math.hypot(...vector);
  if (!(length > 1e-12)) throw new RangeError('Degenerate physical shell normal');
  return vector.map((v) => v / length);
};
const key = (p) => p.map((v) => (Object.is(v, -0) ? 0 : Number(v.toPrecision(14)))).join(',');

function validateWatertight(triangles, label) {
  const edges = new Map();
  let faceCount = 0;
  for (const triangle of triangles) {
    const vertices = triangle.vertices;
    const edgeLength = Math.hypot(
      ...cross(minus(vertices[1], vertices[0]), minus(vertices[2], vertices[0])),
    );
    if (!(edgeLength > 1e-13)) throw new RangeError(label + ': degenerate surface triangle');
    for (let i = 0; i < 3; i++) {
      const a = key(vertices[i]);
      const b = key(vertices[(i + 1) % 3]);
      const id = [a, b].sort().join('|');
      const edge = edges.get(id) || { forward: 0, backward: 0 };
      if (a < b) edge.forward++;
      else edge.backward++;
      edges.set(id, edge);
    }
    faceCount++;
  }
  const invalid = [...edges.values()].filter(
    (value) => value.forward !== 1 || value.backward !== 1,
  );
  if (invalid.length)
    throw new RangeError(label + ': nonmanifold or inconsistently wound edges: ' + invalid.length);
  return { faces: faceCount, edges: edges.size, invalidEdges: 0 };
}

// The Si boundary supplies exact topology and inner-film geometry. Its
// outward-oriented vertex normal is the sum of incident surface area normals.
// We project outward until the exact nearest-triangle distance is the
// specified film thickness; all *vertices* therefore satisfy the real 3D
// material owner. Between vertices this triangulation is a conservative
// planar approximation; it must never be substituted for the membership oracle.
export function triangulatePhysicalFacetShell(descriptor, { maxCells = 256 } = {}) {
  const owner = createPhysicalFacetShellQuery(descriptor, { maxCells });
  const silicon = physicalPyramidSolidMesh(owner.descriptor.silicon, { maxCells });
  const { thicknessUm } = owner.descriptor;
  const normals = new Map();
  const originals = new Map();
  for (const triangle of silicon.triangles) {
    const [a, b, c] = triangle.vertices;
    const n = cross(minus(b, a), minus(c, a));
    if (!(Math.hypot(...n) > 1e-13)) throw new RangeError('Degenerate silicon surface');
    for (const vertex of triangle.vertices) {
      const id = key(vertex);
      originals.set(id, vertex);
      const sum = normals.get(id) || [0, 0, 0];
      normals.set(
        id,
        sum.map((v, i) => v + n[i]),
      );
    }
  }
  const outerPoints = new Map();
  for (const [id, point] of originals) {
    const direction = normalize(normals.get(id));
    const at = (offset) => point.map((v, i) => v + offset * direction[i]);
    let high = thicknessUm * 1.5;
    // A nonzero offset must lead into true exterior air, not into nearby Si.
    let valid = false;
    for (let attempt = 0; attempt < 7; attempt++) {
      const atHigh = owner.sample(at(high));
      if (atHigh.materialLayerId === null) {
        valid = true;
        break;
      }
      high *= 2;
    }
    if (!valid || high >= owner.descriptor.silicon.pitch / 2) {
      throw new RangeError('Cannot close the physical oxide envelope at a sharp feature');
    }
    let low = 0;
    for (let step = 0; step < 42; step++) {
      const mid = (low + high) / 2;
      if (owner.sample(at(mid)).materialLayerId === owner.descriptor.layerId) low = mid;
      else high = mid;
    }
    const outer = at((low + high) / 2);
    const actual = owner.closest(outer).distanceUm;
    if (Math.abs(actual - thicknessUm) > 1e-9) {
      throw new RangeError('Oxide envelope vertex contradicts physical material owner');
    }
    outerPoints.set(id, outer);
  }
  // Keep a true parallel film over each facet interior. Only the narrow
  // perimeter bridges approximate the rounded convex/concave transitions.
  // Without these insets, smoothing corner normals across an entire 6.4 um
  // face collapses the displayed 50 nm film to almost zero thickness.
  const exterior = [];
  for (const triangle of silicon.triangles) {
    const [a, b, c] = triangle.vertices;
    const tangent = cross(minus(b, a), minus(c, a));
    const faceNormal = normalize(tangent);
    const lengths = [
      Math.hypot(...minus(b, a)),
      Math.hypot(...minus(c, b)),
      Math.hypot(...minus(a, c)),
    ];
    const inradius = Math.hypot(...tangent) / lengths.reduce((total, value) => total + value, 0);
    const insetDistance = Math.min(2 * thicknessUm, inradius / 3);
    if (!(inradius > 1e-12)) throw new RangeError('Degenerate physical coating facet');
    const centroid = a.map((_, i) => (a[i] + b[i] + c[i]) / 3);
    const inset = triangle.vertices.map((point) => {
      const xy = point.map(
        (value, index) => value + ((centroid[index] - value) * insetDistance) / inradius,
      );
      return xy.map((value, index) => value + thicknessUm * faceNormal[index]);
    });
    for (const point of inset) {
      const error = Math.abs(owner.closest(point).distanceUm - thicknessUm);
      if (error > 1e-9) {
        throw new RangeError('Film face inset does not follow the full 3D material owner');
      }
    }
    const outer = triangle.vertices.map((point) => outerPoints.get(key(point)));
    exterior.push({ face: triangle.face, vertices: inset });
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      exterior.push({ face: triangle.face, vertices: [outer[i], outer[j], inset[j]] });
      exterior.push({ face: triangle.face, vertices: [outer[i], inset[j], inset[i]] });
    }
  }
  const interfaceTriangles = silicon.triangles.map((triangle) => ({
    face: triangle.face,
    vertices: triangle.vertices.toReversed().map((p) => [...p]),
  }));
  const exteriorAudit = validateWatertight(exterior, 'Outer oxide');
  const interfaceAudit = validateWatertight(interfaceTriangles, 'Si/oxide interface');
  const outerVolume = signedPhysicalMeshVolume({ triangles: exterior });
  const siliconVolume = signedPhysicalMeshVolume(silicon);
  const shellVolume = outerVolume - siliconVolume;
  if (!(shellVolume > 0) || !(siliconVolume > 0)) {
    throw new RangeError('Triangulated oxide has invalid physical volume');
  }
  // Positive outward surface plus inverted Si interface enclose only coating.
  if (!(signedPhysicalMeshVolume({ triangles: [...exterior, ...interfaceTriangles] }) > 0)) {
    throw new RangeError('Film faces have invalid orientation');
  }
  return {
    kind: 'wafercad-physical-tessellated-oxide-evidence-v1',
    exactOwnerKind: owner.descriptor.kind,
    layerId: owner.descriptor.layerId,
    siliconLayerId: owner.descriptor.silicon.layerId,
    thicknessUm,
    exterior,
    interfaceTriangles,
    siliconTriangleCount: silicon.triangles.length,
    filmTriangleCount: exterior.length + interfaceTriangles.length,
    siliconVolumeUm3: siliconVolume,
    triangulatedFilmVolumeUm3: shellVolume,
    topology: { exterior: exteriorAudit, interface: interfaceAudit },
    accuracy: 'true facet-parallel interior; conservative perimeter bridge remains experimental',
  };
}
