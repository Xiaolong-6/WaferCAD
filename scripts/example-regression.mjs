import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, newUiPage } from './test-helpers/ui.mjs';

const vendorSource = await readFile(
  new URL('../site/vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { expandProjectStorage } = await import('../site/project-io.js');

const sahliProjectBuffer = await readFile(
  new URL('../examples/projects/sahli-2018-fully-textured-tandem.wafercad', import.meta.url),
);

const packedLiterature = JSON.parse(
  await readFile(
    new URL('../site/examples/photodetector-literature-examples.wafercad', import.meta.url),
    'utf8',
  ),
);
expandProjectStorage(packedLiterature);

const branches = new Map(
    packedLiterature.snapshotBranches.branches.map((branch) => [branch.id, branch]),
  ),
  nodes = packedLiterature.snapshotBranches.nodes,
  roughStep = nodes.find(
    (node) => node.branchId === 'black-si-fig1a' && /Rough/.test(node.operation?.label || ''),
  ),
  geBInversionStep = nodes.find(
    (node) =>
      node.branchId === 'ge-fig15-b' &&
      node.operation?.kind === 'electrical' &&
      /p-type inversion/.test(node.operation?.label || ''),
  );

assert.ok(roughStep?.state?.model);
assert.ok(geBInversionStep?.state?.model);

const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const reviewDir = new URL('../test-results/product-review/', import.meta.url);
await mkdir(reviewDir, { recursive: true });

function parseGlbJson(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB version');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB byte length');
  const jsonLength = buffer.readUInt32LE(12),
    jsonType = buffer.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a, 'first GLB chunk must be JSON');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function glbPositionBounds(json) {
  const bounds = [];
  for (const node of json.nodes || []) {
    if (!Number.isInteger(node.mesh)) continue;
    const mesh = json.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      const accessorIndex = primitive.attributes?.POSITION;
      if (!Number.isInteger(accessorIndex)) continue;
      const accessor = json.accessors?.[accessorIndex];
      if (accessor?.min?.length === 3 && accessor?.max?.length === 3) {
        bounds.push({
          node,
          count: Number(accessor.count) || 0,
          min: accessor.min.map(Number),
          max: accessor.max.map(Number),
        });
      }
    }
  }
  return bounds;
}

const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, { viewport: { width: 1280, height: 860 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const FUNCTION_SECTION_IDS = {
  snapshots: 'snapshotsTools',
};

async function openFunctionPanel(name) {
  const button = page.locator(`.workstation-rail-button[data-tool="${name}"]`);
  await button.waitFor({ state: 'visible', timeout: 10000 });
  const panel = page.locator('#toolPanel.workstation-tool-flyout'),
    isOpen = await panel.evaluate((element) => element.classList.contains('open')),
    isActive = await button.evaluate((element) => element.classList.contains('active'));
  if (!isOpen || !isActive) await button.click();
  await page.locator(`#${FUNCTION_SECTION_IDS[name]}:not([hidden])`).waitFor();
}

async function waitRendererForState(state, label) {
  const model = state.model;
  await page.waitForFunction(
    ({ revision, processRevision }) => {
      const host = document.getElementById('threeHost');
      return (
        host?.dataset?.modelRevision === String(revision) &&
        host?.dataset?.processRevision === String(processRevision) &&
        host?.dataset?.renderState === 'ready'
      );
    },
    { revision: model.revision, processRevision: model.processRevision },
    { timeout: 30000 },
  );

  const data = await page.locator('#threeHost').evaluate((host) => ({
    modelRevision: Number(host.dataset.modelRevision),
    processRevision: Number(host.dataset.processRevision),
    sceneGeneration: Number(host.dataset.sceneGeneration),
    renderState: host.dataset.renderState,
  }));
  assert.equal(data.modelRevision, model.revision, `${label}: stale model revision in 3D`);
  assert.equal(
    data.processRevision,
    model.processRevision,
    `${label}: stale process revision in 3D`,
  );
  assert.equal(data.renderState, 'ready', `${label}: 3D did not settle`);
  return data;
}

async function switchVariant(branchId) {
  const branch = branches.get(branchId);
  assert.ok(branch, `missing Variant contract ${branchId}`);
  const group = page.locator(`.history-variant[data-variant-id="${branchId}"]`);
  await group.waitFor({ state: 'attached', timeout: 10000 });
  await group.locator(':scope > .history-variant-head .history-variant-name').click();
  await page.waitForFunction(
    (id) =>
      document.querySelector(`.history-variant[data-variant-id="${id}"]`)?.dataset?.active ===
      'true',
    branchId,
    { timeout: 10000 },
  );
  await waitRendererForState(branch.headState, `Variant ${branchId} HEAD`);
}

async function restoreStep(node) {
  const previousGeneration = Number(
    await page.locator('#threeHost').getAttribute('data-scene-generation'),
  );
  const row = page.locator(
    `.history-step-wrap[data-step-id="${node.id}"] > .history-step-row.is-restorable`,
  );
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.click();
  await page.waitForFunction(
    (label) => (document.getElementById('statusText')?.textContent || '').includes(label),
    node.operation?.label || node.operation?.kind || 'Process step',
    { timeout: 10000 },
  );
  const data = await waitRendererForState(node.state, `Step ${node.operation?.label || node.id}`);
  assert.ok(
    data.sceneGeneration > previousGeneration,
    `Step ${node.id}: restore must invalidate the old 3D scene`,
  );
}

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await page
  .locator('.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-open')
  .click();
await page.waitForURL(/start=example.*example=photodetector-literature/, { timeout: 30000 });
await page.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened photodetector-literature-examples.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel('snapshots');

assert.equal(await page.locator('.history-variant').count(), 7);
assert.equal(
  await page
    .locator('.history-variant[data-variant-id="black-si-fig1a-final"]')
    .getAttribute('data-active'),
  'true',
);
await waitRendererForState(
  branches.get('black-si-fig1a-final').headState,
  'initial Black-Si FINAL',
);
await page.screenshot({
  path: new URL('../test-results/product-review/example-photodetector-literature.png', import.meta.url)
    .pathname,
  fullPage: true,
});
assert.equal(await page.locator('#layerLegend .implant-row-wrap').count(), 2);
assert.equal(await page.locator('#layerLegend .electrical-row-wrap').count(), 0);

await switchVariant('ge-fig15-common');
await switchVariant('ge-fig15-b');
assert.equal(await page.locator('#layerLegend .implant-row-wrap').count(), 2);
assert.equal(await page.locator('#layerLegend .electrical-row-wrap').count(), 2);
await restoreStep(geBInversionStep);
assert.equal(await page.locator('#layerLegend .electrical-row-wrap').count(), 1);
assert.equal(await page.locator('#layerLegend .implant-row-wrap').count(), 0);

await switchVariant('black-si-fig1a');
await restoreStep(roughStep);
assert.equal(await page.locator('#layerLegend .electrical-row-wrap').count(), 0);
assert.equal(await page.locator('#layerLegend .implant-row-wrap').count(), 0);
assert.ok(
  Number(await page.locator('#threeHost').getAttribute('data-scene-generation')) > 0,
  '3D scene generation must remain observable for regression diagnostics',
);

for (const example of [
  {
    id: 'perc-point-contact-solar-cell',
    filename: 'perc-solar-cells-point-contacts.wafercad',
  },
  {
    id: 'fully-textured-perovskite-silicon-tandem',
    filename: 'fully-textured-perovskite-silicon-tandem.wafercad',
  },
  {
    id: 'suspended-silica-microdisk',
    filename: 'suspended-silica-microdisks.wafercad',
  },
]) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page
    .locator(`.welcome-example-card[data-example-id="${example.id}"] .welcome-example-open`)
    .click();
  await page.waitForFunction(
    (id) => new URL(location.href).searchParams.get('example') === id,
    example.id,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    (filename) =>
      (document.getElementById('statusText')?.textContent || '') === `Opened ${filename}.`,
    example.filename,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
    null,
    { timeout: 30000 },
  );
  assert.ok((await page.locator('#mainCanvas').getAttribute('width')) !== '0');
  assert.ok((await page.locator('#maskCanvas').getAttribute('width')) !== '0');
  assert.ok((await page.locator('#sectionCanvas').getAttribute('width')) !== '0');
  await page.screenshot({
    path: new URL(
      `../test-results/product-review/example-${example.id}.png`,
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
}

// Sahli is not a Welcome card, but it is the strongest morphology-export
// integration fixture: both faces use deterministic Pyramid fields, the active
// ROI is 40×40 µm, and inherited/buried interfaces reuse those profiles.
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#welcomeProjectInput').setInputFiles({
  name: 'sahli-2018-fully-textured-tandem.wafercad',
  mimeType: 'application/json',
  buffer: sahliProjectBuffer,
});
await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await page.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened sahli-2018-fully-textured-tandem.wafercad.',
  null,
  { timeout: 30000 },
);
await page.waitForFunction(
  () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.locator('#threePanel .export-control > summary').click();
const sahliGlbDownloadPromise = page.waitForEvent('download', { timeout: 60000 });
await page.locator('#threeExportModelBtn').click();
const sahliGlbDownload = await sahliGlbDownloadPromise,
  sahliGlbPath = await sahliGlbDownload.path();
assert.ok(sahliGlbPath);
const sahliGlb = parseGlbJson(await readFile(sahliGlbPath)),
  sahliRoot = (sahliGlb.nodes || []).find((node) => node.name === 'WaferCAD'),
  sahliScale =
    sahliRoot?.scale ||
    (sahliRoot?.matrix
      ? [sahliRoot.matrix[0], sahliRoot.matrix[5], sahliRoot.matrix[10]]
      : []),
  sahliMorphologyNodes = (sahliGlb.nodes || []).filter(
    (node) => node.extras?.wafercadMorphology,
  ),
  sahliBounds = glbPositionBounds(sahliGlb);

assert.equal(sahliScale.length, 3);
assert.ok(sahliScale.every((value) => Math.abs(value - 1e-6) < 1e-12));
assert.ok(sahliMorphologyNodes.length > 0);
assert.ok(
  sahliMorphologyNodes.some(
    (node) =>
      node.extras.wafercadMorphology === 'pyramid' &&
      node.extras.wafercadMorphologySeed === 2018 &&
      node.extras.wafercadSurfaceFace === 'front',
  ),
);
assert.ok(
  sahliMorphologyNodes.some(
    (node) =>
      node.extras.wafercadMorphology === 'pyramid' &&
      node.extras.wafercadMorphologySeed === 2019 &&
      node.extras.wafercadSurfaceFace === 'back',
  ),
);
assert.ok(
  sahliMorphologyNodes.every(
    (node) => node.extras.wafercadMorphologyPolarity === 'normal',
  ),
);

const buriedMorphology = sahliMorphologyNodes.filter(
  (node) => node.extras.wafercadBuriedInterface,
);
assert.ok(buriedMorphology.length > 0, 'Sahli GLB must include inherited buried morphology');
assert.ok(
  buriedMorphology.every(
    (node) =>
      node.extras.wafercadSurfaceOwnership === 'interface' &&
      node.extras.wafercadInterfaceLayerId &&
      node.extras.wafercadRoughBorderVertexCount === 0,
  ),
  'buried morphology must stay owned once and must not close to the ideal plane',
);

assert.ok(sahliBounds.length > 0);
for (const bound of sahliBounds) {
  assert.ok(bound.min[0] >= -20.0001 && bound.max[0] <= 20.0001, 'ROI X clip leaked in GLB');
  assert.ok(bound.min[1] >= -20.0001 && bound.max[1] <= 20.0001, 'ROI Y clip leaked in GLB');
}

const interfaceDiagnostics = sahliBounds
  .filter((entry) => entry.node.extras?.wafercadSurfaceOwnership === 'interface')
  .map((entry) => {
    const extras = entry.node.extras,
      pair = [extras.wafercadLayerId, extras.wafercadInterfaceLayerId].sort().join('|');
    return [
      pair,
      Number(extras.wafercadSurfaceZUm).toFixed(6),
      ...entry.min.map((value) => Number(value).toFixed(6)),
      ...entry.max.map((value) => Number(value).toFixed(6)),
      entry.count,
    ].join(':');
  });
assert.equal(
  new Set(interfaceDiagnostics).size,
  interfaceDiagnostics.length,
  'GLB must not duplicate an owned material interface mesh',
);

await page.screenshot({
  path: new URL('../test-results/product-review/example-sahli-glb-export.png', import.meta.url)
    .pathname,
  fullPage: true,
});

assert.deepEqual(pageErrors, []);
await context.close();
await browser.close();

console.log('Example regression browser harness passed.');
