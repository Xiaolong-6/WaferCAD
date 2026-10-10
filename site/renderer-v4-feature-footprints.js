// R3 evidence only: bounded per-structure perspective-space observation.
// Tile-level bounds exaggerate the apparent detail of spatially separated
// nano features; do not interpret any subpixel result as alpha-removal proof.
import { projectAxisAlignedTileBounds } from './renderer-v3-tile-bounds.js';

const point = (p) =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const gateReason = ({ farTier, clipped, zCollapsed, edgeOn }) =>
  !farTier
    ? 'not-far'
    : clipped
      ? 'roi'
      : zCollapsed
        ? 'z-collapse'
        : edgeOn
          ? 'edge-on'
          : 'alpha-coverage-unverified';

export function surveyV4FeatureFootprints(
  owners,
  {
    viewProjectionMatrix,
    viewportWidth,
    viewportHeight,
    mapZ = (z) => z,
    visibleIntervals = (a, b) => [[a, b]],
    displayZScale = 1,
    farTier = false,
    clipped = false,
    zCollapsed = false,
    edgeOn = false,
    maxOwners = 2,
    maxQuads = 8192,
    subpixelPx = 0.5,
  } = {},
) {
  const report = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    reductionGate: 'invalid-input',
    owners: 0,
    selectedOwners: 0,
    excludedOwners: 0,
    ownerOverflow: 0,
    measuredQuads: 0,
    representedQuads: 0,
    subpixelQuads: 0,
    offscreenQuads: 0,
    nearPlaneUncertainQuads: 0,
    workOverflow: 0,
    rawTriangleCandidates: 0,
    skippedTriangles: 0,
    maxFootprintPx: 0,
    // Representative sample counts are never claimed to cover omitted quads.
    sample: [],
  };
  if (
    !Array.isArray(owners) ||
    !viewProjectionMatrix ||
    viewProjectionMatrix.length !== 16 ||
    !Array.from(viewProjectionMatrix).every(Number.isFinite) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(displayZScale) ||
    displayZScale <= 0 ||
    typeof mapZ !== 'function' ||
    typeof visibleIntervals !== 'function' ||
    !Number.isInteger(maxOwners) ||
    maxOwners < 1 ||
    maxOwners > 8 ||
    !Number.isInteger(maxQuads) ||
    maxQuads < 1 ||
    maxQuads > 32768 ||
    !Number.isFinite(subpixelPx) ||
    subpixelPx <= 0 ||
    subpixelPx > 0.5
  ) return report;
  report.valid = true;
  report.reason = 'measured';
  report.reductionGate = gateReason({ farTier, clipped, zCollapsed, edgeOn });
  const selected = owners
    .map((owner, index) => ({ owner, index }))
    .filter(
      ({ owner }) =>
        owner?.buried === true &&
        Array.isArray(owner.instanceTranslations) &&
        owner.instanceTranslations.length >= 64,
    )
    .sort(
      (a, b) =>
        (b.owner.parts?.length || 1) * b.owner.instanceTranslations.length -
        (a.owner.parts?.length || 1) * a.owner.instanceTranslations.length ||
        a.index - b.index,
    );
  report.selectedOwners = Math.min(selected.length, maxOwners);
  report.ownerOverflow = Math.max(0, selected.length - maxOwners);
  for (const { owner } of selected.slice(0, maxOwners)) {
    const parts = Array.isArray(owner.parts) ? owner.parts : [owner];
    const offsets = owner.instanceTranslations;
    if (
      !parts.length ||
      parts.length > 4096 ||
      !parts.every(
        (p) =>
          point(p.p) &&
          point(p.q) &&
          Number.isFinite(p.z0) &&
          Number.isFinite(p.z1) &&
          !p.lowerSurface?.appearance &&
          !p.upperSurface?.appearance,
      ) ||
      !offsets.every(point)
    ) {
      report.excludedOwners++;
      continue;
    }
    const fragments = [];
    let valid = true;
    try {
      for (const part of parts) {
        const intervals = visibleIntervals(part.z0, part.z1);
        if (!Array.isArray(intervals) || intervals.length > 2) {
          valid = false;
          break;
        }
        for (const interval of intervals) {
          if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite)) {
            valid = false;
            break;
          }
          const a = mapZ(interval[0]) * displayZScale;
          const b = mapZ(interval[1]) * displayZScale;
          if (![a, b].every(Number.isFinite)) {
            valid = false;
            break;
          }
          if (a === b) continue;
          fragments.push({
            minX: Math.min(part.p[0], part.q[0]),
            maxX: Math.max(part.p[0], part.q[0]),
            minY: Math.min(part.p[1], part.q[1]),
            maxY: Math.max(part.p[1], part.q[1]),
            minZ: Math.min(a, b),
            maxZ: Math.max(a, b),
          });
        }
        if (!valid) break;
      }
    } catch {
      valid = false;
    }
    if (!valid) {
      report.excludedOwners++;
      continue;
    }
    report.owners++;
    const count = offsets.length * fragments.length;
    report.representedQuads += count;
    // Never extrapolate a skipped work item into a valid projection result.
    for (const [dx, dy] of offsets) {
      for (const f of fragments) {
        if (report.measuredQuads >= maxQuads) {
          report.workOverflow = Math.max(0, report.representedQuads - report.measuredQuads);
          // The report is explicitly incomplete; stop without authorizing LOD.
          return report;
        }
        report.measuredQuads++;
        const projected = projectAxisAlignedTileBounds(
          {
            minX: f.minX + dx,
            maxX: f.maxX + dx,
            minY: f.minY + dy,
            maxY: f.maxY + dy,
            minZ: f.minZ,
            maxZ: f.maxZ,
          },
          viewProjectionMatrix,
          viewportWidth,
          viewportHeight,
        );
        if (projected.kind === 'uncertain-near-far') {
          report.nearPlaneUncertainQuads++;
          continue;
        }
        if (projected.kind === 'offscreen-bound') {
          report.offscreenQuads++;
          continue;
        }
        const footprint = Math.max(projected.widthPx, projected.heightPx);
        report.maxFootprintPx = Math.max(report.maxFootprintPx, footprint);
        if (footprint <= subpixelPx) {
          report.subpixelQuads++;
          // Count theoretical 2-pass transparent workload, not actual savings.
          report.rawTriangleCandidates += 4;
        }
        if (report.sample.length < 8) report.sample.push(Number(footprint.toFixed(4)));
      }
    }
  }
  return report;
}
