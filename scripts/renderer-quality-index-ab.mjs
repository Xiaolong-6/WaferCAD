// Phase B.1 same-run ON/OFF/FF/ON trial of exact indexed transparent
// material walls. Never enables this experimental display path for users.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const out = new URL('../test-results/renderer-quality-index-ab/', import.meta.url);
await mkdir(out, { recursive: true });
const fixture = fileURLToPath(
  new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
);
const browser = await launchBrowser();
const trials = [];
let referenceCanvas = null;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
}

async function trial(enabled, ordinal) {
  // Isolate Project storage and Three.js scene caches, but keep all trials
  // on the same physical CI runner / browser binary.
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    const label = `${ordinal}-${enabled ? 'on' : 'off'}`;
    await page.goto(
      baseUrl + '/app.html' + (enabled ? '?rendererV3QualityIndex=1' : ''),
    );
    await waitForAppReady(page);
    await page.locator('#openProjectInput').setInputFiles(fixture);
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout: 180000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    await page.locator('#threeFastBtn').selectOption('quality');
    await page.waitForFunction(
      () => {
        const el = document.getElementById('threeHost');
        return el?.dataset.renderState === 'ready' && el.dataset.renderQuality === 'quality';
      },
      null,
      { timeout: 180000 },
    );
    // Display menu is reparented inside More on narrow viewports.
    const display = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    const nested = await display.evaluate((el) => Boolean(el.closest('.view-overflow-secondary')));
    if (nested && !(await more.evaluate((el) => el.open))) {
      await more.locator(':scope > summary').click();
    }
    await display.locator(':scope > summary').click();
    const oldSerial = Number(
      await page.locator('#threeHost').evaluate((el) => el.dataset.rendererFrameSerial || 0),
    );
    const began = performance.now();
    await page.locator('#threeOpacityRange').fill('0.5');
    await waitForThreeReady(page, 180000);
    await page.waitForFunction(
      (serial) => {
        const el = document.getElementById('threeHost');
        return (
          el?.dataset.renderState === 'ready' &&
          el.dataset.sceneVariant === 'transparent' &&
          el.dataset.renderQuality === 'quality' &&
          Number(el.dataset.rendererFrameSerial || 0) > serial
        );
      },
      oldSerial,
      { timeout: 180000 },
    );
    // screenshot forces compositor presentation; elapsed includes blocking
    // software-WebGL rendering and the first complete image.
    const canvas = await page.locator('#threeHost canvas').screenshot({
      path: fileURLToPath(new URL(`${label}.png`, out)),
    });
    const completedFrameMs = performance.now() - began;
    const state = await page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
    assert.deepEqual(errors, [], `${label}: no page errors`);
    assert.equal(state.transparentArrayLodTier, 'exact');
    assert.equal(state.v3SkippedTriangles, '0');
    assert.equal(state.rendererDrawTriangles, '57040012', '625-site exact triangle parity');
    assert.equal(state.rendererDrawCalls, '1408', '625-site draw-call parity');
    assert.equal(state.sceneVariant, 'transparent');
    assert.equal(state.renderQuality, 'quality');
    assert.ok(Number(state.rendererFrameMs) > 0);
    if (enabled) {
      assert.ok(Number(state.v3QualityIndexedTriangles) > 10000000);
      assert.equal(
        Number(state.v3QualityOriginalVertices) /
          Number(state.v3QualityIndexedVertices),
        1.5,
        'each indexed quad must represent the exact original six vertices',
      );
    } else {
      assert.equal(state.v3QualityIndexedTriangles, '0');
      assert.equal(state.v3QualityIndexedVertices, '0');
    }
    if (referenceCanvas === null) referenceCanvas = canvas;
    assert.ok(
      canvas.equals(referenceCanvas),
      `${label}: canvas pixels differ from the same-pose original frame; fail closed`,
    );
    const result = {
      label,
      enabled,
      completedFrameMs,
      renderFrameMs: Number(state.rendererFrameMs),
      sceneAssemblyMs: Number(state.rendererAssemblyMs),
      indexTriangles: Number(state.v3QualityIndexedTriangles),
      sourceVertices: Number(state.v3QualityOriginalVertices),
      indexedVertices: Number(state.v3QualityIndexedVertices),
      submittedTriangles: Number(state.rendererDrawTriangles),
      drawCalls: Number(state.rendererDrawCalls),
      imageBytes: canvas.length,
      cameraMode: state.transparentArrayLodTier,
      errors,
    };
    console.log('RENDERER_QUALITY_INDEX_AB_TRIAL', JSON.stringify(result));
    return result;
  } finally {
    await context.close();
  }
}

try {
  // Symmetric ordering controls for first-run cache and CI thermal drift.
  for (const [i, enabled] of [true, false, false, true].entries()) {
    trials.push(await trial(enabled, i + 1));
  }
  const on = trials.filter((x) => x.enabled);
  const off = trials.filter((x) => !x.enabled);
  const offMedianMs = median(off.map((x) => x.completedFrameMs));
  const onMedianMs = median(on.map((x) => x.completedFrameMs));
  const report = {
    mode: 'same-run-abba',
    fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad',
    viewport: '1440x960',
    browserVersion: browser.version(),
    order: trials.map((x) => x.label),
    trials,
    exactCanvasParity: true,
    onMedianMs,
    offMedianMs,
    elapsedRatioOnToOff: onMedianMs / offMedianMs,
    elapsedDeltaMs: onMedianMs - offMedianMs,
    // Observational diagnostics, not automatically interpreted as a speedup.
    inferSpeedup: false,
  };
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  console.log('RENDERER_QUALITY_INDEX_AB_OK', JSON.stringify(report));
} finally {
  await browser.close();
}
