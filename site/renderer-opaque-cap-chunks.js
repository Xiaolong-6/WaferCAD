// A presentation-only chunker for opaque planar caps. Splitting a triangle
// mesh into bounded chunks does not alter physical polygons, z, winding,
// ownership, materials, export or History. Transparent surfaces must continue
// to use the original whole-bucket path so depth sorting stays unchanged.
export function* chunkOpaquePlanarCaps(caps, maxPolygons = 1024) {
  const limit = Math.max(1, Math.floor(Number(maxPolygons) || 1024));
  let chunk = [];
  let count = 0;
  for (const cap of caps || []) {
    for (const poly of cap.polys || []) {
      if (count >= limit) {
        yield chunk;
        chunk = [];
        count = 0;
      }
      let target = chunk[chunk.length - 1];
      if (!target || target.sourceCap !== cap) {
        target = { ...cap, polys: [], sourceCap: cap };
        chunk.push(target);
      }
      target.polys.push(poly);
      count++;
    }
  }
  if (count) yield chunk;
}
