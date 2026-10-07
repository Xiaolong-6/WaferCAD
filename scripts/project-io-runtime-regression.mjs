import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  installPinnedThreeRoute,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  openFunctionPanel,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';
import { nativeApply } from './test-helpers/native-fig3.mjs';
await loadGeometryKernel();
const { createModel } = await import('../site/model.js');
const { rectMulti, pointInMulti } = await import('../site/vector-geometry.js');
const io = await import('../site/project-io.js');
const { migrateProjectFile } = await import('../site/project-schema.js');
const dir = new URL('../test-results/generic-io/runtime/', import.meta.url);
await mkdir(dir, { recursive: true });
const model = createModel({ shape: 'rect', width: 3000, height: 3000, thickness: 500 });
const p = migrateProjectFile(
  projectForBenchmark({ model, section: { a: [-1400, 0], b: [1400, 0] } }),
);
p.display.threeShowBorders = false;
p.layout.root = 'IO_PERF';
p.layout.name = 'Repeated process masks';
p.layout.hierarchy = { IO_PERF: [] };
p.layout.elements = Array.from({ length: 400 }, (_, i) => ({
  kind: 'polygon',
  sourceCell: 'IO_PERF',
  layer: 9,
  datatype: 0,
  points: rectMulti(8, 6, ((i % 20) - 9.5) * 100, (Math.floor(i / 20) - 9.5) * 100)[0][0].slice(
    0,
    -1,
  ),
}));
p.layout.combos = [{ key: 'IO_PERF|9|0', cell: 'IO_PERF', layer: 9, datatype: 0, count: 400 }];
p.activeCell = 'IO_PERF';
p.selectedLayerKeys = ['IO_PERF|9|0'];
const input = new URL('before-process.wafercad', dir);
await writeFile(input, io.serializeProject(p));
const browser = await chromium.launch({
  headless: process.env.WAFERCAD_HEADFUL !== '1',
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
const errors = [];
let frames = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  await installPinnedThreeRoute(context);
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__ioRuntime = [];
    window.__ioFrames = 0;
    const frame = () => {
      window.__ioFrames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        let run;
        const post = this.postMessage.bind(this);
        this.postMessage = (...args) => {
          run = { url: String(url), start: performance.now() };
          window.__ioRuntime.push(run);
          return post(...args);
        };
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'done' || data.type === 'error') {
            run.elapsedMs = performance.now() - run.start;
            run.type = data.type;
            run.byteLength = data.byteLength;
          }
        });
      }
    };
  });
  await page.goto(baseUrl + '/app.html', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  async function open(file) {
    const start = performance.now();
    await page.locator('#openProjectInput').setInputFiles(file);
    await chooseConfirmation(page);
    await page.waitForFunction(() =>
      document.getElementById('statusText').textContent.startsWith('Opened '),
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 300000);
    return performance.now() - start;
  }
  async function save(name) {
    await openFunctionPanel(page, 'project');
    const start = performance.now(),
      downloadPromise = page.waitForEvent('download', { timeout: 300000 });
    await page.locator('#exportProjectBtn').click();
    const download = await downloadPromise;
    const path = new URL(name + '.wafercad', dir).pathname.replace(/^\/(\w:)/, '$1');
    await download.saveAs(path);
    const exportMs = performance.now() - start;
    const bytes = await readFile(path),
      stored = JSON.parse(bytes),
      project = io.expandProjectStorage(structuredClone(stored));
    await closeFunctionPanel(page);
    return { path, bytes: bytes.length, exportMs, encoding: stored.storage.encoding, project };
  }
  await open(input.pathname.replace(/^\/(\w:)/, '$1'));
  const initial = await save('initial');
  const direct = await nativeApply(page, {
    type: 'add',
    name: 'Perf islands',
    thickness: 0.0404,
    layer: 9,
    growth: 'direct',
  });
  assert.equal(direct.passed, true, direct.status);
  await waitForThreeReady(page, 300000);
  const prior = await save('before-conformal');
  const conformal = await nativeApply(page, {
    type: 'add',
    name: 'Perf conformal',
    thickness: 0.01,
    growth: 'conformal',
    area: 'full',
  });
  assert.equal(conformal.passed, true, conformal.status);
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 300000);
  const exported = await save('after-conformal');
  assert.equal(exported.encoding, 'shared-assets-v3');
  assert.equal(
    exported.project.snapshotBranches.nodes.length,
    initial.project.snapshotBranches.nodes.length + 2,
  );
  assert.deepEqual(
    exported.project.snapshotBranches.nodes.slice(0, prior.project.snapshotBranches.nodes.length),
    prior.project.snapshotBranches.nodes,
  );
  const coating = exported.project.model.layers.find((l) => l.name === 'Perf conformal');
  assert.ok(coating);
  const walls = exported.project.model.regions
    .flatMap((r) => r.stack)
    .filter((s) => s.layerId === coating.id && s.role === 'conformal-sidewall');
  assert.ok(walls.length > 0, 'Native finite-height sidewalls must be present');
  for (let i = 0; i < 400; i++) {
    const point = [((i % 20) - 9.5) * 100 + 4.005, (Math.floor(i / 20) - 9.5) * 100];
    const owners = exported.project.model.regions.filter((r) => pointInMulti(point, r.geom));
    assert.equal(owners.length, 1, 'Each native sidewall must have one material owner');
    assert.ok(
      owners[0].stack.some((s) => s.layerId === coating.id && s.role === 'conformal-sidewall'),
      'The 10 nm native conformal wall must survive storage at every island',
    );
  }
  const reopenedMs = await open(exported.path);
  const reopened = await save('reopened');
  assert.deepEqual(reopened.project.model, exported.project.model);
  assert.deepEqual(
    reopened.project.snapshotBranches.nodes,
    exported.project.snapshotBranches.nodes,
  );
  const comparable = structuredClone(reopened.project.snapshotBranches);
  let cameraMaxDifference = 0;
  for (let i = 0; i < comparable.branches.length; i++) {
    const actual = comparable.branches[i].headState.display.threeCamera,
      expected = exported.project.snapshotBranches.branches[i].headState.display.threeCamera;
    assert.equal(actual.fov, expected.fov);
    for (const key of ['position', 'target'])
      for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(actual[key][axis] - expected[key][axis]);
        assert.ok(delta < 1e-8, 'Orbit camera restore must stay within floating-point roundoff');
        cameraMaxDifference = Math.max(cameraMaxDifference, delta);
      }
    // OrbitControls recomputes the live HEAD camera at ULP scale. Every
    // recorded Step and every other HEAD value, including geometry, stays exact.
    comparable.branches[i].headState.display.threeCamera = structuredClone(expected);
  }
  assert.deepEqual(comparable, exported.project.snapshotBranches);
  const etch = await nativeApply(page, {
    type: 'etch',
    name: 'Perf continued etch',
    thickness: 0.01,
    target: 'Perf conformal',
    area: 'full',
  });
  assert.equal(etch.passed, true, etch.status);
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 300000);
  const final = await save('continued');
  assert.equal(
    final.project.snapshotBranches.nodes.length,
    exported.project.snapshotBranches.nodes.length + 1,
  );
  for (let i = 0; i < 400; i++) {
    const point = [((i % 20) - 9.5) * 100, (Math.floor(i / 20) - 9.5) * 100];
    const owners = final.project.model.regions.filter((r) => pointInMulti(point, r.geom));
    assert.equal(owners.length, 1);
    const metal = final.project.model.layers.find((l) => l.name === 'Perf islands');
    const thickness = owners[0].stack
      .filter((s) => s.layerId === metal.id)
      .reduce((n, s) => n + s.z1 - s.z0, 0);
    assert.ok(
      Math.abs(thickness - 0.0404) < 0.000001,
      'Continued etch must retain the physical island metal',
    );
    assert.equal(
      owners[0].stack.some((s) => s.layerId === coating.id),
      false,
      'Directional etch must open the top coating at every island center',
    );
  }
  const workers = await page.evaluate(() => window.__ioRuntime);
  frames = await page.evaluate(() => window.__ioFrames);
  await page.screenshot({ path: new URL('continued.png', dir).pathname.replace(/^\/(\w:)/, '$1') });
  assert.deepEqual(errors, []);
  const report = {
    browserVersion: browser.version(),
    sites: 400,
    operations: [direct, conformal, etch],
    nativeSidewallSegments: walls.length,
    nativeSidewallSites: 400,
    exportedBytes: exported.bytes,
    exportMs: exported.exportMs,
    reopenedMs,
    steps: final.project.snapshotBranches.nodes.length,
    physicalModelAndHistoryRoundTripEqual: true,
    cameraMaxDifference,
    continuedProcessPassed: true,
    physicalMetalAndContactChecks: 400,
    workers,
    frames,
    errors,
  };
  await writeFile(new URL('report.json', dir), JSON.stringify(report, null, 2));
  console.log('GENERIC_IO_RUNTIME', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
