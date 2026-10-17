/**
 * Experimental ground-return routing study for the Hu 2025 SWX unit.
 *
 * The article requires all non-drive silicon to be grounded, but publishes
 * neither an author GDS nor a unique peripheral silicon/trench mask.
 * These two 6um-wide rails are a deliberately illustrative *alternative*
 * to the unchanged SEM-v2 baseline, NOT SEM-traced geometry or a release
 * / optical / electrostatic sign-off.
 */
import { miteredPolyline } from './swx-mems-geometry.mjs';
import {
  SWX_SEM_V2_PROCESS_PROFILE,
  createSwxSemV2ProcessGeometry,
  createSwxSemV2SupportAudit,
} from './swx-mems-sem-v2-unit.mjs';

export const SWX_GROUND_RETURN_ASSUMPTIONS = Object.freeze({
  authorPerimeterMaskKnown: false,
  authorGroundRoutingKnown: false,
  opticalAndElectromechanicalSimulationVerified: false,
  sideRailWidthUm: 6,
  // Both terminals + spring pads are model-specific illustrative locations.
  pathsUm: [
    [
      [-70, -20],
      [-76, -20],
      [-76, -108],
      [-49, -99],
    ],
    [
      [70, -20],
      [76, -20],
      [76, -108],
      [49, -99],
    ],
  ],
  retainedBOXCenterPointsUm: [
    [-76, -35],
    [-76, -85],
    [76, -35],
    [76, -85],
  ],
});

export function createSwxSemGroundReturnCandidate(state = 'off') {
  const original = createSwxSemV2ProcessGeometry(state);
  const groundRails = SWX_GROUND_RETURN_ASSUMPTIONS.pathsUm.map(
    (path) => miteredPolyline(path, SWX_GROUND_RETURN_ASSUMPTIONS.sideRailWidthUm)[0],
  );
  const maskPolygons = new Map(original.maskPolygons);
  maskPolygons.set(1, [...original.maskPolygons.get(1), ...groundRails]);
  const layout = {
    ...original.layout,
    name: 'SEM-v2 ground-return feasibility study — NOT author perimeter GDS',
    elements: [
      ...original.layout.elements,
      ...groundRails.map((points) => ({
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
  };
  return {
    ...original,
    maskPolygons,
    layout,
    physicalGroups: {
      ...original.physicalGroups,
      candidateGroundRails: groundRails,
    },
    reconstructionStatus: 'illustrative-ground-return-study-not-paper-accepted',
  };
}

export function createSwxGroundReturnSupportAudit(state = 'off') {
  const original = createSwxSemV2SupportAudit(state);
  return {
    ...original,
    supported: [
      ...original.supported,
      ...SWX_GROUND_RETURN_ASSUMPTIONS.retainedBOXCenterPointsUm.map((point, index) => ({
        name: 'illustrative peripheral rail BOX support ' + index,
        point,
      })),
    ],
    outerIsolationTrenchVerified: false,
    sourceHFUndercutFrontVerified: false,
  };
}

export const SWX_GROUND_RETURN_PROCESS_PROFILE = Object.freeze({
  ...SWX_SEM_V2_PROCESS_PROFILE,
  geometryFactory: createSwxSemGroundReturnCandidate,
  semSupportAudit: createSwxGroundReturnSupportAudit,
  projectName: 'Hu SWX 2x2 perimeter ground study · NOT AUTHOR MASK',
  assumptions: SWX_GROUND_RETURN_ASSUMPTIONS,
});
