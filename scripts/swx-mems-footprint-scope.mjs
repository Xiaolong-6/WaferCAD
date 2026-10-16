/**
 * Audit separate physical envelopes of the candidate rather than comparing
 * external optical I/O terminals with the reported MEMS switch footprint.
 *
 * This is strict geometry accounting, not a fit-to-paper optimization:
 * no coordinates or tolerances are changed by this module.
 */
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';
import { createSwxCompactProcessGeometry } from './swx-mems-compact-process-geometry.mjs';

export const SWX_FOOTPRINT_REFERENCES = Object.freeze({
  articleSwitchWithActuatorUm: [95, 100],
  supplementaryTableS1FullUm: [100, 90],
  articleSwxOnlyUm: [23, 23],
  sourcesDisagreeOnFullEnvelope: true,
  authorGdsAvailable: false,
});

export function polygonEnvelope(polygons) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let vertices = 0;
  for (const ring of polygons) {
    for (const [x, y] of ring) {
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error('Nonfinite coordinate in SWX envelope');
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      vertices++;
    }
  }
  if (vertices === 0) throw new Error('Cannot audit empty SWX envelope');
  return { minX, maxX, minY, maxY, widthUm: maxX - minX, heightUm: maxY - minY };
}

export function createSwxFootprintScopeAudit(state = 'off') {
  const pose = createSwxOptomechanicalCandidate(state);
  const process = createSwxCompactProcessGeometry(state);
  const actuator = [...pose.actuator.fixed, ...pose.actuator.movable, ...pose.actuator.flexure];
  const swx = [
    ...pose.optics.fixedFacetsAndPorts,
    ...pose.optics.movableFacetsAndPorts,
    ...pose.optics.fixedStops,
    ...pose.optics.movableStops,
    ...pose.mechanicalBridge,
  ];
  const guides = [...pose.guides.fixed, ...pose.guides.flexure];
  const compliantOptics = pose.opticalRouting.movingSpringWaveguides;
  const fixedOpticalFeeds = pose.opticalRouting.fixed;
  const externalCouplers = pose.opticalRouting.supportedPads;
  const subsets = {
    actuatorOnly: actuator,
    actuatorAndSwx: [...actuator, ...swx],
    actuatorSwxGuides: [...actuator, ...swx, ...guides],
    withCompliantOpticalLegs: [...actuator, ...swx, ...guides, ...compliantOptics],
    withFixedOpticalFeeds: [
      ...actuator,
      ...swx,
      ...guides,
      ...compliantOptics,
      ...fixedOpticalFeeds,
    ],
    fullSiliconIncludingExternalCouplers: [
      ...actuator,
      ...swx,
      ...guides,
      ...compliantOptics,
      ...fixedOpticalFeeds,
      ...externalCouplers,
    ],
  };
  const scopes = Object.fromEntries(
    Object.entries(subsets).map(([key, rings]) => [key, polygonEnvelope(rings)]),
  );
  const maskEnvelope = polygonEnvelope(process.maskPolygons.get(1));
  const full = scopes.fullSiliconIncludingExternalCouplers;
  for (const key of ['minX', 'maxX', 'minY', 'maxY']) {
    if (Math.abs(full[key] - maskEnvelope[key]) > 1e-9)
      throw new Error('SWX footprint groups omit physical mask silicon: ' + key);
  }
  return {
    state,
    references: SWX_FOOTPRINT_REFERENCES,
    scopes,
    maskEnvelope,
    maskSiliconPolygons: process.maskPolygons.get(1).length,
    opticalTerminals: externalCouplers.length,
    movingS6OpticalLegs: compliantOptics.length,
    guides: pose.guides.guides.length,
    sourceS7GuideAnchorRegistrationVerified: false,
    sourceS7CompleteFoldedGuideTopologyVerified: false,
    sourceFullFootprintScopeConfirmed: false,
    interpretation:
      'Switch-plus-MEMS envelope must be evaluated separately from illustrative optical feeds and grating pads. Main text and Supplementary Table S1 differ. Do not scale the layout or mark paper fidelity passed.',
  };
}
