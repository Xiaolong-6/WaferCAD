// Display-only scheduling decision. During an active camera gesture, a dense
// scene can use one WebGL pass and defer exact structural-depth outlines until
// pointer-up. The authoritative mesh/visibility/Border state is unchanged.
export function shouldUseDenseInteractionSinglePass({
  model,
  interacting = false,
  primaryRenderer = true,
  polygonThreshold = 3000,
} = {}) {
  if (!interacting || !primaryRenderer) return false;
  let polygons = 0;
  for (const region of model?.regions || []) {
    polygons += region.geom?.length || 0;
    if (polygons >= polygonThreshold) return true;
  }
  return false;
}
