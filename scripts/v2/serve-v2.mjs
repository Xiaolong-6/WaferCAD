// Localhost-only static preview + save-triggered reload. No build/dependency.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const root = resolve('site');
const port = Number(process.env.WAFERCAD_V2_PORT || 4182);
const clients = new Set();
let revision = 0;
let pending = false;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain',
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/__v2_events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(`: v2 live preview ${revision}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  try {
    const path = resolve(
      root,
      `.${decodeURIComponent(url.pathname === '/' ? '/app-v2.html' : url.pathname)}`,
    );
    if (!path.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end();
      return;
    }
    if (!(await stat(path)).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
const watcher = watch(root, { recursive: true }, async (_event, file) => {
  if (!(file === 'app-v2.html' || String(file).startsWith(`ui-v2${sep}`)) || pending) return;
  pending = true;
  await delay(250);
  pending = false;
  revision++;
  for (const client of clients) client.write(`event: reload\ndata: ${revision}\n\n`);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Live UI v2: http://127.0.0.1:${port}/app-v2.html?live`);
  console.log('Save site/app-v2.html or site/ui-v2/**: connected pages reload automatically.');
});
server.on('error', (error) => {
  console.error(error.message);
  watcher.close();
  process.exitCode = 1;
});
