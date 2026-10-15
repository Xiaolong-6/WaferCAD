/**
 * Separate, intentionally provisional WaferCAD process geometry for the
 * compact SWX optomechanical candidate. Nothing here replaces the public
 * example or the previously validated original-mask baseline.
 *
 * Important: shallow-etched grating geometry is now modeled with explicit,
 * illustrative arcs. Grating pitch/duty and pad locations are NOT source
 * GDS and no optical coupling efficiency or FEM/FDTD is claimed.
 */
import { createSwxGeometry, SWX_REPORTED, SWX_ASSUMPTIONS } from './swx-mems-geometry.mjs';
import {
  createSwxOptomechanicalCandidate,
  SWX_INTERFACE_ASSUMPTIONS,
} from './swx-mems-optomechanical-candidate.mjs';
import { SWX_COMPACT_ASSUMPTIONS } from './swx-mems-actuator-candidate.mjs';
import {
  SWX_COMPACT_GRATING_ASSUMPTIONS,
  createCompactGratingGrooves,
} from './swx-mems-compact-gratings.mjs';

const rect = (x, y, w, h) => [
  [x - w / 2, y - h / 2],
  [x + w / 2, y - h / 2],
  [x + w / 2, y + h / 2],
  [x - w / 2, y + h / 2],
];
const shift = (polygon, dx, dy) => polygon.map(([x, y]) => [x + dx, y + dy]);
const FIELD = [160, 220];
const ELECTRICAL = [
  [-16, 40],
  [-6, 40],
  [6, 40],
  [16, 40],
  [-41, -18],
  [41, -18],
];
const RAIL_X = (SWX_REPORTED.shuttleWidthUm - 0.7) / 2;

export function createSwxCompactProcessGeometry(state = 'off') {
  const source = createSwxOptomechanicalCandidate(state);
  const traditional = createSwxGeometry(state);
  const silicon = [...source.fixed, ...source.movable, ...source.flexure];
  const { offsetXUm: dx, offsetYUm: dy } = SWX_INTERFACE_ASSUMPTIONS;
  // The same 150nm partial etch is used for trial SWT ridge trims and four
  // stationary grating coupler groove sets. Every arc remains inside
  // a 220nm device silicon pad; the etch leaves a 70nm Si floor.
  const compactGratings = createCompactGratingGrooves();
  const ridge = [
    ...traditional.maskPolygons
      .get(2)
      .slice(0, 4)
      .map((p) => shift(p, dx, dy)),
    ...compactGratings.grooves,
  ];
  const electrodes = ELECTRICAL.map(([x, y]) => rect(x, y, 3.5, 3.5));
  const maskPolygons = new Map([
    [1, silicon],
    [2, ridge],
    [3, electrodes],
  ]);
  const labels = [
    [1, 'Illustrative full-height compact MEMS and optical silicon'],
    [2, 'Illustrative 150nm SWT ridge trim and four shallow grating groove sets'],
    [3, 'Six supported candidate Cr/Au electrode pads'],
  ];
  const elements = [...maskPolygons].flatMap(([layer, polygons]) =>
    polygons.map((points) => ({
      kind: 'polygon',
      sourceCell: 'SWX_MEMS_UNIT',
      layer,
      datatype: 0,
      points,
    })),
  );
  const [width, height] = FIELD;
  const layout = {
    name: 'Compact SWX MEMS process candidate ' + state.toUpperCase() + ' (no source GDS)',
    root: 'SWX_MEMS_UNIT',
    elements,
    linework: [],
    hierarchy: {},
    combos: labels.map(([layer]) => ({
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
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
  return {
    state,
    layout,
    maskPolygons,
    maskNames: labels.map(([layer, name]) => ({ layer, name })),
    gapUm: source.gapUm,
    travelUm: source.travelUm,
    releasedBeamTestPoint: [RAIL_X, -12 + source.travelUm],
    anchorTestPoint: [6, 40],
    // Used for numeric acceptance of released Si, not a picture heuristic.
    physicalGroups: {
      fixed: source.fixed,
      movable: source.movable,
      flexure: source.flexure,
      actuator: source.actuator,
      optics: source.optics,
      opticalRouting: source.opticalRouting,
      gratingGrooves: compactGratings.grooves,
      gratingGrooveProbes: compactGratings.probes,
    },
    reconstructionStatus: 'isolated-compact-candidate',
  };
}

export const SWX_COMPACT_PROCESS_PROFILE = Object.freeze({
  geometryFactory: createSwxCompactProcessGeometry,
  fieldUm: FIELD,
  section: { a: [25, -36], b: [25, -10] },
  projectName: 'SWX compact optomechanical process candidate · OFF/ON',
  ridgeNote:
    'Four trial SWT ridge trims plus four six-groove couplers; grating pitch/duty are illustrative.',
  shallowEtchLabel: '150nm SWT ridge trims and illustrative four-terminal grating grooves',
  shallowEtchProbes: [
    { groovePoint: [-19, -35], ridgePoint: [-21, -35] },
    { groovePoint: [-19, -61], ridgePoint: [-21, -61] },
    ...createCompactGratingGrooves().probes.map(({ groovePoint, ridgePoint }) => ({
      groovePoint,
      ridgePoint,
    })),
  ],
  electricalContactPoints: ELECTRICAL,
  gapPoint: (source) => [
    0,
    SWX_INTERFACE_ASSUMPTIONS.offsetYUm + SWX_REPORTED.offGapUm / 2 - source.gapUm / 2,
  ],
  combSupportProbes: [
    { point: [25, SWX_COMPACT_ASSUMPTIONS.fixedBusYUm], shouldRetainBOX: true },
    { point: [-25, SWX_COMPACT_ASSUMPTIONS.fixedBusYUm], shouldRetainBOX: true },
    { point: [25, SWX_COMPACT_ASSUMPTIONS.movingBusYUm], shouldRetainBOX: false },
    { point: [-25, SWX_COMPACT_ASSUMPTIONS.movingBusYUm], shouldRetainBOX: false },
  ],
  guidedSupportPoints: [
    [-62, -26],
    [-62, -45],
    [-55, -95],
    [55, -95],
  ],
  assumptions: {
    ...SWX_ASSUMPTIONS,
    compactMechanical: SWX_COMPACT_ASSUMPTIONS,
    compactOptical: SWX_INTERFACE_ASSUMPTIONS,
    fieldUm: FIELD,
    sourceGratingGroovesImplemented: false,
    physicallyEtchedCandidateGratingGrooves: true,
    candidateGratings: SWX_COMPACT_GRATING_ASSUMPTIONS,
    guidedMechanicalAlignersImplemented: false,
    originalGdsAvailable: false,
    independentFEMOrFDTDVerified: false,
  },
});
