/**
 * Explicitly approximate the nonempty SOI surroundings visible around the
 * fabricated SWX in Hu et al., Fig. 3a. These are real full-etch mask shapes,
 * not Three.js decorations, recovered author GDS, or a new official Example.
 *
 * REVIEWED AGAINST AUTHOR'S ORIGINAL FIG. 3a SEM (and Fig. 1c/4b):
 * the original four-sided 200x280um bulk-Si frame had NO observational
 * support: neither the SEM nor the paper establishes an enclosing closed
 * isolation trench. Reject that rectangular surround. This isolated test
 * now models TWO OPEN peripheral context flanks only, separated from the
 * switching structure. They remain inferred material context, NOT traced
 * SEM contours or accepted author-mask dimensions. A photo alone cannot
 * identify buried BOX or establish the exact full-etch boundary.
 */
import {
  createSwxSemGroundReturnCandidate,
  SWX_GROUND_RETURN_PROCESS_PROFILE,
} from './swx-mems-sem-ground-return-candidate.mjs';

 export const SWX_PERIMETER_CONTEXT_ASSUMPTIONS = Object.freeze({
  sourceAuthorGdsAvailable: false,
  perimeterDimensionsSourceVerified: false,
  actualIsolationTrenchSourceVerified: false,
  contextIsPartOfPaperDeviceFootprint: false,
  fieldUm: [200, 280],
  outerUm: Object.freeze({ minX: -100, maxX: 100, minY: -140, maxY: 140 }),
  sourceFigure: 'Hu et al. Nat Commun 16, 331 (2025), Fig. 3a SEM / Fig. 1c schematic',
  sourceClosedPerimeterTrenchObserved: false,
  sourceFlankMaterialIdentityVerified: false,
  contextualFlankMinYUm: -114,
  contextualFlankMaxYUm: -10,
  expectedPerimeterPolygonCount: 2,
  studyFieldIsMeasuredDeviceFootprint: false,
});

export function createSwxSemPerimeterContext(state = 'off') {
  const original = createSwxSemGroundReturnCandidate(state);
  // Restricted field-edge context only. NO top/bottom closing rectangles:
  // those broad continuous silicon walls were invented by the previous
  // candidate, not present as justified device outlines in Fig. 3a.
  // These two contextual patches must remain entirely isolated from the
  // operative Ground/Signal nets and suspended MEMS. Their coordinates
  // are unverified reconstruction hypotheses, never SEM metrology.
  const left = [
    [-100, -114],
    [-85, -114],
    [-84, -103],
    [-83, -88],
    [-83, -66],
    [-84, -47],
    [-86, -28],
    [-91, -10],
    [-100, -10],
  ];
  const right = left.map(([x, y]) => [-x, y]).reverse();
  const perimeter = [left, right];

  const maskPolygons = new Map(original.maskPolygons);
  maskPolygons.set(1, [...original.maskPolygons.get(1), ...perimeter]);
  const field = SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm;
  const layout = {
    ...original.layout,
    name: 'Hu 2025 SWX - open SEM-context flanks (UNVERIFIED, NOT AUTHOR GDS)',
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
    reconstructionStatus: 'sem-reviewed-open-context-flanks-inferred-not-source-accepted',
  };
}

export const SWX_PERIMETER_CONTEXT_PROCESS_PROFILE = Object.freeze({
  ...SWX_GROUND_RETURN_PROCESS_PROFILE,
  fieldUm: SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm,
  geometryFactory: createSwxSemPerimeterContext,
  projectName: 'Hu 2025 SWX / open context flanks / EXPERIMENTAL - NOT AUTHOR GDS',
});
