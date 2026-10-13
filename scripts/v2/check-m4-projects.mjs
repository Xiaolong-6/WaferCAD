// M4 integrated-route smoke on three independently loaded real projects.
// The full Metalens editing/History/Recovery transaction is owned by check-sync.mjs.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
import { readProjectFile, PROJECT_LENGTH_QUANTUM_UM } from '../../site/project-io.js';
await loadGeometryKernel();
const { parseGDS, flattenGDS } = await import('../../site/gds.js');
const { parseOAS } = await import('../../site/oasis.js');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-m4-projects');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  cases: [],
};
// Compact .wafercad exports use the documented 0.1 nm storage grid for XY/Z.
// IDs, topology, metadata and collection structure must remain strictly identical.
function assertModelPersistence(actual, expected, path = 'model') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path}: type`);
    assert.ok(
      Math.abs(actual - expected) <= PROJECT_LENGTH_QUANTUM_UM + 1e-8,
      `${path}: numeric persistence drift ${actual} vs ${expected}`,
    );
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: array type`);
    assert.equal(actual.length, expected.length, `${path}: topology length`);
    for (let index = 0; index < expected.length; index++)
      assertModelPersistence(actual[index], expected[index], `${path}[${index}]`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${path}: object type`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys`);
    for (const key of Object.keys(expected))
      assertModelPersistence(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, `${path}: canonical value`);
}

const browser = await launchBrowser();
try {
  report.browser = browser.version();
  for (const [example, sourceName] of [
    ['m3d', 'm3d-selfpowered'],
    ['photodetector', 'photodetector-literature'],
    ['metalens', 'tio2-metalens-full-array'],
    ['metalens-array', 'tio2-metalens-full-array'],
  ]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1024, height: 900 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/app.html?start=example&example=${example}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      assert.match(page.url(), /\/app\.html$/);
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const before = await snapshot();
      assert.equal(before.sharedIdentity, true);
      assert.equal(before.workflow.writable, true, 'Fresh independent context owns autosave');
      const conflict = page.locator('#workspaceConflictDialog');
      assert.equal(
        await conflict.isVisible(),
        false,
        'Current owner must not see Take over warning',
      );
      const conflictShownWhenRequired = await conflict.evaluate((node) => {
        const previous = node.hidden;
        node.hidden = false;
        const displayed = getComputedStyle(node).display !== 'none';
        node.hidden = previous;
        return displayed;
      });
      assert.equal(conflictShownWhenRequired, true, 'Non-owner warning remains available');
      assert.ok(before.model.layers.length > 0);
      assert.ok(
        before.model.regions.length > 0 ||
          before.model.array?.templates?.some((template) => template.model.regions.length > 0),
      );
      assert.equal(before.source.includes(sourceName), true);
      if (example === 'metalens-array' || example === 'metalens') {
        assert.equal(before.model.array.instances.length, 6400, 'Real 80×80 full array');
        assert.equal(before.model.array.templates.length, 49, '49 shared physical templates');
      }
      const legacyBoot = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .some((entry) => /\/app\.js(?:\?|$)/.test(entry.name)),
      );
      assert.equal(legacyBoot, false, 'UI v2 must not boot legacy app.js');
      for (const view of ['mask', 'main']) {
        await page.locator(`[data-action="view:${view}"]`).click();
        await waitForPaint(page);
      }
      if (example === 'metalens') {
        // End-to-end Mask export goes through the actual v2 toolbar, floating
        // settings panel and worker; existing Node export tests alone cannot
        // catch missing UI wiring or an empty browser download.
        await page.locator('[data-action="view:mask"]').click();
        await waitForPaint(page);
        const beforeMaskExport = await snapshot();
        const exportMenu = page.locator('[data-action="mask-export-menu"]');
        if (!(await exportMenu.isVisible()))
          await page.locator('#maskPanel button[aria-label$="more tools"]').click();
        await exportMenu.click();
        for (const format of ['gds', 'oas']) {
          const exportAction = page.locator(`[data-action="mask-export:${format}"]`);
          if (!(await exportAction.isVisible())) {
            if (!(await exportMenu.isVisible()))
              await page.locator('#maskPanel button[aria-label$="more tools"]').click();
            await exportMenu.click();
          }
          const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
          await exportAction.click();
          const download = await downloadPromise;
          assert.equal(download.suggestedFilename(), `wafercad-mask.${format}`);
          const filename = resolve(output, `metalens-mask.${format}`);
          await download.saveAs(filename);
          const raw = Uint8Array.from(await readFile(filename)).buffer;
          const parsed = format === 'gds' ? parseGDS(raw) : await parseOAS(raw);
          assert.ok(
            flattenGDS(parsed, parsed.root).elements.length > 0,
            `Real Mask ${format.toUpperCase()} download must contain parseable physical shapes`,
          );
          const unchangedMask = await snapshot();
          assert.deepEqual(unchangedMask.model, beforeMaskExport.model, 'Mask export is read-only');
          assert.deepEqual(unchangedMask.maskRoi, beforeMaskExport.maskRoi);
          assert.deepEqual(unchangedMask.maskTransform, beforeMaskExport.maskTransform);
        }
        console.log('M4 metalens: real v2 GDSII and OASIS Mask downloads round-trip PASS');
        await page.locator('[data-action="view:main"]').click();
        await waitForPaint(page);
      }
      if (example === 'metalens-array') {
        const label = await page.locator('[data-slot="view.main.readout"]').innerText();
        assert.match(label, /6,400 instances/, 'Array summary reports physical instances');
        assert.doesNotMatch(label, /0 regions/, 'Array is not reported as empty');
      }
      await page.locator('[data-action="domain:process"]').click();
      await waitForPaint(page);
      assert.equal(await page.locator('#v2MaterialPreview').isDisabled(), true);
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#xyUnitSelect').selectOption('nm');
      await page.locator('#xyUnitSelect').selectOption('um');
      const unchanged = await snapshot();
      assert.deepEqual(
        unchanged.model,
        before.model,
        'Navigation and unit changes do not alter geometry',
      );
      assert.deepEqual(unchanged.roi, before.roi);
      assert.deepEqual(unchanged.section, before.section);
      // Large projects may pack History for over 30 seconds on software-WebGL
      // runners. Do not wait for click-triggered navigation: the authoritative
      // completion signal is a real download, checked and round-tripped below.
      await page.locator('#projectExportMenuBtn').click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120000 }),
        page.locator('#exportProjectBtn').click({ timeout: 120000, noWaitAfter: true }),
      ]);
      const path = resolve(output, `${example}.wafercad`);
      await download.saveAs(path);
      const exported = await readProjectFile(new Blob([await readFile(path)]));
      assertModelPersistence(exported.model, unchanged.model);
      assert.deepEqual(errors, [], 'No page errors');
      await page.screenshot({ path: resolve(output, `${example}.png`) });
      report.cases.push({
        example,
        result: 'pass',
        layers: before.model.layers.length,
        regions: before.model.regions.length,
      });
      console.log(`M4 ${example}: integrated route, isolation, units and Project export PASS`);
    } catch (error) {
      report.cases.push({ example, result: 'fail', error: error.stack || error.message, errors });
      console.error(`M4 ${example} failed:`, error.stack || error.message, errors);
      await page.screenshot({ path: resolve(output, `${example}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
