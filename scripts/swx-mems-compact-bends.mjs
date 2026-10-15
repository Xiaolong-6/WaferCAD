/**
 * True circular tangent fillets for compact SWX optical centerlines.
 * The 3/5um radii are paper-reported; the waypoint locations and which
 * optical leg uses each radius are reconstruction assumptions, not author GDS.
 * A failed fit is rejected explicitly instead of shrinking R to hide errors.
 */
export function filletPolyline(points, radius, segmentsPerTurn = 12) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('Two endpoints required');
  if (!(radius > 0 && Number.isFinite(radius))) throw new Error('Invalid optical bend radius');
  if (!Number.isInteger(segmentsPerTurn) || segmentsPerTurn < 4) {
    throw new Error('Circular bend requires at least four samples');
  }
  const unit = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 0)) throw new Error('Zero-length optical centerline segment');
    return { dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len };
  };
  const segments = points.slice(1).map((p, i) => unit(points[i], p));
  const turns = [];
  for (let i = 1; i < points.length - 1; i++) {
    const before = segments[i - 1].dir;
    const after = segments[i].dir;
    const dot = Math.max(-1, Math.min(1, before[0] * after[0] + before[1] * after[1]));
    const cross = before[0] * after[1] - before[1] * after[0];
    const angle = Math.atan2(Math.abs(cross), dot);
    if (angle < 1e-10) {
      turns.push(null);
      continue;
    }
    if (angle >= Math.PI - 1e-4) throw new Error('Near-reversal cannot form a fillet');
    const tangent = radius * Math.tan(angle / 2);
    const corner = points[i];
    const entry = [corner[0] - tangent * before[0], corner[1] - tangent * before[1]];
    const exit = [corner[0] + tangent * after[0], corner[1] + tangent * after[1]];
    const sign = Math.sign(cross);
    const center = [entry[0] - sign * before[1] * radius, entry[1] + sign * before[0] * radius];
    const startAngle = Math.atan2(entry[1] - center[1], entry[0] - center[0]);
    turns.push({ index: i, radius, tangent, center, entry, exit, startAngle, sweep: sign * angle });
  }
  // Every inter-bend straight run must retain positive length.
  for (let i = 0; i < segments.length; i++) {
    const leftCut = i > 0 ? (turns[i - 1]?.tangent ?? 0) : 0;
    const rightCut = i < turns.length ? (turns[i]?.tangent ?? 0) : 0;
    if (!(segments[i].len > leftCut + rightCut + 1e-7)) {
      throw new Error('Optical bend radius does not fit available centerline segment');
    }
  }
  const result = [points[0]], arcs = [];
  for (const turn of turns) {
    if (!turn) continue;
    result.push(turn.entry);
    const firstArcIndex = result.length;
    for (let step = 1; step <= segmentsPerTurn; step++) {
      const theta = turn.startAngle + (turn.sweep * step) / segmentsPerTurn;
      result.push([
        turn.center[0] + radius * Math.cos(theta),
        turn.center[1] + radius * Math.sin(theta),
      ]);
    }
    arcs.push({
      cornerIndex: turn.index,
      radiusUm: radius,
      center: turn.center,
      firstArcIndex,
      lastArcIndex: result.length - 1,
      start: turn.entry,
      end: turn.exit,
    });
  }
  result.push(points.at(-1));
  return { points: result, arcs, radiusUm: radius };
}
