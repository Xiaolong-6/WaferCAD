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
  [-64, -77],
  [64, -77],
]);
const electrodeCentersUm = Object.freeze([
  [-46, -24],
  [-6, -120],
  [6, -120],
  [46, -24],
  [-41, -78],
  [41, -78],
]);
export const SWX_SEM_V2_ASSUMPTIONS = Object.freeze({
  sourceSEMAlignedMechanicalAxis: true,
  sourceFixedPortsOpposed: true,
  actuatorFrameTranslationYUm: -90,
  upperSpringLateralityShiftUm: 30,
  upperSpringShiftYUm: -86,
  sourceAuthorGdsAvailable: false,
  fullFidelityClaim: false,
  fixedTerminalCentersUm: newTerminalsUm,
  electrodeCentersUm,
  fieldUm: [160, 260],
});

function newHairpin(side, travel) {
  const x = (u) => side * u;
  const y = (u) => u + travel;
  const start = [side < 0 ? -22 : 21, y(-61)];
  const lead = filletPolyline([start, [x(36), y(-65)], [x(58), y(-65)]], 5, 16);
  const points = [...lead.points];
  const arcRadius = 3;
  const addReturn = (cx, cy, sweep) => {
    for (let index = 1; index <= 24; index++) {
      const radians = Math.PI / 2 + (sweep * index) / 24;
      points.push([cx + arcRadius * Math.cos(radians), cy + arcRadius * Math.sin(radians)]);
    }
  };
  addReturn(x(58), y(-68), -side * Math.PI);
  points.push([x(49), y(-71)]);
  addReturn(x(49), y(-74), side * Math.PI);
  points.push([x(64), -77]);
  return {
    polygons: miteredPolyline(points, 0.4),
    centerline: points,
    radiiUm: [5, 3, 3],
    straightLUm: 15,
    sourceWaypointCoordinatesVerified: false,
  };
}

function semV2PhysicalPose(state) {
  const source = createSwxOptomechanicalCandidate(state);
  const actuator = source.actuator;
  const travel = source.travelUm;
  const down = SWX_SEM_V2_ASSUMPTIONS.actuatorFrameTranslationYUm;
  const translateActuatorAnchor = (ring, index) => {
    const upper = index % 2 === 1;
    if (!upper) return move(ring, 0, down);
    const side = index < 2 ? -1 : 1;
    return move(ring, side * 30, -86);
  };
  const fixedActuator = [
    ...actuator.banks.flatMap((bank) => bank.stationary.map((p) => move(p, 0, down))),
    ...actuator.anchors.map(translateActuatorAnchor),
  ];
  const shuttle = actuator.shuttle.slice(0, -4).map((ring) => move(ring, 0, down));
  for (const side of [-1, 1]) {
    for (const station of [
      { outerX: 6 + 3 * 1.7, y: -86 + travel },
      { outerX: 46 + 3 * 1.7, y: -58 + travel },
    ]) {
      shuttle.push(
        strip(
          [
            [(side * (SWX_REPORTED.shuttleWidthUm - 0.7)) / 2, station.y],
            [side * station.outerX, station.y],
          ],
          0.45,
        ),
      );
    }
  }
  const movableActuator = [
    ...actuator.banks.flatMap((bank) => bank.moving.map((p) => move(p, 0, down))),
    ...shuttle,
  ];
  const springs = actuator.springContours.map(translateActuatorAnchor);
  const fixedRoutes = [
    strip(
      [
        [-22, -35],
        [-22, -15],
        [-70, -20],
      ],
      0.4,
    ),
    strip(
      [
        [21, -35],
        [21, -15],
        [70, -20],
      ],
      0.4,
    ),
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
  const flexure = [...springs, ...opticalFlexures, ...source.guides.flexure];
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
    anchorTestPoint: [6, -120],
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
    add('lower left spring anchor', [-6, -120]),
    add('upper left spring anchor', [-46, -24]),
    add('lower right spring anchor', [6, -120]),
    add('upper right spring anchor', [46, -24]),
    add('S7 left stationary anchor', [-14, -50]),
    add('S7 right stationary anchor', [34, -45]),
    ...newTerminalsUm.map((point, index) => add('terminal support ' + index, point)),
  ];
  const released = [
    add('moving shuttle rail', [2.65, -72 + travel]),
    add('left moving comb handle', [-25, -87.4 + travel]),
    add('right moving comb handle', [25, -87.4 + travel]),
    add('left lower folded spring', [-6, -110]),
    add('left upper folded spring', [-46, -40]),
    add('right lower folded spring', [6, -110]),
    add('right upper folded spring', [46, -40]),
    add('stationary-but-suspended input guide', [-40, -16.875]),
    add('stationary-but-suspended output guide', [40, -16.875]),
    add('left moving S6 optical hairpin', [-58, -65 + travel]),
    add('right moving S6 optical hairpin', [58, -65 + travel]),
    add('left S7 narrow aligner beam', [-7.5, -50 + travel / 2]),
    add('right S7 narrow aligner beam', [27.5, -45 + travel / 2]),
    add('central movable SWX-to-shuttle link', [0, -52 + travel]),
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
