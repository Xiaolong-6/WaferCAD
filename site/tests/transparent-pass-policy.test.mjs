import test from 'node:test';
import assert from 'node:assert/strict';
import { canRenderPlanarCapInSinglePass } from '../transparent-pass-policy.js';

const materialState = { transparent: true, opacity: 0.5 };

test('only smooth, single-plane transparent material caps skip the redundant backface pass', () => {
  for (const kind of ['material-exterior', 'material-interface']) {
    assert.equal(
      canRenderPlanarCapInSinglePass({
        materialState,
        appearance: null,
        presentation: { kind, planarCap: true },
      }),
      true,
      kind,
    );
  }
});

test('opaque materials, sides, rough surfaces and annotations retain the original pass policy', () => {
  const cap = { kind: 'material-interface', planarCap: true };
  assert.equal(
    canRenderPlanarCapInSinglePass({
      materialState: { transparent: false },
      presentation: cap,
    }),
    false,
  );
  assert.equal(
    canRenderPlanarCapInSinglePass({
      materialState,
      presentation: { ...cap, planarCap: false },
    }),
    false,
  );
  assert.equal(
    canRenderPlanarCapInSinglePass({
      materialState,
      presentation: { kind: 'electrical-internal', planarCap: true },
    }),
    false,
  );
  assert.equal(
    canRenderPlanarCapInSinglePass({
      materialState,
      presentation: { kind: 'implant-surface', planarCap: true },
    }),
    false,
  );
  assert.equal(
    canRenderPlanarCapInSinglePass({
      materialState,
      appearance: { kind: 'rough' },
      presentation: cap,
    }),
    false,
  );
  assert.equal(
    canRenderPlanarCapInSinglePass({ materialState, presentation: undefined }),
    false,
  );
  assert.equal(canRenderPlanarCapInSinglePass(), false);
});
