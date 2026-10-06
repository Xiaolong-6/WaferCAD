import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { applyOperation } = await import('../model.js');
const { pointInMulti, unionGeometries } = await import('../vector-geometry.js');
const { expandProjectStorage, serializeProject, readProjectFile } =
  await import('../project-io.js');
const { validateProjectFile, validateProcessModel } = await import('../project-schema.js');
const fixtureURL = new URL('../../tests/fixtures/native-fig3/', import.meta.url);

function filmAt(model, layerId, point) {
  const regions = model.regions.filter((region) => pointInMulti(point, region.geom));
  assert.equal(regions.length, 1, `One material owner at ${point}`);
  return regions[0].stack.filter((segment) => segment.layerId === layerId);
}
function assertFilm(model, layerId, thickness = 0.01, wallOffset = 0.005) {
  for (const point of [
    [0, 0],
    [-575, 0],
    [575, 0],
  ]) {
    const film = filmAt(model, layerId, point);
    assert.equal(film.length, 1);
    assert.ok(
      Math.abs(film[0].z1 - film[0].z0 - thickness) < 1e-9,
      `${thickness * 1000} nm horizontal film`,
    );
  }
  for (const point of [
    [-700 - wallOffset, 0],
    [700 + wallOffset, 0],
  ]) {
    const film = filmAt(model, layerId, point);
    assert.equal(film.length, 1);
    assert.equal(film[0].role, 'conformal-sidewall');
    assert.ok(film[0].z1 - film[0].z0 > 0.05, 'Physical S/D wall has a finite-height coating');
  }
}

test('exact Fig3 tier-2 checkpoint supports native Conformal and persistence without crack-healing overlaps', async () => {
  const metadata = JSON.parse(await readFile(new URL('metadata.json', fixtureURL), 'utf8'));
  const bytes = brotliDecompressSync(
    await readFile(new URL('tier2-before-gate.wafercad.br', fixtureURL)),
  );
  assert.equal(bytes.length, metadata.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  const project = expandProjectStorage(JSON.parse(bytes));
  validateProjectFile(project);
  assert.equal(project.model.regions.length, 30);
  assert.equal(project.snapshotBranches.nodes.length, 22);
  const before = structuredClone(project);
  const model = structuredClone(project.model);
  const result = applyOperation(model, {
    type: 'add',
    name: 'T2 HfO2 gate',
    thickness: 0.01,
    face: 'front',
    growth: 'conformal',
    area: model.boundary,
  });
  assert.equal(result.changed, true, result.error);
  assert.equal(model.revision, before.model.revision + 1);
  validateProcessModel(model);
  assertFilm(model, result.layerId);
  assert.deepEqual(project, before, 'Source project and historical models are untouched');
  const text = serializeProject({ ...project, model });
  const reopened = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  validateProcessModel(reopened.model);
  assertFilm(reopened.model, result.layerId);
  assert.deepEqual(reopened.snapshotBranches.nodes.length, 22);

  const mask = (layer) =>
    unionGeometries(
      project.layout.elements
        .filter((element) => element.layer === layer)
        .map((element) => [[element.points]]),
    );
  assert.deepEqual(project.maskTransform, { x: 0, y: 0, scale: 1, rotation: 0 });
  const metal = applyOperation(model, {
    type: 'add',
    name: 'T2 Gate metal',
    thickness: 0.0404,
    face: 'front',
    growth: 'direct',
    area: mask(12),
  });
  assert.equal(metal.changed, true, metal.error);
  const contact = applyOperation(model, {
    type: 'etch',
    thickness: 0.01,
    face: 'front',
    etchProfile: 'directional',
    etchTargetLayerIds: [result.layerId],
    area: mask(13),
  });
  assert.equal(contact.changed, true, contact.error);
  validateProcessModel(model);
  const liner = applyOperation(model, {
    type: 'add',
    name: 'ILD2 HfO2 liner',
    thickness: 0.02,
    face: 'front',
    growth: 'conformal',
    area: mask(9),
  });
  assert.equal(liner.changed, true, liner.error);
  validateProcessModel(model);
  assertFilm(model, liner.layerId, 0.02, 0.02);
  for (const region of model.regions) {
    for (const polygon of region.geom) {
      for (const ring of polygon) {
        for (const point of ring) {
          for (const value of point)
            assert.ok(
              Math.abs(value / 1e-4 - Math.round(value / 1e-4)) < 1e-6,
              'Shared boundary vertices stay on the persistence grid',
            );
        }
      }
    }
  }
  const linerText = serializeProject({ ...project, model });
  const linerReopened = await readProjectFile({
    size: Buffer.byteLength(linerText),
    text: async () => linerText,
  });
  assert.deepEqual(
    linerReopened.model.regions.map((region) => region.geom),
    model.regions.map((region) => region.geom),
    'ILD2 XY partition survives export exactly',
  );
  for (let index = 0; index < model.regions.length; index++) {
    const storedStack = linerReopened.model.regions[index].stack,
      stack = model.regions[index].stack;
    assert.deepEqual(
      storedStack.map((segment) => segment.layerId),
      stack.map((segment) => segment.layerId),
    );
    storedStack.forEach((segment, ordinal) => {
      assert.ok(Math.abs(segment.z0 - stack[ordinal].z0) < 1e-10);
      assert.ok(Math.abs(segment.z1 - stack[ordinal].z1) < 1e-10);
    });
  }
  assert.deepEqual(serializeProject(linerReopened), linerText, 'Repeated export is stable');
  assertFilm(linerReopened.model, liner.layerId, 0.02, 0.02);
  assert.deepEqual(project, before, 'Native follow-up leaves checkpoint History unchanged');
});
