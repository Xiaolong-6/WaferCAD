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
const url = 'http://127.0.0.1:' + port + '/experimental/physical-facets/physical-facet-preview.html';
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
    assert.equal(data.rendererKind, 'production-createThreeView');
    assert.equal(data.productionHost.rendererState, 'ready');
    assert.equal(data.productionHost.rendererPhase, 'complete');
    assert.equal(data.productionHost.owner, 'wafercad-physical-pyramid-slab-v1');
    assert.equal(data.productionHost.triangleCount, data.physicalTriangleCount);
    assert.equal(data.productionHost.axesHelperHidden, true, 'No axis piercing physical body');
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
      const host = document.getElementById('physicalThree');
      const three = host.querySelector('canvas');
      const section = document.getElementById('physicalSection');
      if (!three) throw new Error('Production ThreeView did not attach WebGL canvas');
      const gl = three.getContext('webgl2');
      if (!gl) throw new Error('Production ThreeView did not establish WebGL2 context');
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

    // Visual proof for the *coated* owner is a separate physical Section
    // inspector. The existing ThreeView above remains honest bare silicon.
    const shellPage = await context.newPage();
    shellPage.on('pageerror', (error) => report.browserErrors.push(error.message));
    const shellResponse = await shellPage.goto(
      url.replace('/experimental/physical-facets/physical-facet-preview.html', '/experimental/physical-facets/physical-facet-shell-preview.html'),
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    assert.equal(shellResponse.status(), 200);
    await shellPage.waitForFunction(() => document.body.dataset.shellReady === 'true', null, {
      timeout: 45000,
    });
    const shellData = await shellPage.evaluate(() => window.WaferCADShellEvidence);
    assert.equal(shellData.kind, 'wafercad-physical-implicit-shell-v1');
    assert.equal(shellData.sourceTriangleCount, data.physicalTriangleCount);
    assert.equal(shellData.views.length, 3);
    assert.equal(shellData.apex, 'oxide');
    assert.equal(shellData.corner, 'oxide');
    assert.equal(shellData.silicon, 'base');
    for (const item of shellData.views) {
      assert.equal(item.samples, item.coatingValidated);
      assert.ok(item.samples >= 30);
      const canvas = shellPage.locator('#' + item.id);
      const pixels = await shellPage.evaluate((id) => {
        const node = document.getElementById(id);
        const rgba = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
        let oxide = 0;
        for (let i = 0; i < rgba.length; i += 16) {
          if (rgba[i] > 205 && rgba[i + 1] > 130 && rgba[i + 1] < 200 && rgba[i + 2] < 140) oxide++;
        }
        return oxide;
      }, item.id);
      assert.ok(pixels > 20, 'Physical oxide must occupy visible pixels in ' + item.id);
      const name = item.id + '.png';
      await canvas.screenshot({ path: resolve(dir, name) });
      report.pictures.push({ angle: 'coated-material-section', name, oxidePixels: pixels });
    }
    await shellPage.close();
    report.shell = shellData;
    report.assertions.push(
      'whole-unit 3D oxide owner and three genuine multilayer Section ROI canvases verified',
    );

    // The coated path MUST exercise the production createThreeView geometry,
    // not only the independently useful 2D implicit-shell inspection page.
    const coatedPage = await context.newPage();
    coatedPage.on('pageerror', (error) => report.browserErrors.push(error.message));
    try {
      const response = await coatedPage.goto(url + '?oxide=1', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      assert.equal(response.status(), 200);
      await coatedPage.waitForFunction(
        () => document.body.dataset.physicalFacetReady === 'true',
        null,
        { timeout: 45000 },
      );
      await waitForPaint(coatedPage);
      const evidence = await coatedPage.evaluate(() => window.WaferCadPhysicalFacetEvidence);
      assert.equal(evidence.productionHost.rendererState, 'ready');
      assert.equal(evidence.productionHost.rendererPhase, 'complete');
      assert.equal(evidence.productionHost.oxideTriangleCount, 25008);
      assert.equal(evidence.physicalOxideTriangles, 25008);
      assert.equal(evidence.oxideSectionRegions, 2);
      assert.equal(evidence.productionHost.owner, 'wafercad-physical-pyramid-slab-v1');
      const visible = await coatedPage.evaluate(() => {
        const threeCanvas = document.querySelector('#physicalThree canvas');
        const sectionCanvas = document.querySelector('#physicalSection');
        if (!threeCanvas || !sectionCanvas) {
          throw new Error('Native physical Si/SiO2 3D or Section canvas is missing');
        }
        const pixels = sectionCanvas
          .getContext('2d')
          .getImageData(0, 0, sectionCanvas.width, sectionCanvas.height).data;
        let orangeSamples = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 155 && pixels[i + 1] > 70 && pixels[i + 1] < 180 && pixels[i + 2] < 120) {
            orangeSamples++;
          }
        }
        return {
          threeWidth: threeCanvas.width,
          threeHeight: threeCanvas.height,
          oxideSectionSamples: orangeSamples,
        };
      });
      assert.ok(visible.threeWidth > 100 && visible.threeHeight > 100);
      assert.ok(visible.oxideSectionSamples > 10, 'Native physical Section must show SiO2');
      const threeShot = 'physical-oxide-three.png';
      const sectionShot = 'physical-oxide-section.png';
      await coatedPage.screenshot({ path: resolve(dir, threeShot), fullPage: true });
      await coatedPage.locator('#physicalSection').screenshot({
        path: resolve(dir, sectionShot),
      });
      report.pictures.push(
        { angle: 'oxide-native-3d', name: threeShot },
        { angle: 'oxide-native-section', name: sectionShot },
      );
      report.coated = { evidence, visible };
    } finally {
      await coatedPage.close();
    }
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
