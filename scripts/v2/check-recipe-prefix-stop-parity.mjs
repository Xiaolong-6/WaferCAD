// Native-v2 replacement candidate for Legacy Recipe prefix and Stop contracts.
// Keep the older browser owner until this and the preflight/fault suites reach parity.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();

async function openEmpty(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
    timeout: 120000,
  });
  await page.locator('[data-action="domain:process"]').click();
  await page.locator('[data-action="process-mode:code"]').click();
  return { page, errors };
}

try {
  // Scope A: Run to Step must ignore invalid *later* steps and commit only the
  // requested prefix as a real physical Model/History transaction.
  const { context } = await newUiPage(browser);
  try {
    const { page, errors } = await openEmpty(context);
    const source = [
      'deposit({ material: "Prefix film", thickness: "30 nm", area: "full" });',
      'etch({ target: "Prefix film", depth: "10 nm", area: "mask" });',
    ].join('\n');
    await page.locator('#recipeCodeEditor').fill(source);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.locator('[data-action="process-mode:recipe"]').click();
    const rows = page.locator('.recipe-step-row');
    assert.equal(await rows.count(), 2);
    await rows.first().click();
    await page.locator('#recipeRunToBtn').click();
    await page.waitForFunction(
      () =>
        /Recipe completed: 1\/1 steps committed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const result = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const film = result.model.layers.find((layer) => layer.name === 'Prefix film');
    assert.ok(film, 'Requested prefix commits the first real material film');
    const thickness = result.model.regions
      .flatMap((region) => region.stack.filter((segment) => segment.layerId === film.id))
      .map((segment) => segment.z1 - segment.z0);
    assert.ok(thickness.length > 0, 'Prefix produces physical film regions');
    assert.ok(thickness.every((value) => Math.abs(value - 0.03) < 1e-12));
    assert.equal(result.workflow.steps.length, 1, 'Later invalid Step cannot be committed');
    assert.deepEqual(errors, [], 'No page exceptions during prefix replay');
  } finally {
    await context.close();
  }

  // Scope B: a 40-step Worker replay must yield to Stop; cancellation may
  // retain already committed Steps but must not leave a busy/inconsistent UI.
  const { context: stopContext } = await newUiPage(browser);
  try {
    // Keep the *real* Process Worker execution while delaying only the
    // browser-observed completion event. This gives Stop an in-flight window
    // even on a fast CI runner and exercises actual cancellation ownership.
    await stopContext.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          this.__delayProcessCompletion = String(url).includes('process-worker.js');
        }

        set onmessage(handler) {
          if (!this.__delayProcessCompletion) {
            super.onmessage = handler;
            return;
          }
          super.onmessage = (event) => {
            if (event.data?.type === 'done') {
              window.setTimeout(() => handler(event), 500);
            } else {
              handler(event);
            }
          };
        }

        get onmessage() {
          return super.onmessage;
        }
      };
    });
    const { page, errors } = await openEmpty(stopContext);
    const code = Array.from(
      { length: 40 },
      (_, index) =>
        `deposit({ material: "Stop film ${index + 1}", thickness: "20 nm", area: "full" });`,
    ).join('\n');
    await page.locator('#recipeCodeEditor').fill(code);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.locator('#recipeRunAllBtn').click();
    await page.locator('#recipeStopBtn').click({ timeout: 5000 });
    await page.waitForFunction(
      () => {
        const summary = document.getElementById('recipeRunSummary')?.textContent || '';
        return /Stopped: [0-9]+\/40/.test(summary);
      },
      null,
      { timeout: 120000 },
    );
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy, null, {
      timeout: 30000,
    });
    const stopped = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.ok(stopped.workflow.steps.length < 40, 'Stop must prevent the full 40-Step replay');
    assert.deepEqual(errors, [], 'No page exceptions while stopping Recipe');
  } finally {
    await stopContext.close();
  }
  console.log('V2_RECIPE_PREFIX_STOP: prefix physical 30 nm film and 40-step Stop PASS');
} finally {
  await browser.close();
}
