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
  for (const state of ['off', 'on']) {
    const baseline = createSwxSemV2ProcessGeometry(state);
    const candidate = createSwxSemGroundReturnCandidate(state);
    assert.equal(candidate.maskPolygons.get(1).length, baseline.maskPolygons.get(1).length + 5);
    assert.deepEqual(candidate.maskPolygons.get(2), baseline.maskPolygons.get(2));
    assert.equal(candidate.maskPolygons.get(3).length, baseline.maskPolygons.get(3).length + 2);
    assert.equal(candidate.layout.elements.length, baseline.layout.elements.length + 7);
    assert.equal(
      candidate.layout.combos.find((combo) => combo.layer === 1).count,
      candidate.maskPolygons.get(1).length,
    );
    assert.deepEqual(candidate.layout.bounds, baseline.layout.bounds);
    assert.equal(candidate.physicalGroups.candidateGroundRails.length, 2);
    assert.ok(candidate.physicalGroups.candidateSignalRail.length > 0);
    assert.equal(candidate.physicalGroups.candidateExternalSiliconPads.length, 2);
    assert.equal(candidate.physicalGroups.candidateExternalMetalPads.length, 2);
    assert.equal(baseline.physicalGroups.candidateGroundRails, undefined);
    const support = createSwxGroundReturnSupportAudit(state);
    assert.equal(support.supported.length, 14);
    assert.equal(support.released.length, 43);
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
