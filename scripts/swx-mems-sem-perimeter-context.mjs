/**
 * SEM-source comparison profile for Hu et al., Nat. Commun. 16, 331 (2025).
 *
 * Original Fig. 3a SEM, Fig. 1c, Fig. 4b and Supplementary S6-S9 do not
 * establish a continuous outer SOI ring or quantitative outer Si polygons.
 * Both the earlier closed rectangular frame and the subsequent inferred
 * exterior flank panels are REJECTED. Never add source-unverified silicon
 * merely to fill an empty region in a perspective SEM screenshot.
 *
 * Preserve the existing (separately experimental) Ground/Signal unit Mask;
 * extend only the nonphysical study field to permit camera inspection.
 * The external routing itself is NOT claimed to be author GDS.
 */
import { SEM_FIG3A_MESA_CONTOURS_UM } from './swx-sem-fig3a-mesa-data.mjs';
import {
  createSwxSemGroundReturnCandidate,
  SWX_GROUND_RETURN_PROCESS_PROFILE,
} from './swx-mems-sem-ground-return-candidate.mjs';

export const SWX_PERIMETER_CONTEXT_ASSUMPTIONS = Object.freeze({
  sourceAuthorGdsAvailable: false,
  sourceFigure: 'Hu 2025 Fig. 3a SEM, Fig. 1c and Fig. 4b',
  sourceClosedPerimeterTrenchObserved: false,
  sourceFlankMaterialIdentityVerified: false,
  sourcePerimeterSiGeometryVerified: false,
  contextIsPartOfPaperDeviceFootprint: false,
  studyFieldIsMeasuredDeviceFootprint: false,
  paperReportedSwitchFootprintUm: [95, 100],
  paperReportedSwxFootprintUm: [23, 23],
  fieldUm: [200, 280],
  expectedExtraPerimeterSiliconPolygons: SEM_FIG3A_MESA_CONTOURS_UM.length,
  sourceOuterMesaMaterialVerified: false,
  semContrastIsPositiveSiliconHypothesis: true,
  unverifiedSiIsolationGuardUm: 1.25,
});

export function createSwxSemPerimeterContext(state = 'off') {
  const original = createSwxSemGroundReturnCandidate(state);
  const [width, height] = SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm;
  const exterior = SEM_FIG3A_MESA_CONTOURS_UM.map((ring) => ring.map(([x, y]) => [x, y]));
  const maskPolygons = new Map(original.maskPolygons);
  maskPolygons.set(1, [...original.maskPolygons.get(1), ...exterior]);
  const additions = exterior.map((points) => ({
    kind: 'polygon',
    sourceCell: 'SWX_MEMS_UNIT',
    layer: 1,
    datatype: 0,
    points,
  }));
  return {
    ...original,
    layout: {
      ...original.layout,
      name: 'Hu 2025 Fig 3a PHOTO-TRACED perimeter trial (NOT AUTHOR GDS)',
      elements: [...original.layout.elements, ...additions],
      combos: original.layout.combos.map((combo) =>
        combo.layer === 1 ? { ...combo, count: maskPolygons.get(1).length } : combo,
      ),
      bounds: {
        minX: -width / 2,
        minY: -height / 2,
        maxX: width / 2,
        maxY: height / 2,
        width,
        height,
      },
    },
    maskPolygons,
    physicalGroups: {
      ...original.physicalGroups,
      semPerimeterContext: exterior,
    },
    reconstructionStatus: 'fig3a-grayscale-traced-mesa-hypothesis-NOT-source-accepted',
  };
}

export const SWX_PERIMETER_CONTEXT_PROCESS_PROFILE = Object.freeze({
  ...SWX_GROUND_RETURN_PROCESS_PROFILE,
  fieldUm: SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm,
  geometryFactory: createSwxSemPerimeterContext,
  projectName: 'Hu 2025 SWX / SEM Fig. 3a source review / NOT AUTHOR GDS',
});
