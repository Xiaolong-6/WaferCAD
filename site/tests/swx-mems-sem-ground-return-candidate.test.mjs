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
const contact = (a, b) => geometryArea(v.intersection(union(a), union(b)));

test('ground study is isolated from the original unapproved SEM-v2 cell', () => {
  assert.equal(SWX_GROUND_RETURN_ASSUMPTIONS.authorPerimeterMaskKnown, false);
  assert.equal(SWX_GROUND_RETURN_ASSUMPTIONS.authorGroundRoutingKnown, false);
  for (const state of ['off', 'on']) {
    const baseline = createSwxSemV2ProcessGeometry(state);
    const candidate = createSwxSemGroundReturnCandidate(state);
    assert.equal(candidate.maskPolygons.get(1).length, baseline.maskPolygons.get(1).length + 2);
    assert.deepEqual(candidate.maskPolygons.get(2), baseline.maskPolygons.get(2));
    assert.deepEqual(candidate.maskPolygons.get(3), baseline.maskPolygons.get(3));
    assert.equal(candidate.layout.elements.length, baseline.layout.elements.length + 2);
    assert.equal(
      candidate.layout.combos.find((combo) => combo.layer === 1).count,
      candidate.maskPolygons.get(1).length,
    );
    assert.deepEqual(candidate.layout.bounds, baseline.layout.bounds);
    assert.equal(candidate.physicalGroups.candidateGroundRails.length, 2);
    assert.equal(baseline.physicalGroups.candidateGroundRails, undefined);
    const support = createSwxGroundReturnSupportAudit(state);
    assert.equal(support.supported.length, 16);
    assert.equal(support.released.length, 38);
    assert.equal(support.outerIsolationTrenchVerified, false);
    assert.equal(support.sourceHFUndercutFrontVerified, false);
  }
});

test('each fabricated perimeter rail bonds optical Si to MEMS ground without shorting drive', () => {
  for (const state of ['off', 'on']) {
    const baseline = createSwxSemV2ProcessGeometry(state);
    const candidate = createSwxSemGroundReturnCandidate(state);
    const baseNets = v.unionGeometries(
      baseline.maskPolygons.get(1).map((ring) => [[[...ring, ring[0]]]]),
    );
    const opticalNet = baseNets.find((net) => v.pointInMulti([-70, -20], [net]));
    const groundNet = baseNets.find((net) => v.pointInMulti([-49, -99], [net]));
    const driveNets = baseNets.filter((net) =>
      v.pointInMulti([-41, -78], [net]) || v.pointInMulti([41, -78], [net]),
    );
    assert.ok(opticalNet && groundNet);
    assert.equal(driveNets.length, 2);
    for (const rail of candidate.physicalGroups.candidateGroundRails) {
      const pathBounds = v.multiBounds(union([rail]));
      const bounds = candidate.layout.bounds;
      assert.ok(pathBounds.minX >= bounds.minX && pathBounds.maxX <= bounds.maxX);
      assert.ok(pathBounds.minY >= bounds.minY && pathBounds.maxY <= bounds.maxY);
      assert.ok(geometryArea(v.intersection(union([rail]), [opticalNet])) > 0.1);
      assert.ok(geometryArea(v.intersection(union([rail]), [groundNet])) > 0.1);
      for (const net of driveNets) {
        assert.ok(
          geometryArea(v.intersection(union([rail]), [net])) < 1e-8,
          state + ' illustrative ground rail creates driven-comb silicon short',
        );
      }
    }
    const oldAudit = auditSwxSemV2ElectricalNets(v, baseline);
    const newAudit = auditSwxSemV2ElectricalNets(v, candidate);
    assert.equal(oldAudit.opticalFrameConnectedToGroundSi, false);
    assert.equal(newAudit.opticalFrameConnectedToGroundSi, true);
    assert.equal(newAudit.combsSeparatedFromGround, true);
    assert.equal(newAudit.springAnchorsShareNet, true);
    assert.equal(newAudit.siliconConnectedDomains, oldAudit.siliconConnectedDomains - 1);
    assert.deepEqual(newAudit.uncontactedSiliconNetIndices, []);
    assert.equal(newAudit.sourceElectricalTopologySatisfied, true);
    // The source perimeter, grounding pads and release front are still
    // unverified, even when candidate topological connectivity is satisfied.
    assert.equal(newAudit.stationaryOpticalExternalGroundVerified, false);
    assert.equal(newAudit.sourceElectricalGroundingAccepted, false);
  }
});
