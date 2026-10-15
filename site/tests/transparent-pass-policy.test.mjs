import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRenderPlanarCapInSinglePass,
  transparentInterfaceOpacity,
} from '../transparent-pass-policy.js';

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

test('rough buried-interface fill is subdued while physical interfaces remain visible', () => {
  assert.equal(transparentInterfaceOpacity(0.5), 0.21);
  assert.equal(transparentInterfaceOpacity(0.5, { rough: true }), 0.06);
  assert.equal(transparentInterfaceOpacity(1, { rough: true }), 0.1);
  assert.equal(transparentInterfaceOpacity(0.1, { rough: true }), 0.025);
  assert.equal(transparentInterfaceOpacity(0.5, { rough: false }), 0.21);
});
