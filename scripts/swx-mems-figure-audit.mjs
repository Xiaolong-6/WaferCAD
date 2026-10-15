// Advisory reconstruction-fidelity audit for Hu et al. Fig. 1c and Suppl. S8.
// This is not a pass/fail fabrication gate: paper images provide topology but
// cannot specify an unambiguous metrology tolerance or author-GDS coordinates.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSwxGeometry, SWX_REPORTED } from './swx-mems-geometry.mjs';

const extent = (points) => {
  const x = points.map(([px]) => px);
  const y = points.map(([, py]) => py);
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minY: Math.min(...y),
    maxY: Math.max(...y),
  };
};
const center = ({ minX, maxX, minY, maxY }) => ({
  x: (minX + maxX) / 2,
  y: (minY + maxY) / 2,
});
const poses = {};
for (const state of ['off', 'on']) {
  const g = createSwxGeometry(state);
  const fixed = g.physicalGroups.combBanks.fixed;
  const moving = g.physicalGroups.combBanks.moving;
  const fixedBounds = fixed.slice(0, 2).map(extent);
  const movingBounds = moving.slice(0, 2).map(extent);
  const fixedCenters = fixedBounds.map(center);
  const movingCenters = movingBounds.map(center);
  poses[state] = {
    swxAirGapUm: g.gapUm,
    movableTravelUm: g.travelUm,
    foldedSpringContours: g.physicalGroups.foldedSprings.length,
    combCellsPerBank: (fixed.length - 2) / 2,
    fixedBusBoundsUm: fixedBounds,
    movableBusBoundsUm: movingBounds,
    fixedBusCentersUm: fixedCenters,
    movableBusCentersUm: movingCenters,
    bankAxialCenterSeparationUm: Math.abs(fixedCenters[0].y - fixedCenters[1].y),
    bankLateralCenterSeparationUm: Math.abs(fixedCenters[0].x - fixedCenters[1].x),
  };
}
const axialSeparation = poses.off.bankAxialCenterSeparationUm;
// Heuristic review trigger, NOT a tolerance from the paper: adjacent banks
// displaced by over two complete finger lengths cannot be called co-located.
const illustrativeTriggerUm = 2 * SWX_REPORTED.combFingerLengthUm;
const blockers = [];
if (axialSeparation > illustrativeTriggerUm) {
  blockers.push({
    id: 'opposed-comb-axial-alignment',
    kind: 'paper-figure-topology',
    note: 'Comb banks lie on opposite X sides but are separated in Y; remodel optical/actuator routing to achieve the compact alignment shown in Fig. 1c/S8.',
    actualSeparationUm: axialSeparation,
    reviewerHeuristicTriggerUm: illustrativeTriggerUm,
    paperToleranceAvailable: false,
  });
}
const audit = {
  source: {
    doi: '10.1038/s41467-024-55528-9',
    figures: ['article Fig. 1c', 'Supplement S8'],
    originalGdsAvailable: false,
  },
  scope: 'figure/topology review only; no calibrated FEM/FDTD or author-GDS claim',
  poses,
  blockers,
  scienceVisualApproval: blockers.length === 0 ? 'requires-manual-review' : 'blocked',
  mergePermission: 'explicit-user-approval-required',
};
await mkdir(resolve('test-results/swx-mems'), { recursive: true });
const filepath = resolve('test-results/swx-mems/figure-layout-audit.json');
await writeFile(filepath, JSON.stringify(audit, null, 2) + '\n');
console.log('SWX source-layout audit: ' + audit.scienceVisualApproval);
console.log('Opposed comb axial separation: ' + axialSeparation.toFixed(3) + ' um');
console.log('Audit saved to ' + filepath);
