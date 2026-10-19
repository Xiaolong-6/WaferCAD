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
  expectedExtraPerimeterSiliconPolygons: 0,
});

export function createSwxSemPerimeterContext(state = 'off') {
  const original = createSwxSemGroundReturnCandidate(state);
  const [width, height] = SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm;
  return {
    ...original,
    layout: {
      ...original.layout,
      name: 'Hu 2025 SEM Fig. 3a review - NO fabricated outer Si (NOT AUTHOR GDS)',
      bounds: {
        minX: -width / 2,
        minY: -height / 2,
        maxX: width / 2,
        maxY: height / 2,
        width,
        height,
      },
    },
    physicalGroups: {
      ...original.physicalGroups,
      semPerimeterContext: [],
    },
    reconstructionStatus: 'sem-fig3a-studied-without-invented-perimeter-si',
  };
}

export const SWX_PERIMETER_CONTEXT_PROCESS_PROFILE = Object.freeze({
  ...SWX_GROUND_RETURN_PROCESS_PROFILE,
  fieldUm: SWX_PERIMETER_CONTEXT_ASSUMPTIONS.fieldUm,
  geometryFactory: createSwxSemPerimeterContext,
  projectName: 'Hu 2025 SWX / SEM Fig. 3a source review / NOT AUTHOR GDS',
});
