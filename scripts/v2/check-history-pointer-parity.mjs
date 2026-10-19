// Issue #184: verify a real mouse pointer can save a native v2 historical Step.
// Deliberately distinct from the transaction-only DOM click replay fault oracle.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('0.05');
    for (const name of ['Pointer A', 'Pointer B', 'Pointer C']) {
      await page.locator('#layerName').fill(name);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (expected) => {
          const state = window.WaferCadV2Workstation.snapshot();
          return (
            !state.workflow.busy && state.model.layers.some((layer) => layer.name === expected)
          );
        },
        name,
        { timeout: 120000 },
      );
    }
    await page.locator('[data-action="domain:history"]').click();
    const step = page.locator('.history-step-wrap', { hasText: 'Pointer B' }).first();
    await step.locator('.snapshot-more-trigger').click();
    await step.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
    await page.locator('#applyOperationBtn').waitFor({ state: 'visible' });
    assert.match(await page.locator('#applyOperationBtn').innerText(), /Save edited Step/);
    await page.locator('#layerName').fill('Pointer B edited');
    await page.locator('#applyOperationBtn').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const button = document.getElementById('applyOperationBtn');
      const scroller = button.closest('.p-panel-content');
      const form = button.closest('.p-form');
      const actions = button.closest('.p-apply-actions');
      const dimensions = (node) => ({
        top: Math.round(node?.getBoundingClientRect().top || 0),
        height: Math.round(node?.getBoundingClientRect().height || 0),
      });
      const geometry = () => ({
        buttonTop: Math.round(button.getBoundingClientRect().top),
        guideTop: Math.round(
          document.querySelector('.p-process-guide')?.getBoundingClientRect().top || 0,
        ),
        scrollTop: scroller?.scrollTop ?? 0,
        scrollHeight: scroller?.scrollHeight ?? 0,
        clientHeight: scroller?.clientHeight ?? 0,
        actions: dimensions(actions),
        form: dimensions(form),
        formChildren: [...(form?.children || [])].map((node) => ({
          tag: node.id || node.className || node.tagName,
          ...dimensions(node),
        })),
      });
      const trace = {
        buttonClick: 0,
        captures: [],
        scrolls: [],
        before: geometry(),
        sourceConnected: true,
        mutations: 0,
      };
      window.__v2PointerTrace = trace;
      window.__v2PointerOrigin = button;
      button.addEventListener('click', () => {
        trace.buttonClick++;
      });
      for (const name of ['pointerdown', 'pointerup', 'click']) {
        document.addEventListener(
          name,
          (event) => {
            const current = document.getElementById('applyOperationBtn');
            trace.captures.push({
              type: name,
              target: event.target?.id || event.target?.tagName || '',
              applyInPath: event.composedPath().includes(current),
              currentSame: current === button,
              originalConnected: button.isConnected,
              pointerY: event.clientY,
              ...geometry(),
            });
          },
          true,
        );
      }
      document.addEventListener(
        'scroll',
        (event) => {
          if (event.target === scroller) trace.scrolls.push({ type: 'scroll', ...geometry() });
        },
        true,
      );
      window.MutationObserver &&
        new window.MutationObserver(() => {
          trace.mutations++;
          trace.sourceConnected = button.isConnected;
        }).observe(button.parentElement, { childList: true, subtree: true });
    });

    await page.locator('#applyOperationBtn').click();
    await page.waitForTimeout(400);
    const observed = await page.evaluate(() => {
      const button = document.getElementById('applyOperationBtn');
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const trace = window.__v2PointerTrace;
      return {
        ...trace,
        originalStillCurrent: window.__v2PointerOrigin === button,
        enabled: !button.disabled,
        inert: button.closest('[inert]')?.className || '',
        centerTarget: document.elementFromPoint(x, y)?.outerHTML?.slice(0, 300),
        status: document.querySelector('[data-slot="status.message"]')?.textContent || '',
        dialogs: [...document.querySelectorAll('.v2-confirm-dialog button')].map((item) =>
          item.textContent?.trim(),
        ),
      };
    });
    console.log('V2_HISTORY_POINTER_EVIDENCE', JSON.stringify(observed));
    await mkdir('test-results/v2-history-pointer', { recursive: true });
    await page.screenshot({
      path: 'test-results/v2-history-pointer/after-pointer-click.png',
      animations: 'disabled',
    });
    assert.deepEqual(errors, [], 'Native pointer click must not produce page errors');
    assert.ok(
      observed.buttonClick >= 1,
      'A real Playwright pointer click must reach the live historical Process button',
    );
    assert.ok(
      observed.dialogs.some((action) => /Replace & replay later Steps/.test(action)),
      'Pointer click must open the actual historical replay confirmation',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    console.log('V2_HISTORY_POINTER_PARITY: real pointer click opens replay confirmation PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
