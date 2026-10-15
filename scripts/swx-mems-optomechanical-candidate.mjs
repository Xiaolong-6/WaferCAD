/**
 * Optical/SWX mechanical interface experiment for the compact S8 actuator.
 *
 * This does not replace the canonical Recipe or create a project. Only the
 * existing tooth facets, four near-facet ports and stoppers are translated
 * as a rigid coordinate frame. Four new optical links are an ILLUSTRATIVE
 * clearance candidate; author-defined 3/5um meanders, optical grating
 * teeth, alignment supports and BOX recipe must still be integrated.
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
  // The original 104um field must NOT be silently reused here. The
  // illustrative optical terminal pads extend to y≈-97um and will need
  // new substrate/mask/ROI bounds and BOX release upon integration.
  requiredFieldMinYUm: -100,
});

const movePolygons = (polygons, deltaX, deltaY) =>
  polygons.map((ring) => ring.map(([x, y]) => [x + deltaX, y + deltaY]));

const pad = (x, y, width) => [
  [x - width / 2, y - width / 2],
  [x + width / 2, y - width / 2],
  [x + width / 2, y + width / 2],
  [x - width / 2, y + width / 2],
];

function makeOpticalRouting(travel) {
  // Each stationary reflector port remains on the fixed half of the SWX.
  // The right fixed port loops to the left BELOW the shuttle bottom, while
  // the two compliant lower-half waveguides are routed farther downstream.
  // This deliberately avoids the moving bridge at (24,-49.6..-27.4)um.
  const coreWidth = 0.4;
  const fixed = [
    ...miteredPolyline(
      [[-22, -35], [-36, -30], [-47, -31], [-62, -26]],
      coreWidth,
    ),
    ...miteredPolyline(
      [[21, -35], [20, -40], [-31, -40], [-44, -43], [-62, -45]],
      coreWidth,
    ),
  ];
  const movingSpringWaveguides = [
    ...miteredPolyline(
      [
        [-22, -61 + travel],
        [-35, -65 + 0.8 * travel],
        [-37, -74 + 0.6 * travel],
        [-47, -83 + 0.3 * travel],
        [-55, -95],
      ],
      coreWidth,
    ),
    ...miteredPolyline(
      [
        [21, -61 + travel],
        [31, -66 + 0.8 * travel],
        [39, -72 + 0.5 * travel],
        [49, -87 + 0.2 * travel],
        [55, -95],
      ],
      coreWidth,
    ),
  ];
  // Fixed optical terminal pads represent supported endpoints; grating
  // tooth/groove masks and HF undercut boundaries are deliberately absent.
  const supportedPads = [
    pad(-62, -26, 8),
    pad(-62, -45, 8),
    pad(-55, -95, 8),
    pad(55, -95, 8),
  ];
  return { fixed, movingSpringWaveguides, supportedPads };
}

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
  const opticalRouting = makeOpticalRouting(travel);
  return {
    state,
    travelUm: travel,
    gapUm: state === 'off' ? 0.9 : 0.015,
    fixed: [
      ...actuator.fixed,
      ...fixedFacetsAndPorts,
      ...fixedStops,
      ...opticalRouting.fixed,
      ...opticalRouting.supportedPads,
    ],
    movable: [
      ...actuator.movable,
      ...movableFacetsAndPorts,
      ...movableStops,
      ...mechanicalBridge,
    ],
    flexure: [...actuator.flexure, ...opticalRouting.movingSpringWaveguides],
    actuator,
    optics: { fixedFacetsAndPorts, movableFacetsAndPorts, fixedStops, movableStops },
    mechanicalBridge,
    opticalRouting,
    integrationStatus: 'optical-four-port-routing-candidate-no-wafercad-project',
    unresolved: [
      'Optical routes are illustrative; 3/5um meander radii and FDTD losses are not yet qualified',
      'Optical grating coupler geometry and structural aligner supports are not yet connected',
      'BOX undercut, electrode insulation and complete process History need new verification',
      'Interface placement and mechanical-bridge thickness are illustrative, not published author GDS',
    ],
  };
}
