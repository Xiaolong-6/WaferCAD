// Browser acceptance of the staged, independently generated SWX OFF/ON projects.
// This exercises the real v2 Project worker, shared renderer state and exports.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { parseOAS } from '../site/oasis.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const out = resolve('test-results/swx-mems/browser');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const report = { browser: browser.version(), cases: [] };

try {
  for (const state of ['off', 'on']) {
    const filename = resolve('test-results/swx-mems/swx-photonic-mems-' + state + '.wafercad');
    const source = await readProjectFile(new Blob([await readFile(filename)]));
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(base + '/app.html?start=empty', {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#openProjectInput').setInputFiles(filename);
      const confirmation = page.getByRole('button', {
        name: 'Open project',
        exact: true,
      });
      if (await confirmation.isVisible()) await confirmation.click();
      await page.waitForFunction(
        (expected) => {
          const s = window.WaferCadV2Workstation.snapshot();
          return s.projectName === expected && !s.workflow.busy;
        },
        source.name,
        { timeout: 120000 },
      );

      const imported = await snapshot();
      assert.equal(imported.sharedIdentity, true);
      assert.equal(imported.model.layers.length, source.model.layers.length);
      assert.equal(imported.model.regions.length, source.model.regions.length);
      assert.equal(imported.layout.elements.length, source.layout.elements.length);
      assert.ok(imported.workflow.steps.length >= 8, 'History did not import');
      assert.ok(imported.model.layers.some((layer) => layer.name === 'Au electrode'));
      await page.locator('[data-action="view:mask"]').click();
      await waitForPaint(page);
      assert.ok((await snapshot()).layout.elements.length > 100);

      const maskMenu = page.locator('[data-action="mask-export-menu"]');
      for (const format of ['gds', 'oas']) {
        if (!(await maskMenu.isVisible())) {
          await page.locator('#maskPanel button[aria-label$="more tools"]').click();
        }
        await maskMenu.click();
        const exportAction = page.locator('[data-action="mask-export:' + format + '"]');
        const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
        await exportAction.click();
        const download = await downloadPromise;
        const layoutPath = resolve(out, 'swx-' + state + '.' + format);
        await download.saveAs(layoutPath);
        const bytes = await readFile(layoutPath);
        assert.ok(bytes.byteLength > 100, 'Empty ' + format + ' export');
        const buffer = Uint8Array.from(bytes).buffer;
        const parsed = format === 'gds' ? parseGDS(buffer) : await parseOAS(buffer);
        assert.ok(
          flattenGDS(parsed, parsed.root).elements.length > 100,
          'Exported ' + format.toUpperCase() + ' lacks physical SWX polygons',
        );
      }

      await page.locator('[data-action="view:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      await page.locator('[data-action="view:main"]').click();
      await waitForPaint(page);
      const beforeExport = await snapshot();
      await page.locator('#projectExportMenuBtn').click();
      const savedFile = page.waitForEvent('download', { timeout: 120000 });
      await page.locator('#exportProjectBtn').click();
      const projectDownload = await savedFile;
      const exportedPath = resolve(out, 'swx-' + state + '-reexport.wafercad');
      await projectDownload.saveAs(exportedPath);
      const reloaded = await readProjectFile(new Blob([await readFile(exportedPath)]));
      await assertSameMaterialGeometry(beforeExport.model, reloaded.model, {
        areaToleranceUm2: 0.01,
      });
      assert.equal(reloaded.layout.elements.length, source.layout.elements.length);
      assert.equal(reloaded.processRecipe.steps.length, source.processRecipe.steps.length);
      assert.deepEqual(
        (await snapshot()).model,
        beforeExport.model,
        'Export must not mutate live physical geometry',
      );
      assert.deepEqual(errors, [], 'Browser runtime errors');

      report.cases.push({
        state,
        pass: true,
        regions: beforeExport.model.regions.length,
        historyNodes: beforeExport.workflow.steps.length,
        masks: beforeExport.layout.elements.length,
        projectRoundTrip: true,
        gdsExport: true,
        oasExport: true,
        views: ['mask', 'three', 'main'],
      });
      console.log('SWX browser ' + state.toUpperCase() + ': project import/export, 3D and GDS/OAS PASS');
    } catch (error) {
      await page.screenshot({ path: resolve(out, 'swx-' + state + '-failure.png') });
      throw error;
    } finally {
      await context.close();
    }
  }
  report.pass = true;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
}
