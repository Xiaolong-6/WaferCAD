// Native v2 evidence: the paper-figure register's previously off-section
// second M3D power-via probe must be on a real rendered A-B Section.
// Produces screenshots and topology metadata; it does NOT certify paper SEM.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  launchBrowser,
  newUiPage,
  waitForPaint,
  canvasInkFraction,
} from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/literature-figure-cuts/native-v2-m3d');
const cases = [
  {
    id: 'first-power-via',
    a: [12, -5.3],
    b: [20, -5.3],
    xy: [16, -5.3],
    present: ['M3D Ti power via 120nm', 'M3D via2 Au 30nm'],
  },
  {
    id: 'second-power-via',
    a: [12, 5.3],
    b: [20, 5.3],
    xy: [16, 5.3],
    present: ['M3D Ti power via 120nm', 'M3D via2 Ni 28nm'],
  },
];
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1560, height: 960 },
  acceptDownloads: false,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const report = {
  caseFamily: 'm3d-selfpowered-heterogeneous-ic',
  route: 'native-v2',
  paperMatch: 'NOT_ACCEPTED',
  originalPaperOverlay: false,
  result: 'running',
  cuts: [],
};

try {
  await page.goto(base + '/app.html?start=example&example=m3d', {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((item) => /\\/app\\.js(?:\\?|$)/.test(item.name)),
    ),
    false,
    'Native v2 figure evidence must not boot the legacy app',
  );
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const starting = await snapshot();
  assert.match(starting.source, /m3d-selfpowered/);
  assert.ok(starting.model.regions.length > 0, 'Actual source has physical material owners');
  assert.equal(starting.workflow.writable, true);
  report.originalModelLayerIds = starting.model.layers.map((layer) => layer.id);

  for (const item of cases) {
    await selectScientificView(page, 'main', 1560);
    const coords = page.locator('[data-action="slice-coordinates"]');
    if (!(await coords.isVisible()))
      await page.locator('#mainPanel button[aria-label$="more tools"]').click();
    await coords.click();
    for (const [field, value] of [
      ['sectionAx', item.a[0]],
      ['sectionAy', item.a[1]],
      ['sectionBx', item.b[0]],
      ['sectionBy', item.b[1]],
    ]) {
      await page.locator('#' + field).fill(String(value));
      await page.locator('#' + field).press('Tab');
    }
    const section = (await snapshot()).section;
    assert.deepEqual(
      section,
      { a: item.a, b: item.b },
      'Native v2 UI Section A-B must match the material probe coordinate',
    );
    await page.getByRole('button', { name: 'Close Section line', exact: true }).click();
    await selectScientificView(page, 'section', 1560);

    // Compute physical material bands using exactly the same topology as
    // the visible Section renderer. The selected probe lies at t=0.5.
    const physical = await page.evaluate(async ({ a, b }) => {
      const { sectionSlices } = await import('/model-view-geometry.js');
      const state = window.WaferCadV2Workstation.snapshot();
      const layerNames = new Map(state.model.layers.map((layer) => [layer.id, layer.name]));
      return sectionSlices(state.model, a, b)
        .filter((slice) => slice.t0 <= 0.5 && 0.5 <= slice.t1 && slice.z1 > slice.z0)
        .map(({ layerId, z0, z1, t0, t1 }) => ({
          material: layerNames.get(layerId) || layerId,
          z0,
          z1,
          t0,
          t1,
        }));
    }, { a: item.a, b: item.b });
    assert.ok(physical.length > 0, item.id + ': Section has no physical geometry');
    for (const expected of item.present) {
      assert.ok(
        physical.some((slice) => slice.material.includes(expected)),
        item.id + ': missing paper-relevant physical material ' + expected,
      );
    }

    await page.locator('#sectionCanvas').waitFor({ state: 'visible', timeout: 120000 });
    await waitForPaint(page);
    const ink = await canvasInkFraction(page, '#sectionCanvas');
    assert.ok(ink > 0.002, item.id + ': actual v2 Section canvas is blank');
    const rect = await page.locator('#sectionCanvas').boundingBox();
    assert.ok(rect && rect.width >= 300 && rect.height >= 180);
    const shot = item.id + '-native-v2-section.png';
    await page.locator('#sectionPanel').screenshot({
      path: resolve(output, shot),
      animations: 'disabled',
      timeout: 120000,
    });
    const after = await snapshot();
    assert.deepEqual(after.model, starting.model, 'Read-only figure cut cannot mutate physical Model');
    report.cuts.push({
      id: item.id,
      lineAUm: item.a,
      lineBUm: item.b,
      materialProbeXYUm: item.xy,
      materialOnActualCut: true,
      cutModelT: 0.5,
      physical,
      inkFraction: ink,
      canvasPixels: [Math.round(rect.width), Math.round(rect.height)],
      screenshot: shot,
      paperOverlayVerified: false,
    });
    console.log('NATIVE_M3D_POWER_VIA_SECTION', item.id, 'materials', physical.length, 'ink', ink);
  }
  assert.deepEqual(errors, [], 'Native v2 cut generated browser exceptions');
  assert.notDeepEqual(
    report.cuts[0].physical.map((slice) => slice.material),
    report.cuts[1].physical.map((slice) => slice.material),
    'Two separated power-via cuts must have independently distinguishable stacks',
  );
  report.result = 'pass';
  console.log('NATIVE_V2_M3D_TWO_POWER_VIA_SECTIONS: actual 2 A-B cuts, topology + PNG PASS');
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || String(error);
  report.browserErrors = errors;
  await page.screenshot({
    path: resolve(output, 'failure.png'),
    animations: 'disabled',
  }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  await context.close();
  await browser.close();
}
