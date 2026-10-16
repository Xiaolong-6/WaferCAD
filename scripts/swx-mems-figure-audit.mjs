// Advisory reconstruction-fidelity audit for Hu et al. Fig. 1c and Suppl. S8.
// This is not a pass/fail fabrication gate: paper images provide topology but
// cannot specify an unambiguous metrology tolerance or author-GDS coordinates.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSwxGeometry, SWX_REPORTED } from './swx-mems-geometry.mjs';
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';
import { createSwxCompactProcessGeometry } from './swx-mems-compact-process-geometry.mjs';
import { SWX_COMPACT_GUIDE_ASSUMPTIONS } from './swx-mems-compact-guides.mjs';
import { createSwxFootprintScopeAudit } from './swx-mems-footprint-scope.mjs';
import { auditCompactSpringAxialRegistration } from './swx-mems-spring-axial-audit.mjs';
import { createSwxSemSupportAudit } from './swx-mems-sem-support-audit.mjs';
import { auditSwxSemRegistration } from './swx-mems-sem-registration.mjs';

const extent = (points) => {
  const x = points.map(([px]) => px);
  const y = points.map(([, py]) => py);
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minY: Math.min(...y),
    maxY: Math.max(...y),
  };
};
const center = ({ minX, maxX, minY, maxY }) => ({
  x: (minX + maxX) / 2,
  y: (minY + maxY) / 2,
});
const poses = {};
for (const state of ['off', 'on']) {
  const g = createSwxGeometry(state);
  const fixed = g.physicalGroups.combBanks.fixed;
  const moving = g.physicalGroups.combBanks.moving;
  const fixedBounds = fixed.slice(0, 2).map(extent);
  const movingBounds = moving.slice(0, 2).map(extent);
  const fixedCenters = fixedBounds.map(center);
  const movingCenters = movingBounds.map(center);
  poses[state] = {
    swxAirGapUm: g.gapUm,
    movableTravelUm: g.travelUm,
    foldedSpringContours: g.physicalGroups.foldedSprings.length,
    combCellsPerBank: (fixed.length - 2) / 2,
    fixedBusBoundsUm: fixedBounds,
    movableBusBoundsUm: movingBounds,
    fixedBusCentersUm: fixedCenters,
    movableBusCentersUm: movingCenters,
    bankAxialCenterSeparationUm: Math.abs(fixedCenters[0].y - fixedCenters[1].y),
    bankLateralCenterSeparationUm: Math.abs(fixedCenters[0].x - fixedCenters[1].x),
  };
}
const prototype = {};
for (const state of ['off', 'on']) {
  const p = createSwxOptomechanicalCandidate(state);
  const compactMask = createSwxCompactProcessGeometry(state);
  const occupiedSilicon = compactMask.maskPolygons.get(1).flat();
  const footprint = extent(occupiedSilicon);
  const widthUm = footprint.maxX - footprint.minX;
  const heightUm = footprint.maxY - footprint.minY;
  const left = center(extent(p.actuator.banks[0].stationary[0]));
  const right = center(extent(p.actuator.banks[1].stationary[0]));
  prototype[state] = {
    integrationStatus: p.integrationStatus,
    swxAirGapUm: p.gapUm,
    movableTravelUm: p.travelUm,
    combCellsPerBank: p.actuator.banks.map((bank) => bank.stationary.length - 1),
    bankAxialCenterSeparationUm: Math.abs(left.y - right.y),
    foldedSpringContours: p.actuator.springContours.length,
    s8SpringAxialRegistration: auditCompactSpringAxialRegistration(state),
    semSupportOwnership: createSwxSemSupportAudit(state),
    semRegisteredUnitLayout: auditSwxSemRegistration(state),
    s8ShuttleDiagonals: p.actuator.shuttleDiagonals.length,
    s8ShuttleTriangularOpenCellProbes: p.actuator.triangularApertureProbes.length,
    s8TriangularPerforationSourceSpacingVerified: false,
    fixedOpticalRoutes: p.opticalRouting.fixed.length,
    compliantOpticalRoutes: p.opticalRouting.movingSpringWaveguides.length,
    supportedOpticalPads: p.opticalRouting.supportedPads.length,
    candidateMaskFootprintUm: [widthUm, heightUm],
    physicalEnvelopeByScopeUm: createSwxFootprintScopeAudit(state).scopes,
    reportedSingleSwitchFootprintUm: SWX_REPORTED.fullFootprintUm,
    comparisonScope:
      'illustrative optical pads and routing may lie outside published switch-only envelope',
    candidateShallowGratingGrooves: compactMask.physicalGroups.gratingGrooves.length,
    reportedGratingPitchVerified: false,
    movingOpticalBendRadiiUm: p.opticalRouting.movingCenterlines.map((line) =>
      line.halfTurns.map((arc) => arc.radiusUm),
    ),
    opticalR1TransitionRadiiUm: p.opticalRouting.movingCenterlines.map(
      (line) => line.transition.radiusUm,
    ),
    nominalS6StraightLUm: p.opticalRouting.movingCenterlines.map(
      (line) => line.nominalTerminalStraightLUm,
    ),
    s6WaypointRegistrationSourceVerified: false,
    halfTurnsPerOpticalLeg: p.opticalRouting.movingCenterlines.map((line) => line.halfTurns.length),
    s7GuidesIntegrated: true,
    s7GuideBeamsPerSide: p.guides.guides.map((guide) => (guide.beam ? 1 : 0)),
    s7SingleNarrowBeamTopologyFromSource: true,
    s7GuidesOriginalAnchorRegistrationVerified: false,
    s7CompleteSourceSchematicTopologyVerified: false,
    s7GuideSourceDimensionsUm: [7, 0.1, 1],
    opticalBendWaypointSourceVerified: false,
    completeFabricationHistoryVerified: false,
    fullWaferCADRendererAccepted: false,
    calibratedOpticalAndMechanicalModelsAvailable: false,
  };
}
const axialSeparation = poses.off.bankAxialCenterSeparationUm;
// Heuristic review trigger, NOT a tolerance from the paper: adjacent banks
// displaced by over two complete finger lengths cannot be called co-located.
const illustrativeTriggerUm = 2 * SWX_REPORTED.combFingerLengthUm;
const blockers = [
  {
    id: 'compact-s7-guide-source-registration',
    kind: 'paper-figure-position-unverified',
    note: 'Two 7um by 100nm structural guides with 1um trusses now satisfy illustrative OFF/ON material separation, but source-level pad positions, stiffness and displacement fields are not verified by original GDS/FEM.',
    guideAnchorsUm: SWX_COMPACT_GUIDE_ASSUMPTIONS.padCentersUm,
    sourceDimensionsPreserved: true,
    includedInCompactProcessMask: true,
    fullSourceS7SchematicTopologyVerified: false,
    schematicSingleAlignerBeamPerSide: true,
    sourceEvidence:
      'Direct check of Supplement Fig. S7a: the structural aligner is one 100nm narrow beam between wide ends; the adjacent multiply folded diagram is the folded spring. Removed unsupported dual-rail S7 aligners. The two anchor locations and stiffness still lack GDS/FEM verification.',
  },
];
blockers.push({
  id: 's8-shuttle-perforation-and-spring-registration',
  kind: 'source-figure-topology-unverified',
  note: 'Article Fig. 1c depicts triangular shuttle perforations and two folded-spring pairs alongside the shuttle; the compact candidate now adds alternating diagonal braces to yield open triangle-cell topology. Brace width/pitch, original triangular contours and spring-anchor registration remain inferred. Do not claim original GDS or FEM equivalence.',
  sourceFigure: 'article Fig. 1c / Supplement Fig. S8a',
  perforationPatternVerified: false,
  illustrativeTriangularAperturesImplemented: true,
  foldedSpringAnchorRegistrationVerified: false,
});
const springAxial = prototype.off.s8SpringAxialRegistration;
if (!springAxial.sourceTopologyMet) {
  blockers.push({
    id: 's8-folded-springs-do-not-flank-combs',
    kind: 'source-mechanical-topology',
    sourceFigure: springAxial.sourceFigure,
    actualAnchorCentersUm: springAxial.anchorPositionsUm,
    actualCombHandleSpanYUm: springAxial.combHandleSpanYUm,
    actualCounts: springAxial.counts,
    requiredCounts: { above: 2, below: 2, within: 0 },
    note: 'The paper places electrostatic combs between TWO axial spring pairs, whereas all four fixed spring anchors in this compact candidate are above the comb. Blindly mirroring the lower pair into the current SWX/optical-feed corridor produces fixed/moving Si contact; relocation requires an integrated mechanical + photonic layout redesign.',
    sourceTopologyMet: false,
  });
}
blockers.push({
  id: 'sem-peripheral-isolation-geometry-unreconstructed',
  kind: 'source-micrograph-perimeter-context',
  sourceFigure: 'article SEM Fig. 2a and Supplement fabrication methods',
  note: 'The compact Si mask covers device, optical leads and supported pads only. The visible surrounding isolation trenches/outer fixed Si and peripheral BOX release contour have NOT been reconstructed from SEM. Dark SEM contours cannot be assigned a unique Si or BOX etch depth from top view; do not invent a perimeter mask.',
  outerIsolationFrameReconstructed: false,
  physicalReleaseOwnershipContractPresent: true,
  sourcePerimeterEtchDepthVerified: false,
});
const semRegistration = prototype.off.semRegisteredUnitLayout;
if (!semRegistration.semRegistrationAccepted) {
  blockers.push({
    id: 'p0-single-unit-sem-axial-and-port-layout',
    kind: 'source-topology-blocking',
    sourceFigure: semRegistration.source.figure,
    semMovingSwxToCombUmApprox: semRegistration.semMovingSwxToCombUmApprox,
    sourceSignedAxialOffsetUmApprox: semRegistration.sourceSignedAxialOffsetUmApprox,
    candidateSignedAxialOffsetUm: semRegistration.candidateSignedAxialOffsetUm,
    candidateFixedOpticalTerminalCentersUm: semRegistration.candidateFixedOpticalTerminalCentersUm,
    issues: semRegistration.hardBlockers,
    note: 'Measured SEM shows moving SWT with comb below it and two laterally opposed fixed upper optical leads. Current actuator sits on the opposite axial side and both fixed terminal pads are left. The long x=24um mechanical detour cannot be source-matched by repainting the perimeter or moving external pads alone. Co-design the SWX-to-shuttle frame, two fixed optical leads, S6 returns and supported terminals before source visual acceptance.',
    registrationAccepted: false,
  });
}
const compactExtent = prototype.off.candidateMaskFootprintUm;
if (compactExtent.some((width, index) => width > SWX_REPORTED.fullFootprintUm[index])) {
  blockers.push({
    id: 'compact-optical-routing-footprint',
    kind: 'paper-footprint-comparability',
    candidateMaskExtentUm: compactExtent,
    reportedSwitchFootprintUm: SWX_REPORTED.fullFootprintUm,
    note: 'The full Mask includes separate external couplers and routing; Main text states 95x100um including MEMS while Supplement Table S1 lists 100x90um. See separate actuator/SWX/guides/meanders/feeds/pads envelopes before comparing any dimensions. The core geometry still requires source-level alignment.',
    scopeMatchedToPaper: false,
  });
}
if (axialSeparation > illustrativeTriggerUm) {
  blockers.push({
    id: 'opposed-comb-axial-alignment',
    kind: 'paper-figure-topology',
    note: 'Comb banks lie on opposite X sides but are separated in Y; remodel optical/actuator routing to achieve the compact alignment shown in Fig. 1c/S8.',
    actualSeparationUm: axialSeparation,
    reviewerHeuristicTriggerUm: illustrativeTriggerUm,
    paperToleranceAvailable: false,
  });
}
const audit = {
  source: {
    doi: '10.1038/s41467-024-55528-9',
    figures: ['article Fig. 1c', 'Supplement S8'],
    originalGdsAvailable: false,
    publishedEnvelopeDisagreement: {
      mainTextSwitchWithActuatorUm: [95, 100],
      supplementaryTableS1FullFootprintUm: [100, 90],
      comparisonScopeUnresolved: true,
    },
  },
  scope: 'figure/topology review only; no calibrated FEM/FDTD or author-GDS claim',
  poses,
  compactOptomechanicalPrototype: prototype,
  blockers,
  scienceVisualApproval: blockers.length === 0 ? 'requires-manual-review' : 'blocked',
  mergePermission: 'explicit-user-approval-required',
};
await mkdir(resolve('test-results/swx-mems'), { recursive: true });
const filepath = resolve('test-results/swx-mems/figure-layout-audit.json');
await writeFile(filepath, JSON.stringify(audit, null, 2) + '\n');
console.log('SWX source-layout audit: ' + audit.scienceVisualApproval);
console.log('Opposed comb axial separation: ' + axialSeparation.toFixed(3) + ' um');
console.log('Audit saved to ' + filepath);
