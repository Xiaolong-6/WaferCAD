// Smoke the exact staged Pages tree, including the repository subpath and real workers.
// Unlike source-tree browser checks, this catches missing or incorrectly stamped deploy files.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { launchBrowser, newUiPage } from './test-helpers/ui.mjs';

const root = resolve(process.env.WAFERCAD_STAGED_ROOT || 'build/pages');
const prefix = '/WaferCAD/';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};
const server = createServer(async (request, response) => {
  let path;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end('Not found');
      return;
    }
    path = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const base = `http://127.0.0.1:${address.port}${prefix.slice(0, -1)}`;
const browser = await launchBrowser();
const { context, page } = await newUiPage(browser, { viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.url().startsWith(base + '/') && response.status() >= 400)
    errors.push(`HTTP ${response.status()}: ${response.url()}`);
});

async function open(path) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
}

try {
  const info = JSON.parse(await readFile(resolve(root, 'build-info.json'), 'utf8'));
  assert.match(info.commit, /^[0-9a-f]{40}$/, 'Published revision must be exact');
  for (const name of ['project-worker.js', 'layout-worker.js', 'process-worker.js']) {
    assert.ok((await stat(resolve(root, name))).isFile(), `Missing published ${name}`);
  }
  await open('/index.html');
  await page.waitForFunction(() => document.documentElement.dataset.welcomeReady === 'true');
  assert.equal(await page.locator('#welcomeScreen').isVisible(), true);

  // Old bookmarked URLs must reach v2 while the retired editor scripts remain
  // absent from the production artifact (legacy tests still run from Git).
  const retired = await readFile(resolve(root, 'app-legacy.html'), 'utf8');
  assert.ok(retired.includes("location.replace('./app.html'"));
  assert.doesNotMatch(retired, /workstation-boot|app\.js|workstation\.css/);
  assert.equal((await page.request.get(base + '/app.js')).status(), 404);
  assert.equal((await page.request.get(base + '/workstation.css')).status(), 404);
  await open('/app-legacy.html?legacy_redirect_probe=1');
  await page.waitForURL(
    (url) =>
      url.pathname.endsWith('/WaferCAD/app.html') &&
      url.searchParams.get('legacy_redirect_probe') === '1',
  );
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');

  // Verify that the tiny Legacy bookmark shim forwards the entire URL intent.
  // The published page must never load a second executable Legacy editor.
  await open('/app-legacy.html?start=empty&view=main#old-empty-bookmark');
  await page.waitForURL(
    (url) =>
      url.pathname.endsWith('/WaferCAD/app.html') &&
      url.searchParams.get('start') === 'empty' &&
      url.searchParams.get('view') === 'main' &&
      url.hash === '#old-empty-bookmark',
  );
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
    timeout: 120000,
  });
  assert.equal(
    (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model.layers.length,
    1,
    'Retired empty bookmark must resolve to the current v2 model',
  );

  await open('/app-legacy.html?start=example&example=photodetector-literature&view=mask#old-example-bookmark');
  await page.waitForURL(
    (url) =>
      url.pathname.endsWith('/WaferCAD/app.html') &&
      url.searchParams.get('start') === 'example' &&
      url.searchParams.get('example') === 'photodetector-literature' &&
      url.searchParams.get('view') === 'mask' &&
      url.hash === '#old-example-bookmark',
  );
  await page.waitForFunction(
    () =>
      window.WaferCadV2Workstation?.ready &&
      window.WaferCadV2Workstation.snapshot().model.layers.length > 1,
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');

  // A legacy preview bookmark routes into the v2 read-only rendering mode:
  // it may display material geometry but cannot obtain the writer lease.
  await open('/app-legacy.html?preview=1&example=photodetector-literature&view=section#old-preview-bookmark');
  await page.waitForURL(
    (url) =>
      url.pathname.endsWith('/WaferCAD/app.html') &&
      url.searchParams.get('preview') === '1' &&
      url.searchParams.get('example') === 'photodetector-literature' &&
      url.searchParams.get('view') === 'section' &&
      url.hash === '#old-preview-bookmark',
  );
  await page.waitForFunction(
    () => window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 120000 },
  );
  const previewState = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.ok(previewState.model.layers.length > 1, 'Retired preview links retain real geometry');
  assert.equal(previewState.workflow.writable, false, 'Retired preview link has no writer lease');
  assert.equal(await page.locator('.p-inspector').isVisible(), false);

  await open('/app.html?start=empty');
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal((await snapshot()).model.layers.length, 1);

  // Exercise the real published Worker entrypoints and their dynamic imports,
  // not merely successful HTTP responses for worker script URLs.
  const workerResults = await page.evaluate(async () => {
    async function runWorker(script, id, payload) {
      const worker = new Worker('./' + script);
      try {
        return await new Promise((resolveResult, reject) => {
          const timeout = setTimeout(() => reject(new Error(script + ' timed out')), 45000);
          worker.onerror = (event) => {
            clearTimeout(timeout);
            reject(new Error(script + ': ' + event.message));
          };
          worker.onmessage = (event) => {
            const message = event.data || {};
            if (message.id !== id || message.type === 'progress') return;
            clearTimeout(timeout);
            if (message.type === 'done') resolveResult(message);
            else reject(new Error(script + ': ' + (message.message || message.type)));
          };
          worker.postMessage({ id, ...payload });
        });
      } finally {
        worker.terminate();
      }
    }
    const projectResponse = await fetch('./examples/photodetector-literature-examples.wafercad');
    if (!projectResponse.ok) throw Error('Published project file could not be fetched');
    const project = await runWorker('project-worker.js', 'project-smoke', {
      arrayBuffer: await projectResponse.arrayBuffer(),
    });
    const layoutResponse = await fetch('./samples/klayout/gds-basic-instances.gds');
    if (!layoutResponse.ok) throw Error('Published layout fixture could not be fetched');
    const layout = await runWorker('layout-worker.js', 'layout-smoke', {
      arrayBuffer: await layoutResponse.arrayBuffer(),
      filename: 'gds-basic-instances.gds',
    });
    return {
      projectLayers: project.project?.model?.layers?.length,
      history: project.project?.snapshotBranches?.nodes?.length,
      layoutElements: layout.imported?.layout?.elements?.length,
    };
  });
  assert.equal(workerResults.projectLayers, 6, 'Project Worker reconstructs real model');
  assert.ok(workerResults.history > 1, 'Project Worker preserves History');
  assert.ok(workerResults.layoutElements > 0, 'Layout Worker parses real GDS geometry');

  // The production Process UI must load and execute the actual Process Worker.
  await page.locator('[data-action="domain:process"]').click();
  await page.locator('#operationType').selectOption('add');
  await page.locator('#operationArea').selectOption('full');
  await page.locator('#layerName').fill('Pages smoke film');
  await page.locator('#operationThickness').fill('0.5');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () => {
      const state = window.WaferCadV2Workstation.snapshot();
      return state.workflow.steps.length === 1 && !state.workflow.busy;
    },
    null,
    { timeout: 120000 },
  );
  const applied = await snapshot();
  assert.ok(applied.model.layers.some((layer) => layer.name === 'Pages smoke film'));
  assert.deepEqual(
    errors,
    [],
    'Staged Pages boot and worker execution have no resource/page errors',
  );
  console.log(
    `Pages staged artifact PASS: ${info.commit.slice(0, 12)}; Welcome/v2/Project/Layout/Process Workers`,
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
