// One-owner physical Si visual acceptance — real Chromium, no production app mutation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiContext, waitForPaint } from '../test-helpers/ui.mjs';

const dir = resolve('test-results/physical-facet-preview');
await mkdir(dir, { recursive: true });
const port = process.env.WAFERCAD_PHYSICAL_PORT || '4191';
const server = spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
  cwd: resolve('.'),
  env: { ...process.env, WAFERCAD_V2_PORT: port },
  stdio: 'ignore',
});
const url = 'http://127.0.0.1:' + port + '/physical-facet-preview.html';
const report = { url, status: 'running', pictures: [], browserErrors: [], assertions: [] };
let browser;
try {
  let live = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) {
        live = true;
        break;
      }
    } catch {
      // Preview server may still be initializing.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(live, 'Physical-facet preview must be served over localhost');
  browser = await launchBrowser();
  report.chromiumVersion = browser.version();
  const context = await newUiContext(browser, { viewport: { width: 1320, height: 780 } });
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => report.browserErrors.push(error.message));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.body.dataset.physicalFacetReady === 'true', null, {
      timeout: 45000,
    });
    await waitForPaint(page);
    const data = await page.evaluate(() => window.WaferCadPhysicalFacetEvidence);
    assert.ok(data.ready && data.displayedZBreakOnly);
    assert.equal(data.sourceKernel, 'vector-physical-facet-experimental-v1');
    assert.equal(data.ownerKind, 'wafercad-physical-pyramid-slab-v1');
    assert.ok(data.physicalTriangleCount >= 32);
    assert.equal(
      Object.values(data.triangleCounts).reduce((sum, n) => sum + n, 0),
      data.physicalTriangleCount,
    );
    assert.ok(data.sectionVertexCount >= 7);
    assert.ok(Math.abs(data.physicalVolumeUm3 - 41615.36) < 1e-7);
    assert.equal(data.frontApexZ, 130);
    assert.equal(data.backApexZ, -130);
    report.assertions.push('same physical owner, volume, mesh and Section invariants passed');

    const pixelCoverage = await page.evaluate(() => {
      const three = document.getElementById('physicalThree');
      const section = document.getElementById('physicalSection');
      const gl = three.getContext('webgl2');
      if (!gl) throw new Error('Physical 3D did not establish WebGL2 context');
      const pixels = new Uint8Array(three.width * three.height * 4);
      gl.readPixels(0, 0, three.width, three.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let material = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i],
          g = pixels[i + 1],
          b = pixels[i + 2];
        if (r < 210 && g < 220 && b < 235) material++;
      }
      const ctx = section.getContext('2d');
      const sectionPixels = ctx.getImageData(0, 0, section.width, section.height).data;
      let sectionMaterial = 0;
      for (let i = 0; i < sectionPixels.length; i += 16) {
        if (sectionPixels[i] < 180 && sectionPixels[i + 1] < 210) sectionMaterial++;
      }
      return { threeMaterialSamples: material, sectionMaterialSamples: sectionMaterial };
    });
    assert.ok(
      pixelCoverage.threeMaterialSamples > 300,
      'Real WebGL Si surface must have visible pixel area',
    );
    assert.ok(
      pixelCoverage.sectionMaterialSamples > 300,
      'Real physical Section must have visible pixel area',
    );
    report.pixelCoverage = pixelCoverage;
    const imageHashes = [];
    for (const angle of ['isometric', 'top', 'side']) {
      await page.evaluate((value) => {
        document.body.dataset.angle = value;
        window.WaferCadPhysicalFacetEvidence.setAngle(value);
      }, angle);
      await waitForPaint(page);
      const name = 'physical-' + angle + '.png';
      const bytes = await page.screenshot({ path: resolve(dir, name), fullPage: true });
      imageHashes.push(createHash('sha256').update(bytes).digest('hex'));
      report.pictures.push({ angle, name, bytes: bytes.length });
    }
    assert.equal(
      new Set(imageHashes).size,
      3,
      'Three independent 3D camera views must be different',
    );
    const sectionCapture = 'physical-section-panel.png';
    await page.locator('#physicalSection').screenshot({ path: resolve(dir, sectionCapture) });
    report.pictures.push({ angle: 'native-section', name: sectionCapture });
    assert.deepEqual(
      report.browserErrors,
      [],
      'Browser modules must render without uncaught errors',
    );
    report.geometry = data;
    report.status = 'captured-unreviewed';
    report.assertions.push(
      'WebGL and Section have nonblank pixels and three distinct camera renders',
    );
  } finally {
    await context.close();
  }
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(dir, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server.kill();
}
