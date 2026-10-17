// Actual v2 Workstation shell, project-file reader, native 3D and Section.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiContext, waitForPaint } from '../test-helpers/ui.mjs';

const directory = resolve('test-results/physical-facet-workstation');
await mkdir(directory, { recursive: true });
const port = '4192';
const server = spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
  cwd: resolve('.'),
  env: { ...process.env, WAFERCAD_V2_PORT: port },
  stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}/app.html?preview=1&physicalFacet=1`;
const evidence = { result: 'running', views: [], browserErrors: [] };
let browser;

try {
  let started = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(base)).ok) {
        started = true;
        break;
      }
    } catch {
      // Static server is starting.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(started, 'Workstation must start on localhost');
  browser = await launchBrowser();
  evidence.chromium = browser.version();
  const context = await newUiContext(browser, {
    viewport: { width: 1340, height: 900 },
  });
  try {
    for (const view of ['three', 'section']) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(base + '&view=' + view, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      assert.equal(response.status(), 200);
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true',
        null,
        { timeout: 45000 },
      );
      assert.equal(
        await page.locator('body').getAttribute('data-physical-facet-preview'),
        'read-only',
      );
      assert.equal(await page.locator('body').getAttribute('data-preview-mode'), 'true');
      let metrics;
      if (view === 'three') {
        await page.waitForFunction(
          () => document.querySelector('#threeHost')?.dataset.renderState === 'ready',
          null,
          { timeout: 45000 },
        );
        metrics = await page.evaluate(() => {
          const host = document.getElementById('threeHost');
          const canvas = host.querySelector('canvas');
          return {
            phase: host.dataset.renderPhase,
            triangles: Number(host.dataset.physicalFacetTriangles),
            owner: host.dataset.physicalFacetOwner,
            axesHidden: host.dataset.physicalFacetAxesHidden,
            canvasWidth: canvas?.width,
            canvasHeight: canvas?.height,
          };
        });
        assert.equal(metrics.phase, 'complete');
        assert.equal(metrics.triangles, 80);
        assert.equal(metrics.owner, 'wafercad-physical-pyramid-slab-v1');
        assert.equal(metrics.axesHidden, 'true');
        assert.ok(metrics.canvasWidth > 100 && metrics.canvasHeight > 100);
      } else {
        await page.waitForFunction(
          () => Boolean(document.getElementById('sectionCanvas')?.dataset.physicalFacetOwner),
          null,
          { timeout: 45000 },
        );
        metrics = await page.evaluate(() => {
          const canvas = document.getElementById('sectionCanvas');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let colored = 0;
          for (let i = 0; i < pixels.length; i += 16) {
            if (pixels[i] < 210 && pixels[i + 1] < 210) colored++;
          }
          return {
            owner: canvas.dataset.physicalFacetOwner,
            zMin: Number(canvas.dataset.zMinUm),
            zMax: Number(canvas.dataset.zMaxUm),
            coloredSamples: colored,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
          };
        });
        assert.equal(metrics.owner, 'wafercad-physical-pyramid-slab-v1');
        assert.equal(metrics.zMin, -130);
        assert.equal(metrics.zMax, 130);
        assert.ok(metrics.coloredSamples > 300, 'Native Section must contain real colored physical material');
      }
      await waitForPaint(page);
      assert.deepEqual(errors, [], view + ' must have no page errors');
      const name = 'workstation-physical-' + view + '.png';
      await page.screenshot({ path: resolve(directory, name), fullPage: true });
      evidence.views.push({ view, screenshot: name, metrics });
      await page.close();
    }
  } finally {
    await context.close();
  }
  evidence.result = 'captured-unreviewed';
} catch (error) {
  evidence.result = 'failed';
  evidence.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  await browser?.close();
  server.kill();
}
