// Workstation integration regression: Welcome, boot gating, navigation, examples, and core tool shell.
import assert from 'node:assert/strict';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import {
  baseUrl,
  canvasInkFraction,
  gotoWelcome,
  launchBrowser,
  newUiPage,
  observePageErrors,
  openFunctionPanel,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();

// Startup must never expose the legacy/raw workspace while the workstation
// stylesheet or DOM transformation is still pending.
const { page: bootPage, context: bootContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const bootErrors = observePageErrors(bootPage);
let releaseWorkstationCss;
let workstationCssSeen;
let appRequestedBeforeCss = false;
const workstationCssGate = new Promise((resolve) => {
  releaseWorkstationCss = resolve;
});
const workstationCssRequest = new Promise((resolve) => {
  workstationCssSeen = resolve;
});
await bootPage.route('**/workstation.css*', async (route) => {
  workstationCssSeen();
  await workstationCssGate;
  await route.continue();
});
await bootPage.route('**/app.js*', async (route) => {
  appRequestedBeforeCss = true;
  await route.continue();
});
const bootNavigation = bootPage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await workstationCssRequest;
assert.equal(
  await bootPage.evaluate(() => document.documentElement.classList.contains('workstation-boot')),
  true,
);
assert.equal(
  await bootPage.locator('.app-shell').evaluate((element) => getComputedStyle(element).visibility),
  'hidden',
);
assert.equal(await bootPage.locator('#workstationBootScreen').isVisible(), true);
assert.equal(await bootPage.locator('.workstation-rail').count(), 0);
assert.equal(appRequestedBeforeCss, false);

releaseWorkstationCss();
await bootNavigation;
await bootPage.waitForFunction(() => document.documentElement.dataset.appReady === 'true', null, {
  timeout: 30000,
});
assert.equal(
  await bootPage.evaluate(() => document.documentElement.classList.contains('workstation-boot')),
  false,
);
assert.equal(
  await bootPage.locator('.app-shell').evaluate((element) => getComputedStyle(element).visibility),
  'visible',
);
assert.equal(await bootPage.locator('.workstation-rail').isVisible(), true);
assert.equal(await bootPage.locator('#workstationBootScreen').isVisible(), false);
assert.deepEqual(bootErrors, []);
await bootContext.close();

const { page, context: mainContext } = await newUiPage(browser, {
  viewport: { width: 1365, height: 900 },
});
const errors = observePageErrors(page);

await gotoWelcome(page);
assert.equal(await page.locator('#welcomeScreen').isVisible(), true);
assert.equal(await page.locator('.app-shell').count(), 0);
assert.match(
  await page.locator('#welcomeScreen').textContent(),
  /Turn a fabrication sequence into an inspectable device structure\.[\s\S]*Example families[\s\S]*How WaferCAD works[\s\S]*Built for structural reasoning/,
);

const photodetectorCard = page.locator(
  '.welcome-example-card[data-example-id="photodetector-literature"]',
);
assert.equal(
  (await photodetectorCard.locator('h3').textContent()).trim(),
  'Photodetectors with nanopatterns',
);
assert.equal(await photodetectorCard.locator('.welcome-example-sources a').count(), 2);
assert.equal(await photodetectorCard.locator('.welcome-example-meta').count(), 0);
assert.doesNotMatch(
  await photodetectorCard.textContent(),
  /Literature reconstruction|Black-Si Fig\. 1a · Ge Fig\. 15/,
);
const welcomeVisualBox = await photodetectorCard.locator('.welcome-example-visual').boundingBox();
const welcomeBodyBox = await photodetectorCard.locator('.welcome-example-body').boundingBox();
const welcomeStageBox = await photodetectorCard
  .locator('.welcome-example-project-stage')
  .boundingBox();
assert.ok(welcomeVisualBox && welcomeBodyBox && welcomeStageBox);
assert.ok(
  welcomeVisualBox.x + welcomeVisualBox.width <= welcomeBodyBox.x + 2,
  'desktop example card should place preview to the left of copy',
);
assert.ok(
  Math.abs(welcomeStageBox.height - welcomeVisualBox.height) <= 2,
  'project preview stage should fill the visual column',
);
assert.ok(welcomeStageBox.height >= 280, 'project preview should keep a useful inspection height');
assert.equal(await photodetectorCard.locator('.welcome-example-project-badge').count(), 0);
assert.ok(
  (await photodetectorCard.locator('.welcome-example-tags span').count()) <= 4,
  'example cards should show at most three tags plus one overflow count',
);
assert.deepEqual(await photodetectorCard.locator('.welcome-example-view-tab').allTextContents(), [
  'Main',
  'Mask',
  '3D',
  'Section',
]);
const welcomeTabsBox = await photodetectorCard.locator('.welcome-example-view-tabs').boundingBox();
assert.ok(welcomeTabsBox);
assert.ok(
  welcomeTabsBox.y >= welcomeStageBox.y &&
    welcomeTabsBox.y + welcomeTabsBox.height <= welcomeStageBox.y + welcomeStageBox.height + 1,
  'preview view switcher should stay inside the project preview',
);
const previewFrames = page.locator('.welcome-example-project-frame');
assert.equal(await previewFrames.count(), BUNDLED_EXAMPLES.length);
for (let index = 0; index < BUNDLED_EXAMPLES.length; index++) {
  const frame = previewFrames.nth(index);
  await frame.scrollIntoViewIfNeeded();
  assert.equal(await frame.getAttribute('src'), null, 'scrolling must not start an editor');
}
await photodetectorCard.locator('[data-preview-view="main"]').click();

const previewFrame = photodetectorCard.locator('.welcome-example-project-frame');
await previewFrame.waitFor({ state: 'visible', timeout: 30000 });
const preview = page.frameLocator(
  '.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-project-frame',
);
await preview.locator('html.welcome-project-preview[data-preview-view="main"]').waitFor({
  state: 'attached',
  timeout: 30000,
});
await preview
  .locator('html.welcome-project-preview[data-preview-plan-framing="fit"]')
  .waitFor({ state: 'attached', timeout: 30000 });

for (const [view, panelId] of [
  ['main', 'mainPanel'],
  ['mask', 'maskPanel'],
  ['three', 'threePanel'],
  ['section', 'sectionPanel'],
]) {
  await photodetectorCard.locator(`.welcome-example-view-tab[data-preview-view="${view}"]`).click();
  await preview.locator(`html.welcome-project-preview[data-preview-view="${view}"]`).waitFor({
    state: 'attached',
    timeout: 10000,
  });
  await preview.locator(`#${panelId}`).waitFor({ state: 'visible', timeout: 10000 });
  const box = await preview.locator(`#${panelId}`).boundingBox();
  assert.ok(box?.width > 20 && box?.height > 20, `${view} preview must have visible area`);

  if (view === 'three') {
    await preview.locator('#threeHost').evaluate(
      (host) =>
        new Promise((resolve, reject) => {
          const deadline = performance.now() + 20000;
          const check = () => {
            if (host.dataset.renderState === 'ready') return resolve(true);
            if (performance.now() > deadline) return reject(new Error('3D preview did not render'));
            requestAnimationFrame(check);
          };
          check();
        }),
    );
  }

  for (const otherId of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
    if (otherId === panelId) continue;
    assert.equal(
      await preview.locator(`#${otherId}`).isVisible(),
      false,
      `${view} preview must hide ${otherId}`,
    );
  }
}

await photodetectorCard.locator('.welcome-example-view-tab[data-preview-view="main"]').click();
await preview.locator('html.welcome-project-preview[data-preview-view="main"]').waitFor({
  state: 'attached',
  timeout: 10000,
});

for (const selector of [
  '.view-head',
  '#sectionEndpointHandles',
  '#sectionCoordsPanel',
  '#focusEditor',
  '#roiEditor',
  '#maskRoiEditor',
  '#drawMaskToolbar',
  '#drawShapeEditor',
  '#sectionDetailRoiOverlay',
  '#sectionDetailInset',
  '#sectionCollapseOverlay',
]) {
  assert.equal(
    await preview.locator(selector).first().isVisible(),
    false,
    `${selector} must stay hidden in preview`,
  );
}

const previewMainBefore = await preview
  .locator('#mainCanvas')
  .evaluate((canvas) => canvas.toDataURL());
await preview.locator('#mainCanvas').dispatchEvent('wheel', {
  deltaY: -120,
  clientX: 120,
  clientY: 80,
});
await preview
  .locator('#mainCanvas')
  .evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const previewMainAfter = await preview
  .locator('#mainCanvas')
  .evaluate((canvas) => canvas.toDataURL());
assert.notEqual(
  previewMainAfter,
  previewMainBefore,
  'Welcome Main preview wheel zoom must remain available',
);

// Click-loaded previews stay switchable; unrelated cards remain idle.
const tandemCard = page.locator(
  '.welcome-example-card[data-example-id="fully-textured-perovskite-silicon-tandem"]',
);
assert.equal(
  (await tandemCard.locator('h3').textContent()).trim(),
  'Fully textured perovskite–silicon tandems',
);
assert.match(
  await tandemCard.locator('.welcome-example-sources a').first().getAttribute('href'),
  /10\.1038\/s41563-018-0115-4/,
);

const percCard = page.locator(
  '.welcome-example-card[data-example-id="perc-point-contact-solar-cell"]',
);
await percCard.locator('.welcome-example-view-tab[data-preview-view="three"]').click();
assert.match(await previewFrames.nth(1).getAttribute('src'), /app\.html\?/);
assert.equal(await previewFrames.nth(2).getAttribute('src'), null);
const percPreview = page.frameLocator(
  '.welcome-example-card[data-example-id="perc-point-contact-solar-cell"] .welcome-example-project-frame',
);
await percPreview.locator('html.welcome-project-preview[data-preview-view="three"]').waitFor({
  state: 'attached',
  timeout: 30000,
});
assert.equal(await percPreview.locator('#threePanel').isVisible(), true);

await page.locator('#welcomeEmptyBtn').click();
await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await page.waitForLoadState('networkidle');
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);
assert.equal(await page.locator('#welcomeScreen').count(), 0);
assert.equal(await page.locator('.app-shell').count(), 1);

// Wide workspaces default to Overview so the three primary views are visible
// immediately. Narrow/compact workspaces still start in focused Main.
assert.equal(await page.locator('#mainPanel').isVisible(), true);
assert.equal(await page.locator('#maskPanel').isVisible(), true);
assert.equal(await page.locator('#threePanel').isVisible(), true);
assert.equal(
  await page.locator('.workstation-view-stage').getAttribute('data-view-mode'),
  'overview',
);
await page.locator('#threePanel').waitFor({ state: 'visible' });

// Navigation semantics are checked in isolated pages so Back/Reload cannot
// perturb the long-lived editor page used by the rest of this smoke suite.
const { page: navigationPage, context: navigationContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const navigationErrors = observePageErrors(navigationPage);
await gotoWelcome(navigationPage);
await navigationPage.locator('#welcomeEmptyBtn').click();
await navigationPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await navigationPage.waitForLoadState('networkidle');
await navigationPage.goBack({ waitUntil: 'domcontentloaded' });
await navigationPage.waitForFunction(
  () => document.documentElement.dataset.welcomeReady === 'true',
  null,
  { timeout: 10000 },
);
assert.equal(await navigationPage.locator('#welcomeScreen').isVisible(), true);
assert.equal(await navigationPage.locator('.app-shell').count(), 0);
assert.deepEqual(navigationErrors, []);
await navigationContext.close();

// Bundled example families must load through the same validated project path as
// user-selected .wafercad files, including their restorable Variant tree.
const { page: familyExamplePage, context: familyExampleContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const familyExampleErrors = observePageErrors(familyExamplePage);
await gotoWelcome(familyExamplePage);
await familyExamplePage
  .locator(
    '.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-title-link',
  )
  .click();
await familyExamplePage.waitForURL(/start=example.*example=photodetector-literature/, {
  timeout: 30000,
});
await familyExamplePage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened photodetector-literature-examples.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel(familyExamplePage, 'snapshots');
assert.equal(await familyExamplePage.locator('.history-variant').count(), 7);
assert.equal(
  await familyExamplePage
    .locator('.history-variant[data-variant-id="black-si-fig1a-final"]')
    .getAttribute('data-active'),
  'true',
);
assert.equal(
  await familyExamplePage.locator('.history-variant[data-variant-id="ge-fig15-a"]').count(),
  1,
);
assert.deepEqual(familyExampleErrors, []);
await familyExampleContext.close();

// A stalled Three.js CDN must never block the editor shell. The old top-level
// await implementation left Main/Mask blank and all tool tabs unbound here.
const blockedThreePage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const blockedThreeErrors = observePageErrors(blockedThreePage);
await blockedThreePage.route('https://cdn.jsdelivr.net/**', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 12000));
  await route.abort();
});
await blockedThreePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await blockedThreePage.locator('#welcomeEmptyBtn').click();
await blockedThreePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await blockedThreePage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 4000 },
);
await openFunctionPanel(blockedThreePage, 'process', { timeout: 2000 });
await blockedThreePage.locator('#operationTools:not([hidden])').waitFor({ timeout: 2000 });
assert.ok((await canvasInkFraction(blockedThreePage, '#mainCanvas')) > 0.01);
assert.deepEqual(blockedThreeErrors, []);
await blockedThreePage.close();

// Project is the first/default tool tab and owns local Save, file Export, recovery, and XYZ units.
assert.equal(await page.locator('#settingsTab').getAttribute('aria-selected'), 'true');
await page.locator('#settingsTools:not([hidden])').waitFor();
await openFunctionPanel(page, 'project');

// XYZ unit switching converts physical Z drafts as well as X/Y drafts.
await page.locator('#xyUnitSelect').selectOption('nm');
assert.equal(await page.locator('#baseThicknessUnit').textContent(), 'nm');
assert.equal(await page.locator('#operationThicknessUnit').textContent(), 'nm');
assert.equal(await page.locator('#roughFeatureUnit').textContent(), 'nm');
assert.equal(await page.locator('#roughHeightUnit').textContent(), 'nm');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12000);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3000);
assert.equal(Number(await page.locator('#roughFeatureSize').inputValue()), 500);
assert.equal(Number(await page.locator('#roughAmplitude').inputValue()), 1000);
await page.locator('#xyUnitSelect').selectOption('um');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3);
assert.equal(Number(await page.locator('#roughFeatureSize').inputValue()), 0.5);
assert.equal(Number(await page.locator('#roughAmplitude').inputValue()), 1);
for (const id of [
  'projectNameInput',
  'newProjectBtn',
  'openProjectInput',
  'saveProjectBtn',
  'exportProjectBtn',
  'workspaceRecoveryClearBtn',
  'xyUnitSelect',
]) {
  assert.equal(await page.locator(`#settingsTools #${id}`).count(), 1);
}

// Operation controls remain usable after the toolbar reorganization.
await openFunctionPanel(page, 'process');
await page.locator('#operationTools:not([hidden])').waitFor();
assert.equal(await page.locator('#recipeRecordManual').isChecked(), false);
for (const id of ['applyOperationBtn', 'undoBtn', 'redoBtn', 'faceToggleBtn']) {
  assert.equal(await page.locator(`#operationTools #${id}`).count(), 1);
}
const face = page.locator('#faceToggleBtn');
assert.equal(await face.inputValue(), 'front');
await face.selectOption('back');
assert.equal(await face.inputValue(), 'back');
await face.selectOption('front');
assert.equal(await face.inputValue(), 'front');

// Step mode must follow the Operation + Surface / Area / Target / Coverage + Thickness
// hierarchy, not merely replace the old six-button grid with a dropdown.
await page.locator('#operationType').selectOption('grow');
assert.equal(await page.locator('#processParametersHeading').textContent(), 'Extend parameters');
assert.match(await page.locator('#processVisualGuide > summary').textContent(), /How Extend works/);
const stepLayout = await page.evaluate(() => {
  const rect = (id) => {
    const node = document.getElementById(id);
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  return {
    operation: rect('operationType'),
    surface: rect('faceToggleBtn'),
    area: rect('operationAreaRow'),
    target: rect('targetLayerRow'),
    coverage: rect('growthModeRow'),
    thickness: rect('operationThicknessRow'),
    pane: rect('manualProcessPane'),
  };
});
assert.ok(Math.abs(stepLayout.operation.y - stepLayout.surface.y) < 3, 'Operation / Surface share a row');
assert.ok(stepLayout.area.width > stepLayout.coverage.width * 1.8, 'Area spans both columns');
assert.ok(stepLayout.target.width > stepLayout.coverage.width * 1.8, 'Target spans both columns');
assert.ok(Math.abs(stepLayout.coverage.y - stepLayout.thickness.y) < 3, 'Coverage / Thickness share a row');
assert.ok(stepLayout.thickness.x > stepLayout.coverage.x, 'Thickness is right of Coverage');
assert.ok(stepLayout.area.x >= stepLayout.pane.x && stepLayout.target.x >= stepLayout.pane.x);
assert.equal(await page.locator('#processVisualGuide').evaluate((node) => node.open), false);
await page.locator('#operationType').selectOption('etch');
assert.equal(await page.locator('#processParametersHeading').textContent(), 'Etch parameters');
assert.equal(await page.locator('#growthModeRow').isHidden(), true);
assert.equal(await page.locator('#operationThicknessRow').isVisible(), true);
await page.locator('#operationType').selectOption('implant');
assert.equal(await page.locator('#implantNameRow').isVisible(), true);
await page.locator('#operationType').selectOption('add');

assert.equal(await page.locator('#threeHost').getAttribute('data-render-error'), null);
assert.deepEqual(errors, []);
await mainContext.close();
await browser.close();

console.log('WaferCAD workstation regression: OK');
