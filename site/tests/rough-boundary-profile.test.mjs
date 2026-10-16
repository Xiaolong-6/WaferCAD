import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundaryProfileFromPositions,
  sidewallBoundarySamples,
} from '../rough-boundary-profile.js';
import { roughProfileOffsetAtPoint } from '../surface-rendering.js';

const appearance = {
  kind: 'rough',
  morphology: 'pyramid',
  polarity: 'normal',
  featureSize: 0.37,
  meanHeight: 0.2,
  etchDepth: 0.2,
  featureCv: 0,
  heightCv: 0,
  seed: 21,
};

test('sidewall consumes cap interpolation rather than independently sampling a different curve', (t) => {
  const p = [-0.9, 0.023],
    q = [0.9, 0.023],
    z = (point) =>
      Math.fround(2 + roughProfileOffsetAtPoint(...point.map(Math.fround), appearance)),
    positions = new Float32Array([...p, z(p), ...q, z(q)]),
    profile = boundaryProfileFromPositions(positions),
    part = { p, q, z0: 0, z1: 2, upperSurface: { appearance, profileNormal: 1 } },
    samples = sidewallBoundarySamples(part, { upperProfile: profile });
  assert.equal(samples.length, 2, 'actual cap profiles must not be independently subdivided');
  assert.deepEqual(samples[0].point, Array.from(positions.slice(0, 2)));
  assert.deepEqual(samples[1].point, Array.from(positions.slice(3, 5)));
  assert.equal(samples[0].upperZ, positions[2]);
  assert.equal(samples[1].upperZ, positions[5]);
  const actualMiddle = (samples[0].upperZ + samples[1].upperZ) / 2,
    independentMiddle = 2 + roughProfileOffsetAtPoint(0, p[1], appearance),
    previousGap = Math.abs(actualMiddle - independentMiddle);
  assert.ok(previousGap > 0.05, 'fixture must demonstrate the old independently sampled crack');
  t.diagnostic(
    `Previous midpoint separation: ${previousGap} um; shared boundary endpoint mismatch: 0 um`,
  );
});

test('different upper and lower cap profiles use the union of actual boundary breakpoints', () => {
  const lowerProfile = boundaryProfileFromPositions(
      new Float32Array([0, 0, 0, 0.5, 0, 0.2, 0.5, 0, 0.2, 1, 0, 0]),
    ),
    upperProfile = boundaryProfileFromPositions(
      new Float32Array([0, 0, 2, 0.25, 0, 2.2, 0.25, 0, 2.2, 1, 0, 2]),
    ),
    part = { p: [0, 0], q: [1, 0], z0: 0, z1: 2 },
    samples = sidewallBoundarySamples(part, { lowerProfile, upperProfile });
  assert.deepEqual(
    samples.map(({ point }) => point[0]),
    [0, 0.25, 0.5, 1],
  );
  assert.equal(samples[1].lowerZ, Math.fround(0.2) / 2);
  assert.equal(samples[2].upperZ, Math.fround(2.2) + (2 - Math.fround(2.2)) / 3);
});

test('slanted partial ROI edges preserve cap vertices and piecewise interpolation after Float32 conversion', () => {
  const upperProfile = boundaryProfileFromPositions(
      new Float32Array([-0.9, -0.3, 2, 0, 0.3, 2.2, 0, 0.3, 2.2, 0.9, 0.9, 2]),
    ),
    part = { p: [-0.45, 0], q: [0.45, 0.6], z0: 0, z1: 2 },
    samples = sidewallBoundarySamples(part, { upperProfile });
  assert.equal(samples.length, 3);
  assert.deepEqual(samples[1].point, [0, Math.fround(0.3)]);
  assert.equal(samples[1].upperZ, Math.fround(2.2));
  assert.ok(Math.abs(samples[0].upperZ - 2.1) < 3e-7);
  assert.ok(Math.abs(samples[2].upperZ - 2.1) < 3e-7);
});

test('rough preview without a prepared profile retains bounded deterministic subdivisions', () => {
  const part = { p: [0, 0], q: [1, 0], z0: 0, z1: 2, upperSurface: { appearance } },
    samples = sidewallBoundarySamples(part, { fallbackSegments: 8 });
  assert.equal(samples.length, 9);
  assert.deepEqual(samples, sidewallBoundarySamples(part, { fallbackSegments: 8 }));
  assert.ok(samples.some((sample) => sample.upperZ > 2));
});

test('display-only anti-alias fallback matches rough cap without altering canonical morphology', () => {
  const display = { ...appearance, displayRoughBlend: 0.12 };
  const part = {
    p: [0, 0],
    q: [0.8, 0],
    z0: 0,
    z1: 2,
    upperSurface: { appearance: display, profileNormal: 1 },
  };
  const samples = sidewallBoundarySamples(part, { fallbackSegments: 4 });
  assert.equal(samples.length, 5);
  const raw = roughProfileOffsetAtPoint(0, 0, appearance);
  const { upperZ } = samples[0];
  const center = appearance.polarity === 'normal' ? 0 : appearance.meanHeight;
  const expected = 2 + center + 0.12 * (raw - center);
  assert.ok(Math.abs(upperZ - expected) < 1e-12);
  assert.equal(roughProfileOffsetAtPoint(0, 0, appearance), raw);
});


test('translated final cap boundary retains Float32 XY and physical 50 nm separation', () => {
  const positions = new Float32Array([
    0, 0, 174.35, 0.25, 0, 174.4, 0.25, 0, 174.4, 0.5, 0, 174.35,
  ]);
  const source = boundaryProfileFromPositions(positions);
  const implant = shiftedBoundaryProfile(source, -0.05);
  assert.equal(boundaryProfileOverlapsEdge(source, [0, 0], [0.5, 0]), true);
  assert.equal(boundaryProfileOverlapsEdge(source, [0, 1], [0.5, 1]), false);
  const samples = sidewallBoundarySamples(
    {
      p: [0, 0],
      q: [0.5, 0],
      z0: 172.8,
      z1: 174.3,
      upperSurface: { capIndex: -1 },
    },
    { upperProfile: implant },
  );
  assert.equal(samples.length, 3);
  for (let i = 0; i < samples.length; i++) {
    const top = source.positions[i * 3 + 2];
    assert.equal(samples[i].point[0], source.positions[i * 3]);
    assert.equal(samples[i].point[1], source.positions[i * 3 + 1]);
    assert.ok(Math.abs(top - samples[i].upperZ - 0.05) < 2e-5);
  }
  assert.deepEqual(source.positions, positions, 'canonical cap buffer remains unchanged');
});
