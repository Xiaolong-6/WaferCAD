// Scientific and storage acceptance for the *published* continuous M08/M09,
// not the synthetic Full Face M07 prototype or the old 72-band variant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;
const { readProjectFile, serializeProject, expandProjectStorage } =
  await import('../project-io.js');
const { continuousModelMaterialAt, validateContinuousEtchModel } =
  await import('../continuous-etch-model.js');
const { continuousOwnerColumnAtXY } = await import('../continuous-material-owner.js');
const { createSelectionGeometry } = await import('../selection-geometry.js');
const { maskLocalToWorld } = await import('../mask-roi-geometry.js');
const { pointInMulti } = await import('../vector-geometry.js');

const originalBytes = await readFileAsync(
  new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url),
);
const publishedBytes = await readFileAsync(
  new URL('../examples/suspended-silica-microdisks-continuous.wafercad', import.meta.url),
);
const original = expandProjectStorage(JSON.parse(originalBytes));
const released = await readProjectFile(new Blob([publishedBytes]));
const m07 = original.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model;

test('published M08 uses the original inverted seven-shape GDS mask, not Full Face', () => {
  const model = released.model;
  const owner = validateContinuousEtchModel(model);
  const selected = (element) =>
    original.selectedLayerKeys.includes(`${element.layer}|${element.datatype}`);
  const geometry = createSelectionGeometry({
    getState: () => ({ ...original, model: m07 }),
    selectedElement: selected,
    maskPoint: (point) => maskLocalToWorld(point, original.maskTransform),
  });
  const actualClip = geometry.operationAreaGeometry('invert');
  assert.equal(actualClip.length, 5);
  assert.deepEqual(owner.operation.clip, actualClip);
  assert.deepEqual(owner.sourceModel, m07);
  assert.equal(owner.operation.face, 'front');
  assert.equal(owner.fronts.length, 1);
  assert.equal(owner.fronts[0].shape, 'circular');
  assert.equal(owner.fronts[0].lateralUm, 36);
  assert.equal(owner.fronts[0].verticalUm, 36);
  assert.equal(released.layout.elements.length, 7);
  const recipe = released.processRecipe.steps;
  assert.deepEqual(recipe.slice(0, 6), original.processRecipe.steps.slice(0, 6));
  assert.equal(recipe[6].params.area, 'invert');
  assert.deepEqual(recipe[6].params.mask, original.processRecipe.steps[6].params.mask);
  assert.equal(recipe[6].params.profile, 'continuous');
  assert.equal(recipe[6].params.continuousShape, 'circular');
  assert.equal(recipe[7].command, 'record');
  const historyM08 = released.snapshotBranches.nodes.find(
    (node) => node.id === 'process-microdisk-08',
  );
  assert.equal(historyM08.operation.replay.version, 1);
  assert.equal(historyM08.operation.replay.params.etchProfile, 'continuous');
  assert.equal(historyM08.operation.replay.params.continuousShape, 'circular');
  assert.equal(historyM08.operation.replay.areaMode, 'invert');
  assert.deepEqual(historyM08.operation.replay.maskContext.layerKeys, ['1|0']);
  assert.equal(
    released.snapshotBranches.nodes.find((node) => node.id === 'process-microdisk-09').operation
      .replay.kind,
    'record',
  );
  assert.match(
    released.snapshotBranches.nodes.find((n) => n.id === 'process-microdisk-08').operation.note,
    /not a measured value/,
  );
});

test('published continuous material conserves silica and retains pedestal with exact occupancy', () => {
  const owner = validateContinuousEtchModel(released.model);
  const sampled = [];
  for (let x = -180; x <= 180; x += 8) for (let y = -180; y <= 180; y += 8) sampled.push([x, y]);
  const materialBefore = JSON.stringify(released.model);
  let solidCount = 0,
    releasedCount = 0;
  for (const xy of sampled) {
    const before = continuousOwnerColumnAtXY(owner, xy);
    const fromModel =
      original.snapshots
        .find((s) => s.id === 'snapshot-microdisk-07')
        .state.model.regions.find((r) => pointInMulti(xy, r.geom))?.stack || [];
    assert.deepEqual(
      before.filter((s) => s.layerId === 'layer-1'),
      fromModel.filter((s) => s.layerId === 'layer-1'),
      `SiO2 altered at ${xy}`,
    );
    if (before.some((s) => s.layerId === 'base')) solidCount++;
    if (
      fromModel.some((s) => s.layerId === 'base' && s.z1 > 20) &&
      !before.some((s) => s.layerId === 'base' && s.z1 > 20)
    )
      releasedCount++;
  }
  assert.ok(solidCount > 1200);
  assert.ok(releasedCount > 100);
  assert.equal(continuousModelMaterialAt(released.model, [0, 0, 39]), 'base');
  assert.equal(continuousModelMaterialAt(released.model, [110, 0, 30]), null);
  assert.equal(continuousModelMaterialAt(released.model, [145, 0, 40.5]), 'layer-1');
  assert.equal(
    JSON.stringify(released.model),
    materialBefore,
    'read-only material queries mutated owner',
  );
});

test('published M08/M09 Bookmarks, process nodes, branch head, Recipe and Export all agree', async () => {
  assert.equal(released.snapshots.length, 9);
  const nodes = new Map(released.snapshotBranches.nodes.map((n) => [n.id, n]));
  for (const suffix of ['08', '09']) {
    const snapshot = released.snapshots.find((s) => s.id === `snapshot-microdisk-${suffix}`);
    const node = nodes.get(`process-microdisk-${suffix}`);
    assert.ok(snapshot && node);
    assert.deepEqual(snapshot.state.model, released.model);
    assert.deepEqual(node.state.model, released.model);
    assert.deepEqual(snapshot.state.processRecipe, node.state.processRecipe);
  }
  assert.deepEqual(released.snapshotBranches.branches[0].headState.model, released.model);
  // A trailing record-only Step must not retain the legacy 9th physical
  // revision: History HEAD sync rejects it, preventing any Step navigation.
  const releaseNode = nodes.get('process-microdisk-08');
  const recordNode = nodes.get('process-microdisk-09');
  assert.equal(releaseNode.processRevision, released.model.processRevision);
  assert.equal(recordNode.processRevision, released.model.processRevision);
  assert.equal(recordNode.processRevision, recordNode.state.model.processRevision);
  const { createSnapshotManager } = await import('../workspace-snapshots.js');
  const headState = released.snapshotBranches.branches[0].headState;
  const manager = createSnapshotManager({
    capture: () => structuredClone(headState),
    restore: () => {},
  });
  assert.equal(manager.importRecords(released.snapshots, released.snapshotBranches), 9);
  assert.equal(manager.syncActiveHeadState(), true, 'Published HEAD must allow safe navigation');
  assert.deepEqual(
    released.snapshotBranches.branches[0].headState.processRecipe,
    released.processRecipe,
  );
  for (let i = 1; i <= 7; i++) {
    const suffix = String(i).padStart(2, '0');
    assert.deepEqual(
      released.snapshots.find((s) => s.id.endsWith(suffix)).state.model,
      original.snapshots.find((s) => s.id.endsWith(suffix)).state.model,
    );
  }
  const text = serializeProject(released);
  assert.equal(JSON.parse(text).storage.lossless, true);
  const reopened = await readProjectFile(new Blob([text]));
  assert.deepEqual(reopened.model, released.model);
  assert.deepEqual(reopened.snapshotBranches, released.snapshotBranches);
  assert.deepEqual(reopened.processRecipe, released.processRecipe);
  assert.equal(
    createHash('sha256').update(originalBytes).digest('hex'),
    createHash('sha256')
      .update(
        await readFileAsync(
          new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url),
        ),
      )
      .digest('hex'),
  );
});
