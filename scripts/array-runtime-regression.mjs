import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel } from './process-benchmarks.mjs';
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
const { pointInMulti } = await import('../site/vector-geometry.js');
const io = await import('../site/project-io.js');
const dir = new URL('../test-results/array-runtime/', import.meta.url);
await mkdir(dir, { recursive: true });
const input = new URL(
  '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
  import.meta.url,
);
const { isArrayModel, arrayParts } = await import('../site/model-array.js');
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
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('PAGEERROR', e.message);
  });
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
            run.arrayWorkingSets = data.result?.arrayWorkingSets;
            run.arrayChangedInstances = data.result?.arrayChangedInstances;
            console.log('WORKER', JSON.stringify(run));
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
    console.log('OPENED');
    return performance.now() - start;
  }
  async function save(name) {
    await openFunctionPanel(page, 'project');
    const start = performance.now(),
      downloadPromise = page.waitForEvent('download', { timeout: 300000 });
    await page.locator('#exportProjectBtn').click();
    const download = await downloadPromise;
    const path = fileURLToPath(new URL(name + '.wafercad', dir));
    await download.saveAs(path);
    console.log('SAVED', name);
    const exportMs = performance.now() - start;
    const bytes = await readFile(path),
      stored = JSON.parse(bytes),
      project = io.expandProjectStorage(structuredClone(stored));
    await closeFunctionPanel(page);
    return { path, bytes: bytes.length, exportMs, encoding: stored.storage.encoding, project };
  }
  const openedMs = await open(fileURLToPath(input));
  await page.screenshot({ path: fileURLToPath(new URL('opened.png', dir)) });
  // Full-wafer SVG keeps every translated tile; the single-device preview is independent.
  await page.locator('#mainPanel .export-control > summary').click();
  let downloading = page.waitForEvent('download');
  await page.locator('#mainExportSvgBtn').click();
  let download = await downloading;
  const svgPath = fileURLToPath(new URL('full-wafer.svg', dir));
  await download.saveAs(svgPath);
  const svg = await readFile(svgPath, 'utf8');
  assert.equal((svg.match(/<use /g) || []).length, 1885);
  await page.locator('#mainPanel .export-control > summary').click();
  await page.locator('#threePanel .export-control > summary').click();
  downloading = page.waitForEvent('download', { timeout: 300000 });
  await page.locator('#threeExportModelBtn').click();
  download = await downloading;
  const glbPath = fileURLToPath(new URL('full-wafer.glb', dir));
  await download.saveAs(glbPath);
  const glbBytes = await readFile(glbPath);
  assert.equal(glbBytes.readUInt32LE(0), 0x46546c67);
  assert.equal(glbBytes.readUInt32LE(8), glbBytes.length);
  const jsonLength = glbBytes.readUInt32LE(12),
    glb = JSON.parse(glbBytes.subarray(20, 20 + jsonLength).toString());
  const binary = glbBytes.subarray(28 + jsonLength);
  assert.ok(glb.extensionsUsed.includes('EXT_mesh_gpu_instancing'));
  const group = glb.nodes.find((n) => n.name === 'WaferCAD');
  assert.deepEqual(group.matrix, [1e-6, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 1]);
  const gatePositions = new Set();
  for (const node of glb.nodes.filter((n) => n.name === 'T3 Gate metal')) {
    const translation = node.extensions?.EXT_mesh_gpu_instancing?.attributes.TRANSLATION;
    if (translation === undefined) continue;
    const accessor = glb.accessors[translation],
      view = glb.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    assert.equal(accessor.type, 'VEC3');
    for (let i = 0; i < accessor.count; i++) {
      const offset =
        (view.byteOffset || 0) + (accessor.byteOffset || 0) + i * (view.byteStride || 12);
      const x = binary.readFloatLE(offset),
        y = binary.readFloatLE(offset + 4);
      gatePositions.add(`${x},${y}`);
    }
  }
  for (let row = -12; row <= 12; row++)
    for (let col = -12; col <= 12; col++)
      assert.ok(
        gatePositions.has(`${col * 1600},${row * 1600}`),
        'Physical gate mesh at every site',
      );
  assert.equal(gatePositions.size, 625);
  await page.locator('#threePanel .export-control > summary').click();
  const initial = await save('initial');
  const direct = await nativeApply(page, {
    type: 'add',
    name: 'Array film',
    thickness: 0.01,
    area: 'full',
  });
  assert.equal(direct.passed, true, direct.status);
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 300000);
  await save('direct');
  const conformal = await nativeApply(page, {
    type: 'add',
    name: 'Array conformal',
    thickness: 0.01,
    layer: 9,
    growth: 'conformal',
  });
  assert.equal(conformal.passed, true, conformal.status);
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 300000);
  const exported = await save('conformal');
  assert.equal(isArrayModel(exported.project.model), true);
  assert.equal(
    exported.project.snapshotBranches.nodes.length,
    initial.project.snapshotBranches.nodes.length + 2,
  );
  const coating = exported.project.model.layers.find((l) => l.name === 'Array conformal');
  assert.ok(coating);
  const originalNames = new Set(initial.project.model.layers.map((l) => l.id));
  const nativeChecks = (actual, reference) => {
    for (const part of arrayParts(actual).filter((p) => p.role === 'device')) {
      const source = arrayParts(reference).find((p) => p.role === 'device').model;
      for (const point of [
        [0, 0],
        [-575, 0],
        [575, 0],
        [0, 150],
        [-700.005, 0],
        [700.005, 0],
      ]) {
        const at = (m) => m.regions.filter((r) => pointInMulti(point, r.geom));
        const owners = at(part.model),
          before = at(source);
        assert.equal(owners.length, 1);
        assert.equal(before.length, 1);
        const physical = (stack) =>
          stack
            .filter((s) => originalNames.has(s.layerId))
            .map((s) => [s.layerId, s.z0, s.z1, s.role || null]);
        assert.deepEqual(
          physical(owners[0].stack),
          physical(before[0].stack),
          `Native metal/contact/wall unchanged at ${part.id}:${point}`,
        );
      }
    }
  };
  nativeChecks(exported.project.model, initial.project.model);
  const walls = arrayParts(exported.project.model)
    .filter((p) => p.role === 'device')
    .map((p) =>
      p.model.regions
        .flatMap((r) => r.stack)
        .filter((s) => s.layerId === coating.id && s.role === 'conformal-sidewall'),
    );
  assert.equal(walls.length, 625);
  assert.ok(
    walls.every((w) => w.length > 0),
    'Native sidewalls at all 625 sites',
  );
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
    name: 'Array continued etch',
    thickness: 0.01,
    target: 'Array conformal',
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
  assert.equal(final.project.model.array.instances.filter((i) => i.role === 'device').length, 625);
  nativeChecks(final.project.model, initial.project.model);
  for (const part of arrayParts(final.project.model).filter((p) => p.role === 'device')) {
    const owners = part.model.regions.filter((r) => pointInMulti([0, 0], r.geom));
    assert.equal(owners.length, 1);
    assert.equal(
      owners[0].stack.some((s) => s.layerId === coating.id),
      false,
      'Continued selective etch removes the 10 nm horizontal coating at every site',
    );
  }
  const workers = await page.evaluate(() => window.__ioRuntime);
  frames = await page.evaluate(() => window.__ioFrames);
  await page.screenshot({ path: fileURLToPath(new URL('continued.png', dir)) });
  assert.deepEqual(errors, []);
  const report = {
    browserVersion: browser.version(),
    sites: 625,
    operations: [direct, conformal, etch],
    nativeSidewallSegments: walls.reduce((n, w) => n + w.length, 0),
    nativeSidewallSites: 625,
    exportedBytes: exported.bytes,
    exportMs: exported.exportMs,
    reopenedMs,
    steps: final.project.snapshotBranches.nodes.length,
    physicalModelAndHistoryRoundTripEqual: true,
    cameraMaxDifference,
    continuedProcessPassed: true,
    nativeMetalAndContactSites: 625,
    initialBytes: initial.bytes,
    openedMs,
    fullWaferSvgInstances: 1885,
    glbGateSites: gatePositions.size,
    glbBytes: glbBytes.length,
    workers,
    frames,
    errors,
  };
  await writeFile(new URL('report.json', dir), JSON.stringify(report, null, 2));
  console.log('ARRAY_IO_RUNTIME', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
