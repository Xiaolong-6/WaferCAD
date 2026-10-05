import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

export const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';

export const launchOptions = {
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
};

export function observePageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => {
    errors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`);
    void dialog.dismiss();
  });
  return errors;
}

export async function launchBrowser() {
  return chromium.launch(launchOptions);
}

export async function installPinnedThreeRoute(target) {
  if (!process.env.WAFERCAD_THREE_DIR) return;
  await target.route('https://cdn.jsdelivr.net/npm/three@0.179.1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/three@0.179.1/')[1];
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile(join(process.env.WAFERCAD_THREE_DIR, path)),
    });
  });
}

export async function newUiContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await installPinnedThreeRoute(context);
  return context;
}

export async function newUiPage(browser, options = {}) {
  const context = await newUiContext(browser, options);
  const page = await context.newPage();
  return { context, page };
}

export async function gotoWelcome(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#welcomeScreen').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.documentElement.dataset.welcomeReady === 'true', null, {
    timeout: 10000,
  });
}

export async function waitForAppReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', null, {
    timeout: 30000,
  });
}

export async function waitForPaint(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

export async function waitForCanvasSizeSync(page, selector) {
  await page.waitForFunction((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas?.checkVisibility()) return false;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      Math.abs(canvas.width - rect.width * dpr) <= 2 &&
      Math.abs(canvas.height - rect.height * dpr) <= 2
    );
  }, selector);
  await waitForPaint(page);
}

const FUNCTION_SECTION_IDS = {
  project: 'settingsTools',
  base: 'baseTools',
  mask: 'maskTools',
  process: 'operationTools',
  snapshots: 'snapshotsTools',
};

export async function openFunctionPanel(page, name, clickOptions = {}) {
  const timeout = clickOptions.timeout || 5000;
  const button = page.locator(`.workstation-rail-button[data-tool="${name}"]`);
  await button.waitFor({ state: 'visible', timeout });

  const panel = page.locator('#toolPanel.workstation-tool-flyout');
  const isOpen = await panel.evaluate((element) => element.classList.contains('open'));
  const isActive = await button.evaluate((element) => element.classList.contains('active'));
  if (!isOpen || !isActive) await button.click(clickOptions);

  await page.locator(`#${FUNCTION_SECTION_IDS[name]}:not([hidden])`).waitFor({ timeout });
  await page.waitForFunction(
    () => {
      const current = document.getElementById('toolPanel');
      if (!current?.classList.contains('open')) return false;
      const rect = current.getBoundingClientRect();
      return rect.left >= 40 && rect.right > rect.left;
    },
    null,
    { timeout },
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

export async function canvasInkFraction(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    let samples = 0;
    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3];
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      samples += 1;
      if (alpha > 12 && (r < 245 || g < 245 || b < 245)) ink += 1;
    }
    return samples ? ink / samples : 0;
  });
}

export async function chooseConfirmation(page, action = 'confirm') {
  const overlay = page.locator('#confirmationDialogOverlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator(`[data-dialog-action="${action}"]`).click();
}

export async function waitForThreeReady(page, timeout = 30000) {
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
    null,
    { timeout },
  );
}

export async function waitForStatus(page, pattern, timeout = 30000) {
  await page.waitForFunction(
    ({ source, flags }) => {
      const text = document.getElementById('statusText')?.textContent || '';
      return new RegExp(source, flags).test(text);
    },
    { source: pattern.source, flags: pattern.flags },
    { timeout },
  );
}

export function assertNoPageErrors(errors, message = 'Unexpected browser errors') {
  assert.deepEqual(errors, [], message);
}
