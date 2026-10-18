// Real production-v2 acceptance after retiring the Legacy DOM. The separate
// full-grid-replay workflow keeps the full 4725-site Recipe Run All contract;
// this check protects the actual shipped Welcome open, geometry and renderer.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  baseUrl,
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForPaint,
} from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const browser = await launchBrowser();
const context = await newUiContext(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = observePageErrors(page);
try {
  await page.goto(baseUrl + '/app.html?start=example&example=tio2-metalens-four-unit', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  const saved = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(saved.source, 'examples/tio2-metalens-full-array.wafercad');
  assert.equal(saved.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(saved.model.array.instances.length, 6400);
  assert.equal(
    saved.model.array.instances.filter((instance) => instance.role === 'device').length,
    4725,
  );
  assert.equal(saved.layout.elements.length, 60232);
  // The v2 runtime snapshot intentionally contains presentation/model state,
  // not the full portable Recipe or History. Inspect the real shipped file
  // through production Project IO instead of assuming those snapshot fields.
  const bytes = await readFile(
    new URL('../site/examples/tio2-metalens-full-array.wafercad', import.meta.url),
  );
  const project = await readProjectFile(new Blob([bytes]));
  assert.equal(project.processRecipe.steps.length, 9);
  assert.equal(project.snapshotBranches.nodes.length, 10);
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#threeHost');
      return (
        host?.dataset.renderState === 'ready' &&
        host.dataset.renderPhase === 'complete' &&
        !host.dataset.rendererBuildFailure &&
        Number(host.dataset.sceneVisibleObjectCount) > 0
      );
    },
    null,
    { timeout: 180000 },
  );
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#sectionCanvas');
      return canvas && canvas.width > 100 && canvas.height > 100;
    },
    null,
    { timeout: 60000 },
  );
  const visual = await page.evaluate(() => {
    const host = document.querySelector('#threeHost');
    const section = document.querySelector('#sectionCanvas');
    return {
      renderState: host.dataset.renderState,
      renderPhase: host.dataset.renderPhase,
      visibleObjects: Number(host.dataset.sceneVisibleObjectCount),
      sectionWidth: section.width,
      sectionHeight: section.height,
    };
  });
  assert.ok(visual.visibleObjects > 0);
  await mkdir('test-results/metalens', { recursive: true });
  await waitForPaint(page);
  await page.screenshot({ path: 'test-results/metalens/v2-4725-four-views.png' });
  await writeFile(
    'test-results/metalens/v2-visual-report.json',
    JSON.stringify({ pass: true, ...visual }, null, 2) + '\n',
  );
  assert.deepEqual(errors, [], 'Current v2 browser must not emit page errors');
  console.log('Metalens actual v2 Welcome and 3D/Section PASS', JSON.stringify(visual));
} finally {
  await context.close();
  await browser.close();
}
