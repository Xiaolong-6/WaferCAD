import { ownedMaterialSurfacesFromTopology } from './process-topology.js';

// Renderer-facing adapter. Physical ownership is derived once by Process
// Geometry Kernel v2; Three.js consumes this plan without re-interpreting
// material interfaces, sidewalls, or border ownership.
export function buildRenderSurfacePlan(model, clip = null) {
  return ownedMaterialSurfacesFromTopology(model, clip);
}
