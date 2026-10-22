// PR #352: real-origin acceptance of the PUBLISHED Microdisk M08/M09,
// including exact inverted-mask Worker history replay, Recovery and Recipe.
// Run against the production v2 app, never a simulated renderer/project.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/pr352-published-microdisk-workstation');
const url = `${base}/app.html?start=example&example=suspended-silica-microdisk`;
const report = {
  status: 'running',
  source: 'suspended-silica-microdisks-continuous.wafercad',
  scenarios: [],
  pageErrors: [],
};
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const snapshot = (page) => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const ready = (page) =>
  page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
async function screenshot(page, name) {
  const path = resolve(output, name + '.png');
  await page.screenshot({ path, animations: 'disabled', timeout: 120000 });
  report.scenarios.push({
    image: name + '.png',
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
  });
}
async function published(page) {
  return page.evaluate(async () => {
    const response = await fetch('/examples/suspended-silica-microdisks-continuous.wafercad');
    if (!response.ok) throw new Error('Published Continuous Microdisk HTTP ' + response.status);
    const project = await (
      await import('/project-io.js')
    ).readProjectFile(new File([await response.blob()], 'published-microdisk.wafercad'));
    const snapshot = (id) => project.snapshots.find((s) => s.id === `snapshot-microdisk-${id}`);
    const source = snapshot('07')?.state?.model;
    const released = snapshot('08')?.state?.model;
    const final = snapshot('09')?.state?.model;
    if (!source || !released || !final) throw new Error('Actual published M07/M08/M09 absent');
    return {
      source,
      released,
      final,
      name: project.name,
      recipe: project.processRecipe,
      nodeIds: project.snapshotBranches.nodes.map((n) => n.id),
      m08Replay: project.snapshotBranches.nodes.find((n) => n.id === 'process-microdisk-08')
        ?.operation?.replay,
    };
  });
}
async function assertMaterial(page, model, label, expectedVerticalUm = 36) {
  const result = await page.evaluate(async () => {
    const { continuousModelMaterialAt, validateContinuousEtchModel } =
      await import('/continuous-etch-model.js');
    const current = window.WaferCadV2Workstation.snapshot().model;
    validateContinuousEtchModel(current);
    const witnesses = [
      [0, 0, 39],
      [110, 0, 30],
      [145, 0, 40.5],
      [155, 0, 15],
      [85, 0, 35],
      [118, 18, 35],
    ];
    return {
      witnessCount: witnesses.length,
      materials: witnesses.map((p) => continuousModelMaterialAt(current, p)),
      front: current.continuousEtchOwner.fronts[0],
      clip: current.continuousEtchOwner.operation.clip,
      processRevision: current.processRevision,
    };
  });
  assert.equal(result.front.shape, 'circular', label + ': real analytic front');
  assert.equal(result.front.verticalUm, expectedVerticalUm, label + ': physical release depth');
  assert.deepEqual(
    result.clip,
    model.continuousEtchOwner.operation.clip,
    label + ': original inverted GDS mask',
  );
  const expected = await page.evaluate(async (reference) => {
    const { continuousModelMaterialAt } = await import('/continuous-etch-model.js');
    return [
      [0, 0, 39],
      [110, 0, 30],
      [145, 0, 40.5],
      [155, 0, 15],
      [85, 0, 35],
      [118, 18, 35],
    ].map((p) => continuousModelMaterialAt(reference, p));
  }, model);
  assert.deepEqual(
    result.materials,
    expected,
    label + ': all six independent published physical witnesses',
  );
  return result;
}
async function openExample() {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => report.pageErrors.push(error.stack || error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await ready(page);
  assert.notEqual(new URL(page.url()).origin, 'null', 'Normal origin is required');
  return { page, context };
}
async function save(page, name) {
  await page.locator('[data-action="domain:project"]').click();
  await page.locator('#projectNameInput').fill(name);
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    (text) =>
      (document.querySelector('[data-slot="status.message"]')?.textContent || '').includes(
        `Saved "${text}" locally`,
      ),
    name,
    { timeout: 120000 },
  );
}
async function recoveryPoints(page) {
  return page.evaluate(async () => {
    const storage = await import('/workspace-persistence.js');
    const list = [];
    for (const point of await storage.listWorkspaceRecoveryPoints())
      list.push({
        key: point.key,
        name: (await storage.loadWorkspaceRecoveryPoint(point.key))?.name,
      });
    return list;
  });
}
let context;
try {
  // Case A: M07 -> M08 -> M09 uses actual History, then edits M08 and
  // forces M09 to replay via the real Worker transaction. Recovery undoes it.
  {
    const entry = await openExample();
    context = entry.context;
    const page = entry.page;
    try {
      const project = await published(page);
      const original = await snapshot(page);
      assert.equal(original.workflow.writable, true, 'Published project must own writer lease');
      assert.equal(original.workflow.steps.length, 9);
      assert.equal(original.model.kernel, 'vector-continuous-etch-v1');
      assert.deepEqual(original.model, project.final);
      assert.equal(project.nodeIds.length, 9);
      assert.equal(project.m08Replay.areaMode, 'invert');
      report.example = { source: original.source, steps: 9, replayArea: 'invert' };
      await assertMaterial(page, project.released, 'Original published M08');
      // A durable starting checkpoint also proves that navigating History
      // cannot accidentally discard an imported publication project.
      await save(page, 'PR352 Published Microdisk original');
      const originalPoint = (await recoveryPoints(page)).find(
        (x) => x.name === 'PR352 Published Microdisk original',
      );
      assert.ok(originalPoint, 'Original 36 um source must have a durable Recovery checkpoint');
      await page.locator('[data-action="domain:history"]').click();
      const restore = async (stepId, expectedKernel) => {
        await page
          .locator(
            `#snapshotList .history-step-wrap[data-step-id="process-microdisk-${stepId}"] .history-step-row`,
          )
          .click();
        try {
          await page.waitForFunction(
            ({ kernel, nodeId }) => {
              const current = window.WaferCadV2Workstation.snapshot();
              return current.model.kernel === kernel && current.workflow.position.nodeId === nodeId;
            },
            { kernel: expectedKernel, nodeId: `process-microdisk-${stepId}` },
            { timeout: 30000 },
          );
        } catch (error) {
          const diagnostic = await page.evaluate((id) => {
            const state = window.WaferCadV2Workstation.snapshot();
            const row = document.querySelector(
              `#snapshotList .history-step-wrap[data-step-id="process-microdisk-${id}"]`,
            );
            return {
              step: id,
              message: document.querySelector('[data-slot="status.message"]')?.textContent,
              kernel: state.model.kernel,
              writable: state.workflow.writable,
              dirty: state.workflow.dirty,
              busy: state.workflow.busy,
              cursor: row?.querySelector('.history-step-row')?.dataset.cursor || null,
              rowClass: row?.querySelector('.history-step-row')?.className,
              dialogs: [...document.querySelectorAll('dialog,[role="dialog"]')]
                .filter((el) => el.getBoundingClientRect().width > 0)
                .map((el) => ({ text: el.textContent?.slice(0, 500) })),
            };
          }, stepId);
          report.scenarios.push({ action: 'History restore diagnostic', ...diagnostic });
          await screenshot(page, `m${stepId}-restore-failure`);
          throw new Error(
            `Actual M${stepId} restore failed: ${JSON.stringify(diagnostic)}: ${error}`,
          );
        }
      };
      await restore('07', 'vector-2.5d-v1');
      assert.deepEqual(
        (await snapshot(page)).model,
        project.source,
        'M07 History must restore the real predecessor',
      );
      await restore('08', 'vector-continuous-etch-v1');
      assert.deepEqual(
        (await snapshot(page)).model,
        project.released,
        'M08 History must restore exact release',
      );
      await restore('09', 'vector-continuous-etch-v1');
      assert.deepEqual(
        (await snapshot(page)).model,
        project.final,
        'M09 Record keeps exact geometry',
      );
      await page.locator('[data-action="domain:history"]').click();
      const m08 = page.locator(
        '#snapshotList .history-step-wrap[data-step-id="process-microdisk-08"]',
      );
      await m08.locator('.snapshot-more-trigger[aria-label="Step actions"]').click();
      const edit = m08.locator('.snapshot-more-popover button', { hasText: 'Edit Step' });
      assert.equal(await edit.isEnabled(), true, 'Published M08 is replayable');
      await edit.click();
      await page.waitForFunction(
        () =>
          document.querySelector('#operationType')?.value === 'etch' &&
          document.querySelector('#etchProfile')?.value === 'continuous',
        null,
        { timeout: 120000 },
      );
      assert.equal(await page.locator('#operationArea').inputValue(), 'invert');
      assert.equal(await page.locator('#etchTargetLayer').inputValue(), 'base');
      // Circular profile couples lateral reach to physical etch depth.
      // The lateral-only input is hidden and would be ignored by Apply.
      await page.locator('#operationThickness').fill('36.1');
      await page.locator('#applyOperationBtn').click();
      await page
        .getByRole('button', { name: 'Replace & replay later Steps', exact: true })
        .click({ timeout: 30000 });
      await page.waitForFunction(
        () => {
          const state = window.WaferCadV2Workstation.snapshot();
          return (
            !state.workflow.busy &&
            state.workflow.steps.length === 9 &&
            state.model?.continuousEtchOwner?.fronts?.[0]?.lateralUm === 36.1
          );
        },
        null,
        { timeout: 180000 },
      );
      const edited = await snapshot(page);
      const changed = await assertMaterial(page, project.released, 'Edited historical M08', 36.1);
      assert.equal(changed.front.lateralUm, 36.1);
      assert.notDeepEqual(
        edited.model,
        project.final,
        'History edit must really recompute physical material',
      );
      const recorded = edited.workflow.steps.at(-1);
      const penultimate = edited.workflow.steps.at(-2);
      assert.equal(recorded.operation?.kind, 'record', 'Replay must retain M09 record at HEAD');
      assert.equal(penultimate.operation?.kind, 'etch', 'Replay must retain M08 etch');
      assert.equal(
        edited.model.processRevision,
        penultimate.processRevision,
        'M09 metadata cannot increment analytic material revision',
      );
      report.scenarios.push({
        action: 'History Worker replay',
        steps: edited.workflow.steps.length,
        frontLateralUm: 36.1,
      });
      await screenshot(page, 'm08-edited-with-m09-replayed');
      await save(page, 'PR352 Published Microdisk edited');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready(page);
      assert.deepEqual(
        (await snapshot(page)).model,
        edited.model,
        'Reload preserves modified exact owner',
      );
      await page.locator('[data-action="domain:project"]').click();
      await page.waitForFunction(
        (key) =>
          [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
            (o) => o.value === key,
          ),
        originalPoint.key,
        { timeout: 120000 },
      );
      await page.locator('#workspaceRecoverySelect').selectOption(originalPoint.key);
      await page.locator('#workspaceRestoreBtn').click();
      await page
        .locator('.v2-confirm-dialog')
        .getByRole('button', { name: 'Restore', exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (document.querySelector('[data-slot="status.message"]')?.textContent || '').includes(
            'Restored local recovery checkpoint',
          ),
        null,
        { timeout: 120000 },
      );
      assert.deepEqual(
        (await snapshot(page)).model,
        project.final,
        'Recovery restores the original 36 um physical owner',
      );
      assert.equal(
        (await snapshot(page)).workflow.steps.length,
        9,
        'Recovery restores the nine steps',
      );
      await screenshot(page, 'm08-after-recovery');
      report.scenarios.push({ action: 'Published History Save/Reload/Recovery', status: 'pass' });
    } finally {
      await context.close();
      context = null;
    }
  }
  // Case B: full published Recipe from an actual rebuilt Base: masks, M08,
  // and final Record must be executed, not read from the stored M09 snapshot.
  {
    const entry = await openExample();
    context = entry.context;
    const page = entry.page;
    try {
      const project = await published(page);
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('[data-action="process-mode:recipe"]').click();
      await page.locator('#recipeRunStart').selectOption('new-base');
      assert.doesNotMatch(
        await page.locator('#recipeValidation').innerText(),
        /✕|follow-on Process on exact continuous material is unsupported/,
      );
      await page.locator('#recipeRunAllBtn').click();
      const clear = page.getByRole('button', { name: 'Clear history', exact: true });
      if (await clear.isVisible().catch(() => false)) await clear.click();
      await page.waitForFunction(
        () =>
          /^(Completed|Failed|Stopped):/.test(
            document.querySelector('#recipeRunSummary')?.textContent || '',
          ),
        null,
        { timeout: 360000 },
      );
      const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
      report.recipeSummary = summary;
      assert.match(
        summary,
        new RegExp(
          `^Completed: ${project.recipe.steps.length}/${project.recipe.steps.length} steps committed`,
        ),
      );
      const replay = await snapshot(page);
      assert.equal(replay.model.kernel, 'vector-continuous-etch-v1');
      // Recipe's explicit steps are M02–M09; Rebuild Base establishes its
      // starting wafer outside this operation history. Compare committed
      // Recipe steps, not the separately published M01–M09 bookmark count.
      assert.equal(replay.workflow.steps.length, project.recipe.steps.length);
      assert.equal(replay.workflow.steps.at(-1)?.operation?.kind, 'record');
      assert.equal(replay.workflow.steps.at(-2)?.operation?.kind, 'etch');
      assert.equal(
        replay.workflow.steps.at(-1).processRevision,
        replay.model.processRevision,
        'Final Record must preserve the exact release revision',
      );
      const replayMaterials = await assertMaterial(page, project.released, 'Real Recipe Run All');
      assert.equal(replayMaterials.front.lateralUm, 36);
      await screenshot(page, 'published-recipe-after-runall');
      report.scenarios.push({
        action: 'Published full Recipe Run All',
        steps: project.recipe.steps.length,
        status: 'pass',
      });
    } finally {
      await context.close();
      context = null;
    }
  }
  assert.deepEqual(
    report.pageErrors,
    [],
    'Production Workstation must not throw browser exceptions',
  );
  report.status = 'pass';
  console.log(
    'PR352 PUBLISHED M08/M09: real History Worker replay, Recovery, full Recipe Run All PASS',
  );
} catch (error) {
  report.status = 'fail';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  await context?.close().catch(() => {});
  await browser.close();
}
