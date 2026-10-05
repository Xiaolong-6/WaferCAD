import assert from 'node:assert/strict';
import { installPinnedThreeRoute } from './ui.mjs';

export async function openProductPage(browser, viewport, touch, errors) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
  });

  await installPinnedThreeRoute(context);

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => {
    errors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`);
    void dialog.dismiss();
  });

  const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
  await page.goto(`${baseUrl.replace(/\/$/, '')}/app.html`);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  await page.locator('#threeHost canvas').waitFor({ state: 'attached', timeout: 10000 });
  assert.equal(
    await page.locator('#threeHost canvas').count(),
    1,
    'Real 3D must render in this suite',
  );

  return { page, context };
}

export async function chooseConfirmation(page, action = 'confirm') {
  const overlay = page.locator('#confirmationDialogOverlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator(`[data-dialog-action="${action}"]`).click();
}

export async function confirmIfVisible(page, action = 'confirm') {
  const overlay = page.locator('#confirmationDialogOverlay');
  if (await overlay.isVisible()) {
    await overlay.locator(`[data-dialog-action="${action}"]`).click();
  }
}

const FUNCTION_SECTION_IDS = {
  project: 'settingsTools',
  base: 'baseTools',
  mask: 'maskTools',
  process: 'operationTools',
  snapshots: 'snapshotsTools',
};

export async function openFunctionPanel(page, name, clickOptions = {}) {
  const button = page.locator(`.workstation-rail-button[data-tool="${name}"]`);
  await button.waitFor({ state: 'visible', timeout: clickOptions.timeout || 5000 });

  const panel = page.locator('#toolPanel.workstation-tool-flyout');
  const isOpen = await panel.evaluate((element) => element.classList.contains('open'));
  const isActive = await button.evaluate((element) => element.classList.contains('active'));
  if (!isOpen || !isActive) await button.click(clickOptions);

  await page.waitForFunction(() => {
    const panelElement = document.getElementById('toolPanel');
    const rail = document.querySelector('.workstation-rail');
    if (!panelElement?.classList.contains('open') || !rail) return false;
    return panelElement.getBoundingClientRect().left >= rail.getBoundingClientRect().right - 1;
  });

  await page.locator(`#${FUNCTION_SECTION_IDS[name]}:not([hidden])`).waitFor();
  await page.waitForFunction(
    (sectionName) => {
      const scroller = document.querySelector('#toolPanel .tool-tab-content');
      const section = document.querySelector(`[data-workstation-section="${sectionName}"]`);
      if (!scroller || !section) return false;
      return Math.abs(section.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 14;
    },
    name,
  );
}

export async function closeFunctionPanel(page) {
  const panel = page.locator('#toolPanel.workstation-tool-flyout');
  if (await panel.evaluate((element) => element.classList.contains('open'))) {
    await page.locator('.workstation-tool-close').click();
    await page.waitForFunction(
      () => !document.getElementById('toolPanel')?.classList.contains('open'),
    );
  }
}

const PRIMARY_VIEW_PANEL_IDS = {
  main: 'mainPanel',
  mask: 'maskPanel',
  three: 'threePanel',
};

export async function ensurePrimaryViewVisible(page, name) {
  const panel = page.locator(`#${PRIMARY_VIEW_PANEL_IDS[name]}`);
  if (!(await panel.isVisible())) {
    await page.locator(`.workstation-view-tab[data-view="${name}"]`).click();
    await panel.waitFor({ state: 'visible' });
  }
}

export async function captureProductReview(page, name, output, cases) {
  await page.evaluate(
    () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      ),
  );

  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });

  await page.evaluate(
    () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      ),
  );

  cases.push(name);
}

export async function checkLayout(page) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const threeError = document.getElementById('threeHost')?.dataset.renderError;
    if (threeError) issues.push(`3D render error: ${threeError}`);
    if (document.documentElement.scrollWidth > innerWidth) issues.push('page horizontal overflow');

    for (const panel of document.querySelectorAll('.view-panel')) {
      const head = panel.querySelector('.view-head').getBoundingClientRect();
      for (const element of panel.querySelectorAll(
        '.view-head button, .view-head summary, .three-border-toggle',
      )) {
        const rect = element.getBoundingClientRect();
        if (!element.checkVisibility() || element.closest('.focus-popover, .three-opacity-popover')) {
          continue;
        }
        if (!rect.width || !rect.height) continue;
        if (
          rect.left < head.left - 1 ||
          rect.right > head.right + 1 ||
          rect.bottom > head.bottom + 1
        ) {
          issues.push(`${element.id || element.className}: outside header`);
        }
      }
    }

    for (const id of ['mainCanvas', 'maskCanvas', 'sectionCanvas']) {
      const canvas = document.getElementById(id);
      if (!canvas.checkVisibility()) continue;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 100) issues.push(`${id}: too small`);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (
        Math.abs(canvas.width - rect.width * dpr) > 2 ||
        Math.abs(canvas.height - rect.height * dpr) > 2
      ) {
        issues.push(`${id}: stale canvas size`);
      }
    }

    return issues;
  });

  assert.deepEqual(problems, []);
}
