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

const { createVisualizationExample, createVisualizationLayout } =
  await import('../welcome-example.js');
const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const { expandProjectStorage } = await import('../project-io.js');
const { CURRENT_PROJECT_VERSION, migrateProjectFile, validateProjectFile } =
  await import('../project-schema.js');

test('Visualization welcome example preserves the uploaded mask structure', () => {
  const layout = createVisualizationLayout();
  assert.equal(layout.root, 'Wafer');
  assert.equal(layout.elements.length, 397);
  assert.equal(layout.combos.length, 7);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Opening').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'ITO').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Metal').length, 132);
});

test('Visualization welcome example migrates into the current interactive project schema', () => {
  const project = migrateProjectFile(createVisualizationExample());
  assert.equal(project.version, CURRENT_PROJECT_VERSION);
  assert.equal(validateProjectFile(project), project);
  assert.equal(project.model.layers.length, 7);
  assert.deepEqual(project.selectedLayerKeys, ['4|0']);
  assert.equal(project.maskSourceMode, 'file');
  assert.deepEqual(project.drawMask, { nextShapeId: 1, shapes: [] });
  assert.deepEqual(
    project.model.layers.map((layer) => layer.name),
    ['Base', 'SiO2', 'Perovskite', 'ETL', 'ITO', 'Metal', 'Back metal'],
  );
});


test('welcome example catalog promotes four literature-backed project families', async () => {
  assert.deepEqual(
    BUNDLED_EXAMPLES.map((example) => example.id),
    [
      'photodetector-literature',
      'perc-point-contact-solar-cell',
      'fully-textured-perovskite-silicon-tandem',
      'suspended-silica-microdisk',
    ],
  );
  const literature = BUNDLED_EXAMPLES[0];
  assert.equal(literature.kind, 'project');
  assert.match(literature.path, /photodetector-literature-examples\.wafercad$/);

  const packed = JSON.parse(
    await readFile(new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url), 'utf8'),
  );
  expandProjectStorage(packed);
  assert.equal(validateProjectFile(packed), packed);

  const branches = new Map(
    packed.snapshotBranches.branches.map((branch) => [branch.id, branch]),
  );
  assert.equal(packed.snapshotBranches.activeBranchId, 'black-si-fig1a-final');
  assert.equal(branches.get('black-si-fig1a')?.parentBranchId, 'main');
  assert.equal(branches.get('black-si-fig1a-final')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('black-si-fig1a-qa')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('ge-fig15-common')?.parentBranchId, 'main');
  assert.equal(branches.get('ge-fig15-a')?.parentBranchId, 'ge-fig15-common');
  assert.equal(branches.get('ge-fig15-b')?.parentBranchId, 'ge-fig15-common');

  assert.equal(packed.snapshotBranches.branches.length, 7);
  assert.equal(packed.snapshotBranches.nodes.length, 32);
  assert.equal(packed.snapshots.length, 47);

  const allModels = [
    packed.model,
    ...packed.snapshotBranches.nodes.map((node) => node.state?.model).filter(Boolean),
    ...packed.snapshotBranches.branches.map((branch) => branch.headState?.model).filter(Boolean),
  ];
  const geElectrical = allModels
    .flatMap((model) => model?.electricalRegions || [])
    .filter((region) => /Induced .*type/i.test(region.name));
  assert.ok(geElectrical.some((region) => region.regionType === 'p-inversion'));
  assert.ok(geElectrical.some((region) => region.regionType === 'n-accumulation'));
  assert.equal(
    allModels
      .flatMap((model) => model?.implants || [])
      .some((implant) => /^INDUCED/i.test(implant.name)),
    false,
  );
});


test('literature examples expose traceable source citations on Welcome', () => {
  const literatureExamples = BUNDLED_EXAMPLES.filter(
    (example) => example.kind === 'project' && /literature/i.test(example.level || ''),
  );
  assert.ok(literatureExamples.length > 0);

  for (const example of literatureExamples) {
    assert.ok(example.sources?.length > 0, `${example.id}: literature source list missing`);
    for (const source of example.sources) {
      assert.ok(source.citation?.trim(), `${example.id}: citation text missing`);
      assert.match(source.href || '', /^https:\/\/doi\.org\//);
      assert.ok(source.doi?.trim(), `${example.id}: DOI missing`);
      assert.ok(
        source.href.endsWith(source.doi),
        `${example.id}: DOI link must resolve the declared DOI`,
      );
    }
  }
});

test('photodetector family uses the device-oriented Welcome title', () => {
  const example = BUNDLED_EXAMPLES.find((entry) => entry.id === 'photodetector-literature');
  assert.equal(example?.title, 'Photodetectors with nanopatterns');
  assert.equal(example?.sources?.length, 2);
});



test('all promoted Welcome examples are valid project files', async () => {
  for (const example of BUNDLED_EXAMPLES) {
    assert.equal(example.kind, 'project', `${example.id}: Welcome examples must be projects`);
    assert.ok(example.path?.endsWith('.wafercad'), `${example.id}: project path missing`);

    const fileName = example.path.split('/').at(-1);
    const packed = JSON.parse(
      await readFile(new URL(`../examples/${fileName}`, import.meta.url), 'utf8'),
    );
    expandProjectStorage(packed);
    assert.equal(validateProjectFile(packed), packed, `${example.id}: invalid project`);
  }
});

test('promoted device examples use device-oriented titles and explicit provenance', () => {
  const perc = BUNDLED_EXAMPLES.find((entry) => entry.id === 'perc-point-contact-solar-cell'),
    tandem = BUNDLED_EXAMPLES.find(
      (entry) => entry.id === 'fully-textured-perovskite-silicon-tandem',
    ),
    microdisk = BUNDLED_EXAMPLES.find((entry) => entry.id === 'suspended-silica-microdisk');

  assert.equal(perc?.title, 'PERC solar cells with point contacts');
  assert.equal(perc?.sources?.[0]?.doi, '10.1063/1.101596');
  assert.equal(tandem?.title, 'Fully textured perovskite–silicon tandems');
  assert.equal(tandem?.sources?.[0]?.doi, '10.1038/s41563-018-0115-4');
  assert.equal(microdisk?.title, 'Suspended silica microdisks');
  assert.equal(microdisk?.sources?.[0]?.doi, '10.1038/s41467-018-08038-4');
  assert.equal(BUNDLED_EXAMPLES.some((entry) => entry.id === 'visualization'), false);
});
