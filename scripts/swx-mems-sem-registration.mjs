/**
 * Primary P0, source-registered single-SWX layout acceptance.
 *
 * Measured APPROXIMATELY against the supplied article top-view SEM with
 * its 15 um / ~60 px bar. Source landmarks are not original author GDS.
 * This is a signed anatomical relation check; fixed/movable short-free
 * Kernel results alone cannot validate orientation or overall placement.
 */
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';
import { SWX_REPORTED } from './swx-mems-geometry.mjs';

export const SOURCE_SEM_REGISTER = Object.freeze({
  doi: '10.1038/s41467-024-55528-9',
  figure: 'article top-view SEM (Input 1/2 and Output 1/2 labeled)',
  scaleBarUm: 15,
  approximateScaleBarPx: 60,
  annotatedMovingSwxYPx: 123,
  annotatedCombYPx: 249,
  targetCombBelowMovingSwx: true,
  targetFixedTerminalsOppositeLateralSides: true,
  targetMovingTerminalsOppositeLateralSides: true,
  originalAuthorGdsAvailable: false,
  semPixelSelectionMetrologyCertified: false,
});

const bounds = (polygons) => {
  const points = polygons.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
};
const mid = (lo, hi) => (lo + hi) / 2;
const center = (polygon) => {
  const b = bounds([polygon]);
  return [mid(b.minX, b.maxX), mid(b.minY, b.maxY)];
};
const flanks = (xs) => xs.some((x) => x < 0) && xs.some((x) => x > 0);

export function auditSwxSemRegistration(state = 'off') {
  const pose = createSwxOptomechanicalCandidate(state);
  const mobileSwxY = center(pose.optics.movableFacetsAndPorts[0])[1];
  const fixedSwxY = center(pose.optics.fixedFacetsAndPorts[0])[1];
  const combBusCenters = pose.actuator.banks.flatMap((bank) => [
    center(bank.stationary[0])[1],
    center(bank.moving[0])[1],
  ]);
  const combY = combBusCenters.reduce((sum, y) => sum + y, 0) / combBusCenters.length;
  const supportedTerminalCenters = pose.opticalRouting.supportedPads.map(center);
  const fixedPorts = supportedTerminalCenters.slice(0, 2);
  const movingPorts = supportedTerminalCenters.slice(2);
  const sourceSwxToCombUmApprox =
    ((SOURCE_SEM_REGISTER.annotatedCombYPx - SOURCE_SEM_REGISTER.annotatedMovingSwxYPx) *
      SOURCE_SEM_REGISTER.scaleBarUm) /
    SOURCE_SEM_REGISTER.approximateScaleBarPx;
  const signedSourceSwxToCombUmApprox = -sourceSwxToCombUmApprox;
  const signedCandidateSwxToCombUm = combY - mobileSwxY;
  const badMechanicalSide = signedCandidateSwxToCombUm > 0;
  const fixedPortsBothOnLeft = fixedPorts.every(([x]) => x < 0);
  const fixedPortsLateralOpposed = flanks(fixedPorts.map(([x]) => x));
  const movingPortsLateralOpposed = flanks(movingPorts.map(([x]) => x));
  const measuredBridge = bounds(pose.mechanicalBridge);
  const movingBridgeExternalToShuttle = measuredBridge.maxX > SWX_REPORTED.shuttleWidthUm / 2;
  // The explicit source contract is: comb BELOW moving SWX, fixed optical
  // endpoints on BOTH lateral sides, and moving endpoints on BOTH sides.
  // The existing positive Si mask violates the first two unambiguously.
  const hardBlockers = [];
  if (badMechanicalSide) hardBlockers.push('actuator-on-wrong-side-of-moving-swx');
  if (!fixedPortsLateralOpposed) hardBlockers.push('fixed-optical-ports-on-one-side');
  if (!movingPortsLateralOpposed) hardBlockers.push('moving-optical-ports-not-laterally-opposed');
  return {
    state,
    source: SOURCE_SEM_REGISTER,
    physicalAxialConvention: 'positive Y is upward relative to user SEM image',
    semMovingSwxToCombUmApprox: sourceSwxToCombUmApprox,
    sourceSignedAxialOffsetUmApprox: signedSourceSwxToCombUmApprox,
    candidateFixedSwxYUm: fixedSwxY,
    candidateMovingSwxYUm: mobileSwxY,
    candidateCombYUm: combY,
    candidateSignedAxialOffsetUm: signedCandidateSwxToCombUm,
    candidateFixedOpticalTerminalCentersUm: fixedPorts,
    candidateMovingOpticalTerminalCentersUm: movingPorts,
    fixedPortsBothOnLeft,
    movingBridgeExternalToShuttle,
    hardBlockers,
    semRegistrationAccepted: hardBlockers.length === 0,
    note: 'Only signed orientation is a source-topology gate; approximate SEM distance is NOT a fabrication-dimension or fit-to-paper tolerance.',
  };
}
