// Renderer-agnostic triangle adapter over WaferCAD's native owned surface plan.
// Cap triangulation is supplied by site/polygon-triangulation.js.
function point3(x, y, z) {
  if (![x, y, z].every(Number.isFinite)) throw Error('Nonfinite 3D material coordinate.');
  return [x, y, z];
}
export function collectOwnedMesh({ model, plan, triangulate, maxTriangles = 500000, borders = true }) {
  if (!Array.isArray(plan?.caps) || !Array.isArray(plan?.sidewalls)) throw Error('Invalid native renderer surface plan.');
  if (typeof triangulate !== 'function') throw Error('Canonical polygon triangulation is required.');
  const layers = new Map();
  for (const layer of model.layers || []) if (layer.visible !== false) layers.set(layer.id, {id:layer.id, name:layer.name || layer.id, color:/^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : '#a0b8cb', triangles:[]});
  let caps = 0, sidewalls = 0, skippedBuried = 0, count = 0;
  function add(layerId, triangle) {
    const layer = layers.get(layerId);
    if (!layer) throw Error(`Owned surface references missing or invisible material layer: ${layerId}`);
    if (count >= maxTriangles) throw Error(`Offline 3D triangle budget exceeded: ${maxTriangles}`);
    if (triangle.length !== 3) throw Error('Native triangulator returned malformed triangle.');
    layer.triangles.push(triangle);
    count++;
  }
  for (const cap of plan.caps) {
    if (cap.buried) { skippedBuried++; continue; }
    if (!Number.isFinite(cap.z)) throw Error('Cap has invalid physical Z.');
    for (const polygon of cap.polys || []) {
      const triangles = triangulate(polygon);
      if (!triangles.length) throw Error(`Cannot safely triangulate exposed cap: ${cap.layerId}`);
      for (const triangle of triangles) add(cap.layerId, triangle.map(([x, y]) => point3(x, y, cap.z)));
    }
    caps++;
  }
  for (const wall of plan.sidewalls) {
    if (wall.buried) { skippedBuried++; continue; }
    const a = point3(wall.p[0], wall.p[1], wall.z0);
    const b = point3(wall.q[0], wall.q[1], wall.z0);
    const c = point3(wall.q[0], wall.q[1], wall.z1);
    const d = point3(wall.p[0], wall.p[1], wall.z1);
    if (!(wall.z1 > wall.z0)) throw Error('Owned sidewall has invalid physical Z span.');
    add(wall.layerId, [a, b, c]);
    add(wall.layerId, [a, c, d]);
    sidewalls++;
  }
  if (!count) throw Error('No exposed owned material surfaces to rasterize.');
  const lineSegments = borders ? (plan.borderLines || []).map((segment) => {
    if (!Array.isArray(segment) || segment.length !== 2) throw Error('Malformed native border segment.');
    return segment.map(([x,y,z]) => point3(x,y,z));
  }) : [];
  return { schema:'wafercad-offline-3d-mesh-v1', layers:[...layers.values()].filter((layer)=>layer.triangles.length), borderLines:lineSegments, evidence:{ nativeCaps:caps, nativeSidewalls:sidewalls, ignoredBuriedInterfaces:skippedBuried, triangles:count, borders:lineSegments.length, limitations:['No physical roughness displacement, annotation shading, or Three.js shader/depth compositing parity.'] } };
}