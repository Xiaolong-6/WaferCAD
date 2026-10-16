// Guard the real v2 loading boundary and the initial editor-width contract.
import assert from 'node:assert/strict';
import { launchBrowser } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
const errors = [];

async function dimensions(page) {
  return page.evaluate(() => {
    const editor = document.querySelector('.p-inspector');
    const stage = document.querySelector('.p-stage');
    const views = [...document.querySelectorAll('.p-canvases > .p-view:not([hidden])')];
    return {
      editorWidth: editor.getBoundingClientRect().width,
      sidebarWidth: document.querySelector('.p-sidebar')?.getBoundingClientRect().width ?? 0,
      sidebarX: document.querySelector('.p-sidebar')?.getBoundingClientRect().x ?? -1,
      stageX: stage.getBoundingClientRect().x,
      stageWidth: stage.getBoundingClientRect().width,
      views: views
        .sort((a, b) => Number(a.style.order) - Number(b.style.order))
        .map((view) => view.dataset.view),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

try {
  // A held network response makes the incomplete-shell state deterministic.
  const context = await browser.newContext({ viewport: { width: 1700, height: 960 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  // Capture the real paint ordering, not just the two readiness flags.
  await page.addInitScript(() => {
    const order = [];
    window.__firstStartupPaintOrder = order;
    let planarSeen = false;
    let threeSeen = false;
    new window.MutationObserver(() => {
      if (
        !planarSeen &&
        ['main', 'mask', 'section'].some(
          (key) =>
            document.querySelector(`.p-view[data-view="${key}"]`)?.dataset.viewLoad === 'ready',
        )
      ) {
        planarSeen = true;
        order.push('planar');
      }
      if (
        !threeSeen &&
        Number(document.getElementById('threeHost')?.dataset.rendererFrameSerial || 0) > 0
      ) {
        threeSeen = true;
        order.push('three');
      }
    }).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-view-load', 'data-renderer-frame-serial'],
    });
  });
  let releaseAsset;
  let markRequested;
  const requested = new Promise((resolve) => {
    markRequested = resolve;
  });
  const held = new Promise((resolve) => {
    releaseAsset = resolve;
  });
  await page.route('**/examples/m3d-selfpowered-full-replay.wafercad*', async (route) => {
    markRequested();
    await held;
    await route.continue();
  });
  try {
    // Commit does not wait for the entry module's top-level await, whose
    // project fetch is deliberately paused below.
    await page.goto(`${base}/app.html?start=example&example=m3d`, {
      waitUntil: 'commit',
      timeout: 120000,
    });
    let requestTimeout;
    try {
      await Promise.race([
        requested,
        new Promise((_, reject) => {
          requestTimeout = setTimeout(
            () => reject(new Error('The M3D project request was not intercepted')),
            30000,
          );
        }),
      ]);
    } finally {
      clearTimeout(requestTimeout);
    }
    await page.waitForSelector('.p-workbench[data-boot="project"]');
    assert.equal(await page.locator('body').getAttribute('data-ready'), 'false');
    assert.equal(
      await page.locator('.p-nav [data-action^="domain:"]').count(),
      4,
      'Primary navigation remains present during delayed project import',
    );
    assert.equal(
      await page.locator('.p-panel-content').evaluate((node) => getComputedStyle(node).visibility),
      'hidden',
      'Uninitialized Project/Process forms must never leak during startup',
    );
    assert.equal(
      await page.locator('.p-canvases').evaluate((node) => getComputedStyle(node).visibility),
      'visible',
      'The stable four-view grid remains visible during project import',
    );
    assert.equal(await page.locator('.p-view[data-view-load="pending"]').count(), 4);
    assert.equal(await page.locator('.p-workbench').getAttribute('data-project-ready'), 'false');
    const before = await dimensions(page);
    assert.ok(
      before.sidebarWidth >= 300 && before.sidebarWidth <= 390,
      'Startup keeps the approved fixed-range desktop sidebar width',
    );
    assert.ok(
      Math.abs(before.editorWidth - before.sidebarWidth) <= 2,
      'Editor fills the sidebar without reserving an obsolete M2 column',
    );
    assert.ok(
      Math.abs(before.sidebarX) <= 1 && before.stageX >= before.sidebarWidth,
      'Scientific workspace begins after the sidebar',
    );
    releaseAsset();
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    assert.equal(await page.locator('.p-workbench').getAttribute('data-boot'), 'ready');
    await page.waitForFunction(
      () =>
        ['main', 'mask', 'section'].every(
          (key) => window.WaferCadV2Workstation.startup().views[key] === 'ready',
        ),
      null,
      { timeout: 120000 },
    );
    assert.equal(await page.locator('.p-workbench').getAttribute('data-first-frame-ready'), 'true');
    assert.equal(
      (await page.evaluate(() => window.__firstStartupPaintOrder))[0],
      'planar',
      'An overview must paint a visible planar view before the first 3D WebGL frame',
    );
    const after = await dimensions(page);
    assert.ok(Math.abs(after.editorWidth - before.editorWidth) < 2);
    assert.ok(Math.abs(after.stageX - before.stageX) < 2);
    assert.ok(Math.abs(after.stageWidth - before.stageWidth) < 2);
    assert.deepEqual(after.views, ['main', 'mask', 'three', 'section']);
    assert.equal(after.horizontalOverflow, 0);
    assert.ok(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model.layers.length)) > 1,
    );
  } finally {
    releaseAsset();
    await context.close();
  }

  // Desktop editor width, mobile stacking, and the first resize gesture.
  for (const width of [1440, 1024, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const before = await dimensions(page);
      assert.equal(before.horizontalOverflow, 0);
      if (width > 820) {
        const expectedSidebarWidth = Math.min(390, Math.max(300, width * 0.21));
        assert.ok(
          Math.abs(before.editorWidth - expectedSidebarWidth) < 2,
          `Production Sidebar follows the 21vw/300–390px design contract at ${width}px`,
        );
        const divider = page.locator('.p-divider');
        await divider.focus();
        await page.keyboard.press('ArrowRight');
        const adjusted = await dimensions(page);
        assert.ok(
          Math.abs(adjusted.editorWidth - before.editorWidth - 8) < 2,
          'First resize adds 8px without jumping to the old one-third width',
        );
        await page.locator('[data-action="domain:process"]').click();
        assert.ok(
          Math.abs((await dimensions(page)).editorWidth - adjusted.editorWidth) < 2,
          'Editor width survives changing the active domain',
        );
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, [], 'Startup and width scenarios produce no uncaught page errors');
  console.log('UI v2 boot shell: held M3D payload, ordered views, width and first resize PASS');
} finally {
  await browser.close();
}
