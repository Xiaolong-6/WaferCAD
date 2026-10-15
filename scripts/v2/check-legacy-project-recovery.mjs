// Preserve real historical project compatibility before removing the Legacy UI.
// The 2026-10-06 shared-assets-v1 fixture is loaded in the current v2 Workstation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const fixture = 'tests/fixtures/project-io/nature2026-fig3-wafer-legacy.wafercad.br';
const metadata = JSON.parse(await readFile('tests/fixtures/project-io/metadata.json', 'utf8'));
const archived = await readFile(fixture);
const bytes = brotliDecompressSync(archived);
assert.equal(bytes.byteLength, metadata.originalBytes, 'Legacy project bytes are intact');
assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.originalSha256);

const browser = await launchBrowser();
const { context, page } = await newUiPage(browser, { viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/legacy-compat-project.wafercad', (route) =>
  route.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes }),
);

async function open(path) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 180000,
  });
}

async function fingerprint() {
  return page.evaluate(async () => {
    const state = window.WaferCadV2Workstation.snapshot();
    // The current project format stores physical lengths on its documented
    // 0.1 nm grid. Sort object keys and quantize values for semantic equality;
    // leave array ordering, IDs, layer data and topology strictly unchanged.
    function canonical(value) {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw Error('Nonfinite scientific value');
        return Math.round(value / 0.0001) * 0.0001;
      }
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        );
      return value;
    }
    const payload = JSON.stringify(canonical(state.model));
    const hash = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload),
    );
    const modelHash = [...new Uint8Array(hash)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    return {
      modelHash,
      layers: state.model.layers.length,
      steps: state.workflow.steps.length,
      branches: state.workflow.branches.length,
    };
  });
}

try {
  await open('/app.html?start=empty');
  await page.evaluate(async () => {
    const response = await fetch('/legacy-compat-project.wafercad');
    if (!response.ok) throw Error('Legacy project fixture could not be fetched');
    const { stageStartupFile } = await import('/startup-file.js');
    await stageStartupFile(
      new File([await response.arrayBuffer()], 'legacy-project.wafercad'),
      'project',
    );
  });

  await open('/app.html?start=staged');
  const imported = await fingerprint();
  assert.ok(imported.layers > 1, 'Legacy project material layers are preserved');
  assert.ok(imported.steps >= metadata.steps, 'Legacy process steps are preserved');
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
    null,
    { timeout: 180000 },
  );

  await open('/app.html');
  assert.deepEqual(
    await fingerprint(),
    imported,
    'V2 reload preserves History, IDs and physical state at the documented 0.1 nm grid',
  );

  // Retired UI is unnecessary for the writer-lease parity invariant: a
  // second v2 tab must never take over the archived project's current owner.
  const original = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const competing = await context.newPage();
  competing.on('pageerror', (error) => errors.push(error.message));
  try {
    await competing.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await competing.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 180000,
    });
    const second = await competing.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(second.workflow.writable, false, 'Second v2 tab cannot steal saved writer lease');
    assert.deepEqual(second.model, original.model, 'Non-owner reads intact archived geometry');
    assert.deepEqual(
      second.workflow.branches,
      original.workflow.branches,
      'Non-owner sees archived Variants unchanged',
    );
    assert.equal(second.workflow.steps.length, imported.steps);
    const persisted = await competing.evaluate(async () => {
      const { loadWorkspaceState } = await import('/workspace-persistence.js');
      const saved = await loadWorkspaceState();
      return {
        model: saved.model,
        nodes: saved.snapshotBranches?.nodes?.length || saved.snapshots?.length || 0,
        branches: saved.snapshotBranches?.branches?.length || 0,
      };
    });
    assert.deepEqual(persisted.model, original.model, 'Contending tab did not rewrite geometry');
    assert.equal(persisted.nodes, imported.steps);
    assert.equal(persisted.branches, imported.branches);
  } finally {
    await competing.close();
  }

  await open('/app.html?start=empty');
  const recovery = await page.evaluate(async () => {
    const storage = await import('/workspace-persistence.js');
    const points = await storage.listWorkspaceRecoveryPoints();
    for (const point of points) {
      const saved = await storage.loadWorkspaceRecoveryPoint(point.key);
      if (saved?.model?.layers?.length > 1) {
        return {
          layers: saved.model.layers.length,
          steps: saved.snapshotBranches?.nodes?.length || saved.snapshots?.length || 0,
          branches: saved.snapshotBranches?.branches?.length || 0,
        };
      }
    }
    return null;
  });
  assert.ok(recovery, 'Replacing an old imported project must create Recovery');
  assert.equal(recovery.layers, imported.layers);
  assert.ok(recovery.steps >= metadata.steps);
  assert.equal(recovery.branches, imported.branches, 'Recovery retains all archived Variants');
  assert.deepEqual(errors, [], 'No uncaught errors during Legacy file import and Recovery');
  console.log('Legacy project v2 import / autosave / reload / Recovery PASS');
} finally {
  await context.close();
  await browser.close();
}
