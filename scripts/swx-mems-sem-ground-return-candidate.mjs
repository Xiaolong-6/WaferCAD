/**
 * One isolated electrical-perimeter study for the Hu 2025 SWX 2x2 unit.
 *
 * This REPLACES the previous 6um BOX-supported side-rail experiment.
 * Fig. 1c shows a shared stationary-comb signal network and a grounded
 * non-drive network; the article does NOT specify these mask coordinates.
 * Real single-layer silicon routes are released where narrow, and verified
 * for OFF/ON connectivity, grounded/signal isolation and BOX ownership.
 * This is not an author-derived GDS or an accepted full switch structure.
 */
import { miteredPolyline } from './swx-mems-geometry.mjs';

const pad = ([x, y], width) => [
  [x - width / 2, y - width / 2],
  [x + width / 2, y - width / 2],
  [x + width / 2, y + width / 2],
  [x - width / 2, y + width / 2],
];
import {
  SWX_SEM_V2_PROCESS_PROFILE,
  createSwxSemV2ProcessGeometry,
  createSwxSemV2SupportAudit,
} from './swx-mems-sem-v2-unit.mjs';

export const SWX_GROUND_RETURN_ASSUMPTIONS = Object.freeze({
  authorPerimeterMaskKnown: false,
  authorGroundRoutingKnown: false,
  opticalAndElectromechanicalSimulationVerified: false,
  externalContactLocationsVerified: false,
  externalPadCentersUm: [
    [-76, -38],
    [61, -115],
  ],
  externalSiliconPadWidthUm: 8,
  externalMetalPadWidthUm: 3.5,
  // These are free-standing 220nm device-Si routing experiments, not
  // the wide retained-BOX return rails from the superseded candidate.
  groundTraceWidthUm: 0.8,
  signalTraceWidthUm: 1.2,
  groundPathsUm: [
    [
      [-70, -20],
      [-76, -20],
      [-76, -63],
      [-41, -70],
    ],
    [
      [70, -20],
      [76, -20],
      [76, -63],
      [41, -70],
    ],
  ],
  signalPathUm: [
    [-41, -78],
    [-61, -78],
    [-61, -115],
    [61, -115],
    [61, -78],
    [41, -78],
  ],
  // Local HF probes strictly in the narrow routes and away from pads.
  releasedRailProbePointsUm: [
    [-76, -51],
    [76, -40],
    [-61, -105],
    [61, -105],
    [0, -115],
  ],
});

/**
 * A deliberately conservative screening calculation, NOT a FEM result.
 *
 * The externally routed Si consists of very slender free-standing beams.
 * For a prismatic beam under axial compression, Euler critical strain is
 * (pi^2 / 12) * (h / L)^2 for pinned ends, and four times that for ideal
 * clamped ends, with weak-axis bending through film thickness h.
 *
 * An SOI device-Si residual stress measurement, true end constraints,
 * geometric imperfections and 3D post-HF FEM are NOT available. Therefore
 * even the favorable clamped value cannot certify fabrication stability.
 */
export function auditSwxGroundReturnBucklingRisk() {
  const thicknessUm = 0.22; // Paper's full device Si thickness, not a fit.
  const assumedYoungModulusGPa = 169; // Illustrative crystal-axis value.
  const measuredResidualCompression = false;
  const routes = [
    ...SWX_GROUND_RETURN_ASSUMPTIONS.groundPathsUm.map((points, index) => ({
      name: 'ground-' + index,
      points,
    })),
    { name: 'signal', points: SWX_GROUND_RETURN_ASSUMPTIONS.signalPathUm },
  ];
  const spans = routes.flatMap(({ name, points }) =>
    points.slice(1).map((to, index) => {
      const from = points[index];
      const lengthUm = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const pinnedCriticalStrain = (Math.PI ** 2 / 12) * (thicknessUm / lengthUm) ** 2;
      return {
        route: name,
        segmentIndex: index,
        from,
        to,
        lengthUm,
        pinnedCriticalStrain,
        idealClampedCriticalStrain: pinnedCriticalStrain * 4,
      };
    }),
  );
  const longest = spans.reduce((best, item) => (item.lengthUm > best.lengthUm ? item : best));
  // Scenario stresses are NOT measured in the paper or WaferCAD model.
  const hypothetical100ppmCompression = 100e-6;
  return {
    source: 'Hu 2025 220nm Si; ideal uniform Euler beam, weak-axis compression screen only',
    thicknessUm,
    assumedYoungModulusGPa,
    measuredResidualCompression,
    spans,
    longest,
    hypothetical100ppmCompression,
    stressScenarioMPa: hypothetical100ppmCompression * assumedYoungModulusGPa * 1e3,
    idealClampedCriticalStressMPa:
      longest.idealClampedCriticalStrain * assumedYoungModulusGPa * 1e3,
    hypotheticalStrainToIdealClampedCriticalRatio:
      hypothetical100ppmCompression / longest.idealClampedCriticalStrain,
    residualCompressionDirectionKnown: false,
    endConstraintsVerified: false,
    geometricImperfectionsVerified: false,
    actualWaferBucklingPredicted: false,
    mechanicalFEMVerified: false,
    paperPerimeterMechanicalAcceptance: false,
  };
}

export function createSwxSemGroundReturnCandidate(state = 'off') {
  const original = createSwxSemV2ProcessGeometry(state);
  const groundRails = SWX_GROUND_RETURN_ASSUMPTIONS.groundPathsUm.map(
    (path) => miteredPolyline(path, SWX_GROUND_RETURN_ASSUMPTIONS.groundTraceWidthUm)[0],
  );
  const signalRail = miteredPolyline(
    SWX_GROUND_RETURN_ASSUMPTIONS.signalPathUm,
    SWX_GROUND_RETURN_ASSUMPTIONS.signalTraceWidthUm,
  )[0];
  const siliconPads = SWX_GROUND_RETURN_ASSUMPTIONS.externalPadCentersUm.map((center) =>
    pad(center, SWX_GROUND_RETURN_ASSUMPTIONS.externalSiliconPadWidthUm),
  );
  const metalPads = SWX_GROUND_RETURN_ASSUMPTIONS.externalPadCentersUm.map((center) =>
    pad(center, SWX_GROUND_RETURN_ASSUMPTIONS.externalMetalPadWidthUm),
  );
  const perimeterRoutes = [...groundRails, signalRail, ...siliconPads];
  const maskPolygons = new Map(original.maskPolygons);
  maskPolygons.set(1, [...original.maskPolygons.get(1), ...perimeterRoutes]);
  maskPolygons.set(3, [...original.maskPolygons.get(3), ...metalPads]);
  const layout = {
    ...original.layout,
    name: 'SEM-v2 two-net perimeter routing study — NOT AUTHOR GDS',
    elements: [
      ...original.layout.elements,
      ...perimeterRoutes.map((points) => ({
        kind: 'polygon',
        sourceCell: 'SWX_MEMS_UNIT',
        layer: 1,
        datatype: 0,
        points,
      })),
      ...metalPads.map((points) => ({
        kind: 'polygon',
        sourceCell: 'SWX_MEMS_UNIT',
        layer: 3,
        datatype: 0,
        points,
      })),
    ],
    combos: original.layout.combos.map((combo) =>
      combo.layer === 1 ? { ...combo, count: maskPolygons.get(1).length } : combo,
    ),
  };
  return {
    ...original,
    maskPolygons,
    layout,
    physicalGroups: {
      ...original.physicalGroups,
      candidateGroundRails: groundRails,
      candidateSignalRail: signalRail,
      candidateExternalSiliconPads: siliconPads,
      candidateExternalMetalPads: metalPads,
    },
    reconstructionStatus: 'illustrative-two-net-perimeter-study-not-paper-accepted',
  };
}

export function createSwxGroundReturnSupportAudit(state = 'off') {
  const original = createSwxSemV2SupportAudit(state);
  return {
    ...original,
    supported: [
      ...original.supported,
      ...SWX_GROUND_RETURN_ASSUMPTIONS.externalPadCentersUm.map((point, index) => ({
        name: 'illustrative external electrical anchor ' + index,
        point,
      })),
    ],
    // No unverified BOX-backed side rails. All five remote segments must
    // genuinely lose BOX in the processed wafer, in both actuation states.
    released: [
      ...original.released,
      ...SWX_GROUND_RETURN_ASSUMPTIONS.releasedRailProbePointsUm.map((point, index) => ({
        name: 'electrical-perimeter released rail ' + index,
        point,
      })),
    ],
    authorPerimeterContactsVerified: false,
    outerIsolationTrenchVerified: false,
    sourceHFUndercutFrontVerified: false,
  };
}

export const SWX_GROUND_RETURN_PROCESS_PROFILE = Object.freeze({
  ...SWX_SEM_V2_PROCESS_PROFILE,
  geometryFactory: createSwxSemGroundReturnCandidate,
  semSupportAudit: createSwxGroundReturnSupportAudit,
  electricalContactPoints: [
    ...SWX_SEM_V2_PROCESS_PROFILE.electricalContactPoints,
    ...SWX_GROUND_RETURN_ASSUMPTIONS.externalPadCentersUm,
  ],
  projectName: 'Hu SWX 2x2 experimental Ground and Signal rails · NOT AUTHOR MASK',
  assumptions: SWX_GROUND_RETURN_ASSUMPTIONS,
});
