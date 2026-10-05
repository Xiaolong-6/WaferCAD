import assert from 'node:assert/strict';
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

export async function gotoWelcome(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#welcomeScreen').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.welcomeReady === 'true',
    null,
    { timeout: 10000 },
  );
}

export async function waitForAppReady(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === 'true',
    null,
    { timeout: 30000 },
  );
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
