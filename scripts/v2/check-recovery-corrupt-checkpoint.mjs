// #289: an IndexedDB Recovery option with a corrupted stored payload must fail closed.
// The current Model/History/Variant graph and persisted workspace must not be replaced.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());

    async function deposit(name) {
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(name);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (expected) => {
          const state = window.WaferCadV2Workstation.snapshot();
          return (
            !state.workflow.busy && state.model.layers.some((layer) => layer.name === expected)
          );
        },
        name,
        { timeout: 120000 },
      );
    }
    async function save(name) {
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#projectNameInput').fill(name);
      await page.locator('#saveProjectBtn').click();
      await page.waitForFunction(
        (expected) =>
          (document.querySelector('[data-slot="status.message"]')?.textContent || '').includes(
            'Saved "' + expected + '" locally',
          ),
        name,
        { timeout: 120000 },
      );
    }

    await deposit('Corruption original A');
    await save('Corruption old checkpoint');
    const selectedKey = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const record of await storage.listWorkspaceRecoveryPoints()) {
        if (
          (await storage.loadWorkspaceRecoveryPoint(record.key))?.name ===
          'Corruption old checkpoint'
        )
          return record.key;
      }
      return null;
    });
    assert.ok(selectedKey, 'Must have a valid existing Recovery checkpoint');

    await deposit('Corruption active B');
    await save('Corruption active workspace');
    const before = await snapshot();
    assert.equal(before.workflow.steps.length, 2);
    assert.equal(before.workflow.writable, true);
    const storedBefore = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(storedBefore.model, before.model);

    // Corrupt only the selected recovery payload in real IndexedDB, keeping
    // its metadata/selector record so the UI still offers the failing restore.
    await page.evaluate(
      (key) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('wafercad-workspace-v1', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('workspace', 'readwrite');
            transaction.objectStore('workspace').put({
              key,
              project: {
                format: 'WaferCAD-vector',
                version: 15,
                model: { kernel: 'corrupted-invalid-kernel' },
              },
            });
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            transaction.onabort = () => {
              database.close();
              reject(transaction.error || Error('Corruption transaction aborted'));
            };
          };
        }),
      selectedKey,
    );
    const isRejected = await page.evaluate(async (key) => {
      const storage = await import('/workspace-persistence.js');
      const options = await storage.listWorkspaceRecoveryPoints();
      if (!options.some((record) => record.key === key)) return false;
      try {
        await storage.loadWorkspaceRecoveryPoint(key);
        return false;
      } catch {
        return true;
      }
    }, selectedKey);
    assert.equal(isRejected, true, 'Strict project validation must reject the stored corruption');

    await page.locator('[data-action="domain:project"]').click();
    await page.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      selectedKey,
    );
    await page.locator('#workspaceRecoverySelect').selectOption(selectedKey);
    await page.locator('#workspaceRestoreBtn').click();
    await page
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        /Recovery restore failed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );

    const after = await snapshot();
    assert.deepEqual(after.model, before.model, 'Malformed Recovery cannot alter physical Model');
    assert.deepEqual(after.workflow.steps, before.workflow.steps, 'History must remain unchanged');
    assert.deepEqual(
      after.workflow.branches,
      before.workflow.branches,
      'Variant heads must remain unchanged',
    );
    const storedAfter = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(storedAfter, storedBefore, 'Corruption cannot modify current IndexedDB state');

    // A selectable, valid checkpoint must remain available; storage-open
    // denial during either the protective write or Recovery read must fail
    // closed without discarding the current scientific project.
    const validKey = await page.evaluate(async (corruptKey) => {
      const storage = await import('/workspace-persistence.js');
      for (const point of await storage.listWorkspaceRecoveryPoints()) {
        if (point.key === corruptKey) continue;
        const candidate = await storage.loadWorkspaceRecoveryPoint(point.key);
        if (candidate?.name === 'Corruption active workspace') return point.key;
      }
      return null;
    }, selectedKey);
    assert.ok(validKey, 'A separate valid Recovery checkpoint must exist');

    for (const failAtOpen of [1, 2]) {
      await page.locator('#workspaceRecoverySelect').selectOption(validKey);
      await page.evaluate((failAt) => {
        const nativeOpen = IDBFactory.prototype.open;
        const trace = { attempts: 0, hits: 0, failAt };
        window.__recoveryStorageFault = trace;
        window.__recoveryNativeOpen = nativeOpen;
        IDBFactory.prototype.open = function (...args) {
          if (args[0] === 'wafercad-workspace-v1') {
            trace.attempts++;
            if (trace.attempts === failAt) {
              trace.hits++;
              throw new DOMException('Synthetic IndexedDB unavailable', 'SecurityError');
            }
          }
          return Reflect.apply(nativeOpen, this, args);
        };
      }, failAtOpen);
      try {
        await page.locator('#workspaceRestoreBtn').click();
        await page
          .locator('.v2-workflow-dialog-actions')
          .getByRole('button', { name: 'Restore', exact: true })
          .click();
        await page.waitForFunction(
          () => {
            const failed = /Recovery restore failed/.test(
              document.querySelector('[data-slot="status.message"]')?.textContent || '',
            );
            return (
              window.__recoveryStorageFault?.hits === 1 &&
              failed &&
              !window.WaferCadV2Workstation.snapshot().workflow.busy
            );
          },
          null,
          { timeout: 120000 },
        );
        const trace = await page.evaluate(() => window.__recoveryStorageFault);
        assert.equal(trace.hits, 1, 'Real IndexedDB open must be blocked exactly once');
        assert.equal(
          trace.attempts,
          failAtOpen,
          'The intended Recovery transaction boundary must be the one blocked',
        );
      } finally {
        await page.evaluate(() => {
          IDBFactory.prototype.open = window.__recoveryNativeOpen;
          delete window.__recoveryNativeOpen;
        });
      }
      const unchanged = await snapshot();
      assert.deepEqual(
        unchanged.model,
        before.model,
        'Unavailable storage cannot replace physical Model',
      );
      assert.deepEqual(
        unchanged.workflow.steps,
        before.workflow.steps,
        'Unavailable storage cannot replace History Steps',
      );
      assert.deepEqual(
        unchanged.workflow.branches,
        before.workflow.branches,
        'Unavailable storage cannot replace Variant topology',
      );
      const durable = await page.evaluate(async () =>
        (await import('/workspace-persistence.js')).loadWorkspaceState(),
      );
      assert.deepEqual(durable, storedBefore, 'Current IndexedDB record must remain exact');
    }

    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const reopened = await snapshot();
    assert.deepEqual(reopened.model, before.model, 'Reload must retain valid current geometry');
    assert.deepEqual(reopened.workflow.steps, before.workflow.steps);
    assert.deepEqual(reopened.workflow.branches, before.workflow.branches);
    assert.deepEqual(errors, []);
    console.log('V2_RECOVERY_CORRUPT_CHECKPOINT: failed closed with unchanged Model/History PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
