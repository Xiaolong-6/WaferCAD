/**
 * Optical/SWX mechanical interface experiment for the compact S8 actuator.
 *
 * This does not replace the canonical Recipe or create a project. Only the
 * existing tooth facets, four near-facet ports and stoppers are translated
 * as a rigid coordinate frame. The rest of the optical waveguide routing,
 * alignment supports and BOX recipe must be rebuilt independently.
 */
import { createSwxGeometry, miteredPolyline } from './swx-mems-geometry.mjs';
import { createCompactSwxActuator } from './swx-mems-actuator-candidate.mjs';

export const SWX_INTERFACE_ASSUMPTIONS = Object.freeze({
  // Measured from the illustrative mask, not a published registration datum.
  offsetXUm: 31,
  offsetYUm: -48,
  bridgeCornerXUm: 24,
  bridgeStartXUm: 3.5,
  bridgeWidthUm: 0.7,
  // The previous 104um field is intentionally NOT silently scaled here.
  // Both BOX release and viewport extents need readjustment upon integration.
  requiredFieldMinYUm: -64,
});

const movePolygons = (polygons, deltaX, deltaY) =>
  polygons.map((ring) => ring.map(([x, y]) => [x + deltaX, y + deltaY]));

export function createSwxOptomechanicalCandidate(state = 'off') {
  const actuator = createCompactSwxActuator(state);
  const nativeOptics = createSwxGeometry(state).physicalGroups;
  const { offsetXUm: dx, offsetYUm: dy, bridgeCornerXUm: corner } = SWX_INTERFACE_ASSUMPTIONS;
  const shift = (polygons) => movePolygons(polygons, dx, dy);
  const fixedFacetsAndPorts = shift(nativeOptics.fixed.slice(0, 5));
  const movableFacetsAndPorts = shift(nativeOptics.movable.slice(0, 5));
  const fixedStops = shift(nativeOptics.stopperFixed);
  const movableStops = shift(nativeOptics.stopperMovable);
  // The moving tooth facet has a supported lower side at y ~= -1.6um
  // in the native frame. Depart laterally BELOW the fixed half to avoid
  // crossing its reflecting facet or right-side optical taper.
  const travel = actuator.travelUm;
  const bridgeStart = [SWX_INTERFACE_ASSUMPTIONS.bridgeStartXUm, dy - 1.6 + travel];
  const bridgeCorner = [corner, dy - 1.6 + travel];
  const bridgeEnd = [corner, -27.4 + travel];
  const mechanicalBridge = miteredPolyline(
    [bridgeStart, bridgeCorner, bridgeEnd],
    SWX_INTERFACE_ASSUMPTIONS.bridgeWidthUm,
  );
  return {
    state,
    travelUm: travel,
    gapUm: state === 'off' ? 0.9 : 0.015,
    fixed: [...actuator.fixed, ...fixedFacetsAndPorts, ...fixedStops],
    movable: [
      ...actuator.movable,
      ...movableFacetsAndPorts,
      ...movableStops,
      ...mechanicalBridge,
    ],
    flexure: actuator.flexure,
    actuator,
    optics: { fixedFacetsAndPorts, movableFacetsAndPorts, fixedStops, movableStops },
    mechanicalBridge,
    integrationStatus: 'facet-and-shuttle-interface-only-no-wafercad-project',
    unresolved: [
      'Both compliant moving optical waveguides and fixed-side optical routing remain to be designed',
      'Optical grating couplers and structural aligner supports are not yet connected',
      'BOX undercut, electrode insulation and complete process History need new verification',
      'Interface placement and mechanical-bridge thickness are illustrative, not published author GDS',
    ],
  };
}
