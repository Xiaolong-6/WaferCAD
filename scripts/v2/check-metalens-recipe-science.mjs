// Real native-v2 / Process Worker acceptance of the illustrative 80x80 TiO2 Metalens.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
import { assertSameMaterialGeometry } from '../magic1000-geometry-comparison.mjs';
import { readProjectFile } from '../../site/project-io.js';
import { selectScientificView } from './desktop-view-selector.mjs';

await loadGeometryKernel();
const { unionGeometries } = await import('../../site/vector-geometry.js');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/v2-metalens-science');
await mkdir(output, { recursive: true });
const source = await readFile(
  new URL('../../site/examples/tio2-metalens-full-array.wafercad', import.meta.url),
);
const reference = await readProjectFile({
  size: source.length,
  text: async () => source.toString('utf8'),
});

function tiO2Perimeter(model) {
  const ids = new Set(model.layers.filter((layer) => layer.name === 'TiO2').map((l) => l.id));
  const geom = model.regions
    .filter((region) => region.stack.some((segment) => ids.has(segment.layerId)))
    .map((region) => region.geom);
  let length = 0;
  for (const polygon of unionGeometries(geom)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        length += Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
    }
  }
  return length;
}

function placements(model) {
  return model.array.instances.map(({ id, role, x, y }) => [id, role, x, y]);
}

function representatives(model) {
  const selected = new Map();
  for (const site of model.array.instances) {
    const template = site.templateId;
    const family =
      template === 'background'
        ? 'background'
        : template.startsWith('bipolar-')
          ? 'bipolar'
          : template.split('-')[0];
    if (!selected.has(family)) selected.set(family, site);
  }
  assert.deepEqual([...selected.keys()].sort(), [
    'background',
    'bipolar',
    'circle',
    'ring',
    'square',
  ]);
  return [...selected.values()];
}

async function comparePhysicalArray(expected, actual, label, sampleOnly = false) {
  assert.equal(actual.kernel, 'vector-2.5d-array-v1');
  assert.deepEqual(placements(actual), placements(expected), label + ': canonical 6400 XY/roles');
  const oldTemplates = new Map(expected.array.templates.map((part) => [part.id, part.model]));
  const newTemplates = new Map(actual.array.templates.map((part) => [part.id, part.model]));
  const newSites = new Map(actual.array.instances.map((site) => [site.id, site]));
  const checked = new Set();
  let slabs = 0;
  let maxMismatchUm2 = 0;
  for (const site of sampleOnly ? representatives(expected) : expected.array.instances) {
    const next = newSites.get(site.id);
    assert.ok(next, label + ': missing physical site ' + site.id);
    const key = site.templateId + '|' + next.templateId;
    if (checked.has(key)) continue;
    checked.add(key);
    const original = oldTemplates.get(site.templateId);
    const rebuilt = newTemplates.get(next.templateId);
    assert.ok(original && rebuilt, label + ': missing physical template ' + key);
    const perimeter = tiO2Perimeter(original);
    // Exact comparator and 0.1 nm storage-quantum acceptance from the existing
    // source-derived full-grid Recipe replay; do not relax scientific bounds.
    const tolerance = Math.max(1e-7, Math.min(1.5e-4, 1.1e-4 * perimeter));
    const result = await assertSameMaterialGeometry(original, rebuilt, {
      areaToleranceUm2: tolerance,
    });
    slabs += result.slabsChecked;
    maxMismatchUm2 = Math.max(maxMismatchUm2, result.maxMismatchAreaUm2);
  }
  return {
    label,
    sites: expected.array.instances.length,
    pairs: checked.size,
    slabs,
    maxMismatchUm2,
  };
}

const browser = await launchBrowser();
const report = { example: 'tio2-metalens-four-unit', runtime: 'native-v2', steps: 9 };
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('crash', () => errors.push('Chromium crashed'));
  try {
    await page.goto(base + '/app.html?start=example&example=metalens', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 180000,
    });
    assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snapshot();
    assert.equal(before.model.array.instances.length, 6400);
    assert.equal(
      before.model.array.instances.filter((site) => site.role === 'device').length,
      4725,
    );
    assert.equal(before.model.array.templates.length, 49);
    assert.equal(before.layout.elements.length, 60232);
    assert.equal(before.processRecipe.steps.length, 9);
    assert.equal(before.workflow.steps.length, 10);
    assert.deepEqual(before.model, reference.model, 'Opening source changed physical Metalens');
    assert.deepEqual(before.layout, reference.layout, 'Opening source changed full Mask');
    await selectScientificView(page, 'mask', 1440);
    await page.screenshot({
      path: resolve(output, 'mask-before-replay.png'),
      animations: 'disabled',
      timeout: 120000,
    });

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('[data-action="process-mode:recipe"]').click();
    assert.equal(await page.locator('.recipe-step-row').count(), 9);
    await page.locator('#recipeRunStart').selectOption('new-base');
    assert.doesNotMatch(
      await page.locator('#recipeValidation').innerText(),
      /✕|mask.*missing|material.*does not exist/i,
      'The original Mask Recipe must pass v2 preflight',
    );
    await page.evaluate(() => {
      const progress = document.getElementById('recipeProgressCount');
      window.__metalensProgress = [];
      if (progress) {
        new MutationObserver(() => {
          const value = progress.textContent?.trim();
          if (value) window.__metalensProgress.push(value);
        }).observe(progress, { childList: true, subtree: true });
      }
    });
    await page.locator('#recipeRunAllBtn').click();
    await page.getByRole('button', { name: 'Clear history', exact: true }).click({
      timeout: 30000,
    });
    await page.waitForFunction(
      () =>
        /^(Completed|Failed|Stopped):/.test(
          document.getElementById('recipeRunSummary')?.textContent || '',
        ),
      null,
      { timeout: 900000, polling: 500 },
    );
    const status = await page.evaluate(() => ({
      summary: document.getElementById('recipeRunSummary')?.textContent || '',
      message: document.querySelector('[data-slot="status.message"]')?.textContent || '',
      progress: window.__metalensProgress || [],
    }));
    report.recipe = status;
    assert.match(
      status.summary,
      /^Completed: 9\/9 steps committed/,
      'Actual v2 Process Worker replay failed: ' + JSON.stringify(status),
    );
    const after = await snapshot();
    assert.equal(after.workflow.steps.length, 9, 'Nine actual History commits required');
    assert.equal(after.workflow.branches.length, 1, 'Clear history must not archive a Variant');
    assert.deepEqual(after.layout, before.layout, 'Recipe must preserve all Mask polygons');
    assert.deepEqual(after.processRecipe.steps, before.processRecipe.steps);

    await selectScientificView(page, 'main', 1440);
    await page.screenshot({
      path: resolve(output, 'main-after-replay.png'),
      animations: 'disabled',
      timeout: 120000,
    });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectExportMenuBtn').click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 240000 }),
      page.locator('#exportProjectBtn').click({ timeout: 240000, noWaitAfter: true }),
    ]);
    const path = resolve(output, 'nine-step-replayed.wafercad');
    await download.saveAs(path);
    const contents = await readFile(path);
    const exported = await readProjectFile({
      size: contents.length,
      text: async () => contents.toString('utf8'),
    });
    assert.deepEqual(exported.layout, reference.layout, 'Export lost physical Mask geometry');
    assert.deepEqual(exported.processRecipe.steps, reference.processRecipe.steps);
    assert.equal(exported.snapshotBranches.branches.length, 1);
    assert.equal(exported.snapshotBranches.nodes.length, 9);
    report.final = await comparePhysicalArray(reference.model, exported.model, 'final');

    const baseline = reference.snapshotBranches.nodes.slice(-9);
    const history = exported.snapshotBranches.nodes.slice(-9);
    report.intermediate = [];
    for (let index = 0; index < 9; index++) {
      assert.ok(history[index]?.state?.model, 'Missing restorable Step ' + (index + 1));
      const result = await comparePhysicalArray(
        baseline[index].state.model,
        history[index].state.model,
        'step-' + (index + 1),
        true,
      );
      report.intermediate.push(result);
      console.log('V2_METALENS_STAGE', JSON.stringify(result));
    }
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 240000 },
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 240000,
    });
    const reopened = await snapshot();
    assert.deepEqual(reopened.model, after.model, 'Recovery changed replayed physical model');
    assert.deepEqual(reopened.workflow.steps, after.workflow.steps, 'Recovery lost History Steps');
    assert.deepEqual(
      reopened.workflow.branches,
      after.workflow.branches,
      'Recovery changed Variants',
    );
    assert.deepEqual(errors, []);
    report.pass = true;
    console.log(
      'V2_METALENS_NINE_STEP_SCIENCE',
      JSON.stringify({
        sites: 6400,
        devices: 4725,
        templates: report.final.pairs,
        slabs: report.final.slabs,
        intermediate: report.intermediate.length,
      }),
    );
  } finally {
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await context.close();
  }
} finally {
  await browser.close();
}
