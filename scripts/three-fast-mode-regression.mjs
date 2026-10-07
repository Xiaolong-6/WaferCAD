import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  baseUrl,
  installPinnedThreeRoute,
  waitForAppReady,
  observePageErrors,
} from './test-helpers/ui.mjs';
import { loadProject, exportCurrentProject } from './test-helpers/product-scientific.mjs';

const inspectionOnly = process.argv.includes('--inspection-only');
await loadGeometryKernel();
const { createModel, applyOperation } = await import('../site/model.js');
const { rectMulti } = await import('../site/vector-geometry.js');
const model = createModel({ shape: 'circle', width: 76200, height: 76200, thickness: 500 });
const apply = (params) => {
  const result = applyOperation(model, params);
  assert.equal(result.changed, true, result.error);
};
const surface = {
  kind: 'rough',
  morphology: 'pyramid',
  polarity: 'normal',
  featureSize: 0.5,
  meanHeight: 0.6,
  featureCv: 0.2,
  heightCv: 0.2,
  seed: 151,
  geometryMode: 'ideal',
};
for (const face of ['front', 'back'])
  apply({
    type: 'etch',
    name: 'Full-wafer texture',
    thickness: 1,
    face,
    area: model.boundary,
    surface: { ...surface },
  });
apply({ type: 'etch', thickness: 2, face: 'front', area: rectMulti(140, 100) });
apply({
  type: 'implant',
  name: 'Front implant envelope',
  thickness: 0.25,
  face: 'front',
  area: rectMulti(500, 400),
  color: '#9B5DE5',
});
apply({
  type: 'add',
  name: 'Conformal coating',
  thickness: 0.1,
  face: 'front',
  area: model.boundary,
  growth: 'conformal',
  color: '#6C8EBF',
});
const { serializeProject, readProjectFile } = await import('../site/project-io.js');
const fixtureText = serializeProject(
  projectForBenchmark({ model, section: { a: [-200, 0], b: [200, 0] } }),
);
const project = await readProjectFile({
  size: Buffer.byteLength(fixtureText),
  text: async () => fixtureText,
});
project.display.threeShowBorders = false;
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await installPinnedThreeRoute(context);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = observePageErrors(page);
  await page.addInitScript(() => {
    window.__roughRuns = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (!String(url).includes('rough-mesh-worker.js')) return;
        let run;
        const post = this.postMessage.bind(this);
        this.postMessage = (...args) => {
          run = {
            started: performance.now(),
            analyticNormals: args[0].tasks?.[0]?.geometry?.analyticNormals,
          };
          window.__roughRuns.push(run);
          return post(...args);
        };
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'done') run.workerMs = performance.now() - run.started;
        });
      }
    };
  });
  await page.goto(`${baseUrl}/app.html`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await loadProject(page, project, 'full-wafer-rough-conformal-implant');
  await page.waitForFunction(() =>
    /Saved locally/.test(document.getElementById('workspaceSaveStatus').textContent),
  );
  await page.locator('#threeMaxBtn').click();
  const waitStatic = async (mode) =>
    page.waitForFunction((mode) => {
      const host = document.getElementById('threeHost'),
        canvas = host.querySelector('canvas');
      return (
        host.dataset.renderState === 'ready' &&
        host.dataset.renderQuality === mode &&
        canvas?.dataset.roughMeshMode === 'detailed' &&
        canvas.dataset.roughMeshWorker === 'true'
      );
    }, mode);
  const probe = () =>
    page.evaluate(() => {
      const host = document.getElementById('threeHost'),
        canvas = host.querySelector('canvas');
      return {
        quality: host.dataset.renderQuality,
        topology: host.dataset.surfaceTopology,
        layerIds: host.dataset.materialLayerIds,
        triangles: Number(canvas.dataset.roughTriangleCount),
        subdivisionTriangles: Number(canvas.dataset.roughSubdivisionTriangleCount),
        budget: Number(canvas.dataset.roughSceneTriangleBudget),
        sidewallTriangles: Number(host.dataset.sidewallTriangleCount),
        implantCutCount: host.dataset.implantCutCount,
        implantInternalCount: host.dataset.implantInternalCount,
        main: document.getElementById('mainCanvas').toDataURL(),
        section: document.getElementById('sectionCanvas').toDataURL(),
      };
    });
  assert.equal(await page.locator('#threeFastBtn').getAttribute('aria-pressed'), 'true');
  await waitStatic('fast');
  const first = await probe();
  const modes = [];
  for (let repeat = 0; repeat < (inspectionOnly ? 0 : 3); repeat++) {
    for (const mode of ['quality', 'fast']) {
      const started = performance.now();
      await page.locator('#threeFastBtn').click();
      await waitStatic(mode);
      const result = await probe();
      const lastWorker = await page.evaluate(() =>
        window.__roughRuns.filter((run) => run.workerMs != null).at(-1),
      );
      assert.equal(result.topology, first.topology);
      assert.equal(result.layerIds, first.layerIds);
      assert.equal(result.main, first.main);
      assert.equal(result.section, first.section);
      assert.ok(result.subdivisionTriangles <= result.budget);
      const { main, section, ...summary } = result;
      modes.push({
        repeat,
        ...summary,
        rebuildMs: performance.now() - started,
        workerMs: lastWorker.workerMs,
      });
      if (repeat === 0) {
        await mkdir('test-results/three-fast', { recursive: true });
        await page
          .locator('#threePanel')
          .screenshot({ path: `test-results/three-fast/${mode}.png` });
      }
    }
  }
  const fast = modes.filter((run) => run.quality === 'fast'),
    quality = modes.filter((run) => run.quality === 'quality');
  const median = (runs, key) => runs.map((run) => run[key]).sort((a, b) => a - b)[1];
  if (!inspectionOnly) {
    assert.ok(median(fast, 'triangles') < median(quality, 'triangles'));
    assert.ok(median(fast, 'workerMs') < median(quality, 'workerMs'));
  }
  const box = await page.locator('#threeHost canvas').boundingBox();
  const cachedCounts = await page.locator('#threeHost canvas').evaluate((canvas) => ({
    plan: canvas.dataset.surfacePlanBuildCount,
    zones: canvas.dataset.roughSpatialZoneBuildCount,
    base: canvas.dataset.roughBaseTriangulationCount,
  }));
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.53, { steps: 12 });
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost').dataset.renderQuality === 'interactive' &&
      document.querySelector('#threeHost canvas').dataset.roughMeshMode === 'interactive',
  );
  const interactiveFps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = (now) => {
          frames++;
          if (now - start < 1500) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  const interactive = await probe();
  assert.ok(interactive.subdivisionTriangles <= interactive.budget);
  assert.ok(interactive.budget < first.budget);
  await page.mouse.up();
  await waitStatic('fast');
  const afterDrag = await page.locator('#threeHost canvas').evaluate((canvas) => ({
    plan: canvas.dataset.surfacePlanBuildCount,
    zones: canvas.dataset.roughSpatialZoneBuildCount,
    base: canvas.dataset.roughBaseTriangulationCount,
  }));
  assert.deepEqual(
    afterDrag,
    cachedCounts,
    'Camera interaction must reuse ownership, spatial zones and base triangulation.',
  );
  const inspection = [];
  if (inspectionOnly) {
    await page.locator('#threeMaxBtn').click();
    const roiProject = structuredClone(project);
    roiProject.roi = { type: 'rect', a: [-200, -150], b: [200, 150] };
    roiProject.display.threeCamera = { position: [400, -500, 400], target: [0, 0, 0], fov: 34 };
    await loadProject(page, roiProject, 'roi-rough-conformal-implant');
    await page.locator('#threeMaxBtn').click();
    await waitStatic('fast');
    const roiFirst = await probe();
    assert.ok(
      Number(roiFirst.implantCutCount) > 0,
      'Opaque ROI must expose the surviving Implant cut.',
    );
    for (const opacity of [1, 0.55]) {
      await page.locator('#threeOpacityRange').evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, opacity);
      await waitStatic('fast');
      const fastView = await probe();
      if (opacity < 1) assert.ok(Number(fastView.implantInternalCount) > 0);
      await page.locator('#threeFastBtn').click();
      await waitStatic('quality');
      const qualityView = await probe();
      for (const key of [
        'topology',
        'layerIds',
        'implantCutCount',
        'implantInternalCount',
        'main',
        'section',
      ]) {
        assert.equal(fastView[key], qualityView[key], `ROI ${opacity}: ${key}`);
      }
      inspection.push({
        opacity,
        topology: fastView.topology,
        layerIds: fastView.layerIds,
        implantCuts: Number(fastView.implantCutCount),
        internalImplants: Number(fastView.implantInternalCount),
      });
      await page
        .locator('#threePanel')
        .screenshot({ path: `test-results/three-fast/roi-quality-${opacity}.png` });
      await page.locator('#threeFastBtn').click();
      await waitStatic('fast');
      await page
        .locator('#threePanel')
        .screenshot({ path: `test-results/three-fast/roi-fast-${opacity}.png` });
    }
  }
  await page.locator('#threeMaxBtn').click();
  const exported = await exportCurrentProject(page, 120000);
  assert.deepEqual(
    exported.model,
    project.model,
    'Mode changes must preserve exact physical geometry and annotations.',
  );
  assert.equal(exported.display.threeFastMode, true);
  await page.locator('#threeFastBtn').click();
  await page.waitForFunction(
    () => document.getElementById('threeFastBtn').getAttribute('aria-pressed') === 'false',
  );
  await page.waitForFunction(() =>
    /Saved locally/.test(document.getElementById('workspaceSaveStatus').textContent),
  );
  // Wait for the lightweight view record rather than a pre-existing Saved label.
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('wafercad.workspace.view.v1') || 'null')?.state?.display
        ?.threeFastMode === false,
  );
  await page.reload();
  await waitForAppReady(page);
  await page.waitForFunction(() =>
    document.getElementById('statusText').textContent.startsWith('Restored local workspace'),
  );
  assert.equal(await page.locator('#threeFastBtn').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
  const report = {
    browser: browser.version(),
    model: {
      width: model.width,
      regions: model.regions.length,
      layers: model.layers.length,
      implants: model.implants.length,
    },
    modes,
    inspection,
    medianFastWorkerMs: median(fast, 'workerMs'),
    medianQualityWorkerMs: median(quality, 'workerMs'),
    medianFastRebuildMs: median(fast, 'rebuildMs'),
    medianQualityRebuildMs: median(quality, 'rebuildMs'),
    interactive: {
      triangles: interactive.triangles,
      budget: interactive.budget,
      fps: interactiveFps,
    },
    errors,
  };
  await writeFile(
    inspectionOnly
      ? 'test-results/three-fast/inspection.json'
      : 'test-results/three-fast/report.json',
    JSON.stringify(report, null, 2),
  );
  console.log('WaferCAD 3D Fast regression: OK', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
