// Independent current-layout regression after the intentionally redesigned
// Process toolbar. Historic 2026-10-05 pixel snapshots remain archived and
// are still collected as diagnostics in the Windows audit.
import assert from 'node:assert/strict';
import {
  closeFunctionPanel,
  ensurePrimaryViewVisible,
  openFunctionPanel,
  openProductPage,
  waitForCanvasSizeSync,
} from './test-helpers/product.mjs';
import { assertNoPageErrors } from './test-helpers/ui.mjs';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

try {
  for (const { width, height, mobile } of [
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) {
    const errors = [];
    const { page, context } = await openProductPage(
      browser,
      { width, height },
      mobile,
      errors,
    );
    await openFunctionPanel(page, 'process');

    // Check the rendered panel and the actual user-interactable controls.
    // A vertical-scroll panel may be taller than the viewport; horizontal
    // overflow or an inaccessible action button is never expected.
    for (const operation of ['add', 'grow', 'etch', 'implant', 'electrical', 'record']) {
      await page.locator('#operationType').selectOption(operation);
      const bounds = await page.evaluate(() => {
        const root = document.querySelector('#toolPanel'),
          select = document.querySelector('#operationType'),
          apply = document.querySelector('#applyOperationBtn');
        const rect = (element) => {
          const { left, right, width } = element.getBoundingClientRect();
          return { left, right, width };
        };
        return {
          screen: document.documentElement.clientWidth,
          panel: rect(root),
          input: rect(select),
          action: rect(apply),
          horizontalOverflow: root.scrollWidth - root.clientWidth,
        };
      });
      for (const [label, box] of [
        ['Process panel', bounds.panel],
        ['Operation selector', bounds.input],
        ['Apply action', bounds.action],
      ]) {
        assert.ok(box.width > 12, `${operation}: ${label} is collapsed`);
        assert.ok(box.left >= bounds.panel.left - 3, `${operation}: ${label} overflows left`);
        assert.ok(box.right <= bounds.panel.right + 3, `${operation}: ${label} overflows right`);
      }
      assert.ok(
        bounds.panel.right <= width + 3,
        `${operation}: Process panel escapes ${width}px viewport`,
      );
      assert.ok(
        bounds.horizontalOverflow <= 3,
        `${operation}: Process panel has horizontal overflow ${bounds.horizontalOverflow}px`,
      );
    }
    await page.locator('#operationType').selectOption('add');
    assert.equal(await page.locator('[data-process-input-mode="manual"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-process-input-mode="recipe"]').click();
    assert.equal(await page.locator('[data-process-input-mode="recipe"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-process-input-mode="manual"]').click();
    await closeFunctionPanel(page);
    await ensurePrimaryViewVisible(page, 'main');
    await waitForCanvasSizeSync(page, '#mainCanvas');
    assert.ok(
      await page.locator('#mainPanel').isVisible(),
      `${width}px Main view disappeared after Process panel interaction`,
    );
    assertNoPageErrors(errors);
    await context.close();
    console.log(`Visual layout contract passed at ${width}x${height}`);
  }
} finally {
  await browser.close();
}
