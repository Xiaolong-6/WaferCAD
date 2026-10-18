// Real v2 M3D Welcome -> full project / History / 3D Border integration.
// Retires the obsolete Legacy DOM regression without dropping its user contracts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { gotoWelcome, launchBrowser, newUiContext, observePageErrors } from './test-helpers/ui.mjs';
import { selectScientificView } from './v2/desktop-view-selector.mjs';

await mkdir('test-results/m3d/welcome', { recursive: true });
const browser = await launchBrowser();
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  const card = page.locator(
    '.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"]',
  );
  assert.equal(await card.count(), 1, 'M3D Welcome card missing');
  assert.match(await card.locator('.welcome-example-summary-link').textContent(), /36 History/);
  await card.locator('img').evaluate((img) => img.decode());
  assert.equal(await card.locator('img').evaluate((img) => img.naturalWidth), 640);

  await card.locator('.welcome-example-title-link').click();
  await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' &&
      window.WaferCadV2Workstation?.snapshot().source.endsWith(
        '/m3d-selfpowered-full-replay.wafercad',
      ),
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((resource) => /\/app\.js(?:\?|$)/.test(resource.name)),
    ),
    false,
    'M3D project must not boot the obsolete Legacy editor',
  );

  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const before = await snapshot();
  assert.equal(before.workflow.steps.length, 36, 'M3D source has 36 History Steps');
  assert.equal(before.workflow.bookmarks.length, 27, 'M3D stage bookmarks must survive');
  assert.equal(before.workflow.writable, true);

  await page.locator('[data-action="domain:history"]').click();
  await page.locator('#snapshotList .history-step-wrap').first().waitFor({
    state: 'attached',
    timeout: 120000,
  });
  assert.equal(await page.locator('#snapshotList .history-step-wrap').count(), 36);
  assert.equal((await page.locator('#snapshotCount').textContent()).trim(), '36');

  await selectScientificView(page, 'three', 1440);
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  const border = page.locator('#threePanel [data-action="borders:three"]');
  await border.waitFor({ state: 'visible' });
  assert.equal(await border.getAttribute('aria-label'), 'Borders');
  const visualState = () =>
    border.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
      outline: getComputedStyle(node).borderColor,
      pressed: node.getAttribute('aria-pressed'),
    }));

  // The shared selected-control appearance communicates Border state without
  // a duplicated ON/OFF caption. Toggling must not edit the physical model.
  assert.equal(await border.locator('.three-border-status').count(), 0);
  const starting = await visualState();
  assert.equal(
    starting.pressed,
    String((await snapshot()).threeDisplay.borders),
    'Restored M3D Border toolbar reflects saved display state before interaction',
  );
  await border.click();
  const inspector = page.locator('[data-border-inspector]');
  await inspector.waitFor({ state: 'visible' });
  assert.equal(
    await border.getAttribute('aria-pressed'),
    starting.pressed,
    'Opening Border Inspector must not change the border display state',
  );
  const enabled = inspector.getByRole('checkbox', { name: 'Show 3D borders' });
  assert.equal(await enabled.isChecked(), starting.pressed === 'true');
  await enabled.setChecked(starting.pressed !== 'true');
  const toggled = await visualState();
  assert.notEqual(toggled.pressed, starting.pressed, 'Inspector checkbox changes pressed state');
  assert.equal(
    toggled.pressed,
    String((await snapshot()).threeDisplay.borders),
    'Toolbar stays in sync with the physical renderer display state',
  );
  assert.ok(
    toggled.fill !== starting.fill ||
      toggled.color !== starting.color ||
      toggled.outline !== starting.outline,
    'Border toggle changes its selected visual appearance',
  );
  await enabled.setChecked(starting.pressed === 'true');
  const restored = await visualState();
  assert.equal(restored.pressed, starting.pressed, 'Border pressed state is reversible');
  assert.equal(restored.fill, starting.fill, 'Border selected fill is reversible');
  assert.equal(restored.color, starting.color, 'Border selected text color is reversible');
  // The pointer remains over the button after click; hover/focus outlines are
  // transient accessibility feedback, not persisted Border selection state.

  const after = await snapshot();
  assert.deepEqual(after.model, before.model, 'Border and History navigation preserve M3D model');
  assert.equal(after.workflow.steps.length, 36);
  assert.equal(after.workflow.bookmarks.length, 27);
  assert.deepEqual(errors, [], 'Opening the real v2 M3D project must not throw');
  await page.screenshot({
    path: 'test-results/m3d/welcome/m3d-welcome-opened.png',
    fullPage: true,
    animations: 'disabled',
  });
  await context.close();
} finally {
  await browser.close();
}
console.log('M3D Welcome v2: thumbnail / 36 History / 27 bookmarks / reversible 3D Border PASS');
