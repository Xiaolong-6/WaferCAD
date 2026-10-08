import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  closeFunctionPanel,
  ensurePrimaryViewVisible,
  openFunctionPanel,
  openProductPage,
  waitForCanvasSizeSync,
} from './test-helpers/product.mjs';
import { assertVisualBaseline } from './test-helpers/visual.mjs';
import { gotoWelcome } from './test-helpers/ui.mjs';

const update =
  process.argv.includes('--update') || process.env.WAFERCAD_UPDATE_VISUAL_BASELINES === '1';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const errors = [];
const results = [];

async function compare(page, name, locator) {
  results.push(
    await assertVisualBaseline(page, name, {
      update,
      baselineDir: process.env.WAFERCAD_VISUAL_BASELINE_DIR || 'tests/visual-baselines',
      locator,
      maxDiffRatio: 0.0005,
      channelThreshold: 16,
    }),
  );
}

try {
  {
    const { page, context } = await openProductPage(
      browser,
      { width: 1440, height: 900 },
      false,
      errors,
    );
    await openFunctionPanel(page, 'project');
    await compare(page, 'wide-project-panel', '#toolPanel');
    await closeFunctionPanel(page);
    await waitForCanvasSizeSync(page, '#mainCanvas');
    await compare(page, 'wide-main-panel', '#mainPanel');
    await context.close();
  }

  {
    const { page, context } = await openProductPage(
      browser,
      { width: 390, height: 844 },
      true,
      errors,
    );
    await openFunctionPanel(page, 'process');
    await compare(page, 'phone-process-panel', '#toolPanel');
    await closeFunctionPanel(page);
    await ensurePrimaryViewVisible(page, 'main');
    await waitForCanvasSizeSync(page, '#mainCanvas');
    await compare(page, 'phone-main-panel', '#mainPanel');
    await context.close();
  }

  {
    const { page, context } = await openProductPage(
      browser,
      { width: 1440, height: 900 },
      false,
      errors,
    );
    await gotoWelcome(page);
    await page
      .locator(
        '.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-title-link',
      )
      .click();
    await page.waitForURL(/start=example.*example=photodetector-literature/, {
      timeout: 30000,
    });
    await page.waitForFunction(
      () =>
        (document.getElementById('statusText')?.textContent || '') ===
        'Opened photodetector-literature-examples.wafercad.',
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(() => {
      const canvas = document.getElementById('sectionCanvas');
      return canvas?.checkVisibility() && Number(canvas.dataset.xPxPerUm) > 0;
    });
    await compare(page, 'photodetector-section', '#sectionPanel');
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log(
    update
      ? `WaferCAD visual baselines updated: ${results.length}`
      : `WaferCAD visual baselines: OK (${results.length})`,
  );
} finally {
  await browser.close();
}
