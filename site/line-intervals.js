export const LINE_INTERVAL_EPSILON = 1e-10;

export function canonicalLineInterval(p, q) {
  const dx = Number(q?.[0]) - Number(p?.[0]),
    dy = Number(q?.[1]) - Number(p?.[1]),
    length = Math.hypot(dx, dy);
  if (!(length > 1e-12)) return null;

  let ux = dx / length,
    uy = dy / length;
  if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  const nx = -uy,
    ny = ux,
    offset = nx * Number(p[0]) + ny * Number(p[1]),
    pT = ux * Number(p[0]) + uy * Number(p[1]),
    qT = ux * Number(q[0]) + uy * Number(q[1]);
  return {
    ux,
    uy,
    nx,
    ny,
    offset,
    t0: Math.min(pT, qT),
    t1: Math.max(pT, qT),
    forward: qT >= pT,
    length,
  };
}

export function lineIntervalKey(line, precision = 13) {
  if (!line) return '';
  return [line.ux, line.uy, line.offset]
    .map((value) => Number(value).toPrecision(precision))
    .join('|');
}

export function pointAtLineT(line, t) {
  return [line.ux * Number(t) + line.nx * line.offset, line.uy * Number(t) + line.ny * line.offset];
}

export function localParameterAtLineT(line, t) {
  const span = Math.max(1e-12, line.t1 - line.t0),
    forward = (Number(t) - line.t0) / span;
  return Math.max(0, Math.min(1, line.forward ? forward : 1 - forward));
}

export function partitionLineIntervals(
  entries,
  { lineOf = (entry) => entry?.line, epsilon = LINE_INTERVAL_EPSILON } = {},
) {
  const valid = (entries || []).filter((entry) => lineOf(entry));
  if (!valid.length) return [];

  const levels = [
    ...new Set(
      valid.flatMap((entry) => {
        const line = lineOf(entry);
        return [line.t0, line.t1];
      }),
    ),
  ].sort((a, b) => a - b);

  const spans = [];
  for (let index = 0; index < levels.length - 1; index++) {
    const t0 = levels[index],
      t1 = levels[index + 1];
    if (!(t1 > t0 + epsilon)) continue;
    const covering = valid.filter((entry) => {
      const line = lineOf(entry);
      return line.t0 <= t0 + epsilon && line.t1 >= t1 - epsilon;
    });
    if (covering.length) spans.push({ t0, t1, covering });
  }
  return spans;
}
