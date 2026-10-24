import {
  intersection,
  lineIntervalsInMulti,
  multiBounds,
  pointInMulti,
} from './vector-geometry.js';

/**
 * Choose a deterministic material-interior Section witness for a multi-polygon
 * overlap. A vertex average is unsafe for concave outlines, holes and islands.
 * Scan the open Y-bands between geometry vertices, then take the midpoint of
 * the widest fully interior horizontal interval. This is a diagnostic locator,
 * not a tunnelling-area or material-width estimator.
 */
export function junctionSectionWitness(overlap, { quantumUm = 1e-4 } = {}) {
  if (!(Number.isFinite(quantumUm) && quantumUm > 0))
    throw new RangeError('Section witness quantum must be positive and finite.');
  const bounds = multiBounds(overlap);
  if (!(bounds.width > quantumUm && bounds.height > quantumUm))
    throw new RangeError('Overlap has no resolvable two-dimensional section.');
  const ys = [
    ...new Set(
      overlap.flatMap((polygon) => polygon.flatMap((ring) => ring.map((point) => point[1]))),
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const margin = Math.max(quantumUm, bounds.width * 0.01);
  const left = bounds.minX - margin;
  const right = bounds.maxX + margin;
  let winner = null;
  for (let i = 1; i < ys.length; i++) {
    const bandHeight = ys[i] - ys[i - 1];
    if (!(bandHeight >= quantumUm)) continue;
    const y = (ys[i] + ys[i - 1]) / 2;
    for (const [t0, t1] of lineIntervalsInMulti([left, y], [right, y], overlap)) {
      const width = (t1 - t0) * (right - left);
      if (width < quantumUm) continue;
      const point = [left + ((t0 + t1) * (right - left)) / 2, y];
      if (!pointInMulti(point, overlap)) continue;
      const score = Math.min(width, bandHeight);
      if (
        !winner ||
        score > winner.score + 1e-12 ||
        (Math.abs(score - winner.score) < 1e-12 &&
          (point[1] < winner.point[1] ||
            (point[1] === winner.point[1] && point[0] < winner.point[0])))
      )
        winner = { point, score };
    }
  }
  if (!winner) throw new RangeError('No resolvable material-interior Section witness in overlap.');
  return winner.point;
}

/**
 * Prefer a Section that actually crosses all three metal doses, while the
 * first-two overlap remains the candidate tunnel-junction reference. A third
 * dose may be disjoint; that must be reported instead of inventing coverage.
 */
export function junctionThreeDoseSectionWitness(first, second, third, options) {
  const firstTwoOverlap = intersection(first, second);
  if (!firstTwoOverlap.length) throw new RangeError('First-two Al footprint overlap is empty.');
  const threeDoseOverlap = intersection(firstTwoOverlap, third);
  const sectionFootprint = threeDoseOverlap.length ? threeDoseOverlap : firstTwoOverlap;
  return {
    point: junctionSectionWitness(sectionFootprint, options),
    firstTwoOverlap,
    sectionIncludesThirdAl: threeDoseOverlap.length > 0,
  };
}
