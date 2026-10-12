import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser } from '../test-helpers/ui.mjs';
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = 'test-results/ui-v2-contract-review';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      hasTouch: width === 390,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/ui-v2/reviews/contract-decisions.html`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal(await page.locator('#mockShape option').count(), 4);
    await page.locator('#sectionDetailRoiBtn').click();
    const box = await page.locator('#sectionCanvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.7, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('#sectionDetailInset').isVisible(), true);
    await page.locator('#sectionDetailShapeBtn').click();
    assert.equal(
      await page
        .locator('#sectionDetailRoiOverlay')
        .evaluate((n) => n.classList.contains('circle')),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/decisions-${width}.png`, fullPage: true });
    await page.locator('#detail').screenshot({ path: `${output}/detail-${width}.png` });
    await page.locator('[data-action="menu:section"]').click();
    assert.equal(
      await page.locator('#section-export .review-export-menu button:disabled').count(),
      1,
    );
    await page.locator('[data-action="menu:three"]').click();
    await page.locator('[data-action="proposed-three-glb"]').click();
    assert.equal(await page.locator('.mock-task').isVisible(), true);
    await page.locator('[data-action="task-abort"]').click();
    assert.equal(await page.locator('.mock-task').isVisible(), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS review ${width}: layout, Detail controller, task mock`);
  }
} finally {
  await browser.close();
}
