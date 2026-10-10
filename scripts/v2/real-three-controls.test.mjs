import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const code = readFileSync(
  fileURLToPath(new URL('../../site/ui-v2/real-three-controls.js', import.meta.url)),
  'utf8',
);
const mockWindow = { WaferCadV2Components: { button: () => ({}) } };
runInNewContext(code, { window: mockWindow, HTMLElement: class {} });
const { moveCamera, zoomCamera } = mockWindow.WaferCadV2RealThreeControls;
const norm = (values) => Math.hypot(...values);
const delta = (a, b) => a.map((value, index) => value - b[index]);
const original = () => ({ position: [20, -30, 12], target: [0, 0, 0], fov: 34 });

test('3D Pan translates position and target equally without changing physical model geometry', () => {
  const before = original();
  const after = moveCamera(before, 80, 25, 600);
  assert.ok(norm(delta(after.target, before.target)) > 0.01);
  assert.ok(norm(delta(delta(after.position, after.target),
    delta(before.position, before.target))) < 1e-9);
  assert.deepEqual(before, original(), 'Camera source must remain immutable');
});

test('3D Pan respects perspective target-plane pixel scale and zero motion', () => {
  const before = original();
  const still = moveCamera(before, 0, 0, 600);
  assert.deepEqual(Array.from(still.position), before.position);
  assert.deepEqual(Array.from(still.target), before.target);
  const short = moveCamera(before, 80, 0, 300);
  const tall = moveCamera(before, 80, 0, 600);
  assert.ok(Math.abs(norm(delta(short.target, before.target)) /
    norm(delta(tall.target, before.target)) - 2) < 1e-9);
});

test('3D Zoom changes camera distance but leaves target and fov intact', () => {
  const before = original();
  const farther = zoomCamera(before, 40);
  const nearer = zoomCamera(before, -40);
  const distance = norm(delta(before.position, before.target));
  assert.ok(norm(delta(farther.position, farther.target)) > distance);
  assert.ok(norm(delta(nearer.position, nearer.target)) < distance);
  assert.deepEqual(Array.from(farther.target), before.target);
  assert.equal(farther.fov, before.fov);
  assert.deepEqual(before, original());
});

test('3D controls reject nonfinite camera inputs and stay finite at vertical orbit poses', () => {
  assert.equal(moveCamera(null, 10, 10, 600), null);
  assert.equal(zoomCamera({ position: [NaN, 0, 0], target: [0, 0, 0] }, 10), null);
  const vertical = { position: [0, 0, 100], target: [0, 0, 0], fov: 34 };
  const translated = moveCamera(vertical, 20, 5, 500);
  assert.ok(translated.position.every(Number.isFinite));
  assert.ok(translated.target.every(Number.isFinite));
});
