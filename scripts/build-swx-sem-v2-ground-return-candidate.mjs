/**
 * Independently build/validate a process-real OFF/ON candidate peripheral
 * ground return. Never overwrite the original SEM-v2 reference artifact.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSwxMemsUnified } from './build-swx-mems-example.mjs';
import {
  createSwxSemGroundReturnCandidate,
  SWX_GROUND_RETURN_PROCESS_PROFILE,
  auditSwxGroundReturnBucklingRisk,
} from './swx-mems-sem-ground-return-candidate.mjs';
import {
  createSwxSemV2ProcessGeometry,
  auditSwxSemV2ElectricalNets,
} from './swx-mems-sem-v2-unit.mjs';
import { auditSwxPaperEnvelope } from './swx-mems-paper-envelope-audit.mjs';

const { json, validation, project } = await buildSwxMemsUnified(SWX_GROUND_RETURN_PROCESS_PROFILE);
const source = createSwxSemGroundReturnCandidate('off');
const original = createSwxSemV2ProcessGeometry('off');
assert.deepEqual(project.layout.elements, source.layout.elements);
assert.equal(project.snapshotBranches.branches.length, 2);
const v = await import('../site/vector-geometry.js');
const originalAudit = auditSwxSemV2ElectricalNets(v, original);
const candidateAudit = auditSwxSemV2ElectricalNets(v, source);
const candidateFigureScopeAudit = auditSwxPaperEnvelope(v, source);
const mechanicalRiskScreen = auditSwxGroundReturnBucklingRisk();
assert.equal(mechanicalRiskScreen.longest.route, 'signal');
assert.equal(mechanicalRiskScreen.longest.lengthUm, 37);
assert.equal(mechanicalRiskScreen.rightGroundAnchorRetainsBOX, true);
assert.equal(mechanicalRiskScreen.supportedExternalSignalSpanUm, 122);
assert.equal(mechanicalRiskScreen.paperPerimeterMechanicalAcceptance, false);
assert.equal(originalAudit.opticalFrameConnectedToGroundSi, false);
assert.equal(candidateAudit.opticalFrameConnectedToGroundSi, true);
assert.equal(candidateAudit.combsSeparatedFromGround, true);
assert.equal(candidateAudit.independentCombDriveDomains, 1);
assert.equal(candidateAudit.siliconConnectedDomains, 2);
assert.equal(candidateAudit.metalContacts, 8);
assert.deepEqual(candidateAudit.metalPadSiOwnerIndices.slice(6), [
  candidateAudit.springGroundNetId,
  candidateAudit.metalPadSiOwnerIndices[4],
]);
assert.equal(candidateAudit.springAnchorsShareNet, true);
assert.equal(candidateAudit.sourceElectricalTopologySatisfied, true);
assert.equal(candidateAudit.sourceElectricalGroundingAccepted, false);
assert.deepEqual(candidateAudit.uncontactedSiliconNetIndices, []);

const dir = resolve('test-results/swx-sem-v2-ground');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'swx-sem-ground-return-candidate.wafercad'), json);
await writeFile(
  resolve(dir, 'science-report.json'),
  JSON.stringify(
    {
      ...validation,
      groundReturnStudy: true,
      originalSiliconDomains: originalAudit.siliconConnectedDomains,
      candidateSiliconDomains: candidateAudit.siliconConnectedDomains,
      sourceElectricalNetAudit: candidateAudit,
      figureScopeAudit: candidateFigureScopeAudit,
      perimeterMechanicalRiskScreen: mechanicalRiskScreen,
      externalSignalBusRetainsBOX: true,
      leftGroundContactRetainsBOX: true,
      rightGroundAnchorRetainsBOX: true,
      rightGroundAnchorAuthorLocationVerified: false,
      originalAuthorExternalSupportMaskVerified: false,
      mechanicalPerimeterAccepted: false,
      extraneousSourceUnverifiedBOXSupportedRails: 0,
      inventedSourcePerimeterRails: true,
      modeledExternalGoldContacts: 2,
      paperPadXYCoordinatesVerified: false,
      independentStationaryCombSignalDomains: candidateAudit.independentCombDriveDomains,
      fabricatedSiliconElectricalTopologySatisfied: true,
      authorPerimeterGeometryAccepted: false,
      authorGroundRoutingAccepted: false,
      sourceHFUndercutFrontVerified: false,
      sourceElectrostaticAndOpticalModelsAccepted: false,
      fullSingleUnitPaperFidelityAccepted: false,
      fullArrayAccepted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('Experimental Si-ground candidate: real OFF/ON Kernel/Recipe and topology passed');
