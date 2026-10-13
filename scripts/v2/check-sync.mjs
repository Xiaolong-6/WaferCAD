// Stage C owns real Project/Mask/Process/History sequences on the shared four-view runtime.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { PROJECT_LENGTH_QUANTUM_UM, readProjectFile } from '../../site/project-io.js';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-sync');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  cases: [],
};

function assertModelPersistence(actual, expected, path = 'model') {
  if (typeof expected === 'number') {
    const physicalLength =
      /(?:boundary|geom|width|height|thickness|diameter|radius|depth|length|distance|offset|\.z[01](?:\.|$))/i.test(
        path,
      );
    if (physicalLength) {
      assert.equal(typeof actual, 'number', `${path}: numeric type`);
      assert.ok(
        Math.abs(actual - expected) <= PROJECT_LENGTH_QUANTUM_UM + 1e-12,
        `${path}: physical serialization drift exceeds 0.1 nm`,
      );
    } else assert.equal(actual, expected, `${path}: metadata value`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: array type`);
    assert.equal(actual.length, expected.length, `${path}: topology length`);
    for (let index = 0; index < expected.length; index++)
      assertModelPersistence(actual[index], expected[index], `${path}[${index}]`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${path}: object type`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys`);
    for (const key of Object.keys(expected))
      assertModelPersistence(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.equal(actual, expected, `${path}: value`);
}

const browser = await launchBrowser();
try {
  report.browser = browser.version();
  for (const [width, hasTouch] of [
    [1440, false],
    [1024, false],
    [768, false],
    [390, false],
    [1024, true],
  ]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width, height: 960 },
      hasTouch,
      acceptDownloads: true,
    });
    try {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(
        `${base}/app.html?start=example&example=photodetector-literature`,
      );
      await page.waitForFunction(() => document.body.dataset.ready !== 'false');
      assert.equal(
        await page.locator('body').getAttribute('data-ready'),
        'true',
        await page.locator('body').innerText(),
      );
      const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const initial = await snap();
      console.log(`Sync ${width}${hasTouch ? ' touch' : ''}: shared runtime ready`);
      const panel = async (key) => {
        if (!(await page.locator(`.p-nav [data-action="domain:${key}"]`).isVisible()))
          await page.locator('[data-action="show-editor"]').click();
        await page.locator(`.p-nav [data-action="domain:${key}"]`).click();
        await waitForPaint(page);
      };
      const view = async (key) => {
        const returnResults = page.locator('[data-action="return-results"]:visible').first();
        if (await returnResults.isVisible()) await returnResults.click();
        if (key === 'section') {
          if (await page.locator('[data-action="mobile-section"]').isVisible())
            await page.locator('[data-action="mobile-section"]').click();
          else if (!(await page.locator('#sectionPanel').isVisible()))
            await page.locator('[data-action="section"]').click();
        } else await page.locator(`[data-action="view:${key}"]`).click();
        await waitForPaint(page);
      };
      await panel('process');
      await page.locator('[data-action="process-mode:code"]').click();
      const originalCode = await page.locator('#recipeCodeEditor').inputValue();
      await page.locator('#recipeCodeEditor').fill('// retained draft');
      for (const domain of ['project', 'mask', 'history']) {
        await panel(domain);
        assert.equal(await page.locator('#recipeCodeEditor').isVisible(), false);
        assert.equal(
          await page.locator('[data-slot="panel.process"]').isVisible(),
          false,
          'The Code layout must not override its hidden Process ancestor',
        );
        if (domain === 'mask') {
          assert.equal((await snap()).ui.maximize, 'mask');
          assert.equal((await snap()).ui.view, 'mask');
        }
      }
      const historyScroll = page.locator('#snapshotList');
      assert.equal(await historyScroll.isVisible(), true);
      // Compact rows can fit this fixture at full height. Exercise the real
      // scroll owner in a short window instead of depending on row padding.
      await page.setViewportSize({ width, height: 420 });
      const historyBounds = await historyScroll.evaluate((node) => ({
        client: node.clientHeight,
        scroll: node.scrollHeight,
      }));
      assert.ok(historyBounds.client > 0 && historyBounds.scroll > historyBounds.client);
      await historyScroll.hover();
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.getElementById('snapshotList').scrollTop > 0);
      await page.setViewportSize({ width, height: 960 });
      await panel('process');
      await page.locator('[data-action="process-mode:code"]').click();
      assert.equal(await page.locator('#recipeCodeEditor').inputValue(), '// retained draft');
      await page.locator('#recipeCodeEditor').fill(originalCode);
      await page.locator('[data-action="process-mode:step"]').click();
      await panel('project');
      const command = async (key, action) => {
        const button = page.locator(`[data-action="${action}"]`);
        if (!(await button.isVisible()))
          await page.locator(`#${key}Panel button[aria-label$="more tools"]`).click();
        await button.click();
        await waitForPaint(page);
      };
      const drag = async (selector, from = [0.3, 0.3], to = [0.6, 0.6]) => {
        const b = await page.locator(selector).boundingBox();
        assert.ok(b && b.width > 0 && b.height > 0);
        await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 8 });
        await page.mouse.up();
        await waitForPaint(page);
      };
      const ready3d = async () => {
        await view('three');
        await page.waitForFunction(
          () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
          null,
          { timeout: 120000 },
        );
        await waitForPaint(page);
      };
      assert.equal(initial.sharedIdentity, true);
      await ready3d();
      if (!report.webgl)
        report.webgl = await page.locator('#threeHost canvas').evaluate((c) => {
          const gl = c.getContext('webgl2'),
            ext = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
          return { renderer, software: /swiftshader|llvmpipe|software/i.test(renderer) };
        });
      const generation = await page.locator('#threeHost').getAttribute('data-scene-generation');
      await view('main');
      await command('main', 'roi');
      await page.locator('[data-action="roi-tool:rect"]').click();
      await drag('#mainCanvas', [0.4, 0.4], [0.6, 0.6]);
      await command('main', 'settings:main');
      for (const [id, value] of [
        ['roiX', '0'],
        ['roiY', '0'],
        ['roiWidth', '0.5'],
        ['roiHeight', '0.5'],
      ])
        await page.locator(`#${id}`).fill(value);
      await page
        .locator('#mainRoiSettings')
        .getByRole('button', { name: 'Apply', exact: true })
        .click();
      await page.getByRole('button', { name: 'Close Main ROI settings', exact: true }).click();
      await ready3d();
      assert.equal(await page.locator('#threeStats').innerText(), 'ROI');
      assert.notEqual(
        await page.locator('#threeHost').getAttribute('data-scene-generation'),
        generation,
      );
      await view('main');
      await command('main', 'slice-coordinates');
      for (const [id, value] of [
        ['sectionAx', '-2'],
        ['sectionAy', '0'],
        ['sectionBx', '2'],
        ['sectionBy', '0'],
      ]) {
        await page.locator(`#${id}`).fill(value);
        await page.locator(`#${id}`).press('Tab');
      }
      await page.getByRole('button', { name: 'Close Section line', exact: true }).click();
      await view('section');
      assert.equal(
        Number(
          (await page.locator('[data-slot="view.section.readout"]').innerText()).split(' ')[0],
        ),
        4,
      );
      await command('section', 'detail');
      await drag('#sectionCanvas', [0.25, 0.3], [0.5, 0.65]);
      assert.ok((await snap()).sectionDetailRoi);
      await command('section', 'zbreak-settings');
      await page.locator('#section-collapse-enabled').uncheck();
      await page.getByRole('button', { name: 'Close Z Break · physical µm', exact: true }).click();
      await ready3d();
      assert.equal(
        await page.locator('#threeHost').getAttribute('data-z-collapse-enabled'),
        'false',
      );
      await view('mask');
      await command('mask', 'mask-roi-toggle');
      await page.locator('[data-action="mask-roi-tool:square"]').click();
      await drag('#maskCanvas');
      await command('mask', 'mask-roi-settings');
      for (const [id, value] of [
        ['maskRoiX', '0'],
        ['maskRoiY', '0'],
        ['maskRoiSize', '1'],
      ])
        await page.locator(`#${id}`).fill(value);
      await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
      await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
      const inspection = await snap();
      assert.deepEqual(
        inspection.model,
        initial.model,
        'Inspecting all three ROI domains never changes physical geometry',
      );
      assert.equal(inspection.maskRoi.size, 1);
      assert.equal(inspection.roi.b[0] - inspection.roi.a[0], 0.5);
      await panel('project');
      for (const [unit, factor] of [
        ['nm', 1000],
        ['mm', 0.001],
        ['um', 1],
      ]) {
        await page.locator('#xyUnitSelect').selectOption(unit);
        assert.equal(
          Number(await page.locator('#baseWidth').inputValue()),
          inspection.model.width * factor,
        );
        assert.deepEqual(
          (await snap()).model,
          inspection.model,
          'Display units never change stored geometry',
        );
        assert.deepEqual((await snap()).roi, inspection.roi);
        assert.deepEqual((await snap()).maskRoi, inspection.maskRoi);
      }
      if (width === 1440) {
        await page.getByRole('heading', { name: 'Base', exact: true }).click();
        assert.equal(await page.locator('#substrateShape').isVisible(), false);
        assert.equal(await page.locator('#baseHeight').isVisible(), true);
      }
      await view('main');
      await command('main', 'face:main');
      assert.equal((await snap()).activeFace, inspection.activeFace === 'front' ? 'back' : 'front');
      assert.equal((await snap()).workflow.processFace, 'front');
      assert.equal(await page.locator('#mainFaceBtn').getAttribute('aria-pressed'), null);
      await panel('process');
      if (width === 1440) {
        await page.locator('#operationThickness').fill('0.07');
        await page.locator('#operationThickness').press('Tab');
        await page.getByRole('button', { name: 'Increase Thickness / depth' }).click();
        assert.equal(await page.locator('#operationThickness').inputValue(), '0.071');
        await page.getByRole('button', { name: 'Undo form edit' }).click();
        assert.equal(await page.locator('#operationThickness').inputValue(), '0.07');
        await page.getByRole('button', { name: 'Redo form edit' }).click();
        assert.equal(await page.locator('#operationThickness').inputValue(), '0.071');
        assert.equal(await page.locator('#applyOperationBtn svg').count(), 1);
        assert.equal(await page.locator('#v2MaterialPreview').isDisabled(), true);
      }
      const apply = async (name, depth, face) => {
        await page.locator('#operationType').selectOption('add');
        await page.locator('#operationArea').selectOption('full');
        await page.locator('#faceToggleBtn').selectOption(face);
        await page.locator('#layerName').fill(name);
        await page.locator('#operationThickness').fill(String(depth));
        await page.locator('#applyOperationBtn').click();
        const continuation = page.getByRole('button', {
          name: 'Create Variant & apply',
          exact: true,
        });
        if (await continuation.isVisible()) await continuation.click();
        await page.waitForFunction(
          (name) =>
            window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === name),
          name,
          { timeout: 120000 },
        );
        await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy);
        await waitForPaint(page);
      };
      await apply('Sync front', 0.125, 'front');
      const front = await snap();
      const layer = front.model.layers.find((l) => l.name === 'Sync front');
      assert.ok(layer);
      const coverage = await page.evaluate(async (id) => {
        const { pointInMulti } = await import('./vector-geometry.js');
        const { geometryArea } = await import('./model.js');
        const model = window.WaferCadV2Workstation.snapshot().model;
        const regions = model.regions.filter((r) => r.stack.some((s) => s.layerId === id));
        return {
          area: regions.reduce((sum, r) => sum + geometryArea(r.geom), 0),
          segments: regions
            .flatMap((r) => r.stack.filter((s) => s.layerId === id))
            .map((s) => s.z1 - s.z0),
          outsideMainInsideMask: regions.some((r) => pointInMulti([0.4, 0], r.geom)),
          outsideMask: regions.some((r) => pointInMulti([0.75, 0], r.geom)),
        };
      }, layer.id);
      assert.ok(
        Math.abs(coverage.area - 1) < 1e-10,
        'Mask ROI restricts the actual deposited area',
      );
      assert.ok(coverage.segments.every((t) => Math.abs(t - 0.125) < 1e-12));
      assert.equal(coverage.outsideMainInsideMask, true, 'Main clip cannot restrict the process');
      assert.equal(coverage.outsideMask, false);
      assert.deepEqual(front.roi, inspection.roi);
      assert.deepEqual(front.sectionDetailRoi, inspection.sectionDetailRoi);
      console.log(`Sync ${width}: three independent ROI domains and actual process scope verified`);
      await apply('Sync back', 0.25, 'back');
      const back = await snap();
      assert.equal(back.workflow.processFace, 'back');
      assert.equal(
        back.activeFace,
        front.activeFace,
        'Process face is independent of the Main viewing face',
      );
      assert.ok(back.workflow.steps.length > front.workflow.steps.length);
      await panel('history');
      await page.locator('#undoBtn').click();
      assert.deepEqual((await snap()).model, front.model);
      await page.locator('#redoBtn').click();
      assert.deepEqual((await snap()).model, back.model);
      await panel('history');
      await page.getByRole('button', { name: /^Restore Step .*Sync front/ }).click();
      await page.waitForFunction(
        () =>
          !window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'Sync back'),
      );
      assert.deepEqual((await snap()).model, front.model);
      assert.deepEqual((await snap()).maskRoi, front.maskRoi);
      await page.getByRole('button', { name: 'Return to Variant HEAD', exact: true }).click();
      await page.waitForFunction(() =>
        window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'Sync back'),
      );
      assert.deepEqual((await snap()).model, back.model);
      await view('section');
      console.log(`Sync ${width}: History restore and Undo/Redo verified`);
      await command('section', 'legend');
      assert.equal(
        await page.locator('#sectionPanel [data-action="legend"]').getAttribute('aria-pressed'),
        'false',
      );
      await panel('history');
      await page.getByRole('button', { name: /^Restore Step .*Sync front/ }).click();
      await page.waitForFunction(
        () =>
          !window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'Sync back'),
      );
      await view('section');
      assert.equal(
        await page.locator('#sectionPanel [data-action="legend"]').getAttribute('aria-pressed'),
        'false',
        'History cannot overwrite the Layers display preference',
      );
      await command('section', 'legend');
      await page.getByRole('checkbox', { name: 'Show Sync front', exact: true }).uncheck();
      assert.equal((await snap()).model.layers.find((l) => l.id === layer.id).visible, false);
      await ready3d();
      assert.ok(
        Number(await page.locator('#threeHost').getAttribute('data-renderer-draw-calls')) > 0,
      );
      await view('section');
      await page.getByRole('checkbox', { name: 'Show Sync front', exact: true }).check();
      if (width === 1440) {
        await panel('project');
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#exportProjectBtn').click();
        const download = await downloadPromise;
        const path = resolve(output, 'sync.wafercad');
        await download.saveAs(path);
        const exported = await readProjectFile(new Blob([await readFile(path)]));
        console.log('Sync Project: exported project strictly validated');
        assertModelPersistence(exported.model, (await snap()).model);
        await page.locator('#projectNameInput').fill('Temporary review name');
        await page.locator('#projectNameInput').press('Tab');
        await page.locator('#openProjectInput').setInputFiles(path);
        const confirm = page.getByRole('button', { name: 'Open project', exact: true });
        if (await confirm.isVisible()) await confirm.click();
        await page.waitForFunction(
          (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
          exported.name,
          { timeout: 120000 },
        );
        assert.deepEqual((await snap()).model, exported.model);
        console.log('Sync Project: Open verified');
        await page.locator('#saveProjectBtn').click();
        await page.waitForFunction(
          () =>
            /Saved .* locally/.test(
              document.querySelector('[data-slot="status.message"]')?.textContent || '',
            ),
          null,
          { timeout: 120000 },
        );
        const savedRecoveryKey = await page.locator('#workspaceRecoverySelect').inputValue();
        console.log('Sync Project: Save verified');
        assert.ok(savedRecoveryKey, 'Project Save creates a real Recovery checkpoint');
        const saved = await snap();
        await page.locator('#projectNameInput').fill('Changed after Save');
        await page.locator('#projectNameInput').press('Tab');
        await page.locator('#workspaceRecoverySelect').selectOption(savedRecoveryKey);
        await page.locator('#workspaceRestoreBtn').click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Restore', exact: true })
          .click();
        await page.waitForFunction(
          (name) =>
            window.WaferCadV2Workstation.snapshot().projectName === name &&
            !window.WaferCadV2Workstation.snapshot().workflow.busy,
          saved.projectName,
          { timeout: 120000 },
        );
        assert.deepEqual((await snap()).model, saved.model);
        assert.deepEqual((await snap()).roi, saved.roi);
        assert.deepEqual((await snap()).maskRoi, saved.maskRoi);
        assert.deepEqual((await snap()).section, saved.section);
        assert.deepEqual((await snap()).sectionDetailRoi, saved.sectionDetailRoi);
        assert.equal((await snap()).sharedIdentity, true);
        console.log('Sync Project: Recovery Restore verified');
        await page.getByRole('heading', { name: 'Base', exact: true }).click();
        await page.locator('#baseWidth').fill('6');
        await page.locator('#baseHeight').fill('4');
        await page.locator('#baseThickness').fill('2');
        const beforeBase = await snap();
        await page.locator('#applyBaseBtn').click();
        await page.getByRole('button', { name: 'Keep previous history', exact: true }).click();
        assert.equal((await snap()).model.width, 6);
        assert.ok((await snap()).workflow.branches.length > beforeBase.workflow.branches.length);
        await page.locator('#revertBaseBtn').click();
        assert.deepEqual((await snap()).model, beforeBase.model);
        await panel('mask');
        const importedGdsName = 'gds-basic-instances.gds';
        await page.locator('#gdsInput').setInputFiles(`site/samples/klayout/${importedGdsName}`);
        await page.waitForFunction(
          (filename) => {
            const imported = window.WaferCadV2Workstation.snapshot();
            return (
              imported.layout.name === filename &&
              imported.layout.elements.length > 0 &&
              imported.maskSourceMode === 'file' &&
              Boolean(imported.activeCell)
            );
          },
          importedGdsName,
          { timeout: 10000 },
        );
        assert.deepEqual((await snap()).model, beforeBase.model);
        const maskBefore = await snap();
        await page.getByText('Transform', { exact: true }).click();
        await page.locator('#v2-maskOffsetX').fill('0.125');
        await page.locator('#v2-maskOffsetX').press('Tab');
        assert.equal((await snap()).maskTransform.x, 0.125);
        assert.deepEqual((await snap()).roi, maskBefore.roi);
        await panel('history');
        await page.getByRole('button', { name: 'Return to Variant HEAD', exact: true }).click();
        await page.waitForFunction(() =>
          window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'Sync back'),
        );
        await panel('process');
        await page.locator('[data-action="process-mode:code"]').click();
        await page
          .locator('#recipeCodeEditor')
          .fill('deposit({ material: "Graphene precision", thickness: "0.35 nm", area: "full" });');
        await page.locator('#recipeApplyCodeBtn').click();
        await page.locator('#recipeRunAllBtn').click();
        const continueRecipe = page.getByRole('button', {
          name: 'Continue and apply',
          exact: true,
        });
        await continueRecipe.waitFor({ state: 'visible', timeout: 15000 });
        await continueRecipe.click();
        await page.waitForFunction(
          () =>
            /Recipe completed: 1\/1/.test(
              document.querySelector('[data-slot="status.message"]')?.textContent || '',
            ),
          null,
          { timeout: 120000 },
        );
        // M4 failure/recovery: a malformed Code draft must fail before a
        // Recipe confirmation, Process operation or History mutation.
        const goodCode = await page.locator('#recipeCodeEditor').inputValue();
        const recipeBeforeFailure = await snap();
        await page.locator('#recipeCodeEditor').fill('deposit({');
        await page.locator('#recipeApplyCodeBtn').click();
        await page.waitForFunction(() =>
          /Recipe code error:/.test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        );
        assert.deepEqual((await snap()).model, recipeBeforeFailure.model);
        await page.locator('#recipeRunAllBtn').click();
        await page.waitForFunction(() =>
          /Recipe preflight failed/.test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        );
        const recipeAfterFailure = await snap();
        assert.deepEqual(
          recipeAfterFailure.model,
          recipeBeforeFailure.model,
          'Invalid Recipe must not change canonical geometry',
        );
        assert.deepEqual(
          recipeAfterFailure.workflow.steps,
          recipeBeforeFailure.workflow.steps,
          'Invalid Recipe must not record Process History',
        );
        assert.deepEqual(
          recipeAfterFailure.workflow.branches,
          recipeBeforeFailure.workflow.branches,
          'Invalid Recipe must not create History Variants',
        );
        assert.equal(
          await page.getByRole('button', { name: 'Continue and apply', exact: true }).isVisible(),
          false,
          'Preflight must block before asking to continue',
        );
        await page.locator('#recipeCodeEditor').fill(goodCode);
        await page.locator('#recipeApplyCodeBtn').click();
        await page.waitForFunction(() =>
          /Recipe code applied/.test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        );
        assert.deepEqual((await snap()).model, recipeBeforeFailure.model);
        console.log(
          'Sync Recipe: invalid-code rejection, preflight atomicity and recovery verified',
        );
        const precise = (await snap()).model;
        const film = precise.layers.find((l) => l.name === 'Graphene precision');
        assert.ok(film);
        for (const s of precise.regions.flatMap((r) =>
          r.stack.filter((s) => s.layerId === film.id),
        ))
          assert.ok(Math.abs(s.z1 - s.z0 - 0.00035) < 1e-12);
        await page.locator('[data-action="process-mode:diagnostics"]').click();
        await page.locator('#diagnosticsAnalyzeBtn').click();
        await page.waitForFunction(
          () =>
            /Analysis complete/.test(
              document.getElementById('diagnosticsStatus')?.textContent || '',
            ),
          null,
          { timeout: 120000 },
        );
        assert.deepEqual((await snap()).model, precise, 'Diagnostics is read-only');
        const diagnosticsPresentation = await page
          .locator('#diagnosticsResults')
          .evaluate((root) => ({
            metrics: root.querySelectorAll('.diagnostics-metric').length,
            metricLayout: getComputedStyle(root.querySelector('.diagnostics-metric')).display,
            layerLayout: getComputedStyle(root.querySelector('.diagnostics-layer')).display,
            overflow: Math.max(0, root.scrollWidth - root.clientWidth),
          }));
        assert.ok(diagnosticsPresentation.metrics >= 4, 'Diagnostics metrics stay visible');
        assert.equal(diagnosticsPresentation.metricLayout, 'flex');
        assert.equal(diagnosticsPresentation.layerLayout, 'grid');
        assert.equal(
          diagnosticsPresentation.overflow,
          0,
          'Diagnostics inspector must not overflow',
        );
      }
      await view('main');
      if (await page.locator('[data-action="mode:split"]').isVisible()) {
        await page.locator('[data-action="mode:split"]').click();
        await page
          .getByRole('combobox', { name: 'Right Split view', exact: true })
          .selectOption('three');
        await page.locator('[data-action="mode:overview"]').click();
        assert.equal((await snap()).sharedIdentity, true);
      }
      await waitForPaint(page);
      const layout = await page.evaluate(() => {
        const c = document.querySelector('#mainCanvas'),
          b = c.getBoundingClientRect(),
          h = c.parentElement.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          agreement: Math.max(
            Math.abs(b.x - h.x),
            Math.abs(b.y - h.y),
            Math.abs(b.width - h.width),
            Math.abs(b.height - h.height),
          ),
          coarse: window.matchMedia('(pointer: coarse)').matches,
        };
      });
      assert.ok(layout.overflow <= 0.25);
      assert.ok(layout.agreement <= 0.25);
      assert.equal(layout.coarse, hasTouch);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: resolve(output, `sync-${width}${hasTouch ? '-touch' : ''}.png`),
      });
      report.cases.push({
        width,
        hasTouch,
        sharedModel: true,
        roiProcessScope: coverage,
        historyRestored: true,
        layerPreferencePreserved: true,
        layout,
      });
      console.log(`Sync ${width}${hasTouch ? ' touch' : ''}: PASS`);
    } catch (error) {
      report.pageText = await page.locator('body').innerText();
      await page.screenshot({ path: resolve(output, 'failure.png') });
      throw error;
    } finally {
      await context.close();
    }
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.error = error.stack;
  throw error;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
