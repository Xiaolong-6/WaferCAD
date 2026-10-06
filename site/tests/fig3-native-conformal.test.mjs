import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { applyOperation } = await import('../model.js');
const { pointInMulti } = await import('../vector-geometry.js');
const { expandProjectStorage, serializeProject, readProjectFile } =
  await import('../project-io.js');
const { validateProjectFile, validateProcessModel } = await import('../project-schema.js');
const fixtureURL = new URL('../../tests/fixtures/native-fig3/', import.meta.url);

function filmAt(model, layerId, point) {
  const regions = model.regions.filter((region) => pointInMulti(point, region.geom));
  assert.equal(regions.length, 1, `One material owner at ${point}`);
  return regions[0].stack.filter((segment) => segment.layerId === layerId);
}
function assertFilm(model, layerId) {
  for (const point of [
    [0, 0],
    [-575, 0],
    [575, 0],
  ]) {
    const film = filmAt(model, layerId, point);
    assert.equal(film.length, 1);
    assert.ok(Math.abs(film[0].z1 - film[0].z0 - 0.01) < 1e-9, '10 nm horizontal film');
  }
  for (const point of [
    [-700.005, 0],
    [700.005, 0],
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
});
