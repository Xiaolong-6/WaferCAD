import test from 'node:test';
import assert from 'node:assert/strict';
import { canRenderPlanarCapInSinglePass } from '../transparent-pass-policy.js';

const materialState = { transparent: true, opacity: 0.5 };
const canUseSinglePass = (options) =>
  canRenderPlanarCapInSinglePass({ transparentScene: true, ...options });

test('single-plane transparent material caps can skip the redundant backface pass', () => {
  for (const kind of ['material-exterior', 'material-interface']) {
    assert.equal(
      canUseSinglePass({
        materialState,
        appearance: null,
        presentation: { kind, planarCap: true },
      }),
      true,
      kind,
    );
  }
});

test('opaque scenes, sides, rough surfaces and annotations retain the two-pass policy', () => {
  const cap = { kind: 'material-interface', planarCap: true };
  assert.equal(
    canRenderPlanarCapInSinglePass({
      transparentScene: false,
      materialState,
      presentation: cap,
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState: { transparent: false },
      presentation: cap,
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState,
      presentation: { ...cap, planarCap: false },
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState,
      presentation: { kind: 'electrical-internal', planarCap: true },
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState,
      presentation: { kind: 'implant-surface', planarCap: true },
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState,
      appearance: { kind: 'rough' },
      presentation: cap,
    }),
    false,
  );
  assert.equal(canUseSinglePass({ materialState }), false);
  assert.equal(canRenderPlanarCapInSinglePass(), false);
});

test('electrical planar cap experiment is explicit and never applies to volume/rough/opaque', () => {
  const electrical = { kind: 'electrical-surface', planarCap: true };
  assert.equal(canUseSinglePass({ materialState, presentation: electrical }), false);
  assert.equal(
    canUseSinglePass({
      materialState,
      presentation: { ...electrical, experimentalElectricalPlanarSinglePass: true },
    }),
    true,
  );
  for (const presentation of [
    { ...electrical, planarCap: false, experimentalElectricalPlanarSinglePass: true },
    { kind: 'electrical-internal', planarCap: true, experimentalElectricalPlanarSinglePass: true },
    { kind: 'implant-surface', planarCap: true, experimentalElectricalPlanarSinglePass: true },
    { kind: 'implant-internal', planarCap: true, experimentalElectricalPlanarSinglePass: true },
  ]) {
    assert.equal(canUseSinglePass({ materialState, presentation }), false, presentation.kind);
  }
  assert.equal(
    canUseSinglePass({
      materialState,
      appearance: { kind: 'rough' },
      presentation: { ...electrical, experimentalElectricalPlanarSinglePass: true },
    }),
    false,
  );
  assert.equal(
    canUseSinglePass({
      materialState: { transparent: false },
      presentation: { ...electrical, experimentalElectricalPlanarSinglePass: true },
    }),
    false,
  );
});
