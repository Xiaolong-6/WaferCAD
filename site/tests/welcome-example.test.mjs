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

const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const { expandProjectStorage } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');

test('welcome example catalog promotes six literature-backed project families', async () => {
  assert.deepEqual(
    BUNDLED_EXAMPLES.map((example) => example.id),
    [
      'photodetector-literature',
      'perc-point-contact-solar-cell',
      'fully-textured-perovskite-silicon-tandem',
      'suspended-silica-microdisk',
      'm3d-selfpowered-heterogeneous-ic',
      'three-tier-silicon-jlfets',
    ],
  );
  const literature = BUNDLED_EXAMPLES[0];
  assert.equal(literature.kind, 'project');
  assert.match(literature.path, /photodetector-literature-examples\.wafercad$/);

  const packed = JSON.parse(
    await readFile(
      new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
      'utf8',
    ),
  );
  expandProjectStorage(packed);
  assert.equal(validateProjectFile(packed), packed);

  const branches = new Map(packed.snapshotBranches.branches.map((branch) => [branch.id, branch]));
  assert.equal(packed.snapshotBranches.activeBranchId, 'black-si-fig1a-final');
  assert.equal(branches.get('black-si-fig1a')?.parentBranchId, 'main');
  assert.equal(branches.get('black-si-fig1a-final')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('black-si-fig1a-qa')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('ge-fig15-common')?.parentBranchId, 'main');
  assert.equal(branches.get('ge-fig15-a')?.parentBranchId, 'ge-fig15-common');
  assert.equal(branches.get('ge-fig15-b')?.parentBranchId, 'ge-fig15-common');

  assert.equal(packed.snapshotBranches.branches.length, 7);
  assert.equal(packed.snapshotBranches.nodes.length, 46);
  assert.equal(packed.snapshots.length, 20);

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
  assert.equal(
    BUNDLED_EXAMPLES.some((entry) => entry.id === 'visualization'),
    false,
  );
});

test('Welcome previews preserve final structure and display while retaining only the final Step', async () => {
  for (const example of BUNDLED_EXAMPLES) {
    const read = async (path) =>
      expandProjectStorage(
        JSON.parse(
          await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url), 'utf8'),
        ),
      );
    const original = await read(example.previewSourcePath || example.path);
    if (example.previewSourcePath) {
      // Full-wafer validity and the 625-site/40-Step contract are covered by
      // example-structure, Native Fig3 full replay and array browser regression.
      // This preview test only needs the single-site source used to build the cover.
      assert.equal(original.model.kernel, 'vector-2.5d-v1');
    }
    const preview = await read(example.previewProject.path);
    assert.equal(validateProjectFile(preview), preview);
    for (const key of Object.keys(original).filter(
      (key) => !['snapshots', 'snapshotBranches', 'storageEncoding'].includes(key),
    )) {
      assert.deepEqual(
        preview[key],
        original[key],
        `${example.id}: ${key} changed in the final preview`,
      );
    }
    assert.equal(preview.snapshots.length, 0);
    assert.equal(preview.snapshotBranches.nodes.length, 1);
    assert.equal(preview.snapshotBranches.branches.length, 1);
    assert.ok(original.snapshotBranches.nodes.length > 1, 'complete original must retain History');
    assert.deepEqual(preview.snapshotBranches.nodes[0].state.model, original.model);
  }
});

test('Welcome thumbnail assets match their final preview source and image manifest', async () => {
  const { createHash } = await import('node:crypto');
  const manifest = JSON.parse(
    await readFile(
      new URL('../../tests/fixtures/project-io/example-thumbnails.json', import.meta.url),
      'utf8',
    ),
  );
  for (const example of BUNDLED_EXAMPLES) {
    const entry = manifest.examples.find((entry) => entry.id === example.id);
    assert.ok(entry);
    assert.equal(example.preview.view, 'three');
    assert.equal(example.preview.path, entry.path);
    const image = await readFile(new URL('../' + entry.path.replace(/^\.\//, ''), import.meta.url));
    const source = await readFile(
      new URL('../' + example.previewProject.path.replace(/^\.\//, ''), import.meta.url),
    );
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.equal(image.length, entry.bytes);
    assert.equal(createHash('sha256').update(image).digest('hex'), entry.sha256);
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      entry.sourceSha256,
      'regenerate thumbnail when its final structure changes',
    );
  }
});
