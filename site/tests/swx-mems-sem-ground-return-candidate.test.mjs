import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditSwxSemV2ElectricalNets,
  createSwxSemV2ProcessGeometry,
} from '../../scripts/swx-mems-sem-v2-unit.mjs';
import {
  SWX_GROUND_RETURN_ASSUMPTIONS,
  createSwxSemGroundReturnCandidate,
  createSwxGroundReturnSupportAudit,
  auditSwxGroundReturnBucklingRisk,
} from '../../scripts/swx-mems-sem-ground-return-candidate.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const union = (rings) => v.unionGeometries(rings.map((ring) => [[[...ring, ring[0]]]]));
const areaContact = (a, b) => geometryArea(v.intersection(union([a]), [b]));

test('one isolated two-net electrical candidate replaces 6um retained-BOX rails', () => {
  const a = SWX_GROUND_RETURN_ASSUMPTIONS;
  assert.equal(a.authorPerimeterMaskKnown, false);
  assert.equal(a.authorGroundRoutingKnown, false);
  assert.equal(a.externalContactLocationsVerified, false);
  assert.equal(a.groundTraceWidthUm, 0.8);
  assert.equal(a.signalTraceWidthUm, 1.2);
  assert.equal(a.externalSignalSupportWidthUm, 6);
  assert.deepEqual(a.rightGroundSupportCenterUm, [76, -38]);
  assert.equal(a.rightGroundSupportWidthUm, 8);
  assert.equal(a.externalGroundSupportCoordinatesVerified, false);
  for (const state of ['off', 'on']) {
    const baseline = createSwxSemV2ProcessGeometry(state);
    const candidate = createSwxSemGroundReturnCandidate(state);
    assert.equal(candidate.maskPolygons.get(1).length, baseline.maskPolygons.get(1).length + 7);
    assert.deepEqual(candidate.maskPolygons.get(2), baseline.maskPolygons.get(2));
    assert.equal(candidate.maskPolygons.get(3).length, baseline.maskPolygons.get(3).length + 2);
    assert.equal(candidate.layout.elements.length, baseline.layout.elements.length + 9);
    assert.equal(
      candidate.layout.combos.find((combo) => combo.layer === 1).count,
      candidate.maskPolygons.get(1).length,
    );
    assert.deepEqual(candidate.layout.bounds, baseline.layout.bounds);
    assert.equal(candidate.physicalGroups.candidateGroundRails.length, 2);
    assert.ok(candidate.physicalGroups.candidateSignalRail.length > 0);
    assert.equal(candidate.physicalGroups.candidateSignalSupportRail.length, 4);
    assert.equal(candidate.physicalGroups.candidateRightGroundSupportAnchor.length, 4);
    assert.equal(candidate.physicalGroups.candidateExternalSiliconPads.length, 2);
    assert.equal(candidate.physicalGroups.candidateExternalMetalPads.length, 2);
    assert.equal(baseline.physicalGroups.candidateGroundRails, undefined);
    const support = createSwxGroundReturnSupportAudit(state);
    assert.equal(support.supported.length, 18);
    assert.equal(support.released.length, 46);
    assert.ok(support.supported.some((entry) => entry.point[0] === 76 && entry.point[1] === -38));
    assert.ok(support.released.some((entry) => entry.point[0] === 76 && entry.point[1] === -51));
    assert.equal(support.authorPerimeterContactsVerified, false);
    assert.equal(support.outerIsolationTrenchVerified, false);
    assert.equal(support.sourceHFUndercutFrontVerified, false);
  }
});

test('OFF/ON actual ground and signal routing connects the correct physical Si islands', () => {
  for (const state of ['off', 'on']) {
    const baseline = createSwxSemV2ProcessGeometry(state);
    const candidate = createSwxSemGroundReturnCandidate(state);
    const nets = v.unionGeometries(
      baseline.maskPolygons.get(1).map((ring) => [[[...ring, ring[0]]]]),
    );
    const opticalNet = nets.find((net) => v.pointInMulti([-70, -20], [net]));
    const groundNet = nets.find((net) => v.pointInMulti([-49, -99], [net]));
    const driveNets = nets.filter(
      (net) => v.pointInMulti([-41, -78], [net]) || v.pointInMulti([41, -78], [net]),
    );
    assert.ok(opticalNet && groundNet);
    assert.equal(driveNets.length, 2);
    for (const rail of candidate.physicalGroups.candidateGroundRails) {
      const bounds = v.multiBounds(union([rail]));
      const field = candidate.layout.bounds;
      assert.ok(bounds.minX >= field.minX && bounds.maxX <= field.maxX);
      assert.ok(bounds.minY >= field.minY && bounds.maxY <= field.maxY);
      assert.ok(areaContact(rail, opticalNet) > 0.1);
      assert.ok(areaContact(rail, groundNet) > 0.1);
      for (const drive of driveNets) {
        assert.ok(areaContact(rail, drive) < 1e-8, 'ground trace shorts fixed comb');
      }
    }
    const signal = candidate.physicalGroups.candidateSignalRail;
    assert.ok(areaContact(signal, driveNets[0]) > 0.1);
    assert.ok(areaContact(signal, driveNets[1]) > 0.1);
    assert.ok(areaContact(signal, groundNet) < 1e-8);
    const supported = candidate.physicalGroups.candidateSignalSupportRail;
    assert.ok(geometryArea(v.intersection(union([supported]), union([signal]))) > 100);
    assert.ok(areaContact(supported, groundNet) < 1e-8);
    const rightAnchor = candidate.physicalGroups.candidateRightGroundSupportAnchor;
    const rightGround = candidate.physicalGroups.candidateGroundRails[1];
    assert.ok(geometryArea(v.intersection(union([rightAnchor]), union([rightGround]))) > 1);
    assert.ok(areaContact(rightAnchor, driveNets[0]) < 1e-8);
    assert.ok(areaContact(rightAnchor, driveNets[1]) < 1e-8);
    assert.ok(geometryArea(v.intersection(union([rightAnchor]), union([signal]))) < 1e-8);
    assert.equal(v.multiBounds(union([supported])).height, 6);
    assert.ok(areaContact(signal, opticalNet) < 1e-8);
    for (const ground of candidate.physicalGroups.candidateGroundRails) {
      assert.ok(geometryArea(v.intersection(union([signal]), union([ground]))) < 1e-8);
    }
    const originalAudit = auditSwxSemV2ElectricalNets(v, baseline);
    const result = auditSwxSemV2ElectricalNets(v, candidate);
    assert.equal(originalAudit.siliconConnectedDomains, 4);
    assert.equal(originalAudit.independentCombDriveDomains, 2);
    assert.equal(originalAudit.opticalFrameConnectedToGroundSi, false);
    assert.equal(result.siliconConnectedDomains, 2);
    assert.equal(result.metalContacts, 8);
    assert.deepEqual(result.metalPadSiOwnerIndices.slice(6), [
      result.springGroundNetId,
      result.metalPadSiOwnerIndices[4],
    ]);
    assert.equal(result.independentCombDriveDomains, 1);
    assert.equal(result.opticalFrameConnectedToGroundSi, true);
    assert.equal(result.combsSeparatedFromGround, true);
    assert.equal(result.springAnchorsShareNet, true);
    assert.deepEqual(result.uncontactedSiliconNetIndices, []);
    assert.equal(result.sourceElectricalTopologySatisfied, true);
    // A physical two-net mask does not establish the authors' pad placement,
    // HF undercut front or full electrical-source agreement.
    assert.equal(result.stationaryOpticalExternalGroundVerified, false);
    assert.equal(result.sourceElectricalGroundingAccepted, false);
  }
});

test('suspended perimeter Si is not accepted without post-HF mechanical qualification', () => {
  const a = auditSwxGroundReturnBucklingRisk();
  assert.equal(a.thicknessUm, 0.22);
  assert.equal(a.measuredResidualCompression, false);
  assert.equal(a.residualCompressionDirectionKnown, false);
  assert.equal(a.endConstraintsVerified, false);
  assert.equal(a.mechanicalFEMVerified, false);
  assert.equal(a.paperPerimeterMechanicalAcceptance, false);
  const longest = a.longest;
  assert.equal(longest.route, 'signal');
  assert.deepEqual(longest.from, [-61, -78]);
  assert.deepEqual(longest.to, [-61, -115]);
  assert.equal(longest.lengthUm, 37);
  assert.equal(a.supportedExternalSignalSpanUm, 122);
  assert.equal(a.longestUnsupportedSpanUm, 37);
  assert.equal(a.rightGroundAnchorRetainsBOX, true);
  assert.equal(a.rightGroundAnchorSourceVerified, false);
  for (const side of ['ground-0', 'ground-1']) {
    const segments = a.spans.filter((span) => span.route === side && span.segmentIndex === 1);
    assert.deepEqual(segments.map((span) => span.lengthUm), [14, 8, 21]);
    assert.deepEqual(segments.map((span) => span.supportedByBOX), [false, true, false]);
  }
  assert.equal(a.supportedSignalBusSourceVerified, false);
  assert.equal(
    a.spans.find((span) => span.route === 'signal' && span.segmentIndex === 2).supportedByBOX,
    true,
  );
  // Theoretical idealized pinned/fixed Euler weak-axis strain bounds.
  assert.ok(longest.pinnedCriticalStrain > 2.9e-5);
  assert.ok(longest.pinnedCriticalStrain < 3.0e-5);
  assert.ok(longest.idealClampedCriticalStrain > 1.16e-4);
  assert.ok(longest.idealClampedCriticalStrain < 1.2e-4);
  assert.ok(a.hypotheticalStrainToIdealClampedCriticalRatio > 0.8);
  assert.ok(a.hypotheticalStrainToIdealClampedCriticalRatio < 0.9);
  // This is a HYPOTHETICAL compressive stress, not measured residual stress.
  assert.equal(Number(a.stressScenarioMPa.toFixed(4)), 16.9);
  assert.equal(a.actualWaferBucklingPredicted, false);
});
