/**
 * Source-layout audit for the two opposed axial pairs of folded springs.
 *
 * Hu et al., main-text Fig. 1c and Supplement Fig. S8a place the combs
 * BETWEEN two pairs of folded springs, not on one side of all four springs.
 * Only the topology is source-derived: exact anchor XY remains unavailable.
 * This module measures actual polygon geometry, never guessed tolerances.
 */
import { createCompactSwxActuator } from './swx-mems-actuator-candidate.mjs';

const envelope = (ring) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};
const center = (min, max) => (min + max) / 2;

export function auditCompactSpringAxialRegistration(state = 'off') {
  const pose = createCompactSwxActuator(state);
  const handleBounds = pose.banks.flatMap((bank) => [
    envelope(bank.stationary[0]),
    envelope(bank.moving[0]),
  ]);
  const combSpan = {
    minY: Math.min(...handleBounds.map((bounds) => bounds.minY)),
    maxY: Math.max(...handleBounds.map((bounds) => bounds.maxY)),
  };
  const anchors = pose.anchors.map((polygon) => {
    const b = envelope(polygon);
    const xUm = center(b.minX, b.maxX);
    const yUm = center(b.minY, b.maxY);
    const relation = yUm > combSpan.maxY ? 'above' : yUm < combSpan.minY ? 'below' : 'within';
    return { xUm, yUm, relation, side: xUm < 0 ? 'left' : 'right' };
  });
  const stations = {
    above: anchors.filter((anchor) => anchor.relation === 'above'),
    below: anchors.filter((anchor) => anchor.relation === 'below'),
    within: anchors.filter((anchor) => anchor.relation === 'within'),
  };
  const spansBothSides = (station) =>
    station.length === 2 &&
    station.some((anchor) => anchor.side === 'left') &&
    station.some((anchor) => anchor.side === 'right');
  const sourceTopologyMet =
    pose.springContours.length === 4 &&
    spansBothSides(stations.above) &&
    spansBothSides(stations.below) &&
    stations.within.length === 0;
  return {
    state,
    actuatorDirection: '+Y',
    sourceFigure: 'article Fig. 1c and Supplement Fig. S8a',
    sourceRequirement: 'one pair of folded springs on each axial side of comb, two per station',
    sourceToleranceAvailable: false,
    anchorPositionsUm: anchors,
    combHandleSpanYUm: combSpan,
    counts: {
      above: stations.above.length,
      below: stations.below.length,
      within: stations.within.length,
    },
    sourceTopologyMet,
    annotation: sourceTopologyMet
      ? 'Axial arrangement meets source topological requirement; pad coordinates/FEM not verified'
      : 'Folded springs do not flank the combs as required by article Fig. 1c/S8a; source mechanical layout fidelity is blocked',
  };
}
