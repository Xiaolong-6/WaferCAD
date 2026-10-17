import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { buildTcmosInverter } from '../../scripts/build-tcmos-inverter-example.mjs';
import {
  createTcmosArrayPatch,
  TCMOS_ARRAY_SPEC,
} from '../../scripts/build-tcmos-array-patch.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');
const { arrayParts, resolveArrayModel, translateGeometry } =
  await import('../model-array.js');
const { resolveQualitativeDopantRegion } = await import('../dopant-regions.js');
const { validateProjectFile } = await import('../project-schema.js');

test('4x4 native T-CMOS patch keeps all 16 independent SVG cells and ILD supports', async () => {
  const { project: source } = await buildTcmosInverter({ includeComparison: false });
  const { project, cells } = await createTcmosArrayPatch(source);
  validateProjectFile(project);
  assert.equal(project.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(project.model.array.templates.length, 1);
  assert.equal(cells.length, 16);
  assert.deepEqual(
    [project.model.width, project.model.height],
    [TCMOS_ARRAY_SPEC.columns * 14, TCMOS_ARRAY_SPEC.rows * 8],
  );
  assert.equal(project.layout.combos.length, 8);
  assert.equal(project.layout.elements.length, 232 * 16);
  assert.equal(project.layout.elements.filter((element) => element.layer === 10).length, 218 * 16);
  assert.equal(project.model.regions.length, 0, 'Array materials must remain instanced');
  const ilD = project.model.layers.find((layer) => layer.name === 'Interlayer SiO2');
  assert.equal(ilD?.visible, true);
  assert.ok(!project.processRecipe && !project.snapshotBranches, 'No false whole-array replay');
  const parts = arrayParts(project.model);
  for (let i = 0; i < 16; i++) {
    const part = parts[i];
    assert.strictEqual(
      part.model.regions.length,
      source.model.regions.length,
      'Every site must retain all real material owners',
    );
    const siteMask = project.layout.elements.slice(i * 232, (i + 1) * 232);
    for (let n = 0; n < 232; n++) {
      assert.deepEqual(
        siteMask[n].points,
        source.layout.elements[n].points.map(([x, y]) => [x + part.x, y + part.y]),
        'No mask position may be dropped or guessed while tiling',
      );
    }
    const cut = resolveArrayModel(project.model, {
      minX: part.x - 6,
      maxX: part.x + 6,
      minY: part.y - 3,
      maxY: part.y + 3,
    });
    assert.ok(cut.regions.length >= source.model.regions.length);
  }
  assert.equal(project.model.dopantRegions.length, source.model.dopantRegions.length);
  for (const [index, dopant] of project.model.dopantRegions.entries()) {
    const original = source.model.dopantRegions[index];
    assert.equal(dopant.area.length, original.area.length * 16);
    for (let i = 0; i < 16; i++) {
      const { x, y } = cells[i];
      assert.deepEqual(
        dopant.area.slice(i * original.area.length, (i + 1) * original.area.length),
        translateGeometry(original.area, x, y),
      );
    }
    const fragments = resolveQualitativeDopantRegion(project.model, dopant, v);
    assert.ok(fragments.length >= 16, 'Doping must retain host-material overlap at all 16 sites');
  }
  assert.equal(project.model.array.instances.filter((item) => item.role === 'device').length, 16);
});
