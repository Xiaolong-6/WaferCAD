// Targeted real-Chromium acceptance for the experimental, read-only v15 Assembly preview.
// Never overwrites existing image baselines or performs a general UI regression.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from '../process-benchmarks.mjs';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

await loadGeometryKernel();
const { createModel } = await import('../../site/model.js');
const { migrateProjectFile } = await import('../../site/project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../../site/wafer-assembly.js');
const { serializeProject } = await import('../../site/project-io.js');

function wafer(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}

const initial = createWaferAssembly(wafer('Receiver'), 'A');
const second = appendWaferToAssembly(initial, wafer('Donor B'), { donorId: 'B' });
const third = appendWaferToAssembly(second.assembly, wafer('Donor C'), { donorId: 'C' });
const assembly = createBondedAssemblyProject(third.assembly);
const fixture = Buffer.from(serializeProject(assembly));
const output = resolve('test-results/wafer-bond-preview');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    const errors = observePageErrors(page);
    await page.goto(`${base}/app.html?assemblyPreview=1`, { waitUntil: 'domcontentloaded' });
    const input = page.getByLabel('Open bonded Assembly project');
    await input.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('.p-workbench').count(), 0);
    assert.equal(await page.locator('.assembly-preview-file-picker').isVisible(), true);

    await input.setInputFiles({
      name: 'standalone.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(wafer('Unbonded'))),
    });
    await page.locator('.assembly-preview-file-picker [data-error="true"]').waitFor();
    assert.match(
      await page.locator('.assembly-preview-file-picker [role="status"]').textContent(),
      /does not contain a bonded v15 Assembly/,
    );
    assert.equal(await page.locator('.p-workbench').count(), 0);

    await input.setInputFiles({
      name: 'three.wafercad',
      mimeType: 'application/json',
      buffer: fixture,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 90000,
    });
    await waitForPaint(page);

    const baseState = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(baseState.assemblyPreview.readOnly, true);
    assert.equal(baseState.assemblyPreview.index, 2);
    assert.equal(baseState.assemblyPreview.bonds, 2);
    assert.equal(baseState.assemblyPreview.sources, 3);
    assert.equal(baseState.sharedIdentity, true);
    assert.equal(baseState.workflow.writable, false, 'Preview cannot acquire a writer lease');
    assert.equal(await page.locator('.p-inspector').isVisible(), false);
    assert.equal(await page.locator('.p-nav').isVisible(), false);
    assert.equal(await page.locator('[data-action="domain:process"]').isVisible(), false);

    const canvases = {
      main: '#mainCanvas',
      mask: '#maskCanvas',
      three: '#threePanel canvas',
      section: '#sectionCanvas',
    };
    for (const index of [2, 1, 0]) {
      while (
        Number(await page.locator('.assembly-preview-controls').getAttribute('data-bond-index')) >
        index
      ) {
        await page.getByRole('button', { name: '← Bond' }).click();
      }
      const state = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(state.assemblyPreview.index, index);
      assert.equal(state.sharedIdentity, true);
      assert.equal(state.workflow.writable, false);
      if (index === 0) {
        assert.deepEqual(state.model, assembly.waferAssembly.sources[0].project.model);
      } else if (index === 2) {
        assert.deepEqual(state.model, assembly.model);
      }
      for (const [view, selector] of Object.entries(canvases)) {
        await page.locator(`.assembly-preview-views [data-view="${view}"]`).click();
        await page.locator(selector).waitFor({ state: 'visible', timeout: 30000 });
        await waitForPaint(page);
        const dims = await page.locator(selector).evaluate((canvas) => ({
          width: canvas.width,
          height: canvas.height,
        }));
        assert.ok(dims.width > 60 && dims.height > 60, `${view}: real canvas has size`);
        await page.screenshot({ path: resolve(output, `bond-${index}-${view}.png`) });
      }
    }
    await page.getByRole('button', { name: 'Bond →' }).click();
    await page.getByRole('button', { name: 'Bond →' }).click();
    const recovered = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(recovered.assemblyPreview.index, 2);
    assert.deepEqual(recovered.model, assembly.model);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('Native Assembly preview: 3 Bond stages × 4 views + file security = OK');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
