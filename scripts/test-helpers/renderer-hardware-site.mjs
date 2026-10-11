// Read-only static HTTP site for the exact Git worktree under test.
// Validate the real entrypoint before consuming any browser/GPU time.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

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
  const entrypoint = resolve(site, 'app.html');
  const page = await stat(entrypoint);
  if (!page.isFile() || page.size < 1000) {
    throw new Error('Missing or truncated app.html in worktree ' + worktree);
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
    async verify() {
      const response = await fetch(url + '/app.html', {
        signal: globalThis.AbortSignal.timeout(10000),
      });
      const body = await response.text();
      if (response.status !== 200 || !body.includes('<html')) {
        throw new Error(
          'Static worktree preflight failed: ' +
            response.status +
            ' ' +
            url +
            '/app.html, body=' +
            body.slice(0, 120),
        );
      }
      diagnostic({ status: response.status, path: '/app.html', bytes: body.length });
    },
    close: () => new Promise((done) => server.close(done)),
  };
}
