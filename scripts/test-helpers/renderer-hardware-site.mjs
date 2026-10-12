// Read-only static HTTP site for the exact Git worktree under test.
// Validate the real entrypoint before consuming any browser/GPU time.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isScientificRendererWorkstation } from './renderer-workstation-route.mjs';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wafercad': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

export async function startRendererHardwareSite(worktree, diagnostic = () => {}) {
  const site = resolve(worktree, 'site');
  let entryName = null;
  for (const candidate of ['app-legacy.html', 'app.html']) {
    try {
      const entrypoint = resolve(site, candidate);
      const page = await stat(entrypoint);
      if (
        page.isFile() &&
        page.size >= 1000 &&
        isScientificRendererWorkstation(await readFile(entrypoint, 'utf8'))
      ) {
        entryName = candidate;
        break;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (!entryName) {
    throw new Error('Scientific renderer entry absent: app-legacy.html or old app.html required');
  }
  const server = createServer(async (request, response) => {
    let target = null;
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const segments = (pathname === '/' ? '/index.html' : pathname).split('/').filter(Boolean);
      if (
        segments.some(
          (segment) => segment === '..' || segment.includes('\\') || segment.includes('\0'),
        )
      ) {
        response.writeHead(403).end('Forbidden path');
        diagnostic({ status: 403, path: pathname });
        return;
      }
      target = resolve(site, ...segments);
      const within = relative(site, target);
      if (!within || within.startsWith('..' + sep) || within === '..' || isAbsolute(within)) {
        response.writeHead(403).end('Forbidden target');
        diagnostic({ status: 403, path: pathname, target });
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch (error) {
      const details = { status: 404, path: request.url, target, error: String(error) };
      diagnostic(details);
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  return {
    url,
    entryName,
    entryUrl: url + '/' + entryName,
    async verify() {
      const response = await fetch(url + '/' + entryName, {
        signal: globalThis.AbortSignal.timeout(10000),
      });
      const body = await response.text();
      if (response.status !== 200 || !isScientificRendererWorkstation(body)) {
        throw new Error(
          'Static worktree preflight failed: ' +
            response.status +
            ' ' +
            url +
            '/' +
            entryName +
            ', body=' +
            body.slice(0, 120),
        );
      }
      diagnostic({ status: response.status, path: '/' + entryName, bytes: body.length });
    },
    close: () => new Promise((done) => server.close(done)),
  };
}
