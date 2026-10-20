// Production-v2 saved-project loading benchmark. The existing T-CMOS mode remains
// unchanged in scope; --welcome enumerates EVERY shipped Welcome project.
// No model/Recipe/History mutations, benchmark-only browser instrumentation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';

const welcomeMode = process.argv.includes('--welcome');
const sampleCount = Number(process.env.WAFERCAD_PERF_REPEATS || (welcomeMode ? 3 : 2));
const shardIndex = Number(process.env.WAFERCAD_PERF_SHARD_INDEX || 0);
const shardCount = Number(process.env.WAFERCAD_PERF_SHARD_COUNT || 1);
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 10);
assert.ok(Number.isInteger(shardCount) && shardCount >= 1 && shardCount <= 9);
assert.ok(Number.isInteger(shardIndex) && shardIndex >= 0 && shardIndex < shardCount);

const oldTcmos = resolve('test-results/tcmos');
const projects = welcomeMode
  ? BUNDLED_EXAMPLES.map((example) => ({
      id: example.id,
      path: resolve('site', example.path.replace(/^\.\//, '')),
    }))
  : [
      { id: 'tcmos-1x1', path: resolve(oldTcmos, 'tcmos-ternary-inverter-130nm.wafercad') },
      {
        id: 'tcmos-native-4x4',
        path: resolve(oldTcmos, 'tcmos-inverter-4x4-RECIPE-EXPERIMENT.wafercad'),
      },
      {
        id: 'tcmos-routed-4x4',
        path: resolve(oldTcmos, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-PROTOTYPE.wafercad'),
      },
      {
        id: 'microdisk-72-band',
        path: resolve('site/examples/suspended-silica-microdisks-adaptive.wafercad'),
      },
    ];
assert.equal(new Set(projects.map((item) => item.id)).size, projects.length);
assert.ok(projects.length > 0);
const selected = projects.filter((_, index) => index % shardCount === shardIndex);
assert.ok(selected.length, 'Benchmark shard selected no projects');
const dir = welcomeMode ? resolve('test-results/welcome-load-baseline') : oldTcmos;
const output = resolve(
  dir,
  welcomeMode ? `shard-${shardIndex}-of-${shardCount}.json` : 'cold-open-timing.json',
);
await mkdir(dir, { recursive: true });
const report = {
  schema: 'wafercad-welcome-loading-v1',
  scope: welcomeMode ? 'all-shipped-welcome' : 'tcmos-compatibility',
  sourceSha: process.env.GITHUB_SHA || 'local-unidentified',
  catalogIds: projects.map((project) => project.id),
  shard: { index: shardIndex, count: shardCount },
  samplesPerProject: sampleCount,
  environment: {
    node: process.version,
    platform: platform(),
    cpus: cpus().length,
    totalMemoryBytes: totalmem(),
    headful: process.env.WAFERCAD_BENCH_HEADFUL === '1',
    viewport: { width: 1440, height: 950 },
    freshBrowserProcess: true,
    osFileCachePurged: false,
    warmOtherViews: true,
  },
  samples: [],
};

// Wrapper observes real project-worker messages. It does NOT intercept, fake,
// delay, or modify worker input/output. Internal worker timings use its own
// performance clock; events use the page's performance clock.
const watchProjectWorker = () => {
  window.__wafercadImportRuns = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      if (!String(url).includes('project-worker.js')) return;
      const trace = { created: performance.now() };
      window.__wafercadImportRuns.push(trace);
      const post = this.postMessage.bind(this);
      this.postMessage = (...args) => {
        trace.started = performance.now();
        return post(...args);
      };
      this.addEventListener('message', ({ data }) => {
        if (data?.type === 'progress') {
          (trace.progress ||= []).push({ at: performance.now(), stage: data.stage });
        } else if (data?.type === 'done') {
          trace.done = performance.now();
          trace.workerTimingsMs = data.timingsMs || null;
        } else if (data?.type === 'error') {
          trace.error = data.message;
        }
      });
    }
  };
};
const time = (ms) => +ms.toFixed(1);
const renderMetricNames = [
  'rendererTopologyMs',
  'rendererSmoothCapsMs',
  'rendererSidewallsMs',
  'rendererAnnotationsMs',
  'rendererAssemblyMs',
  'rendererPresentationMs',
  'rendererRoughMs',
  'rendererPreviewReadyMs',
  'rendererFinalReadyMs',
  'rendererFrameMs',
  'rendererDrawCalls',
  'rendererDrawTriangles',
  'sceneVisibleObjectCount',
  'sceneGeometryCount',
  'sceneMaterialCount',
  'surfacePlanBuildCount',
  'roughMeshTriangleCount',
];
async function chooseView(page, view) {
  const domain = view === 'mask' ? 'mask' : 'project';
  await page.locator(`.p-nav [data-action="domain:${domain}"]`).click();
  const dock = page.locator(`[data-action="dock:view:${view}"]:visible`).first();
  if (await dock.count()) {
    if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
  } else {
    const fallback = page.locator(`[data-action="view:${view}"]:visible`).first();
    if (await fallback.count()) await fallback.click();
    else
      await page
        .getByRole('button', { name: view === 'three' ? '3D' : 'Section', exact: true })
        .first()
        .click();
  }
  await page.locator(`#${view}Panel`).waitFor({ state: 'visible', timeout: 30000 });
}
async function visibleCanvas(page, view) {
  await page.waitForFunction(
    (viewName) => {
      const panel = document.querySelector(`#${viewName}Panel`);
      if (!panel || panel.getBoundingClientRect().width === 0) return false;
      const canvases = [...panel.querySelectorAll('canvas')];
      return canvases.some((canvas) => canvas.width > 0 && canvas.height > 0);
    },
    view,
    { timeout: 30000 },
  );
  await waitForPaint(page);
}

let failures = 0;
for (const project of selected) {
  const readStart = performance.now();
  const bytes = await readFile(project.path);
  const diskReadMs = time(performance.now() - readStart);
  const parseStart = performance.now();
  const parsed = JSON.parse(bytes.toString('utf8'));
  const jsonParseMs = time(performance.now() - parseStart);
  const projectName = parsed.name;
  assert.ok(projectName, `${project.id}: missing project name`);
  const inputSha256 = createHash('sha256').update(bytes).digest('hex');
  for (let repeat = 1; repeat <= sampleCount; repeat += 1) {
    const result = {
      id: project.id,
      repeat,
      bytes: bytes.length,
      inputSha256,
      projectName,
      diskReadMs,
      jsonParseMs,
      status: 'running',
    };
    let browser, context;
    try {
      const bootStart = performance.now();
      browser =
        process.env.WAFERCAD_BENCH_HEADFUL === '1'
          ? await chromium.launch({
              headless: false,
              ...(process.env.WAFERCAD_CHROMIUM
                ? { executablePath: process.env.WAFERCAD_CHROMIUM }
                : {}),
              args: [
                '--enable-unsafe-swiftshader',
                '--use-angle=swiftshader',
                '--ignore-gpu-blocklist',
                '--no-sandbox',
                '--disable-dev-shm-usage',
              ],
            })
          : await launchBrowser();
      result.chromiumVersion = browser.version();
      const opened = await newUiPage(browser, { viewport: report.environment.viewport });
      context = opened.context;
      const page = opened.page;
      await page.addInitScript(watchProjectWorker);
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      result.browserContextMs = time(performance.now() - bootStart);
      const navigationStart = performance.now();
      await page.goto(
        (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') + '/app.html?start=empty',
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      result.workstationReadyMs = time(performance.now() - navigationStart);
      await page.locator('.p-nav [data-action="domain:project"]').click();
      const openStart = performance.now();
      await page.locator('#openProjectInput').setInputFiles(project.path);
      const confirm = page.getByRole('button', { name: 'Open project', exact: true });
      if (await confirm.isVisible()) await confirm.click();
      await page.waitForFunction(
        (name) => {
          const snapshot = window.WaferCadV2Workstation?.snapshot();
          return snapshot?.projectName === name && snapshot.model?.layers?.length > 0;
        },
        projectName,
        { timeout: 240000, polling: 250 },
      );
      result.projectReadyMs = time(performance.now() - openStart);
      result.worker = await page.evaluate(() => {
        const trace = window.__wafercadImportRuns?.at(-1);
        return trace
          ? {
              elapsedMs: trace.started && trace.done ? trace.done - trace.started : null,
              timingsMs: trace.workerTimingsMs || null,
              doneToSnapshotMs: trace.done ? performance.now() - trace.done : null,
              progress: trace.progress?.map((item) => item.stage) || [],
              error: trace.error || null,
            }
          : null;
      });
      result.historyMeasures = await page.evaluate(() =>
        performance
          .getEntriesByType('measure')
          .filter((entry) => entry.name.startsWith('wafercad:history:'))
          .map(({ name, duration }) => ({ name, durationMs: duration })),
      );
      // 3D is selected immediately after Open: this preserves the previously
      // accepted navigation-to-3D latency definition (not warm after Mask).
      const threeStart = performance.now();
      await chooseView(page, 'three');
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
        { timeout: 240000 },
      );
      await waitForPaint(page);
      result.threeReadyMs = time(performance.now() - threeStart);
      result.navigationToThreeMs = time(performance.now() - navigationStart);
      result.threeScene = await page.locator('#threeHost').evaluate(
        (host, names) => ({
          state: host.dataset.renderState,
          phase: host.dataset.renderPhase,
          failure: host.dataset.rendererBuildFailure || null,
          metrics: Object.fromEntries(
            names.map((name) => [
              name,
              host.dataset[name] == null || host.dataset[name] === ''
                ? null
                : Number(host.dataset[name]),
            ]),
          ),
        }),
        renderMetricNames,
      );
      assert.ok(result.threeScene.metrics.sceneVisibleObjectCount > 0);
      if (repeat === 1) {
        await page.locator('#threePanel').screenshot({
          path: resolve(dir, `baseline-${project.id}-three.png`),
        });
      }
      if (welcomeMode) {
        // Main/Mask/Section are measured AFTER the 3D pass. These are warm
        // inspection-view costs and must never be presented as cold starts.
        result.warmViewsMs = {};
        for (const view of ['main', 'mask', 'section']) {
          const viewStart = performance.now();
          await chooseView(page, view);
          await visibleCanvas(page, view);
          result.warmViewsMs[view] = time(performance.now() - viewStart);
          if (view === 'section' && repeat === 1) {
            await page.locator('#sectionPanel').screenshot({
              path: resolve(dir, `baseline-${project.id}-section.png`),
            });
          }
        }
      }
      result.pageErrors = pageErrors;
      assert.deepEqual(pageErrors, [], 'Browser runtime errors while loading example');
      result.status = 'pass';
      console.log('WAFERCAD_WELCOME_LOADING_SAMPLE ' + JSON.stringify(result));
    } catch (error) {
      failures++;
      result.status = 'fail';
      result.error = error.stack || String(error);
      console.error('WAFERCAD_WELCOME_LOADING_FAILED ' + JSON.stringify(result));
    } finally {
      report.samples.push(result);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }
  }
}
assert.equal(failures, 0, `${failures} actual Chromium project-load samples failed`);
console.log(
  'WAFERCAD_WELCOME_LOADING_DONE ' + JSON.stringify({ output, count: report.samples.length }),
);
