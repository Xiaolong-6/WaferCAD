import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { expandProjectStorage } = await import('../project-io.js');
const { attachContinuousEtchModel, validateContinuousEtchModel } =
  await import('../continuous-etch-model.js');
const { continuousOwnerColumnAtXY } = await import('../continuous-material-owner.js');
const { buildContinuousSiHeightfieldMesh } = await import('../continuous-heightfield-mesh.js');

const project = expandProjectStorage(
  JSON.parse(
    readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
  ),
);
const m07 = project.snapshots.find((step) => step.id === 'snapshot-microdisk-07')?.state?.model;
assert.ok(m07, 'Real published Microdisk M07 precursor required');

// Production material queries are the independent reference: they use the
// original exact polygon distances, without the display-only XY edge index.
for (const { shape, lateralUm, verticalUm } of [
  { shape: 'circular', lateralUm: 36, verticalUm: 36 },
  { shape: 'elliptical', lateralUm: 36, verticalUm: 21 },
]) {
  test(`indexed ${shape} Microdisk heightfield matches canonical XY/Z owner at grid vertices`, () => {
    const model = attachContinuousEtchModel(m07, {
      face: 'front',
      targetLayerIds: ['base'],
      shape,
      lateralUm,
      verticalUm,
    });
    const source = JSON.stringify(model);
    const owner = validateContinuousEtchModel(model);
    const mesh = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
    const { nx, ny } = mesh.grid;
    const dx = m07.width / nx,
      dy = m07.height / ny;
    let count = 0,
      maximumError = 0;
    for (let j = 1; j < ny; j += 13)
      for (let i = 1; i < nx; i += 11) {
        const x = -m07.width / 2 + i * dx,
          y = -m07.height / 2 + j * dy;
        const column = continuousOwnerColumnAtXY(owner, [x, y]);
        const expected = Math.max(
          ...column.filter((part) => part.layerId === 'base').map((part) => part.z1),
        );
        // The first vertex in the top triangle of each cell is exactly the
        // (i,j) grid vertex, before bottom/sidewall triangles are appended.
        const actual = mesh.positions[2 * (j * nx + i) * 9 + 2];
        assert.ok(Number.isFinite(actual) && Number.isFinite(expected));
        const error = Math.abs(actual - expected);
        maximumError = Math.max(maximumError, error);
        assert.ok(
          error < 1e-5,
          `Indexed display deviates from canonical material at ${x},${y}: ${error}`,
        );
        count++;
      }
    // Include all four sides of the known difficult ROI and the near-vertical
    // shoulder, not only easy interior sample points.
    for (const [x, y] of [
      [-75, 56],
      [-5, 56],
      [-75, 114],
      [-5, 114],
      [-36, 0],
      [36, 0],
      [82, 0],
      [118, 0],
      [0, 82],
      [0, 148],
    ]) {
      const i = Math.round((x + m07.width / 2) / dx),
        j = Math.round((y + m07.height / 2) / dy);
      const expected = Math.max(
        ...continuousOwnerColumnAtXY(owner, [x, y])
          .filter((part) => part.layerId === 'base')
          .map((part) => part.z1),
      );
      const actual = mesh.positions[2 * (j * nx + i) * 9 + 2];
      assert.ok(Math.abs(actual - expected) < 1e-5, `ROI-edge material changed at ${x},${y}`);
      count++;
    }
    assert.ok(count > 1000, 'Comparison must cover a substantial 2D area');
    assert.equal(
      JSON.stringify(model),
      source,
      'Display grid must never mutate canonical material',
    );
    console.log(JSON.stringify({ shape, witnessCount: count, maxGridErrorUm: maximumError }));
  });
}
