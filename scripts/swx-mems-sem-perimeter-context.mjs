/**
 * Explicitly approximate the nonempty SOI surroundings visible around the
 * fabricated SWX in Hu et al., Fig. 3a. These are real full-etch mask shapes,
 * not Three.js decorations, recovered author GDS, or a new official Example.
 *
 * The rectangular trench/cavity is an ENGINEERING HYPOTHESIS. The goal is to
 * restore topological distinction between peripheral, BOX-retained bulk
 * silicon and the suspended MEMS core without creating Si electrical shorts.
 */
import {
  createSwxSemGroundReturnCandidate,
  SWX_GROUND_RETURN_PROCESS_PROFILE,
} from './swx-mems-sem-ground-return-candidate.mjs';

const rect = (minX, minY, maxX, maxY) => [
  [minX, minY],
  [maxX, minY],
  [maxX, maxY],
  [minX, maxY],
];

export const SWX_PERIMETER_CONTEXT_ASSUMPTIONS = Object.freeze({
  sourceAuthorGdsAvailable: false,
  perimeterDimensionsSourceVerified: false,
  actualIsolationTrenchSourceVerified: false,
  contextIsPartOfPaperDeviceFootprint: false,
  fieldUm: [200, 280],
  outerUm: Object.freeze({ minX: -100, maxX: 100, minY: -140, maxY: 140 }),
  cavityUm: Object.freeze({ minX: -82, maxX: 82, minY: -121, maxY: -8 }),
  nominalMinIsolationUm: 2,
  expectedPerimeterPolygonCount: 4,
});

export function createSwxSemPerimeterContext(state = 'off') {
  const original = createSwxSemGroundReturnCandidate(state);
  const { outerUm: o, cavityUm: c } = SWX_PERIMETER_CONTEXT_ASSUMPTIONS;
  // Four touching positive-Si rectangles form a single contiguous outer
  // frame while the entire active cell, pads and routed nets stay in the
  // central etched cavity. This geometry is deliberately NOT author GDS.
  const perimeter = [
    rect(o.minX, o.minY, c.minX, o.maxY),
    rect(c.maxX, o.minY, o.maxX, o.maxY),
    rect(c.minX, c.maxY, c.maxX, o.maxY),
    rect(c.minX, o.minY, c.maxX, c.minY),
  ];
  const maskPolygons = new Map(original.maskPolygons);
  maskPolygons.set(1, [...original.maskPolygons.get(1), ...perimeter]);
  const field = SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm;
  const layout = {
    ...original.layout,
    name: 'Hu 2025 SWX - conjectural bulk-Si perimeter and isolation window (NOT AUTHOR GDS)',
    elements: [
      ...original.layout.elements,
      ...perimeter.map((points) => ({
        kind: 'polygon',
        sourceCell: 'SWX_MEMS_UNIT',
        layer: 1,
        datatype: 0,
        points,
      })),
    ],
    combos: original.layout.combos.map((combo) =>
      combo.layer === 1 ? { ...combo, count: maskPolygons.get(1).length } : combo,
    ),
    bounds: {
      minX: o.minX,
      minY: o.minY,
      maxX: o.maxX,
      maxY: o.maxY,
      width: field[0],
      height: field[1],
    },
  };
  return {
    ...original,
    layout,
    maskPolygons,
    physicalGroups: {
      ...original.physicalGroups,
      semPerimeterContext: perimeter,
    },
    reconstructionStatus: 'trial-etched-silicon-perimeter-inferred-not-source-accepted',
  };
}

export const SWX_PERIMETER_CONTEXT_PROCESS_PROFILE = Object.freeze({
  ...SWX_GROUND_RETURN_PROCESS_PROFILE,
  fieldUm: SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm,
  geometryFactory: createSwxSemPerimeterContext,
  projectName: 'Hu 2025 SWX / real processed Si perimeter / EXPERIMENTAL - NOT AUTHOR GDS',
});
