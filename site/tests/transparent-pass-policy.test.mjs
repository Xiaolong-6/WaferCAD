import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRenderPlanarCapInSinglePass,
  canRenderRoughCapInSinglePass,
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

test('transparent rough heightfield is a single skin, and opaque/other faces remain unchanged', () => {
  assert.equal(
    canRenderRoughCapInSinglePass({
      transparentScene: true,
      materialState,
      appearance: { kind: 'rough', featureSize: 0.3 },
    }),
    true,
  );
  assert.equal(
    canRenderRoughCapInSinglePass({
      transparentScene: false,
      materialState,
      appearance: { kind: 'rough' },
    }),
    false,
  );
  assert.equal(
    canRenderRoughCapInSinglePass({
      transparentScene: true,
      materialState: { transparent: false },
      appearance: { kind: 'rough' },
    }),
    false,
  );
  assert.equal(
    canRenderRoughCapInSinglePass({
      transparentScene: true,
      materialState,
      appearance: null,
    }),
    false,
  );
  assert.equal(
    canRenderRoughCapInSinglePass({
      transparentScene: true,
      materialState,
      appearance: { kind: 'smooth' },
    }),
    false,
  );
  assert.equal(canRenderRoughCapInSinglePass(), false);
});
