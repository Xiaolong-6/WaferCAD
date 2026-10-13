import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRendererR9FocusEvidence,
  R9_FOCUS_COUNT,
  R9_FOCUS_END,
  R9_FOCUS_START,
} from '../../scripts/test-helpers/renderer-r9-focus-evidence.mjs';
import { mockR9FocusEvidence } from '../../scripts/tests/renderer-r9-focus-fixture.mjs';

test('every draw from 129 to 154 must carry a bounded input fingerprint', () => {
  const rows = mockR9FocusEvidence();
  assert.equal(rows.length, R9_FOCUS_COUNT);
  assert.equal(rows[0].draw, R9_FOCUS_START);
  assert.equal(rows.at(-1).draw, R9_FOCUS_END);
  assert.deepEqual(checkRendererR9FocusEvidence(rows), { valid: true, reason: null });
  assert.equal(rows.every((draw) => draw.textureContentVerified === false), true);
});

test('an absent, reordered or interrupted draw fails closed', () => {
  const rows = mockR9FocusEvidence();
  assert.equal(checkRendererR9FocusEvidence(rows.slice(1)).valid, false);
  const reordered = structuredClone(rows);
  [reordered[3], reordered[4]] = [reordered[4], reordered[3]];
  assert.equal(checkRendererR9FocusEvidence(reordered).valid, false);
  const interrupted = structuredClone(rows);
  interrupted[10].status = 'capture-error';
  assert.equal(checkRendererR9FocusEvidence(interrupted).valid, false);
});

test('invalid shader, uniform or bounded GPU buffer evidence is rejected', () => {
  const valid = mockR9FocusEvidence();
  const broken = (modify) => {
    const rows = structuredClone(valid);
    modify(rows[3]);
    assert.equal(checkRendererR9FocusEvidence(rows).valid, false);
  };
  broken((draw) => { draw.shaderHashes.pop(); });
  broken((draw) => { draw.uniforms[0].value = null; });
  broken((draw) => { draw.rasterState.samples = null; });
  broken((draw) => { draw.uninspectedAttributesEnabled = true; });
  broken((draw) => { draw.buffers.attributes[0].hash = ''; });
  broken((draw) => { draw.buffers.attributes[0].sampledBytes = 99999; });
  broken((draw) => { draw.buffers.indices = { status: 'missing-buffer' }; draw.method = 'drawElements'; });
});

test('texture binding observations must explicitly admit missing texture contents', () => {
  const rows = mockR9FocusEvidence();
  const falselyVerified = structuredClone(rows);
  falselyVerified[0].textureContentVerified = true;
  assert.equal(checkRendererR9FocusEvidence(falselyVerified).valid, false);
  const missingUnit = structuredClone(rows);
  missingUnit[0].textureUnits.pop();
  assert.equal(checkRendererR9FocusEvidence(missingUnit).valid, false);
});
