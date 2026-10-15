import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { pr250AuditFixtures } from './pr250-audit-fixtures.mjs';
import { hiddenLinePixelOracle } from './test-helpers/pr250-hidden-line-oracle.mjs';
import { gpuHeightOracle } from './test-helpers/pr250-gpu-height-oracle.mjs';

// Standalone renderer acceptance, independent of application storage/Legacy DOM.
// WAFERCAD_AUDIT_SITE may point to an exact git-archive baseline site snapshot.
const site = resolve(process.env.WAFERCAD_AUDIT_SITE || 'site');
const sourceNames = [
  'three-view.js',
  'rough-mesh-geometry.js',
  'rough-mesh-worker.js',
  'gpu-rough-surface.js',
  'renderer-geometry.js',
  'three-outline-geometry.js',
  'three-outline-pass.js',
  'rough-boundary-profile.js',
];
const sourceHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sourceNames.map(async (name) => [
        name,
        await readFile(resolve(site, name))
          .then((data) => createHash('sha256').update(data).digest('hex'))
          .catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error))),
      ]),
    ),
  );
const initialSourceHashes = await sourceHashes();
const output = resolve(
  process.env.WAFERCAD_AUDIT_OUTPUT || 'output/playwright/pr250-audit/current',
);
await mkdir(output, { recursive: true });
const fixtures = await pr250AuditFixtures();
const { prepareProjectForExport, readProjectFile } = await import('../site/project-io.js');
const { roughProfileOffsetAtPoint } = await import('../site/surface-rendering.js');
const roughProfiles = (value) => {
  if (!value || typeof value !== 'object') return [];
  if (value.kind === 'rough') return [value];
  return Object.values(value).flatMap(roughProfiles);
};
const roundTrips = [];
for (const fixture of fixtures) {
  const exported = prepareProjectForExport(fixture.project);
  const text = JSON.stringify(exported.stored);
  const restored = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  const profileKey = (profile) =>
    JSON.stringify(Object.entries(profile).sort(([a], [b]) => a.localeCompare(b)));
  const orderProfiles = (model) =>
    roughProfiles(model).sort((a, b) => profileKey(a).localeCompare(profileKey(b)));
  const before = orderProfiles(fixture.project.model),
    after = orderProfiles(restored.model);
  assert.equal(after.length, before.length, 'Save/reload must preserve morphology ownership');
  let maximumHeightErrorUm = 0;
  for (let i = 0; i < before.length; i++)
    for (const [x, y] of [
      [0.013, 0.027],
      [-3.11, 1.7],
      [4.2, -2.6],
    ]) {
      maximumHeightErrorUm = Math.max(
        maximumHeightErrorUm,
        Math.abs(
          roughProfileOffsetAtPoint(x, y, before[i]) - roughProfileOffsetAtPoint(x, y, after[i]),
        ),
      );
    }
  assert.equal(maximumHeightErrorUm, 0, 'Save/reload must reproduce deterministic morphology');
  await writeFile(resolve(output, `${fixture.name}.wafercad`), text);
  roundTrips.push({
    name: fixture.name,
    mode: exported.mode,
    profiles: before.length,
    maximumHeightErrorUm,
  });
}
await writeFile(resolve(output, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
const pageSource = `<!doctype html><html><head><style>
html,body{margin:0;background:#f5f7f9;font:14px sans-serif}#host{width:1100px;height:760px}
#stats{position:absolute;bottom:8px;left:12px}canvas{display:block}
</style><script src="/site/vendor/polygon-clipping.umd.js"></script><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><div id="host"></div><div id="stats"></div><script type="module">
import {createThreeView} from '/site/three-view.js';
window.inspection={opacity:1,borders:true,fast:true};window.zCollapse=null;
window.model=null;window.clip=null;
window.view=createThreeView({host:document.querySelector('#host'),stats:document.querySelector('#stats'),
getModel:()=>window.model,getClipGeometry:()=>window.clip,getInspection:()=>window.inspection,getZCollapse:()=>window.zCollapse});
window.boot=true;</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(pageSource);
      return;
    }
    const root = pathname.startsWith('/three/') ? resolve('node_modules/three') : site;
    const relative = pathname.replace(/^\/(three|site)\//, '');
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) throw new Error('Outside static root');
    response.setHeader(
      'Content-Type',
      { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' }[
        extname(file)
      ] || 'application/octet-stream',
    );
    response.setHeader('Cache-Control', 'no-store');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({
  headless: process.env.WAFERCAD_AUDIT_HEADED !== '1',
  ...(process.env.WAFERCAD_AUDIT_ANGLE
    ? {
        args: [
          `--use-angle=${process.env.WAFERCAD_AUDIT_ANGLE}`,
          '--ignore-gpu-blocklist',
          '--force_high_performance_gpu',
        ],
      }
    : {}),
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
});
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  site,
  node: process.version,
  platform: process.platform,
  chromium: browser.version(),
  viewport: { width: 1100, height: 800 },
  deviceScaleFactor: 1,
  cases: [],
  errors: [],
  sourceHashes: initialSourceHashes,
  roundTrips,
};
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  if (process.env.WAFERCAD_AUDIT_NO_WORKER === '1')
    await context.addInitScript(() => {
      window.Worker = undefined;
    });
  let page;
  const freshPage = async () => {
    if (page) await page.close();
    page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(message.text());
    });
  };
  await freshPage();
  if (process.env.WAFERCAD_AUDIT_ORACLE === '1') {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.boot);
    report.hiddenLineOracle = await page.evaluate(hiddenLinePixelOracle);
    for (const result of report.hiddenLineOracle) {
      await writeFile(
        resolve(output, `hidden-line-oracle-${result.direction}.png`),
        Buffer.from(result.png.split(',')[1], 'base64'),
      );
      delete result.png;
      const front = result.bands[result.direction > 0 ? 0 : 1];
      const back = result.bands[result.direction > 0 ? 1 : 0];
      assert.ok(
        front.green > 250 && front.red === 0,
        `Visible contour must be solid: ${JSON.stringify(result)}`,
      );
      assert.ok(
        back.red > 70 && back.green < 120 && back.holeGreen > 50,
        `Occluded contour must be dashed and hole must expose solid: ${JSON.stringify(result)}`,
      );
    }
    console.log(`Depth oracle: ${JSON.stringify(report.hiddenLineOracle)}`);
    report.gpuHeightOracle = await page.evaluate(gpuHeightOracle);
    for (const result of report.gpuHeightOracle) {
      if (result.productionBackend === 'cpu-software-parity') {
        // Keep recording the failing SwiftShader GLSL numerical experiment,
        // but never use that shader for production displacement on software.
        // The runtime assertion below requires the selected CPU mesh.
        report.softwareShaderParityUnverified = true;
        continue;
      }
      assert.ok(
        result.maximumErrorUm < 0.00002,
        `CPU/GPU height mismatch: ${JSON.stringify(result)}`,
      );
    }
    console.log(
      `GPU height oracle (unselected software shader is diagnostic only): ${JSON.stringify(report.gpuHeightOracle)}`,
    );
  }
  for (const fixture of fixtures) {
    if (
      process.env.WAFERCAD_AUDIT_FILTER &&
      !fixture.name.includes(process.env.WAFERCAD_AUDIT_FILTER)
    )
      continue;
    await freshPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.boot);
    const initial = JSON.stringify(fixture.project.model);
    await page.evaluate(
      async ({ model, clip }) => {
        window.model = model;
        window.clip = clip;
        if (!(await window.view.init())) throw new Error('Renderer initialization failed');
        window.view.setGestureMode('rotate');
      },
      { model: fixture.project.model, clip: fixture.clip },
    );
    const ready = () =>
      page
        .waitForFunction(
          () => {
            const host = document.querySelector('#host');
            const mode = host.querySelector('canvas')?.dataset.roughMeshMode;
            return (
              host.dataset.renderState === 'ready' &&
              (!mode || mode === 'none' || mode === 'detailed')
            );
          },
          null,
          { timeout: Number(process.env.WAFERCAD_AUDIT_TIMEOUT) || 120000 },
        )
        .catch(async (error) => {
          report.failedReady = await page.evaluate(() => {
            const host = document.querySelector('#host');
            return {
              host: { ...host.dataset },
              canvas: { ...host.querySelector('canvas')?.dataset },
              stats: document.querySelector('#stats').textContent,
            };
          });
          await page.screenshot({ path: resolve(output, 'failed-ready.png') });
          throw error;
        });
    await ready();
    await page.evaluate(() => window.view.fit({ notify: false }));
    await ready();
    const fit = await page.evaluate(() => window.view.getViewState());
    for (const config of [
      { name: 'opaque', opacity: 1, borders: false, fast: true },
      { name: 'opaque-borders', opacity: 1, borders: true, fast: true },
      { name: 'transparent', opacity: 0.5, borders: true, fast: true },
      { name: 'transparent-back', opacity: 0.15, borders: true, fast: true, back: true },
      { name: 'quality-zoom', opacity: 0.5, borders: true, fast: false, zoom: 0.7 },
      ...(fixture.name === 'photodetector-blacksi-final-roi'
        ? [
            {
              name: 'surface-cut-zbreak-opaque-detail',
              opacity: 1,
              borders: false,
              fast: false,
              detail: true,
              zBreak: true,
            },
            {
              name: 'surface-cut-zbreak-opaque-borders-detail',
              opacity: 1,
              borders: true,
              fast: false,
              detail: true,
              zBreak: true,
            },
            {
              name: 'surface-cut-zbreak-transparent-no-borders-detail',
              opacity: 0.5,
              borders: false,
              fast: false,
              detail: true,
              zBreak: true,
            },
            {
              name: 'surface-cut-zbreak-transparent-detail',
              opacity: 0.5,
              borders: true,
              fast: false,
              detail: true,
              zBreak: true,
            },
          ]
        : []),
      ...(fixture.name === 'photodetector-blacksi-final-micro-roi'
        ? [
            {
              name: 'micro-zbreak-opaque-detail',
              opacity: 1,
              borders: false,
              fast: false,
              detail: true,
              micro: true,
              zBreak: true,
            },
            {
              name: 'micro-zbreak-opaque-borders-detail',
              opacity: 1,
              borders: true,
              fast: false,
              detail: true,
              micro: true,
              zBreak: true,
            },
            {
              name: 'micro-zbreak-transparent-detail',
              opacity: 0.5,
              borders: true,
              fast: false,
              detail: true,
              micro: true,
              zBreak: true,
            },
          ]
        : []),
      ...(fixture.name.includes('-back-') || fixture.name.includes('-both-')
        ? [{ name: 'underneath', opacity: 0.5, borders: true, fast: true, underneath: true }]
        : []),
    ]) {
      const started = performance.now();
      await page.evaluate(
        async ({ config, fit }) => {
          Object.assign(window.inspection, config);
          // Use the existing 3D Z Break display-only transform to pull the
          // active Black-Si surface away from the 350 um base. Front/Back
          // scales do NOT modify the canonical layer z coordinates.
          window.zCollapse = config.zBreak
            ? {
                enabled: true,
                top: 173.2,
                bottom: -174.4,
                scaleLinked: false,
                frontScale: 8,
                backScale: 1,
              }
            : null;
          window.view.updateZCollapse();
          await window.view.render();
          const delta = fit.position.map((value, index) => value - fit.target[index]);
          const length = Math.hypot(...delta) || 1;
          const displayScale = Number(document.querySelector('#host').dataset.zDisplayScale);
          const upperSurfaceZ = 174.325;
          const c = window.zCollapse;
          const focusedZ = c
            ? ((c.top + c.bottom) / 2 + (upperSurfaceZ - c.top) * c.frontScale) * displayScale
            : fit.target[2];
          const target = config.zBreak
            ? [config.micro ? 2495 : 2400, 0, focusedZ]
            : config.detail
              ? [2495, -140, fit.target[2]]
              : fit.target;
          const distance = config.micro ? 14 : config.zBreak ? 110 : 40;
          const position = config.detail
            ? target.map((value, index) => value + (delta[index] / length) * distance)
            : fit.position.map(
                (value, index) =>
                  target[index] +
                  (value - target[index]) *
                    (config.zoom || 1) *
                    ((config.back && index < 2) || (config.underneath && index === 2) ? -1 : 1),
              );
          window.view.setViewState({ ...fit, target, position });
        },
        { config, fit },
      );
      await ready();
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const diagnostics = await page.evaluate(() => {
        const host = document.querySelector('#host');
        const canvas = host.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          host: { ...host.dataset },
          canvas: { ...canvas.dataset },
          camera: window.view.getViewState(),
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          canonicalModel: JSON.stringify(window.model),
          heap: performance.memory
            ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
            : null,
        };
      });
      assert.equal(
        diagnostics.canonicalModel,
        initial,
        'Inspection must not mutate ideal material geometry',
      );
      delete diagnostics.canonicalModel;
      assert.equal(diagnostics.host.renderState, 'ready');
      if (fixture.name.startsWith('photodetector-') && config.zBreak) {
        const blend = Number(diagnostics.host.roughDisplayBlendMin);
        assert.ok(Number.isFinite(blend) && blend > 0);
        if (fixture.name.includes('-micro-')) {
          assert.equal(blend, 1, 'microscopic roughness must retain full display relief');
        } else {
          assert.ok(blend < 0.5, 'macro under-sampled roughness must be prefiltered');
        }
      }
      if (config.zBreak) {
        assert.equal(Number(diagnostics.host.zFrontScale), 8);
        assert.equal(diagnostics.host.zScaleLinked, 'false');
        assert.ok(Number(diagnostics.host.zCollapseTopUm) < 174.3);
      }
      if (
        diagnostics.host.roughDisplacementBackend === 'cpu-software-parity' &&
        !fixture.name.includes('smooth')
      ) {
        assert.equal(diagnostics.canvas.roughMeshBackend, 'cpu-mesh');
        assert.equal(
          Number(diagnostics.canvas.roughGpuTaskCount || 0),
          0,
          'Software WebGL may not use a shader that fails the height tolerance',
        );
      }
      if (!fixture.name.includes('smooth'))
        assert.equal(
          diagnostics.canvas.roughMeshWorker,
          process.env.WAFERCAD_AUDIT_NO_WORKER === '1' ? 'false' : 'true',
          'Runtime fixture must exercise the requested rough execution backend',
        );
      if (!config.borders) assert.equal(diagnostics.host.outlineVisibility || 'off', 'off');
      const name = `${fixture.name}-${config.name}`;
      const readyMs = performance.now() - started;
      await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
      const steadyFrames = await page.evaluate(async () => {
        const samples = [];
        for (let index = 0; index < 5; index++) {
          const started = performance.now();
          window.view.setViewState(window.view.getViewState());
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          const host = document.querySelector('#host');
          samples.push({
            wallMs: performance.now() - started,
            submissionMs: Number(host.dataset.rendererFrameMs),
            calls: Number(host.dataset.rendererDrawCalls),
            triangles: Number(host.dataset.rendererDrawTriangles),
          });
        }
        return samples;
      });
      const result = { name, config, readyMs, steadyFrames, ...diagnostics };
      report.cases.push(result);
      await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
      console.log(`${name}: ${result.readyMs.toFixed(0)}ms ${result.renderer}`);
    }
    const toggles = await page.evaluate(async () => {
      const snapshots = [];
      const read = () => {
        const data = document.querySelector('#host').dataset;
        return Object.fromEntries(
          [
            'sceneGeneration',
            'surfacePlanBuildCount',
            'sceneRetainedGeometryCount',
            'sceneRetainedMaterialCount',
          ].map((key) => [key, data[key]]),
        );
      };
      snapshots.push(read());
      for (let index = 0; index < 10; index++) {
        window.inspection.opacity = index % 2 ? 0.5 : 0.15;
        window.inspection.borders = Boolean(index % 2);
        await window.view.render();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        snapshots.push(read());
      }
      return snapshots;
    });
    for (const snapshot of toggles)
      assert.deepEqual(
        snapshot,
        toggles[0],
        'Presentation toggles must retain scene resources and surface plan',
      );
    (report.presentationToggles ||= []).push({ fixture: fixture.name, snapshots: toggles });
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.deepEqual(
    await sourceHashes(),
    initialSourceHashes,
    'Product sources changed during capture; rerun against a stable revision',
  );
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
