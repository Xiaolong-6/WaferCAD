import assert from 'node:assert/strict';

const NOMINAL_AL_DOSES = [
  ['Al1', 0.04, 45, 45],
  ['Al2', 0.03, 45, 135],
  ['Al3', 0.03, 45, -45],
  ['Al4 contact', 0.03, 45, 270],
  ['Al5 contact', 0.06, 45, 90],
  ['Al6 contact', 0.06, 45, 270],
];

/**
 * Verify the author-paper six-dose geometric process, not a local angle
 * sensitivity study or the horizontal-only scaffold. GDS-frame azimuths
 * reflect the explicitly assumed 90° planetary-zero alignment.
 */
export function assertNominalTransmonDoses(steps) {
  assert.ok(Array.isArray(steps), 'Expected the persisted process Recipe steps.');
  const doses = steps.filter(
    (step) => step.command === 'deposit' && /^Al[1-6]/.test(step.params?.material),
  );
  assert.deepEqual(
    doses.map(({ params }) => [
      params.material,
      params.thicknessUm,
      params.tiltDeg,
      params.azimuthDeg,
    ]),
    NOMINAL_AL_DOSES,
    'The complete paper-reconstruction proof requires six 45° Al doses, not a sensitivity model.',
  );
  assert.ok(
    doses.every(({ params }) => params.materialGeometry === true && params.sidewalls === true),
    'A horizontal-only scaffold cannot satisfy the material sidewall process proof.',
  );
  return doses;
}
