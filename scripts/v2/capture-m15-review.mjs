// Review-only prototype captures; never writes approved baselines.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { launchBrowser, waitForPaint } from '../test-helpers/ui.mjs';
const root = resolve('site');
const output = resolve('test-results/m15-visual-review');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
    if (!path.startsWith(root + sep)) return res.writeHead(403).end();
    res.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.json': 'application/json',
        '.woff2': 'font/woff2',
      }[extname(path)] || 'application/octet-stream',
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await launchBrowser();
const rows = [];
try {
  const page = await browser.newPage();
  for (const fixture of ['m3d', 'photodetector']) {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(
        `http://127.0.0.1:${server.address().port}/ui-v2/prototypes/a-full/index.html?example=${fixture}&domain=project`,
      );
      await page.locator('#width').selectOption(String(width));
      const frame = page.frameLocator('#frame');
      await frame.locator('.p-workbench').waitFor();
      if (width <= 820) await frame.locator('[data-action="return-results"]').click();
      for (const view of ['main', 'three', 'section']) {
        const action =
          view === 'section' ? (width <= 820 ? 'mobile-section' : 'section') : `view:${view}`;
        await frame.locator(`[data-action="${action}"]`).first().click();
        await waitForPaint(page);
        const file = `${fixture}-${width}-${view}.png`;
        await frame.locator('.p-workbench').screenshot({ path: resolve(output, file) });
        rows.push({ fixture, width, view, file });
      }
    }
  }
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify({ browser: browser.version(), rows }, null, 2),
  );
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
