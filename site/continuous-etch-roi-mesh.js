// Crop derived display triangles to the physical XY rectangle. Unlike GPU
// fragment-only clipping, every output triangle lies inside the displayed ROI.
// This does not modify the analytical material owner or its saved front.
export function clipContinuousSurfaceToRect(part, bounds) {
  if (!bounds) return part;
  const { minX, minY, maxX, maxY } = bounds;
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || !(maxX > minX && maxY > minY))
    throw new RangeError('Invalid continuous display crop');
  if (part.positions.length !== part.normals.length || part.positions.length % 9)
    throw new RangeError('Invalid continuous triangle mesh');
  const output = [];
  const normals = [];
  const planes = [
    [0, minX, true],
    [0, maxX, false],
    [1, minY, true],
    [1, maxY, false],
  ];
  for (let start = 0; start < part.positions.length; start += 9) {
    let polygon = [];
    for (let i = 0; i < 3; i++) {
      const k = start + i * 3;
      polygon.push([
        part.positions[k],
        part.positions[k + 1],
        part.positions[k + 2],
        part.normals[k],
        part.normals[k + 1],
        part.normals[k + 2],
      ]);
    }
    for (const [axis, limit, lower] of planes) {
      if (!polygon.length) break;
      const inside = (v) => (lower ? v[axis] >= limit : v[axis] <= limit);
      const clipped = [];
      let previous = polygon.at(-1);
      for (const current of polygon) {
        const prevInside = inside(previous);
        const nextInside = inside(current);
        if (prevInside !== nextInside) {
          const denominator = current[axis] - previous[axis];
          const t = denominator === 0 ? 0 : (limit - previous[axis]) / denominator;
          const intersection = previous.map((value, j) => value + t * (current[j] - value));
          intersection[axis] = limit;
          clipped.push(intersection);
        }
        if (nextInside) clipped.push(current);
        previous = current;
      }
      polygon = clipped;
    }
    if (polygon.length < 3) continue;
    for (let index = 1; index + 1 < polygon.length; index++) {
      const triangle = [polygon[0], polygon[index], polygon[index + 1]];
      // A pre-existing material sidewall can coincide exactly with a crop
      // plane. Keep that plane's physical area in the generated cut face,
      // rather than rendering the old sidewall AND a cap over each other.
      // The boundary of the remaining cropped mesh is the single cap owner.
      if (
        planes.some(([axis, limit]) =>
          triangle.every((vertex) => Math.abs(vertex[axis] - limit) <= 1e-6),
        )
      )
        continue;
      const [a, b, c] = triangle;
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        uz = b[2] - a[2];
      const vx = c[0] - a[0],
        vy = c[1] - a[1],
        vz = c[2] - a[2];
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-11) continue;
      for (const v of triangle) {
        output.push(v[0], v[1], v[2]);
        const length = Math.hypot(v[3], v[4], v[5]) || 1;
        normals.push(v[3] / length, v[4] / length, v[5] / length);
      }
    }
  }
  return {
    ...part,
    positions: Float32Array.from(output),
    normals: Float32Array.from(normals),
    triangles: output.length / 9,
  };
}
