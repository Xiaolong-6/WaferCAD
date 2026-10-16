import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENES64_SOURCE,
  BENES64_PAIR_BITS,
  benesStageOrder,
  createBenes64Network,
  createBenes64DiagnosticLayout,
} from '../../scripts/swx-benes64-network.mjs';

const network = createBenes64Network();
const indices = Array.from({ length: 64 }, (_, k) => k);
test('Benes 64 has eleven valid 32-switch stages and 64 wires per stage', () => {
  assert.equal(BENES64_PAIR_BITS.length, 11);
  assert.equal(network.switches.length, 352);
  for (let stage = 0; stage < 11; stage++) {
    const cells = network.switches.filter((sw) => sw.stage === stage);
    assert.equal(cells.length, 32);
    assert.deepEqual(
      cells.flatMap((sw) => sw.wireIds).sort((a, b) => a - b),
      indices,
    );
    assert.deepEqual(
      benesStageOrder(BENES64_PAIR_BITS[stage]).sort((a, b) => a - b),
      indices,
    );
  }
});
test('Benes permutation inversion count gives the paper EXACT 1824 crossings', () => {
  assert.deepEqual(network.crossingsPerTransition, [16, 48, 112, 240, 496, 496, 240, 112, 48, 16]);
  assert.equal(network.crossings.length, 1824);
  assert.equal(BENES64_SOURCE.waveguideCrossings, 1824);
  assert.equal(
    new Set(network.crossings.map((cross) => cross.atUm.map((x) => x.toFixed(9)).join(','))).size,
    1824,
  );
});
test('all 640 shuffle links preserve one-to-one wire identity in each stage', () => {
  assert.equal(network.links.length, 640);
  for (let stage = 0; stage < 10; stage++) {
    const links = network.links.filter((item) => item.stage === stage);
    assert.equal(links.length, 64);
    assert.deepEqual(
      links.map((item) => item.startSlot).sort((a, b) => a - b),
      indices,
    );
    assert.deepEqual(
      links.map((item) => item.endSlot).sort((a, b) => a - b),
      indices,
    );
    assert.deepEqual(
      links.map((item) => item.wireId).sort((a, b) => a - b),
      indices,
    );
  }
});
test('complete diagnostic Mask counts sources without pretending MMI or FEM fidelity', () => {
  const layout = createBenes64DiagnosticLayout(network);
  assert.equal(layout.elements.filter((e) => e.layer === 90).length, 352);
  assert.equal(layout.elements.filter((e) => e.layer === 91).length, 1344);
  assert.equal(layout.elements.filter((e) => e.layer === 92).length, 1824);
  assert.equal(layout.elements.length, 3520);
  assert.equal(network.originalAuthorRoutingKnown, false);
  assert.equal(BENES64_SOURCE.mmiArmWidthsUm.length, 13);
  assert.equal(BENES64_SOURCE.mmiArmLengthUm, 5.74);
});
