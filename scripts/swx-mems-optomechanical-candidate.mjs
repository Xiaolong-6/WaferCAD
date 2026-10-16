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
import { createSwxDoubleHairpin } from './swx-mems-compact-bends.mjs';
import { createCompactSwxActuator } from './swx-mems-actuator-candidate.mjs';
import { SWX_COMPACT_GRATING_ASSUMPTIONS } from './swx-mems-compact-gratings.mjs';

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
      [
        [-22, -35],
        [-36, -30],
        [-47, -31],
        [-62, -26],
      ],
      coreWidth,
    ),
    ...miteredPolyline(
      [
        [21, -35],
        [20, -40],
        [-31, -40],
        [-44, -43],
        [-62, -45],
      ],
      coreWidth,
    ),
  ];
  // In source S6 BOTH waveguides have TWO 180-degree turns, R1=5um and
  // R2=3um. Assigning one radius to each waveguide was geometrically
  // valid but scientifically incorrect; model the paper topology here.
  const movingCenterlines = [-1, 1].map((side) =>
    createSwxDoubleHairpin({ side, travelUm: travel }),
  );
  const movingSpringWaveguides = movingCenterlines.flatMap((centerline) =>
    miteredPolyline(centerline.points, coreWidth),
  );
  // Fixed optical terminal pads represent supported endpoints; grating
  // tooth/groove masks and HF undercut boundaries are deliberately absent.
  const { centersUm, padWidthUm } = SWX_COMPACT_GRATING_ASSUMPTIONS;
  const supportedPads = centersUm.map(([x, y]) => pad(x, y, padWidthUm));
  return { fixed, movingSpringWaveguides, movingCenterlines, supportedPads };
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
    movable: [...actuator.movable, ...movableFacetsAndPorts, ...movableStops, ...mechanicalBridge],
    flexure: [...actuator.flexure, ...opticalRouting.movingSpringWaveguides],
    actuator,
    optics: { fixedFacetsAndPorts, movableFacetsAndPorts, fixedStops, movableStops },
    mechanicalBridge,
    opticalRouting,
    integrationStatus: 'optical-four-port-routing-candidate-no-wafercad-project',
    unresolved: [
      'Both moving optical legs carry S6 5/3um semicircles; placement, elastic deformation and FDTD losses remain unverified',
      'Shallow grating groove masks are illustrative; source pitch and coupling efficiency unverified',
      'Guided mechanical aligner supports have not yet been reconstructed',
      'BOX undercut, electrode insulation and complete process History need new verification',
      'Interface placement and mechanical-bridge thickness are illustrative, not published author GDS',
    ],
  };
}
