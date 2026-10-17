// Read-only 3D presentation adapter for the experimental physical-facet owner.
// Source vertices always come from the same canonical solid as Section contours.
import { validateExperimentalPhysicalFacetModel } from './physical-facet-model.js';
import { physicalPyramidSolidMesh } from './physical-facet-surface.js';

export function physicalFacetPresentationZ(z, { compressBulk = false } = {}) {
  if (!Number.isFinite(z)) throw new RangeError('Physical Z must be finite');
  // Optical inspection only: a symmetric display Z-break that preserves
  // ridge/valley relief exactly; physical owner and volume remain untouched.
  return compressBulk ? z - Math.sign(z) * 118 : z;
}

export function buildPhysicalFacetPresentation(
  model,
  { compressBulk = false, maxCells = 256 } = {},
) {
  const owner = validateExperimentalPhysicalFacetModel(model);
  if (!owner) throw new RangeError('Physical presentation requires an opt-in model');
  const physical = physicalPyramidSolidMesh(owner, { maxCells });
  const groups = { top: [], bottom: [], side: [] };
  for (const triangle of physical.triangles) {
    for (const [x, y, z] of triangle.vertices) {
      groups[triangle.face].push(x, y, physicalFacetPresentationZ(z, { compressBulk }));
    }
  }
  return {
    kind: 'wafercad-physical-facet-presentation-v1',
    layerId: owner.layerId,
    ownerKind: owner.kind,
    sourceCells: physical.sourceCells,
    physicalTriangleCount: physical.triangles.length,
    positions: {
      top: new Float32Array(groups.top),
      bottom: new Float32Array(groups.bottom),
      side: new Float32Array(groups.side),
    },
    displayOnlyZBreak: Boolean(compressBulk),
  };
}
