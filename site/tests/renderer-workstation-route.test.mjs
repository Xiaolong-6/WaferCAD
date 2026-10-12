import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isScientificRendererWorkstation,
  resolveRendererWorkstationUrl,
} from '../../scripts/test-helpers/renderer-workstation-route.mjs';

const legacy = '<html><div id="threeHost"></div><script src="app.js"></script></html>';
const v2 = '<html data-ui="v2"><main id="app-root"></main></html>';
const response = (status, body = '') => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => body,
});

test('renderer route distinguishes Legacy science DOM from v2 default', () => {
  assert.equal(isScientificRendererWorkstation(legacy), true);
  assert.equal(isScientificRendererWorkstation(v2), false);
  assert.equal(isScientificRendererWorkstation('<div id="threeHost"></div>'), false);
});

test('after PR177: science suite prefers the retained Legacy page', async () => {
  const seen = [];
  const url = await resolveRendererWorkstationUrl('http://localhost:4173', async (address) => {
    seen.push(address);
    return response(200, address.endsWith('app-legacy.html') ? legacy : v2);
  });
  assert.equal(url, 'http://localhost:4173/app-legacy.html');
  assert.equal(seen.length, 1);
});

test('before PR177: science suite accepts legacy app.html', async () => {
  const url = await resolveRendererWorkstationUrl('http://localhost:4173', async (address) =>
    address.endsWith('app-legacy.html') ? response(404) : response(200, legacy),
  );
  assert.equal(url, 'http://localhost:4173/app.html');
});

test('static fallback must never mistake v2 for legacy renderer DOM', async () => {
  await assert.rejects(
    resolveRendererWorkstationUrl('http://localhost:4173', async () => response(200, v2)),
    /scientific DOM not found/i,
  );
});

test('missing legacy with v2 default fails closed', async () => {
  await assert.rejects(
    resolveRendererWorkstationUrl('http://localhost:4173', async (address) =>
      address.endsWith('app-legacy.html') ? response(404) : response(200, v2),
    ),
    /app-legacy.html is required/,
  );
});

test('HTTP errors remain infrastructure failures', async () => {
  await assert.rejects(
    resolveRendererWorkstationUrl('http://localhost:4173', async () => response(500)),
    /Renderer workstation HTTP 500/,
  );
});
