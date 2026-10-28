import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { validateNativeLiteratureCases } from '../../scripts/v2/capture-literature-native-v2.mjs';

test('ten native-v2 literature Sections intersect published canonical material, including array-only models', async () => {
  const registry = JSON.parse(
    await readFile(
      new URL('../../docs/evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json', import.meta.url),
    ),
  );
  const cases = validateNativeLiteratureCases(registry);
  await loadGeometryKernel();
  const [{ readProjectFile }, { sectionSlices, sectionContours }] = await Promise.all([
    import('../project-io.js'),
    import('../model-view-geometry.js'),
  ]);
  assert.equal(cases.length, 10);
  for (const source of cases) {
    const filename = new URL('../' + source.projectPath.slice(2), import.meta.url);
    const file = await readFile(filename);
    const project = await readProjectFile(new Blob([file], { type: 'application/json' }));
    assert.ok(project.model.regions.length > 0 || project.model.array);
    assert.ok(project.model.layers.length > 0);
    const continuous = project.model.kernel === 'vector-continuous-etch-v1';
    const slices = continuous
      ? sectionContours(project.model, source.a, source.b)
      : sectionSlices(project.model, source.a, source.b);
    assert.ok(slices.length > 0, source.id + ': A-B cut misses all material');
    assert.ok(
      slices.every((entry) =>
        continuous
          ? entry.layerId && entry.polys?.length > 0
          : entry.layerId && entry.z1 > entry.z0,
      ),
    );
    if (source.id === 'tio2-metalens-four-unit') {
      const tioxide = project.model.layers.find((layer) => layer.name === 'TiO2');
      assert.ok(tioxide, 'Missing physical TiO2 layer');
      assert.ok(slices.some((slice) => slice.layerId === tioxide.id));
    }
    assert.equal(source.acceptance.status, 'open-paper-match');
  }
});
