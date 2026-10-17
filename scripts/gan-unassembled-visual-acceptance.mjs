// Real Chromium acceptance for four INDEPENDENT native GaN workpieces.
// A screenshot is evidence of an actual Workstation, never a simulated HTML render.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  baseUrl, installPinnedThreeRoute, observePageErrors, waitForPaint,
} from './test-helpers/ui.mjs';

const ids = [
  'gan-microchannel-interposer-2022',
  'gan-hemt-die-2022',
  'gan-gsg-left-die-2022',
  'gan-gsg-right-die-2022',
];
const folder = new URL('../test-results/gan-unassembled/visual/', import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM
    ? { executablePath: process.env.WAFERCAD_CHROMIUM }
    : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const report = {
  acceptance: 'real WaferCAD Workstation, independently separate Main histories',
  paper: '10.1038/s41378-022-00462-3',
  assemblyPerformed: false,
  views: {},
};
try {
  for (const id of ids) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await installPinnedThreeRoute(context);
    const page = await context.newPage();
    const errors = observePageErrors(page);
    await page.goto(
      baseUrl + '/app.html?start=example&example=' + encodeURIComponent(id),
      { waitUntil: 'domcontentloaded', timeout: 45000 },
    );
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 180000,
    });
    const revision = await page.evaluate(
      () => window.WaferCadV2Workstation.snapshot().model.revision,
    );
    await page.waitForFunction(
      (rev) => {
        const host = document.getElementById('threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.modelRevision) === rev
        );
      },
      revision,
      { timeout: 180000 },
    );
    await waitForPaint(page);
    const viewport = new URL(id + '-workstation.png', folder);
    const view = new URL(id + '-3d.png', folder);
    await page.screenshot({ path: viewport.pathname });
    const three = page.locator('#threePanel');
    assert.equal(await three.isVisible(), true, id + ' missing native 3D panel');
    await three.screenshot({ path: view.pathname });
    assert.deepEqual(errors, [], id + ' runtime errors');
    report.views[id] = {
      revision,
      panelVisible: true,
      screenshot: id + '-workstation.png',
      threeScreenshot: id + '-3d.png',
    };
    console.log('GAN_UNASSEMBLED_REAL_CHROMIUM', JSON.stringify({ id, revision }));
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(new URL('visual-acceptance.json', folder), JSON.stringify(report, null, 2));
