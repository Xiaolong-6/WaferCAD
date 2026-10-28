// Display-only shoulder refinement on a coarse XY grid. Refinement follows the
// dominant surface-gradient axis and stitches neighbour edge subdivisions,
// avoiding whole-wafer fine grids and hanging-edge (T-junction) triangles.
export function planAdaptiveContinuousTop({
  nx,
  ny,
  minX,
  minY,
  dx,
  dy,
  top,
  originalTop,
  releaseDepthUm,
  sampleZ,
  maxChordErrorUm,
}) {
  if (!(maxChordErrorUm > 0 && Number.isFinite(maxChordErrorUm)))
    throw new RangeError('Invalid adaptive display chord tolerance');
  const vertex = (i, j) => j * (nx + 1) + i;
  const xPow = new Uint8Array(nx * ny),
    yPow = new Uint8Array(nx * ny);
  const zCache = new Map();
  const at = (x, y) => {
    const key = Math.round(x * 4096) + ':' + Math.round(y * 4096);
    if (!zCache.has(key)) zCache.set(key, sampleZ(x, y));
    return zCache.get(key);
  };
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const a = top[vertex(i, j)],
        b = top[vertex(i + 1, j)],
        c = top[vertex(i + 1, j + 1)],
        d = top[vertex(i, j + 1)];
      if (
        Math.max(a, b, c, d) < originalTop - releaseDepthUm * 0.65 ||
        Math.max(a, b, c, d) - Math.min(a, b, c, d) < maxChordErrorUm / 2
      )
        continue;
      const x = minX + i * dx,
        y = minY + j * dy;
      const error = Math.max(
        Math.abs(at(x + dx / 2, y + dy / 2) - (a + c) / 2),
        Math.abs(at(x + dx / 2, y) - (a + b) / 2),
        Math.abs(at(x + dx, y + dy / 2) - (b + c) / 2),
        Math.abs(at(x + dx / 2, y + dy) - (c + d) / 2),
        Math.abs(at(x, y + dy / 2) - (d + a) / 2),
      );
      let level = error > maxChordErrorUm / 2 ? 1 : 0;
      if (error > maxChordErrorUm) level = 2;
      if (error > 2 * maxChordErrorUm) level = 3;
      if (error > 2 * maxChordErrorUm && Math.max(a, b, c, d) > originalTop - releaseDepthUm * 0.14)
        level = 4;
      if (!level) continue;
      const gx = Math.abs((b + c - a - d) / 2 / dx);
      const gy = Math.abs((d + c - a - b) / 2 / dy);
      // Dominant-axis refinement is substantially cheaper on circular fronts.
      // Diagonal shoulders need resolution in both directions.
      const ix = j * nx + i;
      if (gx > 1.5 * gy) xPow[ix] = level;
      else if (gy > 1.5 * gx) yPow[ix] = level;
      else xPow[ix] = yPow[ix] = Math.max(1, level - 1);
    }
  const countX = (i, j) => (i < 0 || i >= nx || j < 0 || j >= ny ? 1 : 2 ** xPow[j * nx + i]);
  const countY = (i, j) => (i < 0 || i >= nx || j < 0 || j >= ny ? 1 : 2 ** yPow[j * nx + i]);
  const each = (callback) => {
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const nX = countX(i, j),
          nY = countY(i, j);
        const adjacent = [countX(i, j - 1), countY(i + 1, j), countX(i, j + 1), countY(i - 1, j)];
        callback(i, j, nX, nY, adjacent);
      }
  };
  let triangles = 0,
    refinedCells = 0;
  each((i, j, nX, nY, sides) => {
    if (nX === 1 && nY === 1 && sides.every((n) => n === 1)) {
      triangles += 2;
      return;
    }
    if (nX > 1 || nY > 1) refinedCells++;
    triangles +=
      4 * nX * nY +
      Math.max(0, sides[0] - nX) +
      Math.max(0, sides[1] - nY) +
      Math.max(0, sides[2] - nX) +
      Math.max(0, sides[3] - nY);
  });
  const emit = (pushTri, surface, unitNormal) => {
    const normalAt = (x, y) => {
      const fx = Math.max(0, Math.min(nx - 1, (x - minX) / dx));
      const fy = Math.max(0, Math.min(ny - 1, (y - minY) / dy));
      const i = Math.floor(fx),
        j = Math.floor(fy),
        tx = fx - i,
        ty = fy - j;
      const corners = [
        [1 - tx, 1 - ty, i, j],
        [tx, 1 - ty, i + 1, j],
        [tx, ty, i + 1, j + 1],
        [1 - tx, ty, i, j + 1],
      ];
      const n = [0, 0, 0];
      for (const [wx, wy, ix, iy] of corners) {
        const m = unitNormal(ix, iy),
          w = wx * wy;
        n[0] += w * m[0];
        n[1] += w * m[1];
        n[2] += w * m[2];
      }
      const length = Math.hypot(...n);
      return n.map((v) => v / length);
    };
    const point = (x, y) => [x, y, at(x, y)];
    each((i, j, nX, nY, sides) => {
      if (nX === 1 && nY === 1 && sides.every((n) => n === 1)) {
        const a = surface(i, j),
          b = surface(i + 1, j),
          c = surface(i + 1, j + 1),
          d = surface(i, j + 1);
        const na = unitNormal(i, j),
          nb = unitNormal(i + 1, j),
          nc = unitNormal(i + 1, j + 1),
          nd = unitNormal(i, j + 1);
        pushTri(a, b, c, [na, nb, nc]);
        pushTri(a, c, d, [na, nc, nd]);
        return;
      }
      const stepX = dx / nX,
        stepY = dy / nY;
      for (let sy = 0; sy < nY; sy++)
        for (let sx = 0; sx < nX; sx++) {
          const x0 = minX + i * dx + sx * stepX,
            y0 = minY + j * dy + sy * stepY;
          const x1 = x0 + stepX,
            y1 = y0 + stepY;
          const splits = [
            sy === 0 ? Math.max(1, sides[0] / nX) : 1,
            sx === nX - 1 ? Math.max(1, sides[1] / nY) : 1,
            sy === nY - 1 ? Math.max(1, sides[2] / nX) : 1,
            sx === 0 ? Math.max(1, sides[3] / nY) : 1,
          ];
          const corners = [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ];
          const ring = [];
          for (let edge = 0; edge < 4; edge++) {
            const start = corners[edge],
              end = corners[(edge + 1) % 4];
            for (let k = 0; k < splits[edge]; k++) {
              const f = k / splits[edge];
              ring.push(
                point(start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f),
              );
            }
          }
          const center = point((x0 + x1) / 2, (y0 + y1) / 2),
            normal = normalAt(center[0], center[1]);
          for (let k = 0; k < ring.length; k++) {
            const a = ring[k],
              b = ring[(k + 1) % ring.length];
            pushTri(center, a, b, [normal, normalAt(a[0], a[1]), normalAt(b[0], b[1])]);
          }
        }
    });
  };
  return { triangles, refinedCells, emit };
}
