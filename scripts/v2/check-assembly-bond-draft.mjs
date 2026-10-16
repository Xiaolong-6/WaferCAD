// One focused Chromium transaction acceptance for the opt-in direct-Bond draft.
// Verifies IndexedDB Recovery durability and byte-safe portable .wafercad export.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from '../process-benchmarks.mjs';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

await loadGeometryKernel();
const { createModel } = await import('../../site/model.js');
const { migrateProjectFile } = await import('../../site/project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../../site/wafer-assembly.js');
const { serializeProject, readProjectFile } = await import('../../site/project-io.js');

function source(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}

const a = createWaferAssembly(source('receiver A'), 'A');
const b = appendWaferToAssembly(a, source('donor B'), { donorId: 'B' });
const baseline = createBondedAssemblyProject(b.assembly);
const donorC = source('donor C');
const output = resolve('test-results/wafer-bond-draft');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  try {
    const errors = observePageErrors(page);
    await page.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByLabel('Open bonded Assembly project').setInputFiles({
      name: 'two.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(baseline)),
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 90000,
    });
    await page.locator('.assembly-bond-draft-tools summary').click();
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).assemblyPreview.readOnly,
      false,
    );
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).workflow.writable,
      false,
    );

    const donorSelect = page.getByLabel('Select independent donor wafer');
    await page.locator('.assembly-bond-draft-form input[name="donorId"]').fill('B');
    await donorSelect.setInputFiles({
      name: 'donor.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(donorC)),
    });
    await page.getByRole('button', { name: 'Validate and Bond' }).click();
    await page.locator('.assembly-bond-draft-status[data-error="true"]').waitFor();
    assert.match(await page.locator('.assembly-bond-draft-status').textContent(), /Duplicate/);
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).assemblyPreview.bonds,
      1,
    );

    await page.locator('.assembly-bond-draft-form input[name="donorId"]').fill('C');
    await page.getByRole('button', { name: 'Validate and Bond' }).click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation?.snapshot().assemblyPreview.bonds === 2,
      null,
      { timeout: 60000 },
    );
    await page.locator('.assembly-bond-draft-status').filter({ hasText: /Bonded C/ }).waitFor();
    await waitForPaint(page);
    const committed = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(committed.assemblyPreview.sources, 3);
    assert.equal(committed.assemblyPreview.index, 2);
    assert.equal(committed.sharedIdentity, true);
    assert.equal(committed.workflow.writable, false);
    assert.match(await page.locator('.assembly-preview-stage').textContent(), /Z 1200 µm/);

    const checkpoints = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('wafercad-assembly-bond-drafts-v1', 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('checkpoints', 'readonly');
            const r = tx.objectStore('checkpoints').getAll();
            r.onsuccess = () => {
              db.close();
              resolve(r.result);
            };
            r.onerror = () => reject(r.error);
          };
        }),
    );
    assert.equal(checkpoints.length, 1, 'failed preflight must not write a Recovery point');
    assert.equal(checkpoints[0].reason, 'pre-wafer-bond');
    assert.deepEqual(checkpoints[0].project.waferAssembly, baseline.waferAssembly);
    assert.deepEqual(checkpoints[0].project.model, baseline.model);

    await page.locator('.assembly-preview-views [data-view="three"]').click();
    await waitForPaint(page);
    await page.screenshot({ path: resolve(output, 'bond-three-after-commit.png') });
    await page.getByRole('button', { name: '← Bond' }).click();
    assert.equal(await page.getByRole('button', { name: 'Validate and Bond' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Bond →' }).click();
    assert.deepEqual(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
      committed.model,
    );

    const exportPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Export full Assembly' }).click();
    const downloaded = await exportPromise;
    const bytes = await readFile(await downloaded.path());
    const reloaded = await readProjectFile({
      size: bytes.length,
      text: async () => bytes.toString('utf8'),
    });
    assert.equal(reloaded.waferAssembly.sources.length, 3);
    assert.equal(reloaded.waferAssembly.bonds.length, 2);
    assert.deepEqual(
      reloaded.waferAssembly.sources[0].project.model,
      baseline.waferAssembly.sources[0].project.model,
    );
    assert.deepEqual(reloaded.model, committed.model);
    const recoveryPage = await context.newPage();
    try {
      const recoveryErrors = observePageErrors(recoveryPage);
      await recoveryPage.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await recoveryPage.getByLabel('Assembly Bond Recovery checkpoint').waitFor();
      await recoveryPage
        .getByRole('button', { name: 'Restore pre-Bond checkpoint' })
        .waitFor({ state: 'visible' });
      await recoveryPage.waitForFunction(
        () => {
          const select = document.querySelector(
            '[aria-label="Assembly Bond Recovery checkpoint"]',
          );
          return Boolean(select && select.options.length && !select.disabled);
        },
        null,
        { timeout: 15000 },
      );
      await recoveryPage.getByRole('button', { name: 'Restore pre-Bond checkpoint' }).click();
      await recoveryPage.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      const recovered = await recoveryPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(recovered.assemblyPreview.sources, 2);
      assert.equal(recovered.assemblyPreview.bonds, 1);
      assert.deepEqual(recovered.model, baseline.model);
      assert.equal(recovered.workflow.writable, false);
      assert.deepEqual(recoveryErrors, []);
    } finally {
      await recoveryPage.close();
    }

    assert.deepEqual(errors, [], 'No uncaught page errors during transaction or export');
    console.log('Native Assembly Bond draft: donor C, durable Recovery, Undo/Redo, export = OK');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
