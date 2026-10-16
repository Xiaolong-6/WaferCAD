import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRenderPlanarCapInSinglePass,
  canRenderRoughExteriorCapInSinglePass,
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

test('only physical exterior rough caps can use one transparent DoubleSide pass', () => {
  const exterior = { kind: 'material-exterior', roughCap: true };
  const rough = { kind: 'rough', featureSize: 0.3 };
  assert.equal(
    canRenderRoughExteriorCapInSinglePass({
      transparentScene: true,
      materialState,
      appearance: rough,
      presentation: exterior,
    }),
    true,
  );
  for (const presentation of [
    { ...exterior, kind: 'material-interface' },
    { ...exterior, kind: 'implant-surface' },
    { ...exterior, kind: 'electrical-surface' },
    { ...exterior, roughCap: false },
    { kind: 'material-exterior' },
  ]) {
    assert.equal(
      canRenderRoughExteriorCapInSinglePass({
        transparentScene: true,
        materialState,
        appearance: rough,
        presentation,
      }),
      false,
    );
  }
  assert.equal(
    canRenderRoughExteriorCapInSinglePass({
      transparentScene: false,
      materialState,
      appearance: rough,
      presentation: exterior,
    }),
    false,
  );
  assert.equal(
    canRenderRoughExteriorCapInSinglePass({
      transparentScene: true,
      materialState: { opacity: 1, transparent: false },
      appearance: rough,
      presentation: exterior,
    }),
    false,
  );
  assert.equal(
    canRenderRoughExteriorCapInSinglePass({
      transparentScene: true,
      materialState,
      appearance: { kind: 'smooth' },
      presentation: exterior,
    }),
    false,
  );
});
