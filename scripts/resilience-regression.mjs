// Production v2 degraded-mode contract. Legacy's old DOM test owner is retired:
// Three.js or WebGL failure must never make the process editor or 2D views unusable.
import assert from 'node:assert/strict';
import {
  assertNoPageErrors,
  baseUrl,
  launchBrowser,
  newUiContext,
  observePageErrors,
} from './test-helpers/ui.mjs';

const appUrl = `${baseUrl.replace(/\/$/, '')}/app.html?start=empty`;
const browser = await launchBrowser();

async function openV2(context) {
  const page = await context.newPage();
  const errors = observePageErrors(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.equal(
    await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model.layers.length),
    1,
  );
  return { page, errors };
}

async function checkTwoDimensionalEditing(page) {
  // A functioning canvas alone does not establish usability: exercise the real
  // Process Worker and History mutation after a degraded 3D initialization.
  for (const [view, panel] of [
    ['main', '#mainPanel'],
    ['mask', '#maskPanel'],
    ['section', '#sectionPanel'],
  ]) {
    await page.locator(`[data-action="view:${view}"]`).first().click();
    await page.locator(panel).waitFor({ state: 'visible', timeout: 30000 });
  }
  await page.locator('[data-action="domain:process"]').click();
  await page.locator('#operationType').selectOption('add');
  await page.locator('#operationArea').selectOption('full');
  await page.locator('#layerName').fill('Degraded render film');
  await page.locator('#operationThickness').fill('0.25');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () => {
      const snapshot = window.WaferCadV2Workstation.snapshot();
      return snapshot.workflow.steps.length === 1 && !snapshot.workflow.busy;
    },
    null,
    { timeout: 120000 },
  );
  const model = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model);
  assert.ok(model.layers.some((layer) => layer.name === 'Degraded render film'));
}

try {
  // A missing Three.js CDN should affect only the on-demand 3D view.
  const unavailableContext = await newUiContext(browser, {
    viewport: { width: 1440, height: 900 },
  });
  await unavailableContext.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({ status: 503, body: 'CDN unavailable' }),
  );
  const { page: unavailable, errors: dependencyErrors } = await openV2(unavailableContext);
  await unavailable.locator('[data-action="view:three"]').first().click();
  await unavailable.waitForFunction(
    () => document.querySelector('#threeHost')?.dataset.threeUnavailableReason === 'dependency',
    null,
    { timeout: 30000 },
  );
  assert.equal(
    (await unavailable.locator('#threeStats').textContent()).trim(),
    'dependency unavailable',
  );
  assert.match(
    await unavailable.locator('#threeHost').textContent(),
    /Three\.js resources could not be loaded/,
  );
  assert.equal(await unavailable.locator('#threeHost').getAttribute('data-render-error'), null);
  await checkTwoDimensionalEditing(unavailable);
  assertNoPageErrors(dependencyErrors, 'Missing CDN must not break the v2 editor');
  await unavailableContext.close();

  // Three.js exists, but the browser deliberately cannot allocate a WebGL context.
  const webglContext = await newUiContext(browser, {
    viewport: { width: 1440, height: 900 },
  });
  await webglContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function withoutWebGL(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  const { page: unavailableWebGL, errors: webglErrors } = await openV2(webglContext);
  await unavailableWebGL.locator('[data-action="view:three"]').first().click();
  await unavailableWebGL.waitForFunction(
    () => document.querySelector('#threeHost')?.dataset.threeUnavailableReason === 'webgl',
    null,
    { timeout: 30000 },
  );
  assert.equal(
    (await unavailableWebGL.locator('#threeStats').textContent()).trim(),
    'WebGL unavailable',
  );
  assert.match(
    await unavailableWebGL.locator('#threeHost').textContent(),
    /could not create a WebGL context/,
  );
  assert.equal(
    await unavailableWebGL
      .locator('#threeHost')
      .evaluate((node) => node.classList.contains('three-loading')),
    false,
  );
  await checkTwoDimensionalEditing(unavailableWebGL);
  assertNoPageErrors(webglErrors, 'Unavailable WebGL must not break the v2 editor');
  await webglContext.close();
} finally {
  await browser.close();
}

console.log('WaferCAD v2 resilience regression: CDN/WebGL failure and real 2D Process PASS');
