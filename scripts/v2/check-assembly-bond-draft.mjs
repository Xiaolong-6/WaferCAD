// One focused Chromium transaction acceptance for the opt-in direct-Bond draft.
// Verifies IndexedDB Recovery durability and byte-safe portable .wafercad export.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from '../process-benchmarks.mjs';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

await loadGeometryKernel();
const { createModel } = await import('../../site/model.js');
const { migrateProjectFile } = await import('../../site/project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../../site/wafer-assembly.js');
const { serializeProject, readProjectFile } = await import('../../site/project-io.js');

function source(name, thickness = 400) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}

const a = createWaferAssembly(source('receiver A'), 'A');
const b = appendWaferToAssembly(a, source('donor B'), { donorId: 'B' });
const baseline = createBondedAssemblyProject(b.assembly);
const donorC = source('donor C');
const output = resolve('test-results/wafer-bond-draft');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  try {
    const errors = observePageErrors(page);
    await page.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByLabel('Open bonded Assembly project').setInputFiles({
      name: 'two.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(baseline)),
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 90000,
    });
    await page.locator('.assembly-bond-draft-tools summary').click();
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).assemblyPreview.readOnly,
      false,
    );
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).workflow.writable,
      false,
    );

    const donorSelect = page.getByLabel('Select independent donor wafer');
    await page.locator('.assembly-bond-draft-form input[name="donorId"]').fill('B');
    await donorSelect.setInputFiles({
      name: 'donor.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(donorC)),
    });
    await page.getByRole('button', { name: 'Validate and Bond' }).click();
    await page.locator('.assembly-bond-draft-status[data-error="true"]').waitFor();
    assert.match(await page.locator('.assembly-bond-draft-status').textContent(), /Duplicate/);
    assert.equal(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).assemblyPreview.bonds,
      1,
    );

    await page.locator('.assembly-bond-draft-form input[name="donorId"]').fill('C');
    await page.getByRole('button', { name: 'Validate and Bond' }).click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation?.snapshot().assemblyPreview.bonds === 2,
      null,
      { timeout: 60000 },
    );
    await page
      .locator('.assembly-bond-draft-status')
      .filter({ hasText: /Bonded C/ })
      .waitFor();
    await waitForPaint(page);
    const committed = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(committed.assemblyPreview.sources, 3);
    assert.equal(committed.sectionCollapse.enabled, false);
    assert.equal(committed.assemblyPreview.index, 2);
    assert.equal(committed.sharedIdentity, true);
    assert.equal(committed.workflow.writable, false);
    assert.match(await page.locator('.assembly-preview-stage').textContent(), /Z 1200 µm/);

    const checkpoints = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('wafercad-assembly-bond-drafts-v1', 2);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('checkpoints', 'readonly');
            const r = tx.objectStore('checkpoints').getAll();
            r.onsuccess = () => {
              db.close();
              resolve(r.result);
            };
            r.onerror = () => reject(r.error);
          };
        }),
    );
    assert.equal(checkpoints.length, 1, 'failed preflight must not write a Recovery point');
    assert.equal(checkpoints[0].reason, 'pre-wafer-bond');
    assert.deepEqual(checkpoints[0].project.waferAssembly, baseline.waferAssembly);
    assert.deepEqual(checkpoints[0].project.model, baseline.model);
    const originalWorkspaceId = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('wafercad-assembly-bond-drafts-v1', 2);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('workspaces', 'readonly');
            const request = tx.objectStore('workspaces').getAll();
            request.onsuccess = () => {
              db.close();
              resolve(request.result.length === 1 ? request.result[0].id : null);
            };
            request.onerror = () => reject(request.error);
          };
        }),
    );
    assert.ok(originalWorkspaceId, 'one committed workspace must exist after the Bond');

    await page.locator('.assembly-preview-views [data-view="three"]').click();
    await waitForPaint(page);
    await page.screenshot({ path: resolve(output, 'bond-three-after-commit.png') });
    await page.getByRole('button', { name: '← Bond' }).click();
    await page.waitForFunction(
      () => document.querySelector('.assembly-preview-controls')?.dataset.bondIndex === '1',
    );
    assert.equal(await page.getByRole('button', { name: 'Validate and Bond' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Bond →' }).click();
    await page.waitForFunction(
      () => document.querySelector('.assembly-preview-controls')?.dataset.bondIndex === '2',
    );
    assert.deepEqual(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
      committed.model,
    );

    const exportPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Export full Assembly' }).click();
    const downloaded = await exportPromise;
    const bytes = await readFile(await downloaded.path());
    const reloaded = await readProjectFile({
      size: bytes.length,
      text: async () => bytes.toString('utf8'),
    });
    assert.equal(reloaded.waferAssembly.sources.length, 3);
    assert.equal(reloaded.waferAssembly.bonds.length, 2);
    assert.deepEqual(
      reloaded.waferAssembly.sources[0].project.model,
      baseline.waferAssembly.sources[0].project.model,
    );
    assert.deepEqual(reloaded.model, committed.model);
    const recoveryPage = await context.newPage();
    try {
      const recoveryErrors = observePageErrors(recoveryPage);
      await recoveryPage.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await recoveryPage.getByLabel('Assembly Bond Recovery checkpoint').waitFor();
      await recoveryPage
        .getByRole('button', { name: 'Restore Assembly Recovery' })
        .waitFor({ state: 'visible' });
      await recoveryPage.waitForFunction(
        () => {
          const select = document.querySelector('[aria-label="Assembly Bond Recovery checkpoint"]');
          return Boolean(select && select.options.length && !select.disabled);
        },
        null,
        { timeout: 15000 },
      );
      const checkpointOption = await recoveryPage
        .getByLabel('Assembly Bond Recovery checkpoint')
        .locator('option')
        .evaluateAll(
          (options) => options.find((option) => option.value.startsWith('checkpoint:'))?.value,
        );
      assert.ok(checkpointOption, 'pre-Bond checkpoint remains independently recoverable');
      await recoveryPage
        .getByLabel('Assembly Bond Recovery checkpoint')
        .selectOption(checkpointOption);
      await recoveryPage.getByRole('button', { name: 'Restore Assembly Recovery' }).click();
      await recoveryPage.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      const recovered = await recoveryPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(recovered.assemblyPreview.sources, 2);
      assert.equal(recovered.assemblyPreview.bonds, 1);
      assert.deepEqual(recovered.model, baseline.model);
      assert.equal(recovered.workflow.writable, false);
      assert.deepEqual(recoveryErrors, []);
    } finally {
      await recoveryPage.close();
    }

    // Fork A+B into a physically independent D alternative, keeping C on Main.
    await page.getByRole('button', { name: '← Bond' }).click();
    await page.waitForFunction(
      () => document.querySelector('.assembly-preview-controls')?.dataset.bondIndex === '1',
    );
    await page.getByRole('button', { name: 'Fork from current Bond' }).click();
    await page.waitForFunction(
      () => document.querySelector('.assembly-bond-variants select')?.options.length === 2,
    );
    await page
      .locator('.assembly-bond-variants')
      .getByLabel('Bond Variant', { exact: true })
      .selectOption('variant-1');
    await page.locator('.assembly-bond-draft-form input[name="donorId"]').fill('D');
    await page.locator('.assembly-bond-draft-form input[name="dx"]').fill('10');
    await page.getByLabel('Select independent donor wafer').setInputFiles({
      name: 'donor-d.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(source('donor D', 350))),
    });
    await page.getByRole('button', { name: 'Validate and Bond' }).click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation?.snapshot().assemblyPreview.bonds === 2 &&
        window.WaferCadV2Workstation?.snapshot().assemblyPreview.originDisplayColors.length >= 3,
      null,
      { timeout: 60000 },
    );
    // Model publication occurs before IndexedDB commit; wait for the durable
    // operation completion UI, not just the in-memory Bond counter.
    await page
      .locator('.assembly-bond-draft-status')
      .filter({ hasText: /Bonded D/ })
      .waitFor();
    const alternate = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(alternate.assemblyPreview.sources, 3);
    assert.match(await page.locator('.assembly-preview-stage').textContent(), /Z 1150 µm/);
    assert.notDeepEqual(alternate.model, committed.model);
    assert.match(
      await page.locator('.assembly-bond-draft-status').textContent(),
      /Export all Variants/,
    );
    await page.locator('.assembly-preview-views [data-view="three"]').click();
    await waitForPaint(page);
    await page.screenshot({ path: resolve(output, 'variant-d-alternative.png') });

    const graphDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Export all Variants' }).click();
    const graphDownload = await graphDownloadPromise;
    assert.match(graphDownload.suggestedFilename(), /\.wafercad-variants\.json$/);
    const graphBytes = await readFile(await graphDownload.path());
    const graph = JSON.parse(graphBytes.toString('utf8'));
    assert.equal(graph.sources.length, 4);
    assert.equal(graph.branches.length, 2);
    assert.deepEqual(
      graph.branches.map((b) => b.bonds.at(-1).donorId),
      ['C', 'D'],
    );
    assert.deepEqual(graph.branches[0].sourceRefs, [0, 1, 2]);
    assert.deepEqual(graph.branches[1].sourceRefs, [0, 1, 3]);

    await page.getByLabel('Bond Variant', { exact: true }).selectOption('main');
    await page.waitForFunction(() =>
      document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1200 µm'),
    );
    const switchedMain = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.deepEqual(switchedMain.model, committed.model);
    assert.match(await page.locator('.assembly-preview-stage').textContent(), /Z 1200 µm/);
    assert.equal(switchedMain.workflow.writable, false);
    await page.getByLabel('Bond Variant', { exact: true }).selectOption('variant-1');
    await page.waitForFunction(() =>
      document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1150 µm'),
    );
    assert.deepEqual(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
      alternate.model,
    );
    assert.match(await page.locator('.assembly-preview-stage').textContent(), /Z 1150 µm/);

    const sidecarTab = await context.newPage();
    try {
      const sidecarErrors = observePageErrors(sidecarTab);
      await sidecarTab.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await sidecarTab.getByLabel('Open bonded Assembly project').setInputFiles({
        name: graphDownload.suggestedFilename(),
        mimeType: 'application/json',
        buffer: graphBytes,
      });
      await sidecarTab.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      const sidecarView = await sidecarTab.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.deepEqual(sidecarView.model, alternate.model);
      assert.equal(sidecarView.assemblyPreview.bonds, 2);
      assert.match(await sidecarTab.locator('.assembly-preview-stage').textContent(), /Z 1150 µm/);
      await sidecarTab.locator('.assembly-bond-draft-tools summary').click();
      assert.equal(
        await sidecarTab.getByLabel('Bond Variant', { exact: true }).locator('option').count(),
        2,
      );
      await sidecarTab.getByLabel('Bond Variant', { exact: true }).selectOption('main');
      await sidecarTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1200 µm'),
      );
      assert.deepEqual(
        (await sidecarTab.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        committed.model,
      );
      assert.match(await sidecarTab.locator('.assembly-preview-stage').textContent(), /Z 1200 µm/);
      assert.deepEqual(sidecarErrors, []);
    } finally {
      await sidecarTab.close();
    }

    const committedTab = await context.newPage();
    try {
      const committedErrors = observePageErrors(committedTab);
      await committedTab.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await committedTab.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('[aria-label="Assembly Bond Recovery checkpoint"] option'),
          ).some((option) => option.value.startsWith('workspace:')),
        null,
        { timeout: 20000 },
      );
      const committedOption = `workspace:${originalWorkspaceId}`;
      assert.ok(
        await committedTab
          .getByLabel('Assembly Bond Recovery checkpoint')
          .locator(`option[value="${committedOption}"]`)
          .count(),
        'original tab workspace must be independently recoverable',
      );
      await committedTab
        .getByLabel('Assembly Bond Recovery checkpoint')
        .selectOption(committedOption);
      await committedTab.getByRole('button', { name: 'Restore Assembly Recovery' }).click();
      await committedTab.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      const latest = await committedTab.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(latest.assemblyPreview.sources, 3);
      assert.deepEqual(latest.model, alternate.model);
      await committedTab.locator('.assembly-bond-draft-tools summary').click();
      assert.equal(
        await committedTab.getByLabel('Bond Variant', { exact: true }).locator('option').count(),
        2,
      );
      await committedTab.getByLabel('Bond Variant', { exact: true }).selectOption('main');
      await committedTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1200 µm'),
      );
      assert.deepEqual(
        (await committedTab.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        committed.model,
      );
      // The original tab has the same workspace ID but now a stale revision.
      // It must not overwrite the committed state of the newly recovered tab.
      await page.getByLabel('Bond Variant', { exact: true }).selectOption('main');
      await page.locator('.assembly-bond-draft-status[data-error="true"]').waitFor();
      assert.match(
        await page.locator('.assembly-bond-draft-status').textContent(),
        /revision conflict/,
      );
      assert.deepEqual(
        (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        alternate.model,
      );
      assert.deepEqual(committedErrors, []);
    } finally {
      await committedTab.close();
    }

    // Post-Bond geometry is stored only in the source-aware Variant sidecar.
    // Confirm a derived 1.8 µm Deposit appears in real 3D/Section, while the
    // physically canonical v15 bonded baseline remains unchanged.
    const processTab = await context.newPage();
    try {
      const processErrors = observePageErrors(processTab);
      await processTab.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await processTab.waitForFunction(
        (workspaceId) =>
          Boolean(document.querySelector(`option[value="workspace:${workspaceId}"]`)),
        originalWorkspaceId,
        { timeout: 20000 },
      );
      await processTab
        .getByLabel('Assembly Bond Recovery checkpoint')
        .selectOption(`workspace:${originalWorkspaceId}`);
      await processTab.getByRole('button', { name: 'Restore Assembly Recovery' }).click();
      await processTab.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      await processTab.locator('.assembly-bond-draft-tools summary').click();
      await processTab.getByLabel('Post-Bond Process material').fill('SiO2');
      await processTab.getByLabel('Post-Bond Process thickness µm').fill('1.8');
      await processTab.getByRole('button', { name: 'Apply Process preview' }).click();
      await processTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1201.8 µm'),
      );
      await processTab
        .locator('.assembly-bond-post-process-count')
        .filter({ hasText: /Process 1 \/ 1/ })
        .waitFor();
      const processBaseline = await processTab.evaluate(() =>
        window.WaferCadV2Workstation.snapshot(),
      );
      assert.deepEqual(processBaseline.model, committed.model);
      await processTab.locator('.assembly-preview-views [data-view="three"]').click();
      await waitForPaint(processTab);
      await processTab.screenshot({ path: resolve(output, 'postbond-deposit-three.png') });
      await processTab.locator('.assembly-preview-views [data-view="section"]').click();
      await waitForPaint(processTab);
      await processTab.screenshot({ path: resolve(output, 'postbond-deposit-section.png') });
      // Same Recipe: deposit 1.8 µm, then directional etch 0.5 µm.
      await processTab
        .getByLabel('Post-Bond Process operation')
        .selectOption('etch');
      await processTab.getByLabel('Post-Bond Process thickness µm').fill('0.5');
      await processTab.getByRole('button', { name: 'Apply Process preview' }).click();
      await processTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1201.3 µm'),
      );
      await processTab
        .locator('.assembly-bond-post-process-count')
        .filter({ hasText: /Process 2 \/ 2/ })
        .waitFor();
      await processTab.getByRole('button', { name: '← Process' }).click();
      await processTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1201.8 µm'),
      );
      await processTab
        .locator('.assembly-bond-post-process-count')
        .filter({ hasText: /Process 1 \/ 2/ })
        .waitFor();
      assert.equal(await processTab.getByRole('button', { name: 'Apply Process preview' }).isDisabled(), true);
      await processTab.getByRole('button', { name: '← Process' }).click();
      await processTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1200 µm'),
      );
      await processTab.getByRole('button', { name: 'Process →' }).click();
      await processTab.waitForFunction(() =>
        document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1201.8 µm'),
      );
      const afterProcessDownload = processTab.waitForEvent('download', { timeout: 30000 });
      await processTab.getByRole('button', { name: 'Export all Variants' }).click();
      const savedProcessFile = await afterProcessDownload;
      const savedProcessBytes = await readFile(await savedProcessFile.path());
      const savedGraph = JSON.parse(savedProcessBytes.toString('utf8'));
      assert.equal(savedGraph.branches[0].postBondSteps.length, 2);
      assert.equal(savedGraph.branches[0].postBondCursor, 1);
      assert.equal(savedGraph.branches[1].postBondSteps.length, 0);

      const restoredProcessTab = await context.newPage();
      try {
        await restoredProcessTab.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
          waitUntil: 'domcontentloaded',
        });
        await restoredProcessTab.getByLabel('Open bonded Assembly project').setInputFiles({
          name: 'postbond.wafercad-variants.json',
          mimeType: 'application/json',
          buffer: savedProcessBytes,
        });
        await restoredProcessTab.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
          timeout: 90000,
        });
        assert.match(
          await restoredProcessTab.locator('.assembly-preview-stage').textContent(),
          /Z 1201.8 µm/,
        );
        await restoredProcessTab.locator('.assembly-bond-draft-tools summary').click();
        assert.match(
          await restoredProcessTab.locator('.assembly-bond-post-process-count').textContent(),
          /Process 1 \/ 2/,
        );
        await restoredProcessTab.getByRole('button', { name: 'Process →' }).click();
        await restoredProcessTab.waitForFunction(() =>
          document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1201.3 µm'),
        );
        await restoredProcessTab
          .getByLabel('Bond Variant', { exact: true })
          .selectOption('variant-1');
        await restoredProcessTab.waitForFunction(() =>
          document.querySelector('.assembly-preview-stage')?.textContent.includes('Z 1150 µm'),
        );
        assert.deepEqual(
          (await restoredProcessTab.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
          alternate.model,
        );
      } finally {
        await restoredProcessTab.close();
      }
      assert.deepEqual(processErrors, []);
    } finally {
      await processTab.close();
    }

    assert.deepEqual(errors, [], 'No uncaught page errors during transaction or export');
    console.log('Native Assembly Bond draft: donor C, durable Recovery, Undo/Redo, export = OK');
    console.log('Native Bond Variants: fork C/D, Main switch, sidecar reload = OK');
  } finally {
    await context.close();
  }

  // A separate browser context: start from *two independent* .wafercad files.
  const { context: firstContext, page: firstPage } = await newUiPage(browser, {
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  try {
    const firstErrors = observePageErrors(firstPage);
    const receiver = source('Independent receiver A');
    const donor = source('Independent donor B');
    await firstPage.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
      waitUntil: 'domcontentloaded',
    });
    await firstPage.getByLabel('Open bonded Assembly project').setInputFiles({
      name: 'receiver.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(receiver)),
    });
    await firstPage.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 90000,
    });
    const beforeFirst = await firstPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(beforeFirst.assemblyPreview.sources, 1);
    assert.equal(beforeFirst.assemblyPreview.bonds, 0);
    assert.equal(beforeFirst.assemblyPreview.index, 0);
    assert.deepEqual(beforeFirst.model, receiver.model);
    assert.equal(beforeFirst.workflow.writable, false);
    assert.match(await firstPage.locator('.assembly-preview-stage').textContent(), /Z 400 µm/);
    await firstPage.locator('.assembly-bond-draft-tools summary').click();
    assert.equal(await firstPage.locator('input[name="receiverId"]').inputValue(), 'A');
    assert.equal(await firstPage.locator('input[name="donorId"]').inputValue(), 'B');
    await firstPage.getByLabel('Select independent donor wafer').setInputFiles({
      name: 'donor.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeProject(donor)),
    });
    await firstPage.getByRole('button', { name: 'Validate and Bond' }).click();
    await firstPage.waitForFunction(
      () => window.WaferCadV2Workstation?.snapshot().assemblyPreview.bonds === 1,
      null,
      { timeout: 60000 },
    );
    const afterFirst = await firstPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(afterFirst.assemblyPreview.sources, 2);
    assert.equal(afterFirst.sectionCollapse.enabled, false);
    assert.equal(afterFirst.assemblyPreview.index, 1);
    assert.equal(afterFirst.sharedIdentity, true);
    assert.equal(afterFirst.workflow.writable, false);
    assert.match(await firstPage.locator('.assembly-preview-stage').textContent(), /Z 800 µm/);
    await firstPage.locator('.assembly-preview-views [data-view="three"]').click();
    await waitForPaint(firstPage);
    await firstPage.screenshot({ path: resolve(output, 'first-bond-two-independent-wafers.png') });

    await firstPage.getByRole('button', { name: '← Bond' }).click();
    const undone = await firstPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.deepEqual(undone.model, receiver.model);
    await firstPage.getByRole('button', { name: 'Bond →' }).click();
    assert.deepEqual(
      (await firstPage.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
      afterFirst.model,
    );

    const downloadPromise = firstPage.waitForEvent('download', { timeout: 30000 });
    await firstPage.getByRole('button', { name: 'Export full Assembly' }).click();
    const exportFile = await downloadPromise;
    const fileBytes = await readFile(await exportFile.path());
    const assembled = await readProjectFile({
      size: fileBytes.length,
      text: async () => fileBytes.toString('utf8'),
    });
    assert.equal(assembled.waferAssembly.sources.length, 2);
    assert.equal(assembled.waferAssembly.bonds.length, 1);
    assert.equal(assembled.waferAssembly.sources[0].id, 'A');
    assert.equal(assembled.waferAssembly.sources[1].id, 'B');
    assert.deepEqual(assembled.waferAssembly.sources[0].project.model, receiver.model);
    assert.deepEqual(assembled.waferAssembly.sources[1].project.model, donor.model);
    assert.deepEqual(assembled.model, afterFirst.model);

    const recoveryPage = await firstContext.newPage();
    try {
      await recoveryPage.goto(`${base}/app.html?assemblyPreview=1&bondEdit=1`, {
        waitUntil: 'domcontentloaded',
      });
      await recoveryPage.waitForFunction(
        () => {
          const select = document.querySelector('[aria-label="Assembly Bond Recovery checkpoint"]');
          return Boolean(select?.options.length && !select.disabled);
        },
        null,
        { timeout: 20000 },
      );
      const checkpointOption = await recoveryPage
        .getByLabel('Assembly Bond Recovery checkpoint')
        .locator('option')
        .evaluateAll(
          (options) => options.find((option) => option.value.startsWith('checkpoint:'))?.value,
        );
      assert.ok(checkpointOption, 'pre-Bond checkpoint remains independently recoverable');
      await recoveryPage
        .getByLabel('Assembly Bond Recovery checkpoint')
        .selectOption(checkpointOption);
      await recoveryPage.getByRole('button', { name: 'Restore Assembly Recovery' }).click();
      await recoveryPage.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 90000,
      });
      const recovered = await recoveryPage.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(recovered.assemblyPreview.sources, 1);
      assert.equal(recovered.assemblyPreview.bonds, 0);
      assert.deepEqual(recovered.model, receiver.model);
      assert.equal(recovered.workflow.writable, false);
    } finally {
      await recoveryPage.close();
    }
    assert.deepEqual(firstErrors, [], 'First-Bond Chromium produced no uncaught browser errors');
    console.log('Native first Bond: two independent sources, Recovery, Undo/Redo, export = OK');
  } finally {
    await firstContext.close();
  }
} finally {
  await browser.close();
}
