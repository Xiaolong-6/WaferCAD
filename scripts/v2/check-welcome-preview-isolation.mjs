// The Welcome iframe is a real v2 renderer, with no ownership of user data.
// It may switch/pan views, but must not acquire a writer lease or autosave.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
const { context, page: workspace } = await newUiPage(browser, {
  viewport: { width: 1440, height: 900 },
});
const errors = [];
workspace.on('pageerror', (error) => errors.push(error.message));

const ownership = () =>
  workspace.evaluate(() => ({
    writer: JSON.parse(localStorage.getItem('wafercad.workspace.owner.v1') || 'null')?.tabId,
    persisted: localStorage.getItem('wafercad.workspace.persisted.v1'),
  }));

try {
  await workspace.goto(base + '/app.html?start=empty');
  await workspace.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' &&
      window.WaferCadV2Workstation?.snapshot().workflow.writable &&
      !window.WaferCadV2Workstation.snapshot().workflow.dirty,
    null,
    { timeout: 120000 },
  );
  const before = await ownership();
  assert.ok(before.writer, 'Workspace must have an original writer');
  assert.ok(before.persisted, 'Workspace must have a saved project marker');

  const welcome = await context.newPage();
  welcome.on('pageerror', (error) => errors.push(error.message));
  await welcome.goto(base + '/index.html');
  await welcome.waitForFunction(() => document.documentElement.dataset.welcomeReady === 'true');
  const card = welcome.locator('[data-example-id="photodetector-literature"]');
  const frameNode = card.locator('iframe');
  assert.equal(await frameNode.getAttribute('src'), null, 'Preview stays lazy before interaction');
  await card.locator('[data-preview-view="main"]').click();
  await card.locator('.welcome-example-project-preview.ready').waitFor({
    timeout: 120000,
  });
  const preview = await (await frameNode.elementHandle()).contentFrame();
  assert.match(preview.url(), /\/app\.html\?preview=1/);
  assert.doesNotMatch(preview.url(), /start=/, 'Preview cannot execute a workspace start intent');
  const snapshot = () => preview.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const start = await snapshot();
  assert.match(start.source, /examples\/previews\/photodetector-literature\.wafercad$/);
  assert.ok(start.model.layers.length > 1, 'V2 preview uses real published physical geometry');
  assert.equal(start.workflow.writable, false, 'Read-only iframe does not own autosave');
  assert.equal(start.workflow.dirty, false);
  assert.equal(await preview.locator('.p-inspector').isVisible(), false);
  assert.deepEqual(
    {
      main: [start.local.main.panEnabled, start.local.main.zoomEnabled],
      mask: [start.local.mask.panEnabled, start.local.mask.zoomEnabled],
      section: [start.local.section.panEnabled, start.local.section.zoomEnabled],
      three: [start.local.three.mode, start.local.three.zoomEnabled],
    },
    {
      main: [true, true],
      mask: [true, true],
      section: [true, true],
      three: ['rotate', true],
    },
    'Every preview view must allow navigation without activating a tool',
  );
  assert.deepEqual(start.planViews, {
    main: { zoom: 1, panX: 0, panY: 0 },
    mask: { zoom: 1, panX: 0, panY: 0 },
  });
  assert.equal(await preview.locator('.v2-floating-strip').count(), 0);
  assert.equal(await preview.locator('#maskDrawTools, #maskRoiTools').count(), 0);

  const zoomOnCanvas = async (view, canvasId, readZoom) => {
    await card.locator(`[data-preview-view="${view}"]`).click();
    await preview.waitForFunction(
      (name) => window.WaferCadV2Workstation.snapshot().ui.view === name,
      view,
      { timeout: 30000 },
    );
    const before = readZoom(await snapshot());
    await preview.locator(`#${canvasId}`).evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const WheelEvent = canvas.ownerDocument.defaultView.WheelEvent;
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -200,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    });
    const after = readZoom(await snapshot());
    assert.ok(after > before, `${view}: first wheel must zoom without a toolbar click`);
  };

  await zoomOnCanvas('main', 'mainCanvas', (state) => state.planViews.main.zoom);
  await zoomOnCanvas('mask', 'maskCanvas', (state) => state.planViews.mask.zoom);
  const maskAfterZoom = (await snapshot()).planViews.mask;
  await zoomOnCanvas('section', 'sectionCanvas', (state) => state.sectionViewport.zoom);
  assert.equal(await preview.locator('.v2-legend-name').count(), 0);

  // A switched-away camera should not be reset by the parent tab messages.
  await card.locator('[data-preview-view="mask"]').click();
  await preview.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().ui.view === 'mask',
  );
  assert.deepEqual((await snapshot()).planViews.mask, maskAfterZoom);

  for (const view of ['mask', 'section', 'three', 'main']) {
    await card.locator(`[data-preview-view="${view}"]`).click();
    await preview.waitForFunction(
      (name) => window.WaferCadV2Workstation.snapshot().ui.view === name,
      view,
      { timeout: 30000 },
    );
    assert.equal((await snapshot()).workflow.writable, false, `${view}: no writer lease`);
    assert.equal(await preview.locator('.v2-floating-strip').count(), 0);
    assert.equal(await preview.locator('#maskDrawTools, #maskRoiTools').count(), 0);
  }

  // Do not rely on a rapidly changing lease expiration time. Only the owner
  // identity and last persisted state are stable across normal lease renewals.
  assert.deepEqual((await snapshot()).model, start.model, 'Pan/Zoom cannot mutate geometry');
  assert.equal((await snapshot()).scientificUnchanged, true);
  await welcome.waitForTimeout(2600);
  const after = await ownership();
  assert.equal(after.writer, before.writer, 'Welcome iframe cannot steal writer ownership');
  assert.equal(
    after.persisted,
    before.persisted,
    'Welcome preview must not modify the saved project marker',
  );
  assert.equal(
    (await workspace.evaluate(() => window.WaferCadV2Workstation.snapshot())).model.layers.length,
    1,
  );
  assert.deepEqual(errors, [], 'Preview loading and view switching must not throw');
  console.log('Welcome v2 four-view preview / read-only autosave and lease isolation PASS');
} finally {
  await context.close();
  await browser.close();
}
