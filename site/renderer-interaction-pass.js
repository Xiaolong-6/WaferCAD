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

// Render-only, reversible overview LOD for dense smooth sidewalls. Never
// change physical ownership, instancing matrices or exported geometry.
export function createDenseSidewallMotionLod() {
  const hidden = new Map();
  const restore = (resolveVisibility = null) => {
    for (const [object, wasVisible] of hidden) {
      if (object.parent) {
        object.visible = resolveVisibility ? Boolean(resolveVisibility(object)) : wasVisible;
      }
    }
    hidden.clear();
  };
  return {
    update({ enabled, objects, resolveVisibility = null } = {}) {
      if (!enabled) {
        restore(resolveVisibility);
        return 0;
      }
      for (const object of objects || []) {
        if (
          object.visible &&
          object.userData?.waferCadPresentation?.displayRole === 'sidewall' &&
          !hidden.has(object)
        ) {
          hidden.set(object, object.visible);
          object.visible = false;
        }
      }
      return hidden.size;
    },
    restore,
    get hiddenCount() {
      return hidden.size;
    },
  };
}
