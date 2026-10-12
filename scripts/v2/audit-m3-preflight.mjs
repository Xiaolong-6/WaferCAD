// Read-only M3 preflight: proves shell hosts, not real controller/renderer wiring.
// Own the localhost server so restricted per-command network namespaces work too.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = resolve(repo, 'site');
const output = resolve(repo, 'test-results/ui-v2-m3-preflight');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${root}${sep}`)) return res.writeHead(403).end();
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const evidence = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  scope: 'Pre-D1 placeholder shell only; no real scientific identity or visual-baseline acceptance',
  result: 'running',
  widths: [],
  errors: [],
};
try {
  await mkdir(output, { recursive: true });
  browser = await launchBrowser();
  evidence.browser = browser.version();
  const { context, page } = await newUiPage(browser);
  try {
    page.on('pageerror', (error) => evidence.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.errors.push(message.text());
    });
    await page.goto(`${base}/ui-v2/app.html`);
    await page.waitForFunction(() => Boolean(window.WaferCadV2ProductionShell));
    assert.equal(
      await page.evaluate(() => Boolean(window.WaferCadV2Shell)),
      false,
      'No mock presenter in production fixture',
    );
    await page.evaluate(() => {
      const shell = window.WaferCadV2ProductionShell;
      window.preflightNodes = new Map(
        window.WaferCadV2ShellRegistry.defaults.slots.map((name) => [name, shell.getSlot(name)]),
      );
      for (const [name, node] of window.preflightNodes)
        if (!node) throw Error(`Missing slot ${name}`);
      // A renderer-owned child must survive; this is a sentinel, not a real canvas.
      for (const key of ['main', 'mask', 'three', 'section']) {
        const child = document.createElement('span');
        child.dataset.preflightSentinel = key;
        shell.getSlot(`view.${key}.stage`).append(child);
      }
    });
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const domain of ['mask', 'process', 'history', 'project']) {
        await page.locator(`[data-action="domain:${domain}"]`).click();
      }
      if (!(await page.evaluate(() => window.WaferCadV2ViewState.compact(window)))) {
        for (const mode of ['overview', 'split', 'single'])
          await page.locator(`[data-action="mode:${mode}"]`).click();
      }
      await page.evaluate(() => {
        const shell = window.WaferCadV2ProductionShell;
        for (let i = 0; i < 10; i++) shell.render();
        for (const [name, node] of window.preflightNodes)
          if (shell.getSlot(name) !== node) throw Error(`Changed slot identity ${name}`);
        for (const key of ['main', 'mask', 'three', 'section']) {
          if (
            shell
              .getSlot(`view.${key}.stage`)
              .querySelectorAll(`[data-preflight-sentinel="${key}"]`).length !== 1
          )
            throw Error(`Lost stage child ${key}`);
        }
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
        if (new Set(ids).size !== ids.length) throw Error('Duplicate runtime IDs');
      });
      await waitForPaint(page);
      const result = await page.evaluate(() => ({
        slots: window.preflightNodes.size,
        adapterCount: window.WaferCadV2ProductionShell.adapters.keys().length,
        canvasCount: document.querySelectorAll('canvas').length,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      }));
      assert.equal(result.canvasCount, 0, 'Fixture must not claim a real renderer');
      assert.equal(result.overflow, 0, `Viewport overflow ${width}`);
      evidence.widths.push({ width, ...result });
      await page.screenshot({ path: resolve(output, `production-${width}.png`), fullPage: true });
    }
    evidence.unconnected = await page.locator('[data-adapter="unconnected"]').count();
    assert.equal(evidence.unconnected, 4, 'Only primary domains have mounted in this navigation');
    evidence.preparedDomainSlots = await page.evaluate(() => {
      const shell = window.WaferCadV2ProductionShell;
      const registry = window.WaferCadV2ShellRegistry.defaults;
      const names = registry.panels
        .map((key) => `panel.${key}`)
        .concat(registry.processModes.map((key) => `panel.process.${key}`));
      for (const name of names) shell.adapters.prepare(name, shell.getSlot(name));
      return document.querySelectorAll('[data-adapter="unconnected"]').length;
    });
    assert.equal(
      evidence.preparedDomainSlots,
      9,
      'Explicit prepare covers nested placeholders too',
    );
    await page.evaluate(() => {
      window.WaferCadV2ProductionShell.destroy();
      if (window.WaferCadV2ProductionShell.adapters.keys().length)
        throw Error('Adapters not destroyed');
    });
    evidence.destroy = 'adapter registry cleared';
    await page.goto(`${base}/app-v2.html`);
    await page.waitForFunction(() => Boolean(window.WaferCadV2Shell));
    assert.equal(
      await page.evaluate(() => Boolean(window.WaferCadV2ProductionShell)),
      false,
      'No production presenter in mock preview',
    );
    evidence.publicRoute = 'mock preview, independently isolated';
    assert.deepEqual(evidence.errors, [], 'Page/console errors');
    evidence.result = 'pass';
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await context.close();
  }
} catch (error) {
  evidence.result = 'fail';
  evidence.failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
