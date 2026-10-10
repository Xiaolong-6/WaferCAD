// Manual-only CPU profile for the default 625-site Quality ROI build.
// Isolates fresh ROI from the original post-transition reproduction; does not
// enable any renderer optimization, alter the canonical model or relax gates.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  launchOptions,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const afterTransitions = process.argv.includes('--after-transitions');
const deadlineMs = Number(process.env.WAFERCAD_ROI_PROFILE_DEADLINE_MS || 60000);
assert.ok(Number.isFinite(deadlineMs) && deadlineMs >= 5000);
const out = new URL(
  afterTransitions
    ? '../test-results/renderer-roi-profile-after-transitions/'
    : '../test-results/renderer-roi-profile-fresh/',
  import.meta.url,
);
await mkdir(out, { recursive: true });
const fixture = fileURLToPath(
  new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
);
const browser = await chromium.launch({ ...launchOptions, headless: false });
const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(180000);
const errors = observePageErrors(page);
const marks = [];
const result = {
  mode: afterTransitions ? 'after-transitions' : 'fresh',
  deadlineMs,
  fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad',
  browserVersion: browser.version(),
  optimizationEnabled: false,
  success: false,
  stage: 'boot',
  marks,
  errors,
};
page.on('console', (message) => {
  if (message.text().startsWith('WAFERCAD_ROI_STAGE')) {
    const row = { hostTime: Date.now(), message: message.text() };
    marks.push(row);
    console.log('ROI_PROFILE_STAGE', JSON.stringify(row));
  }
});

async function bounded(action, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`diagnostic deadline ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const state = () =>
  page.evaluate(() => ({
    host: { ...document.getElementById('threeHost')?.dataset },
    status: document.getElementById('statusText')?.textContent,
    roiTool: document.querySelector('.roi-tool.active')?.dataset.tool,
    rendererStage: document.getElementById('threeHost')?.dataset.rendererRoiStage,
  }));
async function changed(action) {
  const before = Number((await state()).host.rendererFrameSerial || 0);
  await action();
  await page.waitForFunction(
    (serial) => {
      const host = document.getElementById('threeHost');
      return host?.dataset.renderState === 'ready' &&
        Number(host.dataset.rendererFrameSerial || 0) > serial;
    },
    before,
    { timeout: 180000 },
  );
}
let session = null;
let profiling = false;
try {
  result.stage = 'load-project';
  await page.goto(`${baseUrl}/app.html?rendererV3RoiTrace=1`);
  await waitForAppReady(page);
  await page.locator('#openProjectInput').setInputFiles(fixture);
  await chooseConfirmation(page);
  await page.waitForFunction(
    () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
    null,
    { timeout: 180000 },
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 180000);
  await changed(() => page.locator('#threeFastBtn').selectOption('quality'));
  await changed(() => page.locator('#threeOpacityRange').fill('0.5'));
  if (afterTransitions) {
    result.stage = 'preceding-presentation-and-camera';
    for (let i = 0; i < 10; i++) {
      await changed(() =>
        page.locator('#threeBorders').evaluate((input) => {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }),
      );
      await changed(() => page.locator('#threeOpacityRange').fill(i % 2 === 0 ? '1' : '0.5'));
    }
    const box = await page.locator('#threeHost canvas').boundingBox();
    assert.ok(box);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await changed(async () => {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -300);
    });
    await changed(async () => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 24, { steps: 4 });
      await page.mouse.up();
    });
    await changed(() => page.locator('#fit3dBtn').click());
    await changed(() =>
      page.locator('#sectionCollapseEnabled').evaluate((input) => {
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }),
    );
    await changed(() =>
      page.locator('#sectionCollapseEnabled').evaluate((input) => {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }),
    );
  }

  // Select the real Main rectangle ROI tool before starting CPU sampling.
  result.stage = 'select-roi-tool';
  await page.locator('#focusEditor').evaluate((node) => {
    const more = node.closest('.view-more-control');
    if (more) more.open = true;
    node.open = true;
  });
  await page.locator('.roi-tool[data-tool="rect"]').click();
  await page.locator('#mainPanel details[open]').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.open = false;
    }),
  );
  const rect = await page.locator('#mainCanvas').boundingBox();
  assert.ok(rect && rect.width > 0 && rect.height > 0);
  const before = Number((await state()).host.rendererFrameSerial || 0);
  session = await context.newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 1000 });
  await session.send('Profiler.start');
  profiling = true;
  result.stage = 'apply-roi-and-rebuild';
  const began = performance.now();
  await bounded(async () => {
    await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6, {
      steps: 4,
    });
    await page.mouse.up();
    await page.waitForFunction(
      (serial) => {
        const host = document.getElementById('threeHost');
        return /^ROI created\./.test(document.getElementById('statusText')?.textContent || '') &&
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > serial;
      },
      before,
      { timeout: 180000 },
    );
  }, deadlineMs);
  result.roiCompletionMs = performance.now() - began;
  result.success = true;
  result.stage = 'roi-ready';
} catch (error) {
  result.error = String(error);
} finally {
  if (profiling) {
    try {
      const captured = await bounded(() => session.send('Profiler.stop'), 12000);
      await writeFile(new URL('roi.cpuprofile', out), JSON.stringify(captured.profile));
      result.cpuProfileSaved = true;
    } catch (error) {
      result.cpuProfileSaved = false;
      result.profileError = String(error);
    }
  }
  try {
    result.finalState = await bounded(state, 5000);
  } catch (error) {
    result.stateError = String(error);
  }
  await writeFile(new URL('report.json', out), JSON.stringify(result, null, 2));
  console.log('ROI_PROFILE_REPORT', JSON.stringify(result));
  await bounded(() => browser.close(), 10000).catch(() => {});
}
assert.ok(result.success, `Default Quality ROI did not complete: ${result.error}; inspect ${fileURLToPath(out)}`);
