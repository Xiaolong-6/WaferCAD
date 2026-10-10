// Manual scientific gate for the default-off electrical planar cap pilot.
// Collect every mismatch, including same-policy controls; never accept a tolerance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';
import { classifyWebglBackend } from './test-helpers/webgl-backend-classification.mjs';
import {
  launchOptions,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

// A diagnostic subset cannot establish full acceptance; preserve ROI failure artifacts.
const skipRoi = process.argv.includes('--skip-roi');
const output = new URL(
  skipRoi
    ? '../test-results/renderer-electrical-inspection-no-roi/'
    : '../test-results/renderer-electrical-inspection/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...launchOptions, headless: false });
const references = new Map();
const policyReferences = new Map();
const comparisons = [];
const trials = [];
let stage = 'boot';
const retainedKeys = [
  'sceneRetainedGroupCount',
  'sceneRetainedObjectCount',
  'sceneRetainedGeometryCount',
  'sceneRetainedMaterialCount',
];
// ROI can legitimately change visible instance/layer counts, never model revisions.
const physicalKeys = ['modelRevision', 'processRevision'];

async function runTrial(enabled, ordinal) {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = observePageErrors(page);
  page.setDefaultTimeout(180000);
  const label = `${ordinal}-${enabled ? 'single' : 'double'}`;
  const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
  const result = { label, enabled, states: [], repeats: [], errors };
  trials.push(result);
  try {
    await page.goto(
      baseUrl + '/app.html' + (enabled ? '?rendererV3ElectricalPlanarSinglePass=1' : ''),
    );
    await waitForAppReady(page);
    await page
      .locator('#openProjectInput')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
            import.meta.url,
          ),
        ),
      );
    await chooseConfirmation(page);
    await page.waitForFunction(() =>
      document.getElementById('statusText')?.textContent?.startsWith('Opened '),
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    await page.locator('#threeFastBtn').selectOption('quality');
    await waitForThreeReady(page, 180000);
    // Test-only frame pose/order accounting: never imported by the application.
    await page.evaluate(async () => {
      const THREE =
        await import('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js');
      const original = THREE.Object3D.prototype.onBeforeRender;
      THREE.Object3D.prototype.onBeforeRender = function (renderer, scene, camera, ...rest) {
        const frame = renderer.info.render.frame;
        if (window.__electricalInspectionTrace?.frame !== frame)
          window.__electricalInspectionTrace = {
            frame,
            cameraWorld: camera.matrixWorld.toArray(),
            cameraProjection: camera.projectionMatrix.toArray(),
            order: [],
          };
        window.__electricalInspectionTrace.order.push([
          this.name,
          this.userData?.waferCadPresentation?.kind,
          this.renderOrder,
        ]);
        return original.call(this, renderer, scene, camera, ...rest);
      };
    });
    const physical = await snapshot();
    result.backend = classifyWebglBackend(
      await page.locator('#threeHost canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: gl.getParameter(gl.RENDERER),
          unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        };
      }),
    );
    assert.equal(
      result.backend.hardwareVerified,
      true,
      'inspection requires a recognized hardware adapter',
    );

    async function changed(action) {
      const serial = Number((await snapshot()).rendererFrameSerial);
      await action();
      await page.waitForFunction(
        (previous) => {
          const host = document.getElementById('threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            Number(host.dataset.rendererFrameSerial) > previous
          );
        },
        serial,
        { timeout: 180000 },
      );
    }
    async function opacity(value) {
      await changed(() =>
        page.locator('#threeOpacityRange').evaluate((input, next) => {
          input.value = String(next);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, value),
      );
    }
    async function capture(name) {
      stage = `${label}/${name}`;
      const image = await page
        .locator('#threeHost canvas')
        .screenshot({ path: fileURLToPath(new URL(`${label}-${name}.png`, output)) });
      const state = await snapshot();
      const trace = await page.evaluate(() => window.__electricalInspectionTrace);
      assert.ok(trace?.cameraWorld?.length === 16 && trace?.cameraProjection?.length === 16);
      const orderHash = createHash('sha256').update(JSON.stringify(trace.order)).digest('hex');
      await writeFile(new URL(`${label}-${name}-trace.json`, output), JSON.stringify(trace));
      // Same-context duplicate capture requires no model, camera or UI action.
      // It separates screenshot/frame instability from fresh-context drift.
      if (['far-collapse', 'far-restored', 'fitted', 'full-z'].includes(name)) {
        const repeatImage = await page.locator('#threeHost canvas').screenshot({
          path: fileURLToPath(new URL(`${label}-${name}-repeat.png`, output)),
        });
        const repeatState = await snapshot();
        const repeatTrace = await page.evaluate(() => window.__electricalInspectionTrace);
        const repeatDiff = compareScreenshotPngPixels(image, repeatImage);
        result.repeats.push({
          name,
          byteIdentical: image.equals(repeatImage),
          frameSerialIdentical: state.rendererFrameSerial === repeatState.rendererFrameSerial,
          cameraIdentical:
            JSON.stringify([trace.cameraWorld, trace.cameraProjection]) ===
            JSON.stringify([repeatTrace?.cameraWorld, repeatTrace?.cameraProjection]),
          orderIdentical:
            orderHash ===
            createHash('sha256').update(JSON.stringify(repeatTrace?.order)).digest('hex'),
          ...repeatDiff,
        });
      }
      for (const key of physicalKeys)
        assert.equal(state[key], physical[key], `${stage}: ${key} changed`);
      assert.equal(state.v3SkippedTriangles, '0');
      const reference = references.get(name);
      if (!reference) references.set(name, { image, label, enabled, trace, orderHash });
      else
        comparisons.push({
          name,
          reference: reference.label,
          label,
          samePolicy: reference.enabled === enabled,
          byteIdentical: image.equals(reference.image),
          cameraIdentical:
            JSON.stringify([trace.cameraWorld, trace.cameraProjection]) ===
            JSON.stringify([reference.trace.cameraWorld, reference.trace.cameraProjection]),
          orderIdentical: orderHash === reference.orderHash,
          ...compareScreenshotPngPixels(reference.image, image),
        });
      const policyKey = `${name}/${enabled}`;
      const policyReference = policyReferences.get(policyKey);
      if (!policyReference) policyReferences.set(policyKey, { image, label, trace, orderHash });
      else if (reference?.enabled !== enabled)
        comparisons.push({
          name,
          reference: policyReference.label,
          label,
          samePolicy: true,
          byteIdentical: image.equals(policyReference.image),
          cameraIdentical:
            JSON.stringify([trace.cameraWorld, trace.cameraProjection]) ===
            JSON.stringify([
              policyReference.trace.cameraWorld,
              policyReference.trace.cameraProjection,
            ]),
          orderIdentical: orderHash === policyReference.orderHash,
          ...compareScreenshotPngPixels(policyReference.image, image),
        });
      result.states.push({
        name,
        state,
        cameraWorld: trace.cameraWorld,
        cameraProjection: trace.cameraProjection,
        orderHash,
      });
      assert.deepEqual(errors, []);
      console.log(
        'ELECTRICAL_INSPECTION_FRAME',
        JSON.stringify({
          label,
          name,
          triangles: state.rendererDrawTriangles,
          calls: state.rendererDrawCalls,
        }),
      );
    }

    // Close menus before all unobstructed scientific comparisons.
    await page.locator('#threePanel details[open]').evaluateAll((nodes) =>
      nodes.forEach((node) => {
        node.open = false;
      }),
    );
    await opacity(0.5);
    await capture('far-collapse');
    assert.equal((await snapshot()).rendererDrawTriangles, enabled ? '54066262' : '57040012');
    await opacity(0.25);
    await capture('far-opacity-25');
    await opacity(0.75);
    await capture('far-opacity-75');
    await opacity(1);
    await capture('far-opaque');
    await opacity(0.5);

    // Twenty presentation transitions per arm; each must complete a new frame.
    const baseline = await snapshot();
    for (let i = 0; i < 10; i++) {
      await changed(() =>
        page.locator('#threeBorders').evaluate((input) => {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }),
      );
      await opacity(i % 2 === 0 ? 1 : 0.5);
      const current = await snapshot();
      for (const key of retainedKeys)
        assert.equal(current[key], baseline[key], `${label}: ${key} leaked`);
      assert.equal(current.sceneGeneration, baseline.sceneGeneration);
      assert.equal(current.surfacePlanBuildCount, baseline.surfacePlanBuildCount);
    }
    result.presentationTransitions = 20;
    await capture('far-restored');

    // Quality transparency disables damping, making matching pointer poses deterministic.
    const box = await page.locator('#threeHost canvas').boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await changed(async () => {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -300);
    });
    await capture('near');
    await changed(async () => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 24, { steps: 4 });
      await page.mouse.up();
    });
    await capture('edge-on');
    await changed(() => page.locator('#fit3dBtn').click());
    await capture('fitted');
    await changed(() =>
      page.locator('#sectionCollapseEnabled').evaluate((input) => {
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }),
    );
    await capture('full-z');
    assert.equal((await snapshot()).zCollapseEnabled, 'false');
    stage = `${label}/restore-collapse`;
    await changed(() =>
      page.locator('#sectionCollapseEnabled').evaluate((input) => {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }),
    );

    if (!skipRoi) {
      // Real Main pointer input creates the render-only ROI.
      stage = `${label}/create-roi`;
      await page.locator('#focusEditor').evaluate((node) => {
        const more = node.closest('.view-more-control');
        if (more) more.open = true;
        node.open = true;
      });
      await page.locator('.roi-tool[data-tool="rect"]').click();
      await page.locator('#mainPanel details[open]').evaluateAll((nodes) =>
        nodes.forEach((node) => {
          node.open = false;
        }),
      );
      const main = await page.locator('#mainCanvas').boundingBox();
      await changed(async () => {
        await page.mouse.move(main.x + main.width * 0.4, main.y + main.height * 0.4);
        await page.mouse.down();
        await page.mouse.move(main.x + main.width * 0.6, main.y + main.height * 0.6, { steps: 4 });
        await page.mouse.up();
        await page.waitForFunction(
          () => /^ROI created\./.test(document.getElementById('statusText')?.textContent || ''),
          null,
          { timeout: 10000 },
        );
      });
      assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
      await page.locator('#focusEditor').evaluate((node) => {
        node.open = false;
      });
      await capture('roi');
      await changed(() => page.locator('#clearRoiBtn').evaluate((button) => button.click()));
      await capture('roi-cleared');
    }
    await changed(() => page.locator('#threeFastBtn').selectOption('fast'));
    await capture('fast-negative-control');
    assert.equal((await snapshot()).renderQuality, 'fast');
    assert.deepEqual(errors, []);
  } catch (error) {
    result.failure = {
      stage,
      error: String(error),
      state: await snapshot().catch(() => null),
      ui: await page
        .evaluate(() => ({
          status: document.getElementById('statusText')?.textContent,
          focusOpen: document.getElementById('focusEditor')?.open,
          roiButton: document
            .querySelector('.roi-tool[data-tool="rect"]')
            ?.getBoundingClientRect()
            .toJSON(),
        }))
        .catch(() => null),
    };
    await page
      .screenshot({ path: fileURLToPath(new URL(`${label}-failure.png`, output)) })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  // Same-policy controls precede cross-policy comparisons. These timings are not ABBA.
  for (const [index, enabled] of [false, false, true, true].entries())
    await runTrial(enabled, index + 1);
  const roiCovered =
    !skipRoi &&
    trials.every((trial) =>
      ['roi', 'roi-cleared'].every((name) => trial.states.some((entry) => entry.name === name)),
    );
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        browserVersion: browser.version(),
        trials,
        comparisons,
        strictParity: comparisons.every((entry) => entry.byteIdentical),
        matchingCamera: comparisons.every((entry) => entry.cameraIdentical),
        sameContextRepeatable: trials.every((trial) =>
          trial.repeats.every(
            (entry) => entry.byteIdentical && entry.frameSerialIdentical && entry.cameraIdentical,
          ),
        ),
        roiCovered,
        fullAcceptance:
          roiCovered &&
          trials.every((trial) =>
            trial.repeats.every(
              (entry) => entry.byteIdentical && entry.frameSerialIdentical && entry.cameraIdentical,
            ),
          ) &&
          comparisons.every((entry) => entry.byteIdentical && entry.cameraIdentical),
        timingAcceptance: false,
      },
      null,
      2,
    ),
  );
  assert.ok(
    trials.every((trial) =>
      trial.repeats.every(
        (entry) => entry.byteIdentical && entry.frameSerialIdentical && entry.cameraIdentical,
      ),
    ) && comparisons.every((entry) => entry.byteIdentical && entry.cameraIdentical),
    'strict repeatability / matching-camera inspection parity failed; inspect report.json',
  );
} catch (error) {
  const roiCovered =
    !skipRoi &&
    trials.length === 4 &&
    trials.every((trial) =>
      ['roi', 'roi-cleared'].every((name) => trial.states.some((entry) => entry.name === name)),
    );
  await writeFile(
    new URL('failure.json', output),
    JSON.stringify(
      {
        stage,
        error: String(error),
        browserVersion: browser.version(),
        roiCovered,
        trials,
        comparisons,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
