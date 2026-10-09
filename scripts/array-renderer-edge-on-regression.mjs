import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  baseUrl,
  chooseConfirmation,
  closeFunctionPanel,
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
} from './test-helpers/ui.mjs';

// Separate browser process from the 20-toggle regression. Software WebGL's
// 625-site exact transparent compositor can saturate the browser after orbiting.
const browser = await launchBrowser();
const output = new URL('../test-results/array-renderer-edge-on/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = observePageErrors(page);
  page.setDefaultTimeout(120000);
  const snapshot = () => page.locator('#threeHost').evaluate((element) => ({ ...element.dataset }));
  const frameSerial = async () => Number((await snapshot()).rendererFrameSerial || 0);

  await page.goto(baseUrl + '/app.html');
  await waitForAppReady(page);
  await page.locator('#openProjectInput').setInputFiles(
    fileURLToPath(
      new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
    ),
  );
  await chooseConfirmation(page);
  await page.waitForFunction(
    () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
    null,
    { timeout: 60000 },
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 120000);
  const initial = await snapshot();
  assert.equal(initial.arrayInstances, '1885');
  assert.equal(initial.renderQuality, 'fast');

  const threeDisplay = page.locator('#threePanel .three-opacity-control');
  const displayInMore = await threeDisplay.evaluate((node) =>
    Boolean(node.closest('.view-overflow-secondary')),
  );
  if (displayInMore) {
    await page.locator('#threePanel .view-more-control > summary').click();
  }
  await threeDisplay.locator(':scope > summary').click();
  const initialFrame = await frameSerial();
  await page.locator('#threeOpacityRange').fill('0.5');
  await page.waitForFunction(
    (previous) => {
      const element = document.getElementById('threeHost');
      return (
        /^far-/.test(element?.dataset.transparentArrayLodTier || '') &&
        element.dataset.renderState === 'ready' &&
        Number(element.dataset.rendererFrameSerial || 0) > previous
      );
    },
    initialFrame,
    { timeout: 120000 },
  );
  const far = await snapshot();
  assert.equal(far.cameraDampingEnabled, 'true');
  assert.ok(Number(far.electricalFarLodBodyCount) > 0);
  const farTriangles = Number(far.rendererDrawTriangles);
  assert.ok(farTriangles > 0);
  console.log('ARRAY_EDGE_FAR', JSON.stringify({
    tier: far.transparentArrayLodTier,
    triangles: farTriangles,
    frameSerial: far.rendererFrameSerial,
  }));
  await page.screenshot({ path: fileURLToPath(new URL('far.png', output)) });

  const bounds = await page.locator('#threeHost canvas').boundingBox();
  assert.ok(bounds, '3D canvas must exist');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const beforeEdgeFrame = await frameSerial();
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY - 24, { steps: 4 });
  await page.mouse.up();

  // Capture the completed exact frame and immediately return to the fitted far
  // camera in one browser task. The test still requires the first exact frame
  // and all its walls to render; a timeout is a correctness failure.
  const handle = await page.waitForFunction(
    (previous) => {
      const host = document.getElementById('threeHost');
      if (
        host?.dataset.transparentArrayLodTier !== 'exact' ||
        host.dataset.renderState !== 'ready' ||
        Number(host.dataset.rendererFrameSerial || 0) <= previous
      ) return false;
      const edge = { ...host.dataset };
      document.getElementById('fit3dBtn')?.click();
      return JSON.stringify(edge);
    },
    beforeEdgeFrame,
    { timeout: 240000, polling: 100 },
  );
  const edgeOn = JSON.parse(await handle.jsonValue());
  assert.equal(edgeOn.transparentArrayLodTier, 'exact');
  assert.equal(edgeOn.cameraDampingEnabled, 'false');
  assert.equal(Number(edgeOn.electricalFarLodBodyCount), 0);
  assert.equal(edgeOn.arrayInstances, far.arrayInstances);
  assert.equal(edgeOn.processRevision, far.processRevision);
  assert.ok(Number(edgeOn.rendererDrawTriangles) > farTriangles);
  console.log('ARRAY_EDGE_EXACT', JSON.stringify({
    tier: edgeOn.transparentArrayLodTier,
    triangles: edgeOn.rendererDrawTriangles,
    frameSerial: edgeOn.rendererFrameSerial,
  }));

  await page.waitForFunction(
    (previous) => {
      const host = document.getElementById('threeHost');
      return (
        /^far-/.test(host?.dataset.transparentArrayLodTier || '') &&
        host.dataset.renderState === 'ready' &&
        Number(host.dataset.rendererFrameSerial || 0) > previous
      );
    },
    Number(edgeOn.rendererFrameSerial),
    { timeout: 120000 },
  );
  const recovered = await snapshot();
  assert.equal(recovered.arrayInstances, far.arrayInstances);
  assert.equal(recovered.processRevision, far.processRevision);
  assert.equal(recovered.cameraDampingEnabled, 'true');
  assert.ok(Number(recovered.electricalFarLodBodyCount) > 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: fileURLToPath(new URL('recovered.png', output)) });
  await writeFile(new URL('report.json', output), JSON.stringify({
    browserVersion: browser.version(),
    far,
    edgeOn,
    recovered,
    errors,
  }, null, 2));
  console.log('ARRAY_EDGE_ON_OK');
  await context.close();
} finally {
  await browser.close();
}
