import assert from 'node:assert/strict';
import test from 'node:test';
import { auditQ2ReleasedMaterial } from '../../scripts/transmon-q2-local-proof.mjs';
import { rectangleGeometry } from '../model-array.js';

const layers = [
  'Nb',
  'Al1',
  'Al2',
  'Al3',
  'Al4 contact',
  'Al5 contact',
  'Al6 contact',
  'AlOx (illustrative thickness)',
].map((name) => ({ id: name, name }));
const oxide = 'AlOx (illustrative thickness)';
const segment = (layerId, z0, z1) => ({ layerId, z0, z1 });
const strip = (minY, maxY, ...stack) => ({
  geom: rectangleGeometry({ minX: -1, maxX: 1, minY, maxY }),
  stack,
});
const fixture = (upperContactZ = 0.042) => ({
  width: 40,
  height: 40,
  boundary: rectangleGeometry({ minX: -20, maxX: 20, minY: -20, maxY: 20 }),
  layers,
  regions: [
    strip(-20, -9, segment('Nb', 0, 0.1)),
    strip(-9, -5, segment('Al4 contact', 0, 0.04)),
    strip(-5, -1, segment('Al1', 0, 0.04)),
    strip(
      -1,
      1,
      segment('Al1', 0, 0.04),
      segment(oxide, 0.04, 0.042),
      segment('Al2', 0.042, 0.072),
    ),
    strip(1, 4, segment('Al3', upperContactZ, 0.072)),
    strip(4, 7, segment('Al5 contact', 0.042, 0.072)),
    strip(7, 9, segment('Al6 contact', 0.042, 0.072)),
    strip(9, 20, segment('Nb', 0, 0.1)),
  ],
});

test('Q2 proof distinguishes a pad-to-pad barrier from the same stack with a metal bypass', async () => {
  const good = await auditQ2ReleasedMaterial(fixture());
  assert.equal(good.sandwichAreaUm2, 4);
  assert.equal(good.terminalSandwichAreaUm2, 4);
  assert.equal(good.shuntedSandwichAreaUm2, 0);
  assert.equal(good.metallicShort, false);
  assert.equal(good.potentialTouch, false);
  assert.equal(good.geometryAccepted, true);

  const shunted = await auditQ2ReleasedMaterial(fixture(0), {
    traceBypass: true,
    probes: [
      { label: 'lower', xy: [0, 0], materials: ['Al1'] },
      { label: 'upper', xy: [0, 0], materials: ['Al2'] },
    ],
  });
  assert.equal(shunted.sandwichAreaUm2, 4);
  assert.equal(shunted.terminalSandwichAreaUm2, 0);
  assert.equal(shunted.shuntedSandwichAreaUm2, 4);
  assert.equal(shunted.metallicShort, true);
  assert.equal(shunted.geometryAccepted, false);
  assert.deepEqual(
    shunted.bypassPath.map(({ layer }) => layer),
    ['Al1', 'Al3', 'Al2'],
  );
  assert.equal(shunted.probes[0].hits[0].component, shunted.probes[1].hits[0].component);
});

test('Q2 proof traces a zero-area pad contact and rejects the otherwise valid barrier', async () => {
  const tangent = await auditQ2ReleasedMaterial(fixture(0.04), { traceBypass: true });
  assert.equal(tangent.terminalSandwichAreaUm2, 4);
  assert.equal(tangent.metallicShort, false);
  assert.equal(tangent.potentialTouch, true);
  assert.equal(tangent.geometryAccepted, false);
  assert.deepEqual(
    tangent.closedContactPath.map(({ from, to }) => [from.layer, to.layer]),
    [['Al1', 'Al3']],
  );
});

test('Q2 morphology distinguishes a separated fragment from one touching a pad edge', async () => {
  const model = fixture();
  for (const minX of [1, 1.5]) {
    model.regions.push({
      geom: rectangleGeometry({ minX, maxX: minX + 0.25, minY: 10, maxY: 11 }),
      stack: [segment('Al3', 0.1, 0.13)],
    });
  }
  const report = await auditQ2ReleasedMaterial(model, { traceMorphology: true });
  assert.equal(report.geometryAccepted, true);
  assert.equal(report.detachedComponentCount, 2);
  const [touching, separated] = report.detachedGeometry.sort((a, b) => a.bounds[0] - b.bounds[0]);
  assert.deepEqual(touching.closedContactTerminals, ['north Nb pad']);
  assert.deepEqual(separated.closedContactTerminals, []);
  assert.deepEqual(separated.slabs[0].zUm, [0.1, 0.13]);
});
