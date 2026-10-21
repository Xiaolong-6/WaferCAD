import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createSectionCollapseController } from '../controllers/section-collapse-controller.js';
import { continuousEtchDisplayCollapse } from '../continuous-etch-model.js';
import { clipContinuousDisplayZBreak } from '../continuous-display-z-break.js';

const part = {
  layerId: 'silicon',
  positions: Float32Array.from([0, 0, -4, 2, 0, 4, 0, 2, 4]),
  normals: Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]),
};

test('Z Break clips physical display triangles on both Z planes without mutating source', () => {
  const previous = Array.from(part.positions);
  const cropped = clipContinuousDisplayZBreak(part, { enabled: true, top: 2, bottom: -2 });
  assert.ok(cropped.triangles > 0);
  assert.ok(cropped.positions.length === cropped.normals.length);
  for (let i = 2; i < cropped.positions.length; i += 3) {
    const z = cropped.positions[i];
    assert.ok(z <= -2 || z >= 2, `Z Break retained concealed volume at ${z}`);
  }
  assert.deepEqual(Array.from(part.positions), previous);
});

test('disabled break leaves the original display geometry untouched', () => {
  assert.equal(clipContinuousDisplayZBreak(part, { enabled: false }), part);
});

test('invalid Z Break bounds fail closed', () => {
  assert.throws(() => clipContinuousDisplayZBreak(part, { enabled: true, top: 0, bottom: 3 }), /Invalid/);
});

test('a user-authored Section Z Break opt-in reaches the Continuous 3D path', () => {
  let stored = { enabled: true, top: 15, bottom: -15 };
  const controller = createSectionCollapseController({
    root: {
      getElementById: (id) =>
        id === 'sectionCanvas' ? { dataset: { zMinUm: '-18', zMaxUm: '25' } } : null,
    },
    getModel: () => ({}),
    getSectionCollapse: () => stored,
    setSectionCollapse: (value) => {
      stored = value;
    },
    renderSection: () => {},
  });
  assert.deepEqual(
    continuousEtchDisplayCollapse({ kernel: 'vector-continuous-etch-v1' }, stored),
    { enabled: false },
    'Implicit Workstation collapse still protects a Continuous material owner',
  );
  controller.setCurrent({ ...stored, bottom: -10 }, { settled: true });
  assert.equal(stored.continuousEtchExplicit, true);
  assert.equal(
    continuousEtchDisplayCollapse({ kernel: 'vector-continuous-etch-v1' }, stored),
    stored,
  );
});

test('sharp-edge structural Border keeps exterior edges, never flat triangulation diagonals', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
    ], 3),
  );
  const edges = new THREE.EdgesGeometry(geometry, 25);
  assert.equal(edges.getAttribute('position').count / 2, 4);
  edges.dispose();
  geometry.dispose();
});
