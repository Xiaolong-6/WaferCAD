/**
 * Isolated, source-oriented 2x2 MEMS unit experiment.
 *
 * Not original author GDS. The original SWX/core and reported widths, folds
 * and pose gaps are retained. A coupled mechanical/optical re-registration
 * places the comb BELOW the movable SWX and puts fixed Input1/Output1 on
 * opposing lateral sides as observed in Fig. 1a SEM.
 *
 * This module cannot be promoted until OFF/ON Kernel, BOX, Recipe, 3D,
 * physical masks and SEM-side visual evidence have passed.
 */
import { createSwxCompactProcessGeometry } from './swx-mems-compact-process-geometry.mjs';
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';
import { miteredPolyline, SWX_REPORTED } from './swx-mems-geometry.mjs';
import { filletPolyline } from './swx-mems-compact-bends.mjs';
import {
  createCompactGratingGrooves,
  SWX_COMPACT_GRATING_ASSUMPTIONS,
} from './swx-mems-compact-gratings.mjs';

const move = (ring, dx, dy) => ring.map(([x, y]) => [x + dx, y + dy]);
const rect = (cx, cy, w, h) => [
  [cx - w / 2, cy - h / 2],
  [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2],
  [cx - w / 2, cy + h / 2],
];
const strip = (points, width) => miteredPolyline(points, width)[0];
const newTerminalsUm = Object.freeze([
  [-70, -20],
  [70, -20],
  [-64, -71],
  [64, -71],
]);
const electrodeCentersUm = Object.freeze([
  [-41, -70],
  [-49, -99],
  [49, -99],
  [41, -70],
  [-41, -78],
  [41, -78],
]);
export const SWX_SEM_V2_ASSUMPTIONS = Object.freeze({
  sourceSEMAlignedMechanicalAxis: true,
  sourceFixedPortsOpposed: true,
  actuatorFrameTranslationYUm: -90,
  upperHorizontalAnchorXUm: 41,
  upperHorizontalAnchorYUm: -70,
  lowerHorizontalAnchorXUm: 49,
  lowerHorizontalAnchorYUm: -99,
  lowerSpringBeamLongUm: SWX_REPORTED.foldedSpringLongBeamUm,
  lowerSpringBeamShortUm: SWX_REPORTED.foldedSpringShortBeamUm,
  foldedSpringTrussWidthUm: SWX_REPORTED.foldedSpringTrussUm,
  sourceAuthorGdsAvailable: false,
  fullFidelityClaim: false,
  fixedLeadIllustrativeFilletRadiusUm: 6,
  // Approximate SEM port-to-comb registration, NOT author-mask metrology.
  s6OpticalTerminalInwardShiftUm: 6,
  fixedTerminalCentersUm: newTerminalsUm,
  electrodeCentersUm,
  fieldUm: [160, 260],
});

function newHairpin(side, travel) {
  const x = (u) => side * u;
  const inward = SWX_SEM_V2_ASSUMPTIONS.s6OpticalTerminalInwardShiftUm;
  const y = (u) => u + inward + travel;
  // Embed the lead inside the existing movable SWT port rather than
  // touching only its polygon boundary. The port translates in ON.
  const start = [side < 0 ? -20 : 19.5, -61 + travel];
  const lead = filletPolyline(
    [start, [x(36), y(-65)], [x(58), y(-65)]],
    SWX_REPORTED.meanderRadiiUm[0],
    16,
  );
  const points = [...lead.points];
  const returnArcs = [];
  const radius = SWX_REPORTED.meanderRadiiUm[1];
  const addReturn = (cx, cy, sweep) => {
    const startIndex = points.length - 1;
    for (let index = 1; index <= 24; index++) {
      const radians = Math.PI / 2 + (sweep * index) / 24;
      points.push([cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)]);
    }
    returnArcs.push({
      center: [cx, cy],
      radiusUm: radius,
      sweepRad: sweep,
      startIndex,
      endIndex: points.length - 1,
    });
  };
  addReturn(x(58), y(-68), -side * Math.PI);
  points.push([x(49), y(-71)]);
  addReturn(x(49), y(-74), side * Math.PI);
  const terminalStraightStart = points.at(-1);
  const stationaryEnd = [x(64), -77 + inward];
  points.push(stationaryEnd);
  return {
    polygons: miteredPolyline(points, SWX_REPORTED.waveguideCoreUm),
    centerline: points,
    transitionArcs: lead.arcs,
    returnArcs,
    terminalStraightStart,
    stationaryEnd,
    movingStart: start,
    coreWidthUm: SWX_REPORTED.waveguideCoreUm,
    radiiUm: [SWX_REPORTED.meanderRadiiUm[0], radius, radius],
    straightLUm: SWX_REPORTED.meanderLengthUm,
    sourceWaypointCoordinatesVerified: false,
    terminalInwardShiftIsSEMEstimate: true,
  };
}

function semV2PhysicalPose(state) {
  const source = createSwxOptomechanicalCandidate(state);
  const actuator = source.actuator;
  const travel = source.travelUm;
  const down = SWX_SEM_V2_ASSUMPTIONS.actuatorFrameTranslationYUm;
  const translateActuatorAnchor = (ring, index) => {
    const upper = index % 2 === 1;
    const side = index < 2 ? -1 : 1;
    const anchorX = upper
      ? SWX_SEM_V2_ASSUMPTIONS.upperHorizontalAnchorXUm
      : SWX_SEM_V2_ASSUMPTIONS.lowerHorizontalAnchorXUm;
    const anchorY = upper
      ? SWX_SEM_V2_ASSUMPTIONS.upperHorizontalAnchorYUm
      : SWX_SEM_V2_ASSUMPTIONS.lowerHorizontalAnchorYUm;
    return rect(side * anchorX, anchorY, 8, 8);
  };
  const horizontalSpringCenterline = (side, upper) => {
    const x = (value) => side * value;
    const anchorY = upper
      ? SWX_SEM_V2_ASSUMPTIONS.upperHorizontalAnchorYUm
      : SWX_SEM_V2_ASSUMPTIONS.lowerHorizontalAnchorYUm;
    const direction = upper ? -1 : 1;
    const long = SWX_REPORTED.foldedSpringLongBeamUm;
    const short = SWX_REPORTED.foldedSpringShortBeamUm;
    const pitch = SWX_REPORTED.foldedSpringClearanceUm + SWX_REPORTED.foldedSpringWidthUm;
    const outerX = upper
      ? SWX_SEM_V2_ASSUMPTIONS.upperHorizontalAnchorXUm
      : SWX_SEM_V2_ASSUMPTIONS.lowerHorizontalAnchorXUm;
    // Both axial spring pairs have the source's 30/22/30um horizontal
    // fold sections, 200nm beam and 1.5um edge clearance; upper is
    // mirrored axially to bracket the stationary/moving comb.
    const path = [
      [x(outerX), anchorY],
      [x(outerX - long), anchorY],
      [x(outerX - long), anchorY + direction * pitch],
      [x(outerX - long + short), anchorY + direction * pitch],
      [x(outerX - long + short), anchorY + direction * 2 * pitch],
      [x(outerX - 2 * long + short), anchorY + direction * 2 * pitch],
      [x(outerX - 2 * long + short), anchorY + direction * 3 * pitch],
      [x((SWX_REPORTED.shuttleWidthUm - 0.7) / 2), anchorY + direction * 3 * pitch],
    ];
    return path.map(([px, py], index) => [px, py + (travel * index) / (path.length - 1)]);
  };
  const fixedActuator = [
    ...actuator.banks.flatMap((bank) => bank.stationary.map((p) => move(p, 0, down))),
    ...actuator.anchors.map(translateActuatorAnchor),
  ];
  const shuttle = actuator.shuttle.slice(0, -4).map((ring) => move(ring, 0, down));
  // Both horizontal spring pairs meet the movable shuttle directly at
  // its existing side rails. Remove the old long upper/lower moving
  // crossbars; they artificially spanned the optical and spring corridors.
  const movableActuator = [
    ...actuator.banks.flatMap((bank) => bank.moving.map((p) => move(p, 0, down))),
    ...shuttle,
  ];
  const springCenterlines = actuator.springContours.map((ring, index) => {
    const side = index < 2 ? -1 : 1;
    return horizontalSpringCenterline(side, index % 2 === 1);
  });
  const lowerSpringCenterlines = [springCenterlines[0], springCenterlines[2]];
  const upperSpringCenterlines = [springCenterlines[1], springCenterlines[3]];
  const springs = springCenterlines.map((centerline) => {
    return miteredPolyline(centerline, SWX_REPORTED.foldedSpringWidthUm)[0];
  });
  // Supplement S7a identifies 1um-wide TRUSSES connecting adjacent
  // horizontal 200nm compliant runs. They must be real device Si, not
  // a graphical border thickening; release these 12 bars with the beam.
  const springTrussContours = springCenterlines.flatMap((centerline) =>
    [
      [1, 2],
      [3, 4],
      [5, 6],
    ].map(([start, end]) => {
      const p = centerline[start];
      const q = centerline[end];
      if (Math.abs(p[0] - q[0]) > 1e-9) {
        throw new Error('Folded spring truss must connect vertical station spans');
      }
      return rect(
        p[0],
        (p[1] + q[1]) / 2,
        SWX_REPORTED.foldedSpringTrussUm,
        Math.abs(p[1] - q[1]) + SWX_REPORTED.foldedSpringWidthUm,
      );
    }),
  );
  // The source SEM has opposing, inward-sloped fixed input/output guides,
  // not two vertical posts and a horizontal roof above the SWX. The
  // intermediate XY and 6um fillet radius are illustrative placements:
  // do NOT treat them as author GDS or a reported bend-radius constant.
  const fixedLead = (points) =>
    strip(
      filletPolyline(points, SWX_SEM_V2_ASSUMPTIONS.fixedLeadIllustrativeFilletRadiusUm).points,
      0.4,
    );
  const fixedRoutes = [
    fixedLead([
      [-22, -35],
      [-30, -13],
      [-70, -20],
    ]),
    fixedLead([
      [21, -35],
      [30, -13],
      [70, -20],
    ]),
  ];
  const hairpins = [-1, 1].map((side) => newHairpin(side, travel));
  const opticalFlexures = hairpins.flatMap((route) => route.polygons);
  const fixedPads = newTerminalsUm.map(([x, y]) => rect(x, y, 12, 12));
  const bridge = [
    strip(
      [
        [0, -50 + travel],
        [0, -53.4 + travel],
      ],
      0.7,
    ),
    strip(
      [
        [0, -50 + travel],
        [23.95, -50 + travel],
        [24, -45 + travel],
      ],
      0.7,
    ),
  ];
  const fixed = [
    ...fixedActuator,
    ...source.optics.fixedFacetsAndPorts,
    ...source.optics.fixedStops,
    ...fixedRoutes,
    ...fixedPads,
    ...source.guides.fixed,
  ];
  const movable = [
    ...movableActuator,
    ...source.optics.movableFacetsAndPorts,
    ...source.optics.movableStops,
    ...bridge,
  ];
  const flexure = [
    ...springs,
    ...springTrussContours,
    ...opticalFlexures,
    ...source.guides.flexure,
  ];
  return {
    source,
    state,
    travel,
    fixed,
    movable,
    flexure,
    fixedActuator,
    movableActuator,
    springContours: springs,
    springCenterlines,
    springTrussContours,
    lowerSpringCenterlines,
    upperSpringCenterlines,
    fixedRoutes,
    opticalFlexures,
    fixedPads,
    hairpins,
    bridge,
  };
}

export function createSwxSemV2ProcessGeometry(state = 'off') {
  const pose = semV2PhysicalPose(state);
  const original = createSwxCompactProcessGeometry(state);
  const originalGrooves = createCompactGratingGrooves();
  const oldCenters = SWX_COMPACT_GRATING_ASSUMPTIONS.centersUm;
  const translatedGrooves = originalGrooves.grooves.map((ring, index) => {
    const sourceCenter = oldCenters[Math.floor(index / 6)];
    const newCenter = newTerminalsUm[Math.floor(index / 6)];
    return move(ring, newCenter[0] - sourceCenter[0], newCenter[1] - sourceCenter[1]);
  });
  const relocatedProbes = originalGrooves.probes.map((item) => {
    const terminalIndex = oldCenters.findIndex(
      ([x, y]) => x === item.terminal[0] && y === item.terminal[1],
    );
    if (terminalIndex < 0) throw new Error('Unknown grating support terminal');
    const sourceCenter = oldCenters[terminalIndex];
    const newCenter = newTerminalsUm[terminalIndex];
    const dx = newCenter[0] - sourceCenter[0];
    const dy = newCenter[1] - sourceCenter[1];
    return {
      groovePoint: [item.groovePoint[0] + dx, item.groovePoint[1] + dy],
      ridgePoint: [item.ridgePoint[0] + dx, item.ridgePoint[1] + dy],
    };
  });
  const silicon = [...pose.fixed, ...pose.movable, ...pose.flexure];
  const ridge = [...original.maskPolygons.get(2).slice(0, 4), ...translatedGrooves];
  const electrodes = electrodeCentersUm.map(([x, y]) => rect(x, y, 3.5, 3.5));
  const maskPolygons = new Map([
    [1, silicon],
    [2, ridge],
    [3, electrodes],
  ]);
  const labels = original.maskNames;
  const [width, height] = SWX_SEM_V2_ASSUMPTIONS.fieldUm;
  const elements = [...maskPolygons].flatMap(([layer, rings]) =>
    rings.map((points) => ({
      kind: 'polygon',
      sourceCell: 'SWX_MEMS_UNIT',
      layer,
      datatype: 0,
      points,
    })),
  );
  const layout = {
    ...original.layout,
    name: 'SEM axial topology v2 — unverified source GDS / no calibrated FEM',
    elements,
    combos: labels.map(({ layer }) => ({
      key: 'SWX_MEMS_UNIT|' + layer + '|0',
      cell: 'SWX_MEMS_UNIT',
      layer,
      datatype: 0,
      count: maskPolygons.get(layer).length,
    })),
    bounds: {
      minX: -width / 2,
      minY: -height / 2,
      maxX: width / 2,
      maxY: height / 2,
      width,
      height,
    },
  };
  return {
    ...original,
    state,
    maskPolygons,
    layout,
    releasedBeamTestPoint: [(SWX_REPORTED.shuttleWidthUm - 0.7) / 2, -72 + pose.travel],
    anchorTestPoint: [49, -99],
    physicalGroups: {
      ...original.physicalGroups,
      fixed: pose.fixed,
      movable: pose.movable,
      flexure: pose.flexure,
      semV2: pose,
      gratingGrooves: translatedGrooves,
      gratingGrooveProbes: relocatedProbes,
    },
    reconstructionStatus: 'isolated-source-oriented-sem-v2-experimental-not-accepted',
  };
}

/**
 * BOX support ownership for the re-registered silicon, verified on both
 * real Kernel states. All points are illustrative local model coordinates.
 * SEM cannot provide a 3D undercut front or full peripheral material map.
 */
export function createSwxSemV2SupportAudit(state = 'off') {
  const travel = state === 'on' ? SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm : 0;
  const add = (name, point) => ({ name, point });
  const supported = [
    add('stationary left comb handle', [-25, -78]),
    add('stationary right comb handle', [25, -78]),
    add('lower left spring anchor', [-49, -99]),
    add('upper left spring anchor', [-41, -70]),
    add('lower right spring anchor', [49, -99]),
    add('upper right spring anchor', [41, -70]),
    add('S7 left stationary anchor', [-14, -50]),
    add('S7 right stationary anchor', [34, -45]),
    ...newTerminalsUm.map((point, index) => add('terminal support ' + index, point)),
  ];
  // Inspect each *real* 1um truss at its own centroid after HF. The
  // older 14 released point probes covered compliant beams but not the
  // wider truss Si that could retain an unintended BOX island.
  const springPose = semV2PhysicalPose(state);
  const springTrusses = springPose.springTrussContours;
  const trussReleasePoints = springTrusses.map((ring, index) => {
    const xs = ring.map((point) => point[0]);
    const ys = ring.map((point) => point[1]);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    return add('folded spring truss ' + index, [x, y]);
  });
  // Each narrow 200nm compliant horizontal run must itself lose BOX after
  // HF; sampling only the 1um trusses would miss isolated unreleased spans.
  // Midpoints are safely away from the BOX-supported outer spring pads.
  const beamRunReleasePoints = springPose.springCenterlines.flatMap((path, springIndex) =>
    [
      [0, 1],
      [2, 3],
      [4, 5],
    ].map(([a, b], runIndex) =>
      add('folded spring beam ' + springIndex + ' run ' + runIndex, [
        (path[a][0] + path[b][0]) / 2,
        (path[a][1] + path[b][1]) / 2,
      ]),
    ),
  );
  const released = [
    add('moving shuttle rail', [2.65, -72 + travel]),
    add('left moving comb handle', [-25, -87.4 + travel]),
    add('right moving comb handle', [25, -87.4 + travel]),
    add('left lower folded spring', [-34, -99 + travel / 14]),
    add('left upper folded spring', [-30, -70]),
    add('right lower folded spring', [34, -99 + travel / 14]),
    add('right upper folded spring', [30, -70]),
    add('stationary-but-suspended input guide', [-40, -14.75]),
    add('stationary-but-suspended output guide', [40, -14.75]),
    add('left moving S6 optical hairpin', [-58, -59 + travel]),
    add('right moving S6 optical hairpin', [58, -59 + travel]),
    add('left S7 narrow aligner beam', [-7.5, -50 + travel / 2]),
    add('right S7 narrow aligner beam', [27.5, -45 + travel / 2]),
    add('central movable SWX-to-shuttle link', [0, -52 + travel]),
    ...trussReleasePoints,
    ...beamRunReleasePoints,
  ];
  return {
    state,
    supported,
    released,
    outerIsolationTrenchVerified: false,
    sourceHFUndercutFrontVerified: false,
  };
}

export const SWX_SEM_V2_PROCESS_PROFILE = Object.freeze({
  geometryFactory: createSwxSemV2ProcessGeometry,
  semSupportAudit: createSwxSemV2SupportAudit,
  fieldUm: SWX_SEM_V2_ASSUMPTIONS.fieldUm,
  section: { a: [-25, -102], b: [-25, -70] },
  projectName: 'Hu 2025 single 2x2 MEMS · SEM axial layout v2 · EXPERIMENTAL',
  ridgeNote: '150nm SWT ridge trims and four relocated illustrative grating couplers.',
  shallowEtchLabel: '150nm ridge trims and SEM-v2 trial coupler grooves',
  shallowEtchProbes: [
    { groovePoint: [-19, -35], ridgePoint: [-21, -35] },
    { groovePoint: [-19, -61], ridgePoint: [-21, -61] },
    ...createSwxSemV2ProcessGeometry('off').physicalGroups.gratingGrooveProbes,
  ],
  electricalContactPoints: electrodeCentersUm,
  gapPoint: (source) => [0, -47.55 - source.gapUm / 2],
  combSupportProbes: [
    { point: [-25, -78], shouldRetainBOX: true },
    { point: [25, -78], shouldRetainBOX: true },
    { point: [-25, -87.4], shouldRetainBOX: false },
    { point: [25, -87.4], shouldRetainBOX: false },
  ],
  guidedSupportPoints: [...newTerminalsUm, [-14, -50], [34, -45]],
  assumptions: SWX_SEM_V2_ASSUMPTIONS,
});
