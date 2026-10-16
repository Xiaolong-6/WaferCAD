// Real browser proof that a stored Quality choice survives a transient Fast
// first frame and is restored only after a committed Quality WebGL frame.
import assert from 'node:assert/strict';
import { launchBrowser } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const stages = [];
  window.__threeStartupStages = stages;
  const observer = new window.MutationObserver(() => {
    const value = document.querySelector('#threePanel')?.dataset.viewLoad;
    if (value && stages.at(-1) !== value) stages.push(value);
  });
  observer.observe(document, {
    childList: true,
    attributes: true,
    subtree: true,
    attributeFilter: ['data-view-load'],
  });
});

try {
  await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.startup().views.three === 'ready',
    null,
    { timeout: 120000 },
  );
  assert.equal(
    (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).threeDisplay.fast,
    true,
  );
  await page.locator('[data-action="quality:three"]').click();
  assert.equal(
    (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).threeDisplay.fast,
    false,
  );
  const originalModel = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model);
  await page.locator('#saveProjectBtn').click();
  try {
    await page.waitForFunction(
      () =>
        /Saved .* locally/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent,
        ),
      null,
      { timeout: 45000 },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      status: document.querySelector('[data-slot="status.message"]')?.textContent,
      workspace: document.querySelector('.workspace')?.dataset,
      boot: document.querySelector('.p-workbench')?.dataset.boot,
      startup: window.WaferCadV2Workstation?.startup?.(),
    }));
    console.error('P1_HISTORY_SAVE_DIAGNOSTIC', JSON.stringify({ diagnostic, errors }));
    throw error;
  }
  await page.goto(`${base}/app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  const restored = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(restored.threeDisplay.fast, false, 'Transient Fast cannot rewrite stored Quality');
  assert.deepEqual(restored.model, originalModel, 'P1 startup does not mutate canonical geometry');
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.startup().views.three === 'ready',
    null,
    { timeout: 120000 },
  );
  const stages = await page.evaluate(() => window.__threeStartupStages);
  const coarse = stages.indexOf('coarse');
  const refining = stages.indexOf('refining');
  const ready = stages.lastIndexOf('ready');
  assert.ok(coarse >= 0 && refining > coarse && ready > refining, JSON.stringify(stages));
  assert.deepEqual(errors, [], 'Progressive Quality startup cannot produce page errors');
  console.log('P1 real 3D: stored Quality -> Fast frame -> idle refine -> Quality frame PASS');
} finally {
  await context.close();
  await browser.close();
}
