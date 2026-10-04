import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const vendorSource = await readFile(
  new URL('../site/vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { expandProjectStorage } = await import('../site/project-io.js');

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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
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
}

assert.deepEqual(pageErrors, []);
await browser.close();

console.log('Example regression browser harness passed.');
