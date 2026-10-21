import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');
const { parseLayoutFile } = await import('../layout-io.js');
const { serializeGDS } = await import('../layout-export.js');
const { validateContinuousEtchModel } = await import('../continuous-etch-model.js');
const { continuousOwnerColumnAtXY, restoreContinuousMaterialOwner } =
  await import('../continuous-material-owner.js');
const { continuousSectionContours } = await import('../continuous-etch-section.js');
const { pointInMulti } = await import('../vector-geometry.js');
const { canBuildContinuousSiHeightfield } = await import('../continuous-heightfield-mesh.js');
const { exactUnetchedFilmCandidates, buildExactFilmComponents } =
  await import('../continuous-exact-film-mesh.js');
const { buildContinuousMaterialSurfaceMesh } = await import('../continuous-etch-mesh.js');
const { parseProcessRecipeSource, serializeProcessRecipe } = await import('../process-recipe.js');
const { validateRecipeExecution } = await import('../process-recipe-preflight.js');
const src = new URL('../../examples/projects/hbar-blesin-2024-candidate/', import.meta.url);
const projectBytes = readFileSync(new URL('hbar-blesin-2024-author-roi.wafercad', src));
const project = await readProjectFile({
  size: projectBytes.length,
  text: async () => projectBytes.toString('utf8'),
});

test('author GDS ROI retains dimensional units, mask layer identities and no invented hierarchy', async () => {
  const data = readFileSync(new URL('hbar-blesin-2024-author-roi.gds', src));
  const parsed = await parseLayoutFile(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    'source-roi.gds',
  );
  assert.equal(parsed.layout.elements.length, 92);
  assert.equal(parsed.layout.root, 'CHIP2_AUTHOR_ROI');
  const masks = new Map();
  for (const item of parsed.layout.elements)
    masks.set(item.layer, (masks.get(item.layer) || 0) + 1);
  assert.equal(masks.get(8), 44); // source polygons for two SiN rings
  assert.equal(masks.get(9), 4); // source polygons for two oxide-hole candidates
  assert.equal(masks.get(11), 8);
  assert.equal(project.layout.elements.length, 92);
  assert.equal(project.layout.bounds.width, 130);
  assert.equal(project.layout.bounds.height, 150);
  // 18 source polygons cross this ROI (including a 4-mm pad/feedline shape).
  // Their *derived* GDS BOUNDARY data must never extend beyond the declared
  // 130 × 150 um cell. The pristine author source remains unchanged.
  const points = parsed.layout.elements.flatMap((e) => e.points);
  assert.ok(
    points.every(
      ([x, y]) => x >= -65 - 1e-8 && x <= 65 + 1e-8 && y >= -75 - 1e-8 && y <= 75 + 1e-8,
    ),
    'physically cropped author ROI must contain no out-of-ROI points',
  );
  assert.ok(parsed.layout.bounds.width <= 130 + 1e-8);
  assert.ok(parsed.layout.bounds.height <= 150 + 1e-8);
  const fixedDate = new Date('2026-10-20T12:00:00.000Z');
  assert.deepEqual(
    serializeGDS(project.layout.elements, { cellName: 'CHIP2_AUTHOR_ROI', timestamp: fixedDate }),
    serializeGDS(project.layout.elements, { cellName: 'CHIP2_AUTHOR_ROI', timestamp: fixedDate }),
    'Fixed GDS export timestamps must produce reproducible archive bytes',
  );
});

test('published stack dimensions survive serializing History and recovering analytic owner', () => {
  validateProjectFile(project);
  assert.equal(project.model.kernel, 'vector-continuous-etch-v1');
  assert.equal(project.snapshots.length, 6);
  assert.equal(project.snapshotBranches.nodes.length, 12);
  assert.deepEqual(project.model.layers.map((l) => l.name).slice(1), [
    'SiO2 lower',
    'Si3N4 waveguide',
    'SiO2 upper',
    'Mo bottom electrode',
    'AlN piezoelectric',
    'Mo top electrode',
  ]);
  const owner = validateContinuousEtchModel(project.model);
  assert.ok(canBuildContinuousSiHeightfield(owner));
  assert.equal(owner.operation.lateralUm, 24);
  assert.equal(owner.operation.verticalUm, 19);
  const stage04 = project.snapshots.find((x) => x.name.startsWith('S04')).state;
  assert.equal(stage04.model.kernel, 'vector-2.5d-v1');
  const stage04Metal = stage04.model.regions.flatMap((r) =>
    r.stack.filter((s) => s.layerId === 'layer-6'),
  );
  assert.ok(stage04Metal.length);
  assert.ok(stage04Metal.every((s) => Math.abs(s.z1 - s.z0 - 0.095) < 1e-8));
  // PR #352 now supports canonical exact continuous-release Recipe replay.
  const release = project.processRecipe.steps.at(-1);
  assert.equal(release.command, 'etch');
  assert.equal(release.params.profile, 'continuous');
  assert.equal(release.params.continuousShape, 'elliptical');
  assert.equal(release.params.continuousLateralUm, owner.operation.lateralUm);
  assert.equal(release.params.thicknessUm, owner.operation.verticalUm);
  assert.equal(release.params.target, project.processRecipe.base.material);
  assert.equal(release.params.mask.layerKeys[0], '9|0');
  const code = serializeProcessRecipe(project.processRecipe);
  assert.match(code, /profile: \"continuous\"/);
  assert.match(code, /shape: \"elliptical\"/);
  assert.match(code, /lateral: \"24 µm\"/);
  const replay = parseProcessRecipeSource(code);
  const replayRelease = replay.steps.at(-1);
  assert.equal(replayRelease.params.continuousShape, release.params.continuousShape);
  assert.equal(replayRelease.params.continuousLateralUm, release.params.continuousLateralUm);
  assert.equal(replayRelease.params.thicknessUm, release.params.thicknessUm);
  assert.equal(replayRelease.params.mask.layerKeys[0], '9|0');
});

test('continuous release clears Si under each cavity without removing suspended SiO2', () => {
  const owner = validateContinuousEtchModel(project.model);
  const holeCenter1 = continuousOwnerColumnAtXY(owner, [-18, 0]);
  const holeCenter2 = continuousOwnerColumnAtXY(owner, [29, 0]);
  for (const col of [holeCenter1, holeCenter2]) {
    assert.equal(col.length, 1, 'oxide should be open through the two mask holes');
    assert.equal(col[0].layerId, 'base');
    assert.ok(Math.abs(col[0].z1 + 1) < 0.15, 'continuous Si etch must end at z~-1um');
  }
  const ringEdge = continuousOwnerColumnAtXY(owner, [5, 0]);
  assert.ok(
    ringEdge.some((s) => s.layerId === 'layer-2' && Math.abs(s.z1 - s.z0 - 0.85) < 1e-8),
    'physical 850 nm SiN core must remain suspended beneath the cladding',
  );
  assert.ok(
    ringEdge.some((s) => s.layerId === 'layer-3' && s.z1 > 23.89),
    'upper silica film must remain intact',
  );
  const sameHeight = exactUnetchedFilmCandidates(owner);
  for (const name of ['layer-1', 'layer-2', 'layer-4', 'layer-5', 'layer-6'])
    assert.ok(sameHeight.has(name), `unetched same-Z layer ${name} needs exact display mesh`);
  assert.ok(!sameHeight.has('layer-3'), 'height-varying upper oxide must not be flattened');
});

test('coincident-height GDS film fragments form finite exact meshes without sampled duplicate layers', () => {
  const owner = validateContinuousEtchModel(project.model);
  const before = JSON.stringify(owner);
  const exactFilms = exactUnetchedFilmCandidates(owner);
  const nitride = exactFilms.get('layer-2');
  const film = buildExactFilmComponents(THREE, nitride.geom, nitride.z0, nitride.z1);
  assert.ok(film.triangles > 0 && film.triangles < 100000);
  assert.ok(film.capComponents >= 2, 'two micro-ring cores should remain spatially separate');
  assert.ok(film.parts.every((part) => part.positions.every(Number.isFinite)));
  const excluded = ['base', ...exactFilms.keys()];
  const sampled = buildContinuousMaterialSurfaceMesh(owner, {
    xyStepUm: 3.5,
    zStepUm: 0.5,
    excludeLayerIds: excluded,
  });
  assert.ok(sampled.triangles > 0);
  assert.ok(sampled.grid.voxels < 100000);
  assert.ok(sampled.layers.every((layer) => !excluded.includes(layer.layerId)));
  assert.equal(
    JSON.stringify(owner),
    before,
    'render mesh generation may not modify the analytic owner',
  );
});

test('released HBAR Section contours match the canonical material owner across five physical cuts', () => {
  const owner = restoreContinuousMaterialOwner(project.model.continuousEtchOwner);
  const sampleHeights = [
    -0.73, 0.21, 1.53, 3.41, 10.53, 16.33, 17.9, 18.13, 18.6, 19.6, 21.9, 23.8, 24.21,
  ];
  let witnesses = 0;
  for (const y of [-8.4, -3.6, 0, 3.6, 8.4]) {
    const from = [-55, y];
    const to = [55, y];
    const contours = continuousSectionContours(project.model, from, to, { maxStepUm: 0.35 });
    for (let x = -52.7; x < 53; x += 3.23) {
      const sectionT = (x + 55) / 110;
      const column = continuousOwnerColumnAtXY(owner, [x, y]);
      for (const z of sampleHeights) {
        const canonicalLayers = column
          .filter((segment) => segment.z0 + 1e-6 < z && z < segment.z1 - 1e-6)
          .map((segment) => segment.layerId)
          .sort();
        const sectionLayers = contours
          .filter((entry) => pointInMulti([sectionT, z], entry.polys))
          .map((entry) => entry.layerId)
          .sort();
        assert.deepEqual(
          sectionLayers,
          canonicalLayers,
          `Physical Section occupancy must match source material at (${x}, ${y}, ${z}) um`,
        );
        witnesses++;
      }
    }
  }
  assert.equal(witnesses, 2145);
});

test('HBAR full Recipe preflight resolves author GDS masks and rejects a missing release layer', () => {
  const options = {
    model: project.model,
    maskState: { layout: project.layout },
    base: project.processRecipe.base,
    startMode: 'new-base',
  };
  const valid = validateRecipeExecution(project.processRecipe.steps, options);
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.warnings, []);
  assert.equal(valid.total, 11);

  const tampered = structuredClone(project.processRecipe.steps);
  const release = tampered.at(-1);
  assert.equal(release.params.profile, 'continuous');
  release.params.mask.layerKeys = ['999|0'];
  const rejected = validateRecipeExecution(tampered, options);
  assert.ok(
    rejected.errors.some((message) => message.includes('Mask layer "999|0" is missing')),
    'A missing author-GDS release-hole layer must fail closed before Recipe Run All',
  );
});
