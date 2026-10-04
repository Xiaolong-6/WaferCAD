import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vendorSource = await readFile(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { expandProjectStorage } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');

const project = JSON.parse(
  await readFile(
    new URL('../../examples/projects/sahli-2018-fully-textured-tandem.wafercad', import.meta.url),
    'utf8',
  ),
);
expandProjectStorage(project);

test('Sahli regression fixture uses bookmarks instead of VIEW fabrication Steps', () => {
  assert.equal(validateProjectFile(project), project);

  const nodes = project.snapshotBranches.nodes,
    finalNode = nodes.find((node) => node.operation?.label === '20_final_tandem'),
    viewSnapshots = project.snapshots.filter((snapshot) =>
      ['Ag finger cross-section', 'Ag finger micro-section'].includes(snapshot.name),
    );

  assert.ok(finalNode);
  assert.equal(nodes.length, 24);
  assert.equal(nodes.some((node) => /^VIEW_Ag_finger_/.test(node.operation?.label || '')), false);
  assert.equal(viewSnapshots.length, 2);
  assert.ok(viewSnapshots.every((snapshot) => snapshot.historyNodeId === finalNode.id));
  assert.ok(
    viewSnapshots.every((snapshot) => snapshot.state.display?.threeCamera?.position?.length === 3),
  );
  assert.equal(project.snapshotBranches.branches[0].headNodeId, finalNode.id);
  assert.equal(project.model.processRevision, finalNode.processRevision);
});

test('Sahli Pyramid reconstruction is deterministic and explicitly non-periodic', () => {
  const appearances = [];
  for (const region of project.model.regions || []) {
    for (const segment of region.stack || []) {
      for (const appearance of [segment.frontSurface, segment.backSurface]) {
        if (appearance?.kind === 'rough' && appearance.morphology === 'pyramid') {
          appearances.push(appearance);
        }
      }
    }
  }

  assert.ok(appearances.length > 0);
  assert.ok(appearances.some((appearance) => appearance.featureCv === 0.3));
  assert.ok(appearances.every((appearance) => Number.isInteger(appearance.seed)));
  assert.ok(appearances.some((appearance) => appearance.seed === 2018));
  assert.ok(appearances.some((appearance) => appearance.seed === 2019));
});
