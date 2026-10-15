// #184 native-v2 History parity: physical restoration, copy-on-write Variant,
// Main isolation and durable save/reload. Legacy History owner stays active.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });

    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const visibleNames = (model) => model.layers.map((layer) => layer.name);
    async function deposit(name, { fork = false } = {}) {
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(name);
      await page.locator('#applyOperationBtn').click();
      if (fork) {
        await page.getByRole('button', { name: 'Create Variant & apply', exact: true }).click();
      }
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
    async function openHistory() {
      await page.locator('[data-action="domain:history"]').click();
    }
    async function selectStep(name) {
      await openHistory();
      await page
        .locator('.process-history-row.history-step-row', { hasText: name })
        .first()
        .click();
      await page.waitForFunction((expected) => {
        const state = window.WaferCadV2Workstation.snapshot();
        return state.model.layers.some((layer) => layer.name === expected) && !state.workflow.busy;
      }, name);
    }

    await deposit('Native history A');
    const first = await snapshot();
    assert.equal(first.workflow.steps.length, 1);
    await deposit('Native history B');
    const main = await snapshot();
    assert.equal(main.workflow.steps.length, 2);
    assert.equal(main.workflow.branches.length, 1);
    assert.ok(visibleNames(main.model).includes('Native history B'));

    await selectStep('Native history A');
    await page.waitForFunction(
      () =>
        !window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Native history B',
        ),
    );
    const historical = await snapshot();
    assert.deepEqual(historical.model, first.model, 'History Step restore retains exact geometry');
    assert.equal(historical.workflow.branches.length, 1, 'Inspection does not fork a Variant');

    await page.locator('.snapshot-return-head').click();
    await page.waitForFunction(() =>
      window.WaferCadV2Workstation.snapshot().model.layers.some(
        (layer) => layer.name === 'Native history B',
      ),
    );
    assert.deepEqual((await snapshot()).model, main.model, 'Return to HEAD restores all geometry');

    await selectStep('Native history A');
    await deposit('Native branch C', { fork: true });
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          !state.workflow.busy &&
          state.workflow.branches.length === 2 &&
          state.model.layers.some((layer) => layer.name === 'Native branch C')
        );
      },
      null,
      { timeout: 120000 },
    );
    const branched = await snapshot();
    assert.equal(branched.workflow.steps.length, 3);
    assert.ok(!visibleNames(branched.model).includes('Native history B'));
    assert.ok(visibleNames(branched.model).includes('Native branch C'));
    const variant = branched.workflow.branches.find((entry) => entry.id !== 'main');
    assert.ok(variant, 'History mutation creates a new Variant');

    await openHistory();
    await page
      .locator(
        '.history-variant[data-variant-id="main"] > .history-variant-head .history-variant-name',
      )
      .click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Native history B',
        ),
    );
    assert.deepEqual(
      (await snapshot()).model,
      main.model,
      'Main geometry is copy-on-write isolated',
    );

    await page
      .locator(
        '.history-variant[data-variant-id="' +
          variant.id +
          '"] > .history-variant-head .history-variant-name',
      )
      .click();
    await page.waitForFunction(() =>
      window.WaferCadV2Workstation.snapshot().model.layers.some(
        (layer) => layer.name === 'Native branch C',
      ),
    );
    assert.deepEqual(
      (await snapshot()).model,
      branched.model,
      'Switching back restores Variant geometry exactly',
    );

    await mkdir('test-results/v2-history-branch', { recursive: true });
    await page.screenshot({
      path: 'test-results/v2-history-branch/history-variant.png',
      animations: 'disabled',
    });

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 30000 },
    );
    const beforeReload = await snapshot();
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(restored.model, beforeReload.model, 'Reload preserves Variant geometry');
    assert.deepEqual(
      restored.workflow.steps,
      beforeReload.workflow.steps,
      'Reload preserves every History Step',
    );
    assert.deepEqual(
      restored.workflow.branches,
      beforeReload.workflow.branches,
      'Reload preserves Variant topology and heads',
    );
    assert.deepEqual(errors, [], 'No uncaught errors in native History workflow');
    console.log('V2_HISTORY_VARIANT_PARITY: restore, HEAD, fork, switch, Save/Reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
