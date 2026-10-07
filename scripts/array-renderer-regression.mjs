import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';
const browser = await launchBrowser();
const output = new URL('../test-results/array-renderer/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = observePageErrors(page);
  await page.goto(baseUrl + '/app.html');
  await waitForAppReady(page);
  await page
    .locator('#openProjectInput')
    .setInputFiles(
      fileURLToPath(
        new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
      ),
    );
  await chooseConfirmation(page);
  await page.waitForFunction(() =>
    document.getElementById('statusText').textContent.startsWith('Opened '),
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 120000);
  const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
  const fast = await snapshot();
  assert.equal(fast.arrayInstances, '1885');
  assert.equal(fast.renderQuality, 'fast');
  assert.equal(fast.cooperativeSceneAssembly, 'true');
  assert.ok(Number(fast.rendererAssemblyMs) > 0, 'renderer profiling must record assembly time');
  assert.ok(
    Number(fast.derivedCapCacheMisses) > 0,
    'initial full-wafer render must populate derived cap triangulation data',
  );
  await page.locator('#threeFastBtn').click();
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost').dataset.renderQuality === 'quality' &&
      document.getElementById('threeHost').dataset.renderState === 'ready',
  );
  const quality = await snapshot();
  assert.ok(
    Number(quality.derivedCapCacheHits) > Number(fast.derivedCapCacheHits),
    'Fast → Quality rebuild must reuse canonical array-cap triangulation data',
  );
  for (const key of [
    'arrayInstances',
    'materialLayerIds',
    'surfaceTopology',
    'modelRevision',
    'processRevision',
  ])
    assert.equal(quality[key], fast[key], key + ' changed when switching display quality');
  await page.screenshot({ path: fileURLToPath(new URL('quality.png', output)) });
  await page.locator('#threePanel .three-opacity-control > summary').click();
  await page.locator('#threeOpacityRange').fill('0.5');
  await waitForThreeReady(page, 120000);
  const transparent = await snapshot();
  assert.equal(transparent.arrayInstances, '1885');
  assert.ok(
    Number(transparent.electricalRegionInternalCount) > 0,
    'Transparent array retains native buried electrical annotations',
  );
  assert.equal(transparent.materialLayerIds, fast.materialLayerIds);
  await page.screenshot({ path: fileURLToPath(new URL('transparent.png', output)) });
  await page.locator('#threeOpacityRange').fill('1');
  await page.locator('#threePanel .three-opacity-control > summary').click();
  await page.locator('#threeFastBtn').click();
  await waitForThreeReady(page, 120000);
  const restored = await snapshot();
  assert.equal(restored.renderQuality, 'fast');
  assert.equal(restored.surfaceTopology, fast.surfaceTopology);
  const canvas = page.locator('#threeHost canvas');
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(rect.x + rect.width * 0.5 + i * 4, rect.y + rect.height * 0.5 + i);
  await page.mouse.up();
  await waitForThreeReady(page, 120000);
  assert.deepEqual(errors, []);
  const report = {
    browserVersion: browser.version(),
    fast,
    quality,
    transparent,
    restored,
    rotationPassed: true,
    errors,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('ARRAY_RENDERER_OK');
  await context.close();
} finally {
  await browser.close();
}
