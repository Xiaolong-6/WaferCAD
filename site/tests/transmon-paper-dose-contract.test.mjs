import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNominalTransmonDoses } from '../../scripts/transmon-paper-dose-contract.mjs';

const paperDoses = () =>
  [
    ['Al1', 0.04, 45, 45],
    ['Al2', 0.03, 45, 135],
    ['Al3', 0.03, 45, -45],
    ['Al4 contact', 0.03, 45, 270],
    ['Al5 contact', 0.06, 45, 90],
    ['Al6 contact', 0.06, 45, 270],
  ].map(([material, thicknessUm, tiltDeg, azimuthDeg]) => ({
    command: 'deposit',
    params: { material, thicknessUm, tiltDeg, azimuthDeg, materialGeometry: true, sidewalls: true },
  }));

const fixture = () => [{ command: 'record', params: { label: 'preclean' } }, ...paperDoses()];

test('six paper-angle material doses satisfy the full-chip persisted proof', () => {
  const steps = fixture();
  assert.equal(assertNominalTransmonDoses(steps).length, 6);
  assert.deepEqual(steps, fixture(), 'checking a Recipe must not mutate it');
});

test('35-degree Al6 sensitivity model cannot masquerade as nominal 45-degree paper process', () => {
  const steps = fixture();
  steps.at(-1).params.tiltDeg = 35;
  assert.throws(() => assertNominalTransmonDoses(steps), /six 45° Al doses/);
});

test('wrong chamber-frame azimuth, thickness and missing dose fail independently', () => {
  const rotated = fixture();
  rotated[1].params.azimuthDeg += 90;
  assert.throws(() => assertNominalTransmonDoses(rotated), /six 45° Al doses/);
  const thickness = fixture();
  thickness[2].params.thicknessUm = 0.04;
  assert.throws(() => assertNominalTransmonDoses(thickness), /six 45° Al doses/);
  assert.throws(() => assertNominalTransmonDoses(fixture().slice(0, -1)), /six 45° Al doses/);
});

test('horizontal-only scaffold is not a material reconstruction', () => {
  const steps = fixture();
  steps.forEach((step) => {
    if (step.command === 'deposit') step.params.sidewalls = false;
  });
  assert.throws(() => assertNominalTransmonDoses(steps), /horizontal-only scaffold/);
  const flat = fixture();
  flat[1].params.materialGeometry = false;
  assert.throws(() => assertNominalTransmonDoses(flat), /horizontal-only scaffold/);
});
