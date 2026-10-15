// Archived .wafercad → current v2 writer lease → Recovery. No Legacy DOM boot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const metadata = JSON.parse(await readFile('tests/fixtures/project-io/metadata.json', 'utf8'));
const archive = await readFile(
  'tests/fixtures/project-io/nature2026-fig3-wafer-legacy.wafercad.br',
);
const bytes = brotliDecompressSync(archive);
assert.equal(bytes.byteLength, metadata.originalBytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.originalSha256);

const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/archived-project.wafercad', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: bytes,
      }),
    );
    const open = async (path) => {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 180000,
      });
    };
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());

    await open('/app.html?start=empty');
    await page.evaluate(async () => {
      const response = await fetch('/archived-project.wafercad');
      if (!response.ok) throw Error('Missing SHA-verified historical fixture');
      const { stageStartupFile } = await import('/startup-file.js');
      await stageStartupFile(
        new File([await response.arrayBuffer()], 'historical.wafercad'),
        'project',
      );
    });
    await open('/app.html?start=staged');
    const imported = await snap();
    assert.ok(imported.model.layers.length > 1);
    assert.ok(imported.workflow.steps.length >= metadata.steps);
    assert.equal(imported.workflow.writable, true);
    await page.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      null,
      { timeout: 180000 },
    );

    const other = await context.newPage();
    other.on('pageerror', (error) => errors.push(error.message));
    try {
      await other.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
      await other.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 180000,
      });
      const contender = await other.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(contender.workflow.writable, false, 'Archived project writer cannot be stolen');
      assert.deepEqual(contender.model, imported.model, 'Nonowner reads exact archived geometry');
      assert.deepEqual(contender.workflow.steps, imported.workflow.steps);
      assert.deepEqual(contender.workflow.branches, imported.workflow.branches);

      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#projectNameInput').fill('Archive retained by writer');
      await page.locator('#saveProjectBtn').click();
      await page.waitForFunction(
        () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
        null,
        { timeout: 180000 },
      );
      const saved = await other.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        const project = await loadWorkspaceState();
        return { name: project.name, model: project.model };
      });
      assert.equal(saved.name, 'Archive retained by writer');
      assert.deepEqual(saved.model, imported.model, 'Save preserves historical topology');
    } finally {
      await other.close();
    }

    await open('/app.html');
    const reloaded = await snap();
    assert.equal(reloaded.projectName, 'Archive retained by writer');
    assert.deepEqual(reloaded.model, imported.model);
    assert.deepEqual(reloaded.workflow.steps, imported.workflow.steps);
    assert.deepEqual(reloaded.workflow.branches, imported.workflow.branches);

    await open('/app.html?start=empty');
    const recovery = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      const items = await storage.listWorkspaceRecoveryPoints();
      for (const item of items) {
        const project = await storage.loadWorkspaceRecoveryPoint(item.key);
        if (project?.name === 'Archive retained by writer') {
          return {
            model: project.model,
            steps: project.snapshotBranches?.nodes?.length || project.snapshots?.length || 0,
          };
        }
      }
      return null;
    });
    assert.ok(recovery, 'Replacing an archived project retains an independent Recovery point');
    assert.deepEqual(recovery.model, imported.model);
    assert.ok(recovery.steps >= metadata.steps);
    assert.deepEqual(errors, []);
    console.log('v2 archived project: SHA, History, exclusive writer, Save and Recovery PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
