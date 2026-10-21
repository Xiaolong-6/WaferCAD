import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptiveRoughMeshLod,
  roughDisplayHeightBlend,
  roughInspectionLatticePitch,
  roughInspectionBandlimitedOffsetAtPoint,
  roughFarFieldContrast,
  roughDisplayProfileOffsetAtPoint,
  roughProfileOffsetAtPoint,
  roughTaskDisplaySampling,
  trimSaturatedRoughLodBudgets,
} from '../surface-rendering.js';

const appearance = {
  kind: 'rough',
  morphology: 'stochastic',
  polarity: 'normal',
  featureSize: 0.3,
  meanHeight: 0.5,
  etchDepth: 0.9,
  featureCv: 0.25,
  heightCv: 0.3,
  seed: 20261015,
};

test('Stable-scale resolved LOD requests finer samples within unchanged pixel and triangle limits', () => {
  const context = {
    triangleCount: 2,
    maxEdge: Math.hypot(0.6, 0.6),
    featureSize: 0.3,
    distance: 0.1,
    viewportWidth: 1100,
    viewportHeight: 800,
    triangleBudget: 10000,
  };
  assert.equal(adaptiveRoughMeshLod(context).estimatedTriangles, 512);
  const stable = { ...context, morphology: 'stochastic-v2' };
  assert.equal(adaptiveRoughMeshLod(stable).estimatedTriangles, 8192);
  assert.equal(adaptiveRoughMeshLod({ ...stable, triangleBudget: 32 }).estimatedTriangles, 32);
  assert.equal(
    adaptiveRoughMeshLod({ ...stable, distance: 100000 }).estimatedTriangles,
    adaptiveRoughMeshLod({ ...context, distance: 100000 }).estimatedTriangles,
  );
});

test('3D profile filtering uses cap XY density independently of ROI and repeated films', () => {
  const task = (size, budget, profile = appearance) => ({
    cap: { appearance: profile },
    zones: [
      {
        baseTriangles: [
          [
            [0, 0],
            [size, 0],
            [size, size],
          ],
          [
            [0, 0],
            [size, size],
            [0, size],
          ],
        ],
        maxEdge: size * Math.SQRT2,
        triangleBudget: budget,
        lodContext: { distance: 1, viewportWidth: 1100, viewportHeight: 800, maxDepth: 8 },
      },
    ],
  });
  const substrate = task(4, 128);
  const film = structuredClone(substrate);
  const before = JSON.stringify([substrate, film]);
  const one = roughTaskDisplaySampling([substrate])[0];
  const pair = roughTaskDisplaySampling([substrate, film]);
  assert.equal(one.pitch, 0.5);
  assert.deepEqual(pair, [one, one], 'A coating cannot improve substrate XY resolution');
  const originalBlend = roughDisplayHeightBlend(appearance.featureSize, one.pitch);
  assert.ok(originalBlend > 0.12 && originalBlend < 1, 'Exercise the filter transition');
  for (const sample of pair) {
    assert.equal(roughDisplayHeightBlend(appearance.featureSize, sample.pitch), originalBlend);
  }
  const other = task(100, 128, { ...appearance, seed: appearance.seed + 1 });
  assert.deepEqual(
    roughTaskDisplaySampling([substrate, other])[0],
    one,
    'An unrelated distant rough field cannot change this profile',
  );
  const coarseFilm = task(4, 8);
  const coarse = roughTaskDisplaySampling([substrate, coarseFilm]);
  assert.deepEqual(
    coarse.map((entry) => entry.pitch),
    [2, 2],
    'A shared seeded field must remain equally filtered on both sides of a film',
  );
  assert.equal(JSON.stringify([substrate, film]), before);
});

test('coarse macro features are display-filtered but resolved microfeatures are exact', () => {
  assert.equal(roughDisplayHeightBlend(0.3, 2), 0.12);
  assert.equal(roughDisplayHeightBlend(0.3, 0.04), 1);
  assert.equal(roughDisplayHeightBlend(0.3, 0), 1);
  assert.ok(roughDisplayHeightBlend(0.3, 0.6) > 0.12);
  const x = 2.135,
    y = -1.843;
  const raw = roughProfileOffsetAtPoint(x, y, appearance),
    blend = 0.12,
    center = appearance.etchDepth - appearance.meanHeight;
  assert.equal(roughDisplayProfileOffsetAtPoint(x, y, appearance), raw);
  assert.equal(
    roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: 1 }),
    raw,
  );
  const low = roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: blend });
  assert.ok(Math.abs(low - (center + blend * (raw - center))) < 1e-12);
  assert.equal(
    roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: 0 }),
    center,
  );
});

test('display height is deterministic and preserves front/back physical profile bounds', () => {
  const before = JSON.stringify(appearance);
  for (const seed of [1, 123, 20261015]) {
    for (const polarity of ['normal', 'inverted']) {
      const profile = { ...appearance, seed, polarity, displayRoughBlend: 0.15 },
        center =
          polarity === 'normal'
            ? appearance.etchDepth - appearance.meanHeight
            : appearance.meanHeight;
      for (const [x, y] of [
        [0, 0],
        [0.125, -0.76],
        [2495, 3],
      ]) {
        const actual = roughDisplayProfileOffsetAtPoint(x, y, profile),
          raw = roughProfileOffsetAtPoint(x, y, profile);
        assert.ok(Math.abs(actual - (center + 0.15 * (raw - center))) < 1e-12);
        assert.ok(actual >= 0 && actual <= appearance.etchDepth);
      }
    }
  }
  assert.equal(JSON.stringify(appearance), before);
});

test('subpixel relief stays visible without exaggerating the physical heightfield', () => {
  const original = JSON.stringify(appearance);
  const far = roughFarFieldContrast(0.02, appearance);
  assert.ok(far > 0.1 && far < 0.22);
  assert.ok(roughFarFieldContrast(1.5, appearance) < far);
  assert.equal(roughFarFieldContrast(10, appearance), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, kind: 'smooth' }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, meanHeight: 0 }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, heightCv: 0 }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, morphology: 'pyramid' }), 0);
  assert.ok(roughFarFieldContrast(0.02, { ...appearance, meanHeight: 0.01 }) < far);
  assert.equal(JSON.stringify(appearance), original);
});

test('Photodetector stochastic morphology is visible at overview without changing geometry', () => {
  const profiles = [
    { ...appearance, featureSize: 0.3, meanHeight: 0.5, heightCv: 0.25, seed: 3668339987 },
    { ...appearance, featureSize: 0.2, meanHeight: 0.7, heightCv: 0.25, seed: 3668339987 },
  ];
  const original = profiles.map((profile) => JSON.stringify(profile));
  const far = profiles.map((profile) => roughFarFieldContrast(0.03, profile));
  assert.ok(far[0] > 0.1 && far[0] < 0.28);
  assert.ok(far[1] > far[0] && far[1] < 0.28);
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const z = roughProfileOffsetAtPoint(0.125, -0.65, profile);
    assert.equal(roughFarFieldContrast(12, profile), 0);
    assert.equal(roughProfileOffsetAtPoint(0.125, -0.65, profile), z);
    assert.equal(JSON.stringify(profile), original[i]);
  }
});

// This optimization is a rendering *budget* concession, never a physical
// change to Section heights, saved profiles, or thin-film interface ownership.
test('Quality can trim one subdivision only for a globally saturated rough scene', () => {
  const task = (size, budget, morphology = 'stochastic') => ({
    cap: { appearance: { ...appearance, morphology } },
    zones: [
      {
        baseTriangles: [
          [
            [0, 0],
            [size, 0],
            [size, size],
          ],
          [
            [0, 0],
            [size, size],
            [0, size],
          ],
        ],
        maxEdge: size * Math.SQRT2,
        triangleBudget: budget,
        lodContext: { distance: 1, viewportWidth: 1100, viewportHeight: 800, maxDepth: 8 },
      },
    ],
  });
  const substrate = task(240, 2048);
  const conformalFilm = structuredClone(substrate);
  const tasks = [substrate, conformalFilm];
  const modelBefore = JSON.stringify(tasks.map((x) => x.cap.appearance));
  const originalBlend = roughTaskDisplaySampling(tasks).map((sample, i) =>
    roughDisplayHeightBlend(tasks[i].cap.appearance.featureSize, sample.pitch),
  );
  assert.deepEqual(originalBlend, [0.12, 0.12]);
  assert.equal(trimSaturatedRoughLodBudgets(tasks), true);
  assert.deepEqual(
    tasks.map((x) => x.zones[0].triangleBudget),
    [512, 512],
    'Shared conformal caps must retain identical tessellation budgets',
  );
  assert.deepEqual(
    roughTaskDisplaySampling(tasks).map((sample, i) =>
      roughDisplayHeightBlend(tasks[i].cap.appearance.featureSize, sample.pitch),
    ),
    originalBlend,
  );
  assert.equal(JSON.stringify(tasks.map((x) => x.cap.appearance)), modelBefore);
  // Budget reduction never changes the seeded field or its physical z.
  assert.equal(
    roughProfileOffsetAtPoint(2495, 0.12, appearance),
    roughProfileOffsetAtPoint(2495, 0.12, substrate.cap.appearance),
  );

  const fine = [task(0.3, 2048)];
  const snapshot = JSON.stringify(fine);
  assert.equal(trimSaturatedRoughLodBudgets(fine), false);
  assert.equal(JSON.stringify(fine), snapshot, 'Resolved Quality detail must not be reduced');
  const mixed = [task(240, 2048), task(0.3, 2048)];
  const mixedSnapshot = JSON.stringify(mixed);
  assert.equal(trimSaturatedRoughLodBudgets(mixed), false);
  assert.equal(
    JSON.stringify(mixed),
    mixedSnapshot,
    'A locally resolved cap blocks co-registered seeded field coarsening',
  );
  const other = [task(240, 2048, 'pyramid')];
  const otherSnapshot = JSON.stringify(other);
  assert.equal(trimSaturatedRoughLodBudgets(other), false);
  assert.equal(JSON.stringify(other), otherSnapshot, 'Pyramid geometry must not be budget-trimmed');
  const translated = [task(240, 2048)];
  translated[0].cap.instanceTranslations = [[1000, 1000]];
  const translatedBefore = JSON.stringify(translated);
  assert.equal(trimSaturatedRoughLodBudgets(translated), false);
  assert.equal(JSON.stringify(translated), translatedBefore);
  const gpu = [task(240, 2048)];
  gpu[0].gpuDisplacement = true;
  assert.equal(trimSaturatedRoughLodBudgets(gpu), false);
  const implant = [task(240, 2048)];
  implant[0].implant = { depth: 1 };
  const physicalSurface = [task(240, 2048), implant[0]];
  assert.equal(trimSaturatedRoughLodBudgets(physicalSurface), true);
  assert.deepEqual(
    physicalSurface.map((x) => x.zones[0].triangleBudget),
    [512, 512],
    'Seed-matched implanted overlays share the same mesh budget reduction',
  );
  const instancedCohort = [task(240, 2048), task(240, 2048)];
  instancedCohort[1].cap.instanceTranslations = [[1000, 0]];
  const instancedSnapshot = JSON.stringify(instancedCohort);
  assert.equal(trimSaturatedRoughLodBudgets(instancedCohort), false);
  assert.equal(JSON.stringify(instancedCohort), instancedSnapshot);
  assert.equal(trimSaturatedRoughLodBudgets([]), false);
});

test('legacy far-wafer inspection is area-integrated, seeded, and physically immutable', () => {
  const legacy = { ...appearance, sampleOrigin: [0, 0] };
  const original = JSON.stringify(legacy);
  const far = { ...legacy, displayInspectionCentre: [2495, 0] };
  const fine = roughInspectionLatticePitch(far, 1100 / 60);
  const medium = roughInspectionLatticePitch(far, 1100 / 240);
  const coarse = roughInspectionLatticePitch(far, 1100 / 6800);
  assert.equal(fine, 2.4);
  assert.equal(medium, 9.6);
  assert.equal(coarse, 307.2);
  assert.equal(roughInspectionLatticePitch({ ...legacy, displayInspectionCentre: [12, 0] }, 18), 0);
  assert.equal(roughInspectionLatticePitch({ ...far, morphology: 'stochastic-v2' }, 18), 0);
  assert.equal(roughInspectionLatticePitch({ ...far, featureCv: 0 }, 18), 0);
  assert.equal(roughInspectionLatticePitch(far, 0), 0);
  // Every display lattice node integrates 4x4 physical samples, rather than
  // enlarging one unresolved random spike into a fabricated display feature.
  const x = 1040 * fine;
  let sum = 0;
  for (let iy = 0; iy < 4; iy++) {
    for (let ix = 0; ix < 4; ix++) {
      sum += roughProfileOffsetAtPoint(
        x + ((ix + 0.5) / 4 - 0.5) * fine,
        ((iy + 0.5) / 4 - 0.5) * fine,
        legacy,
      );
    }
  }
  const expected = sum / 16;
  assert.ok(Math.abs(roughInspectionBandlimitedOffsetAtPoint(x, 0, legacy, fine) - expected) < 1e-11);
  assert.equal(
    roughDisplayProfileOffsetAtPoint(x, 0, { ...legacy, displayLatticePitchUm: fine }),
    roughInspectionBandlimitedOffsetAtPoint(x, 0, legacy, fine),
  );
  assert.equal(roughInspectionBandlimitedOffsetAtPoint(x, 0, legacy, 0), roughProfileOffsetAtPoint(x, 0, legacy));
  for (const dx of [-0.6, -0.31, -0.1, 0, 0.1, 0.33, 0.7]) {
    const v = roughInspectionBandlimitedOffsetAtPoint(x + dx, 0.125, legacy, fine);
    assert.ok(v >= 0 && v <= legacy.etchDepth);
    assert.equal(v, roughInspectionBandlimitedOffsetAtPoint(x + dx, 0.125, { ...legacy }, fine));
  }
  assert.equal(JSON.stringify(legacy), original);
});
