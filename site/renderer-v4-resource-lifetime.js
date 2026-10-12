// Renderer V4 R5 — ownership-based, exactly-once scene resource retirement.
// This module has no WebGL dependency and never touches model/process data.
//
// Each scene variant owns its meshes and materials. A shared flat-cap
// template is referenced by several chunk meshes *within the same variant*.
// After copy-on-write a retired template has no mesh reference, but stays
// owned by the original group until that group is evicted.
export function disposeRendererSceneResources(root, { onError } = {}) {
  const counts = {
    objects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    retiredFlatTemplates: 0,
  };
  if (!root || !Array.isArray(root.children)) return counts;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const visited = new Set();
  const stack = [...root.children];

  while (stack.length > 0) {
    const object = stack.pop();
    if (!object || typeof object !== 'object' || visited.has(object)) continue;
    visited.add(object);
    counts.objects++;
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      if (material.bumpMap) textures.add(material.bumpMap);
    }
    if (Array.isArray(object.children)) stack.push(...object.children);
  }

  const retired = root.userData?.waferCadRetiredFlatGeometries;
  if (retired instanceof Set) {
    for (const geometry of retired) {
      if (geometry && !geometries.has(geometry)) {
        geometries.add(geometry);
        counts.retiredFlatTemplates++;
      }
    }
    retired.clear();
  }

  // Detach objects before disposing their GPU-facing allocations. Repeating
  // retirement on this emptied group must not dispose any resource again.
  root.clear?.();

  // An individual WebGL resource can fail to retire (for example after
  // context loss or a faulty custom material). Never abandon disposal of
  // the remaining scene after one failure: it would leak GPU allocations
  // even though the scene graph has already been detached.
  const disposalErrors = [];
  const disposeAll = (resources, kind) => {
    for (const resource of resources) {
      try {
        resource?.dispose?.();
      } catch (error) {
        disposalErrors.push({ kind, error });
      }
    }
  };
  disposeAll(geometries, 'geometry');
  disposeAll(textures, 'texture');
  disposeAll(materials, 'material');

  counts.geometries = geometries.size;
  counts.materials = materials.size;
  counts.textures = textures.size;
  if (disposalErrors.length) {
    const failure = new globalThis.AggregateError(
      disposalErrors.map(({ error }) => error),
      'Renderer scene disposal failed for ' +
        disposalErrors.map(({ kind }) => kind).join(', ') +
        '; remaining resources were still retired.',
    );
    // Product callers can log the fault without abandoning scene reset.
    // Standalone tests and unhandled callers remain fail-closed.
    if (typeof onError === 'function') onError(failure);
    else throw failure;
  }
  return counts;
}
