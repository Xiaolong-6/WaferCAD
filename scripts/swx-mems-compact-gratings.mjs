/**
 * Four candidate shallow-etched grating couplers at the compact switch's
 * stationary optical terminals. No source GDS or coupler design table exists.
 *
 * These arcs provide a physically patterned 150nm etch into 220nm silicon,
 * leaving a 70nm floor; pitch, duty cycle and sector shape are EXPLICITLY
 * illustrative. No optical efficiency, phase response or paper fidelity
 * is implied. Coordinates and lengths are in physical micrometres.
 */
export const SWX_COMPACT_GRATING_ASSUMPTIONS = Object.freeze({
  centersUm: [
    [-62, -26],
    [-62, -45],
    [-55, -95],
    [55, -95],
  ],
  padWidthUm: 12,
  firstGrooveRadiusUm: 1.35,
  groovePitchUm: 0.6,
  grooveWidthUm: 0.18,
  groovesPerTerminal: 6,
  sectorHalfAngleRad: Math.PI / 3.5,
  segmentsPerArc: 16,
  sourceGdsAvailable: false,
  sourcePitchVerified: false,
  deviceEtchDepthUm: 0.15,
  residualSiUm: 0.07,
});

function grooveAnnulus(cx, cy, inside, outside, assumptions) {
  const outer = [], inner = [];
  const { sectorHalfAngleRad: extent, segmentsPerArc: segments } = assumptions;
  for (let index = 0; index <= segments; index++) {
    const angle = -extent + (2 * extent * index) / segments;
    outer.push([cx + outside * Math.cos(angle), cy + outside * Math.sin(angle)]);
    inner.push([cx + inside * Math.cos(angle), cy + inside * Math.sin(angle)]);
  }
  return [...outer, ...inner.reverse()];
}

export function createCompactGratingGrooves(
  assumptions = SWX_COMPACT_GRATING_ASSUMPTIONS,
) {
  const {
    centersUm,
    padWidthUm,
    firstGrooveRadiusUm,
    groovePitchUm,
    grooveWidthUm,
    groovesPerTerminal,
  } = assumptions;
  if (!(groovePitchUm > grooveWidthUm && grooveWidthUm > 0)) {
    throw new Error('Compact grating pitch must exceed positive groove width');
  }
  const maxRadius = firstGrooveRadiusUm + (groovesPerTerminal - 1) * groovePitchUm +
    grooveWidthUm;
  if (!(firstGrooveRadiusUm > 0 && padWidthUm / 2 > maxRadius)) {
    throw new Error('Compact grating arcs must stay entirely on supported silicon pads');
  }
  const grooves = [], probes = [];
  for (const [cx, cy] of centersUm) {
    for (let i = 0; i < groovesPerTerminal; i++) {
      const radius = firstGrooveRadiusUm + i * groovePitchUm;
      grooves.push(grooveAnnulus(cx, cy, radius, radius + grooveWidthUm, assumptions));
      // At angle 0, the ring's midpoint is in shallow-etched silicon.
      // The midway point between this band and the next band is unetched.
      probes.push({
        terminal: [cx, cy],
        grooveIndex: i,
        groovePoint: [cx + radius + grooveWidthUm / 2, cy],
        ridgePoint: [cx + radius + (grooveWidthUm + groovePitchUm) / 2, cy],
      });
    }
  }
  return { grooves, probes, assumptions };
}
