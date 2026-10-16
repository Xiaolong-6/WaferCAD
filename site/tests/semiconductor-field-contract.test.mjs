import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NET_DOPANT_SLICE_KIND,
  findSampledNetDopantSignCrossings,
  validateNetDopantCrossSection,
  validatePoissonCrossSectionInput,
} from '../semiconductor-field-contract.js';

const fixture = () => ({
  kind: NET_DOPANT_SLICE_KIND,
  units: { position: 'um', concentration: 'cm^-3' },
  xUm: [-1, 0, 1],
  zUm: [0, 1],
  donorsCm3: [
    [2e16, 0, 0],
    [2e16, 0, 0],
  ],
  acceptorsCm3: [
    [0, 1e16, 1e16],
    [0, 1e16, 1e16],
  ],
  hostLayerIds: [
    ['Si', 'Si', 'Si'],
    ['Si', 'Si', 'Si'],
  ],
  provenance: { kind: 'synthetic', sourceId: 'scientific-contract-regression' },
});

test('validated synthetic dopant slice yields strict sampled sign changes, never a PN solution', () => {
  const input = fixture();
  const before = structuredClone(input);
  const valid = validateNetDopantCrossSection(input);
  assert.equal(valid.nx, 3);
  assert.equal(valid.nz, 2);
  assert.equal(valid.semiconductorNodes, 6);
  assert.equal(valid.activationVerified, false);
  const output = findSampledNetDopantSignCrossings(input);
  assert.equal(output.crossings.length, 2);
  assert.equal(output.zeroSamples, 0);
  for (const [row, crossing] of output.crossings.entries()) {
    assert.equal(crossing.axis, 'x');
    assert.equal(crossing.hostLayerId, 'Si');
    assert.ok(Math.abs(crossing.xUm + 1 / 3) < 1e-12);
    assert.equal(crossing.zUm, row);
  }
  assert.equal(output.physicalPnInterfaceResolved, false);
  assert.equal(output.depletionWidthComputed, false);
  assert.equal(output.electricalTransportComputed, false);
  assert.deepEqual(input, before, 'Numerical inspection cannot mutate caller or project data');
});

test('zero concentrations and exact-zero net doping are not invented PN boundaries', () => {
  const input = fixture();
  input.donorsCm3 = input.donorsCm3.map((row) => row.map(() => 1e16));
  input.acceptorsCm3 = input.acceptorsCm3.map((row) => row.map(() => 1e16));
  const result = findSampledNetDopantSignCrossings(input);
  assert.equal(result.crossings.length, 0);
  assert.equal(result.zeroSamples, 6);
  assert.equal(result.physicalPnInterfaceResolved, false);
});

test('host discontinuities suppress crossing through oxide or dissimilar material', () => {
  const input = fixture();
  input.hostLayerIds[0][1] = 'different-host';
  input.hostLayerIds[1][1] = 'different-host';
  assert.equal(findSampledNetDopantSignCrossings(input).crossings.length, 0);
  input.hostLayerIds[0][1] = null;
  input.acceptorsCm3[0][1] = 0;
  assert.equal(findSampledNetDopantSignCrossings(input).crossings.length, 0);
});

test('unverified grid input rejects malformed units, geometry and fabricated calibration', () => {
  const changes = [
    (v) => { v.units.concentration = 'm^-3'; },
    (v) => { v.xUm = [1, 0, -1]; },
    (v) => { v.zUm = [0, 0]; },
    (v) => { v.donorsCm3[0][0] = -1; },
    (v) => { v.acceptorsCm3[0][0] = Infinity; },
    (v) => { v.donorsCm3[0].pop(); },
    (v) => { v.hostLayerIds[0][0] = null; },
    (v) => { v.provenance.kind = 'certified'; },
    (v) => { v.provenance.calibrated = true; },
    (v) => { v.calibrated = true; },
  ];
  for (const corrupt of changes) {
    const input = fixture();
    corrupt(input);
    assert.throws(() => validateNetDopantCrossSection(input), TypeError);
  }
});

test('Poisson boundary interface validates input but refuses to claim a potential solution', () => {
  const problem = {
    kind: 'poisson-xz-input-v1',
    slice: fixture(),
    relativePermittivity: [
      [12, 12, 12],
      [12, 12, 12],
    ],
    temperatureKelvin: 300,
    dirichletVolt: {
      left: [0, 0],
      right: [0, 0],
      bottom: [0, 0, 0],
      top: [0, 0, 0],
    },
  };
  const original = structuredClone(problem);
  const accepted = validatePoissonCrossSectionInput(problem);
  assert.equal(accepted.nodes, 6);
  assert.equal(accepted.boundaryNodes, 6);
  assert.equal(accepted.poissonSolved, false);
  assert.equal(accepted.potentialComputed, false);
  assert.equal(accepted.electricFieldComputed, false);
  assert.equal(accepted.btbtCurrentComputed, false);
  assert.deepEqual(problem, original);

  for (const corrupt of [
    (v) => { v.relativePermittivity[0][0] = 0; },
    (v) => { v.relativePermittivity[1][0] = NaN; },
    (v) => { v.temperatureKelvin = 0; },
    (v) => { v.dirichletVolt.top.pop(); },
    (v) => { v.dirichletVolt.bottom[0] = 1; },
    (v) => { delete v.dirichletVolt.right; },
  ]) {
    const invalid = structuredClone(problem);
    corrupt(invalid);
    assert.throws(() => validatePoissonCrossSectionInput(invalid), TypeError);
  }
});
