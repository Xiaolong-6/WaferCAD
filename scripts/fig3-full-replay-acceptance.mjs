import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import {
  newUiContext,
  waitForAppReady,
  waitForThreeReady,
} from './test-helpers/ui.mjs';
import {
  exportCurrentProject,
  loadProject,
} from './test-helpers/product-scientific.mjs';
import { nativeApply } from './test-helpers/native-fig3.mjs';
import { assertNativeFig3Contract } from './test-helpers/example-contracts.mjs';

await loadGeometryKernel();

const io = await import('../site/project-io.js');
const schema = await import('../site/project-schema.js');
const { pointInMulti } = await import('../site/vector-geometry.js');
const { createWaferArrayProject } = await import('../site/model-array-construction.js');

const sourcePath = new URL('../site/examples/three-tier-silicon-jlfets.wafercad', import.meta.url);
const fullWaferPath = new URL(
  '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
  import.meta.url,
);
const resultDir = new URL('../test-results/native-fig3/full-replay/', import.meta.url);
await mkdir(resultDir, { recursive: true });

const sourceBytes = await readFile(sourcePath);
const source = await io.readProjectFile({
  size: sourceBytes.length,
  text: async () => sourceBytes.toString('utf8'),
});
assert.equal(source.snapshotBranches?.nodes?.length, 40, 'Native Fig3 source must have 40 Steps.');
assertNativeFig3Contract(source, pointInMulti);

const sourceNodes = source.snapshotBranches.nodes;
const oldLayerNames = new Map();
for (const node of sourceNodes) {
  const operation = node.operation;
  if (operation?.resultLayerId) oldLayerNames.set(operation.resultLayerId, operation.name);
}

function replayParams(operation) {
  if (operation.kind === 'record') {
    return {
      type: 'record',
      name: operation.label,
      processType: operation.processType || 'custom',
      temperature: operation.temperatureC,
      duration: operation.durationMin,
      ambient: operation.ambient,
      note: operation.note,
    };
  }

  const replay = operation.replay;
  assert.equal(replay?.version, 1, `Missing replay metadata for ${operation.label}`);
  const params = replay.params || {};
  const layerKey = replay.maskContext?.layerKeys?.[0];
  const targetId = params.etchTargetLayerIds?.[0];
  return {
    type: params.type,
    name: params.name,
    thickness: params.thickness,
    growth: params.growth,
    profile: params.etchProfile,
    area: replay.areaMode,
    layer: layerKey ? Number(layerKey.split('|')[0]) : null,
    target: targetId ? oldLayerNames.get(targetId) : null,
  };
}

function initialProject() {
  // Step 0 is a record-only node, so its restore-state geometry is the pristine
  // receiver geometry. Strip all prior History/Snapshots and replay Step 0 too.
  const seed = structuredClone(sourceNodes[0].state);
  seed.name = 'Native Fig3 full replay seed';
  seed.snapshots = [];
  delete seed.snapshotBranches;
  return seed;
}

function normalizeModel(model) {
  // Model identity fields are deterministic for this replay. Clone to keep
  // comparisons independent of storage/shared-asset object identity.
  return structuredClone(model);
}

function applyCuratedPresentation(project) {
  for (const key of [
    'selectedLayerKeys',
    'activeCell',
    'maskTransform',
    'maskSourceMode',
    'drawMask',
    'maskRoi',
    'maskRoiAnchor',
    'activeFace',
    'roi',
    'roiAnchor',
    'section',
    'planViews',
    'display',
  ]) {
    if (source[key] !== undefined) project[key] = structuredClone(source[key]);
  }
  project.name = source.name;

  const sourceIndex = new Map(sourceNodes.map((node, index) => [node.id, index]));
  const replayNodes = project.snapshotBranches.nodes;
  project.snapshots = (source.snapshots || []).map((snapshot, index) => {
    const nodeIndex = sourceIndex.get(snapshot.historyNodeId);
    assert.ok(Number.isInteger(nodeIndex), `Snapshot ${snapshot.name} has no source Step.`);
    const replayNode = replayNodes[nodeIndex];
    return {
      id: `snapshot-native-fig3-full-replay-${index + 1}`,
      name: snapshot.name,
      createdAt: snapshot.createdAt,
      branchId: replayNode.branchId,
      parentId: index ? `snapshot-native-fig3-full-replay-${index}` : null,
      historyNodeId: replayNode.id,
      state: structuredClone(replayNode.state),
    };
  });
}

const browser = await chromium.launch({
  headless: process.env.WAFERCAD_HEADFUL !== '1',
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: [
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const context = await newUiContext(browser, {
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const timings = [];
let replayed;
try {
  await page.goto((process.env.WAFERCAD_URL || 'http://127.0.0.1:4173') + '/app.html', {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppReady(page);
  await loadProject(page, initialProject(), 'native-fig3-full-replay-seed');

  for (let index = 0; index < sourceNodes.length; index++) {
    const expected = sourceNodes[index];
    const result = await nativeApply(page, replayParams(expected.operation));
    assert.equal(result.passed, true, `Step ${index + 1}: ${result.status}`);
    timings.push({
      step: index + 1,
      label: expected.operation.label,
      seconds: result.seconds,
      status: result.status,
    });
  }

  replayed = await exportCurrentProject(page, 300000);
  schema.validateProjectFile(replayed);
  assert.equal(replayed.snapshotBranches.nodes.length, 40, 'Replay must create exactly 40 Steps.');

  for (let index = 0; index < sourceNodes.length; index++) {
    const actualNode = replayed.snapshotBranches.nodes[index];
    const expectedNode = sourceNodes[index];
    assert.equal(
      actualNode.operation.kind,
      expectedNode.operation.kind,
      `Step ${index + 1} operation kind`,
    );
    assert.deepEqual(
      normalizeModel(actualNode.state.model),
      normalizeModel(expectedNode.state.model),
      `Step ${index + 1} model mismatch: ${expectedNode.operation.label}`,
    );
  }

  assert.deepEqual(pageErrors, []);
  assertNativeFig3Contract(replayed, pointInMulti);
  await waitForThreeReady(page, 300000);

  applyCuratedPresentation(replayed);
  schema.validateProjectFile(replayed);
} finally {
  await browser.close();
}

const siteText = io.serializeProject(replayed);
const reopenedSite = await io.readProjectFile({
  size: Buffer.byteLength(siteText),
  text: async () => siteText,
});
schema.validateProjectFile(reopenedSite);
assertNativeFig3Contract(reopenedSite, pointInMulti);
assert.deepEqual(reopenedSite.model, replayed.model);
assert.deepEqual(reopenedSite.snapshotBranches, replayed.snapshotBranches);

const fullWafer = createWaferArrayProject(reopenedSite);
schema.validateProjectFile(fullWafer);
assert.equal(
  fullWafer.model.array.instances.filter((instance) => instance.role === 'device').length,
  625,
);
assert.equal(fullWafer.snapshotBranches.nodes.length, 40);
assertNativeFig3Contract(fullWafer, pointInMulti);

const fullText = io.serializeProject(fullWafer);
const reopenedFull = await io.readProjectFile({
  size: Buffer.byteLength(fullText),
  text: async () => fullText,
});
schema.validateProjectFile(reopenedFull);
assert.equal(
  reopenedFull.model.array.instances.filter((instance) => instance.role === 'device').length,
  625,
);
assert.deepEqual(reopenedFull.model, fullWafer.model);
assert.deepEqual(reopenedFull.snapshotBranches, fullWafer.snapshotBranches);

await writeFile(new URL('three-tier-silicon-jlfets.wafercad', resultDir), siteText);
await writeFile(
  new URL('three-tier-silicon-jlfets-full-wafer.wafercad', resultDir),
  fullText,
);
await writeFile(
  new URL('validation.json', resultDir),
  JSON.stringify(
    {
      sourceSteps: sourceNodes.length,
      replaySteps: replayed.snapshotBranches.nodes.length,
      snapshots: replayed.snapshots.length,
      fullWaferSites: 625,
      siteBytes: Buffer.byteLength(siteText),
      fullWaferBytes: Buffer.byteLength(fullText),
      pageErrors,
      timings,
      stepModelsExact: true,
      siteRoundTripExact: true,
      fullWaferRoundTripExact: true,
      nativeFig3Contract: true,
    },
    null,
    2,
  ),
);

if (process.argv.includes('--verify-repo-examples')) {
  assert.equal(
    await readFile(sourcePath, 'utf8'),
    siteText,
    'Full replay site output differs from the committed formal example.',
  );
  assert.equal(
    await readFile(fullWaferPath, 'utf8'),
    fullText,
    'Full replay 625-site output differs from the committed formal example.',
  );
}

console.log(
  JSON.stringify({
    pass: true,
    steps: 40,
    snapshots: replayed.snapshots.length,
    sites: 625,
    stepModelsExact: true,
    siteRoundTripExact: true,
    fullWaferRoundTripExact: true,
  }),
);
