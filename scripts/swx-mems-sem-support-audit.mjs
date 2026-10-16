/**
 * SEM/topological support ownership audit for the isolated compact SWX.
 *
 * Source: Hu et al., Fig. 1, Methods and Supplement S7-S9.
 * 'Fixed' is a kinematic label, NOT evidence that an optical guide has BOX.
 * Only the stationary comb, anchors and supported optical terminals retain
 * buried oxide. The released device-Si regions must keep Si with no BOX.
 *
 * Positions below are checks against our ILLUSTRATIVE geometry, not
 * measurements digitized from SEM or unprovided author GDS.
 */
import { SWX_REPORTED } from './swx-mems-geometry.mjs';
import { createSwxOptomechanicalCandidate } from './swx-mems-optomechanical-candidate.mjs';
import { SWX_COMPACT_ASSUMPTIONS } from './swx-mems-actuator-candidate.mjs';

export const SWX_SEM_PERIMETER_PROVENANCE = Object.freeze({
  outerSiliconIsolationFrameReconstructed: false,
  outerDarkSEMContoursDepthVerified: false,
  originalPeripheralMaskGdsAvailable: false,
  hfVaporUndercutQuantitativelyCalibrated: false,
  // The current Mask 1 contains only modeled device and contact silicon:
  // every other XY location in the 160x220um field is full-depth Si etched.
  outsideDeviceMaskIsFullDepthEtch: true,
});

const midpoint = (ring) => [
  (ring[0][0] + ring[2][0]) / 2,
  (ring[0][1] + ring[2][1]) / 2,
];
const entry = (name, point) => ({ name, point });

export function createSwxSemSupportAudit(state = 'off') {
  const pose = createSwxOptomechanicalCandidate(state);
  const travel = pose.travelUm;
  const a = SWX_COMPACT_ASSUMPTIONS;
  const supported = [
    entry('fixed comb left 6um handle', [-25, a.fixedBusYUm]),
    entry('fixed comb right 6um handle', [25, a.fixedBusYUm]),
    ...pose.actuator.anchors.map((ring, i) =>
      entry('folded-spring anchor ' + (i + 1), midpoint(ring)),
    ),
    ...pose.guides.guides.map((guide, i) =>
      entry('S7 structural-aligner anchor ' + (i + 1), midpoint(guide.pad)),
    ),
    ...pose.opticalRouting.supportedPads.map((ring, i) =>
      entry('optical terminal anchor ' + (i + 1), midpoint(ring)),
    ),
  ];
  const released = [
    entry('moving shuttle rail', [(SWX_REPORTED.shuttleWidthUm - 0.7) / 2, 18 + travel]),
    entry('moving comb left 3um handle', [-25, a.movingBusYUm + travel]),
    entry('moving comb right 3um handle', [25, a.movingBusYUm + travel]),
    entry('lower left folded-spring span', [-6, -15]),
    entry('lower right folded-spring span', [6, -15]),
    entry('upper left folded-spring span', [-16, 47]),
    entry('upper right folded-spring span', [16, 47]),
    entry('rigid but suspended optical input guide', [-41.5, -30.5]),
    entry('rigid but suspended optical output guide', [0, -40]),
    entry('moving S6 hairpin left', [-52, -86 + travel]),
    entry('moving S6 hairpin right', [52, -86 + travel]),
    entry('S7 narrow left guide', [-7.5, -50 + travel / 2]),
    entry('S7 narrow right guide', [27.5, -45 + travel / 2]),
    entry('suspended SWT-to-shuttle bridge', [24, -20 + travel]),
  ];
  return {
    state,
    supported,
    released,
    perimeter: SWX_SEM_PERIMETER_PROVENANCE,
    expectedSiliconLayerUm: SWX_REPORTED.siliconUm,
    expectedBoxLayerUm: SWX_REPORTED.boxUm,
    note: 'Support ownership test points are model-specific, not a source metrology reconstruction.',
  };
}
