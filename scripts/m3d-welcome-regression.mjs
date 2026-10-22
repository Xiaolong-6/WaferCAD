// Real v2 M3D Welcome -> full project / History / 3D Border integration.
// Retires the obsolete Legacy DOM regression without dropping its user contracts.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { gotoWelcome, launchBrowser, newUiContext, observePageErrors } from './test-helpers/ui.mjs';
import { selectScientificView } from './v2/desktop-view-selector.mjs';

await mkdir('test-results/m3d/welcome', { recursive: true });
const browser = await launchBrowser();
try {
  const context = await newUiContext(browser, {
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = observePageErrors(page);
  let previewCapture = null;
  let previewCaptureTask = null;
  let previewInteraction = null;
  let previewBackside = null;
  // Capture the REAL native canvas when the first approximate WebGL frame
  // commits; waiting until exact ready would erase the evidence we need.
  await page.exposeFunction('__wafercadCaptureM3DPreview', () => {
    if (previewCaptureTask) return previewCaptureTask;
    previewCaptureTask = (async () => {
      try {
        const phase = await page.evaluate(() => {
          const host = document.getElementById('threeHost');
          return {
            fidelity: host?.dataset.renderFidelity || null,
            renderState: host?.dataset.renderState || null,
            progressiveFirstFrameMs: Number(host?.dataset.rendererProgressiveFirstFrameMs),
            frameSerial: Number(host?.dataset.rendererFrameSerial),
          };
        });
        if (phase.fidelity !== 'approximate' || !Number.isFinite(phase.progressiveFirstFrameMs))
          return;
        await page.screenshot({
          path: 'test-results/m3d/welcome/m3d-progressive-first-frame.png',
          animations: 'disabled',
        });
        previewCapture = phase;
        // Exercise the real OrbitControls input while the authoritative
        // Material Solids Worker is still calculating. A drawn canvas alone
        // does not establish that the approximate first frame is interactive.
        const beforeCamera = await page.evaluate(
          () => window.WaferCadV2Workstation.snapshot().threeCamera,
        );
        const bounds = await page.locator('#threeHost canvas').boundingBox();
        assert.ok(bounds, 'Preview canvas must be interactable');
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        // Measure actual page-side pointer event -> native renderer frame,
        // independently of the Playwright gesture's wall-clock overhead.
        await page.evaluate(() => {
          const host = document.getElementById('threeHost');
          const canvas = host?.querySelector('canvas');
          const samples = [];
          let pendingAt = null;
          canvas.addEventListener(
            'pointermove',
            (event) => {
              if (event.buttons && host.dataset.renderFidelity === 'approximate') {
                pendingAt ??= performance.now();
              }
            },
            { passive: true },
          );
          new globalThis.MutationObserver(() => {
            if (pendingAt === null) return;
            if (host.dataset.renderFidelity === 'approximate') {
              samples.push(performance.now() - pendingAt);
            }
            pendingAt = null;
          }).observe(host, { attributes: true, attributeFilter: ['data-renderer-frame-serial'] });
          window.__wafercadPreviewPointerFrameSamples = samples;
        });
        const started = Date.now();
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 32, y + 18, { steps: 6 });
        await page.mouse.up();
        await page.waitForFunction(
          ({ camera, serial }) => {
            const host = document.getElementById('threeHost');
            const current = window.WaferCadV2Workstation?.snapshot().threeCamera;
            return (
              host?.dataset.renderFidelity === 'approximate' &&
              Number(host.dataset.rendererFrameSerial || 0) > serial &&
              JSON.stringify(current) !== camera
            );
          },
          { camera: JSON.stringify(beforeCamera), serial: phase.frameSerial },
          { timeout: 5000 },
        );
        const pointerToRendererFrame = await page.evaluate(() => {
          const values = (window.__wafercadPreviewPointerFrameSamples || []).sort((a, b) => a - b);
          return {
            count: values.length,
            medianMs: values.length ? values[Math.floor(values.length / 2)] : null,
            p95Ms: values.length ? values[Math.ceil(values.length * 0.95) - 1] : null,
          };
        });
        previewInteraction = {
          realPointerOrbitDuringWorker: true,
          orbitUntilPaintMs: Date.now() - started,
          pointerToRendererFrame,
          frameSerialBefore: phase.frameSerial,
          fidelity: 'approximate',
        };
        // Verify the actual WebGL renderer can show the opposite cap normal,
        // not merely that OrbitControls moved the camera. Move upward through
        // the equator while the authoritative Worker remains in flight.
        let flipped = false;
        for (let attempt = 0; attempt < 2 && !flipped; attempt++) {
          const nextBounds = await page.locator('#threeHost canvas').boundingBox();
          assert.ok(nextBounds, 'Preview canvas must survive camera rotation');
          const centerX = nextBounds.x + nextBounds.width / 2;
          await page.mouse.move(centerX, nextBounds.y + nextBounds.height * 0.85);
          await page.mouse.down();
          await page.mouse.move(centerX, nextBounds.y + nextBounds.height * 0.12, {
            steps: 8,
          });
          await page.mouse.up();
          flipped = await page.evaluate(() => {
            const d = document.getElementById('threeHost')?.dataset;
            return (
              d?.renderFidelity === 'approximate' && d.rendererProgressiveFacingNormal === '-1'
            );
          });
        }
        assert.ok(flipped, 'Worker preview must remain visible from the opposite cap normal');
        await page.waitForFunction(
          (serial) => {
            const d = document.getElementById('threeHost')?.dataset;
            return (
              d?.renderFidelity === 'approximate' &&
              d.rendererProgressiveFacingNormal === '-1' &&
              Number(d.rendererFrameSerial || 0) > serial
            );
          },
          phase.frameSerial,
          { timeout: 5000 },
        );
        previewBackside = await page.evaluate(() => {
          const host = document.getElementById('threeHost');
          const camera = window.WaferCadV2Workstation.snapshot().threeCamera;
          return {
            facingNormal: host?.dataset.rendererProgressiveFacingNormal,
            fidelity: host?.dataset.renderFidelity,
            state: host?.dataset.renderState,
            frameSerial: Number(host?.dataset.rendererFrameSerial),
            cameraBelowTarget: camera.position[2] < camera.target[2],
          };
        });
        assert.equal(previewBackside.cameraBelowTarget, true);
        await page.screenshot({
          path: 'test-results/m3d/welcome/m3d-progressive-backside.png',
          animations: 'disabled',
        });
      } catch (error) {
        // The exact application acceptance must still run even if diagnostic
        // screenshot capture is blocked by a browser or compositor issue.
        console.warn('M3D progressive preview screenshot unavailable:', error.message);
      }
    })();
    return previewCaptureTask;
  });
  await page.addInitScript(() => {
    if (!location.pathname.endsWith('/app.html')) return;
    const observeHost = () => {
      const findHost = () => {
        const host = document.getElementById('threeHost');
        if (!host) return;
        insertion.disconnect();
        let emitted = false;
        const check = () => {
          if (
            !emitted &&
            host.dataset.renderFidelity === 'approximate' &&
            host.dataset.rendererProgressiveFirstFrameMs
          ) {
            emitted = true;
            void window.__wafercadCaptureM3DPreview();
          }
        };
        new globalThis.MutationObserver(check).observe(host, {
          attributes: true,
          attributeFilter: [
            'data-render-fidelity',
            'data-renderer-progressive-first-frame-ms',
            'data-renderer-frame-serial',
          ],
        });
        check();
      };
      const insertion = new globalThis.MutationObserver(findHost);
      insertion.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      findHost();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeHost, {
        once: true,
      });
    } else observeHost();
  });
  await gotoWelcome(page);
  const card = page.locator(
    '.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"]',
  );
  assert.equal(await card.count(), 1, 'M3D Welcome card missing');
  assert.match(await card.locator('.welcome-example-summary-link').textContent(), /36 History/);
  await card.locator('img').evaluate((img) => img.decode());
  assert.equal(await card.locator('img').evaluate((img) => img.naturalWidth), 640);

  await card.locator('.welcome-example-title-link').click();
  await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' &&
      window.WaferCadV2Workstation?.snapshot().source.endsWith(
        '/m3d-selfpowered-full-replay.wafercad',
      ),
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .some((resource) => /\/app\.js(?:\?|$)/.test(resource.name)),
    ),
    false,
    'M3D project must not boot the obsolete Legacy editor',
  );

  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const before = await snapshot();
  assert.equal(before.workflow.steps.length, 36, 'M3D source has 36 History Steps');
  assert.equal(before.workflow.bookmarks.length, 27, 'M3D stage bookmarks must survive');
  assert.equal(before.workflow.writable, true);

  await page.locator('[data-action="domain:history"]').click();
  await page.locator('#snapshotList .history-step-wrap').first().waitFor({
    state: 'attached',
    timeout: 120000,
  });
  assert.equal(await page.locator('#snapshotList .history-step-wrap').count(), 36);
  assert.equal((await page.locator('#snapshotCount').textContent()).trim(), '36');

  await selectScientificView(page, 'three', 1440);
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  if (previewCaptureTask) await previewCaptureTask;
  const firstFrame = await page.evaluate(() => {
    const data = document.getElementById('threeHost')?.dataset || {};
    return {
      fidelity: data.renderFidelity || null,
      progressiveFirstFrameMs: Number(data.rendererProgressiveFirstFrameMs) || null,
      exactFirstFrameMs: Number(data.rendererExactFirstFrameMs) || null,
      progressiveBuildMs: Number(data.rendererProgressiveBuildMs) || null,
      exactSceneMs: Number(data.rendererExactSceneMs) || null,
      renderState: data.renderState || null,
      frameSerial: Number(data.rendererFrameSerial) || 0,
    };
  });
  // The exact scene must replace the disposable preview with one committed
  // presentation variant, without retaining a second visible group or failing
  // to retire GPU-backed resources.
  const sceneHandoff = await page.evaluate(() => {
    const d = document.getElementById('threeHost').dataset;
    return {
      swaps: Number(d.rendererCommittedVariantSwaps || 0),
      disposalFailures: Number(d.rendererDisposalFailures || 0),
      retainedVisible: d.rendererRetainedCompleteVisible,
      finalFidelity: d.renderFidelity,
    };
  });
  assert.ok(sceneHandoff.swaps >= 1, 'Preview must be replaced by an exact scene variant');
  assert.equal(sceneHandoff.disposalFailures, 0, 'Preview resources must dispose cleanly');
  assert.equal(sceneHandoff.retainedVisible, 'false', 'Only the exact scene may remain visible');
  assert.equal(sceneHandoff.finalFidelity, 'exact-surface-plan');
  const firstFrameEvidence = {
    ...firstFrame,
    sceneHandoff,
    capturedPreview: previewCapture,
    previewInteraction,
    previewBackside,
    source: 'real Chromium WaferCAD Workstation M3D Welcome',
    scope: 'same loaded model; not a cold baseline A/B or peak-memory measurement',
  };
  await writeFile(
    'test-results/m3d/welcome/m3d-first-frame-evidence.json',
    JSON.stringify(firstFrameEvidence, null, 2) + '\n',
  );
  console.log('M3D_PROGRESSIVE_FIRST_FRAME_EVIDENCE', JSON.stringify(firstFrameEvidence));
  assert.ok(previewCapture, 'Expected a painted M3D approximate frame');
  assert.ok(
    previewInteraction?.realPointerOrbitDuringWorker,
    'Preview input must remain responsive',
  );
  assert.equal(previewBackside?.facingNormal, '-1', 'Backside preview not verified');
  const border = page.locator('#threePanel [data-action="borders:three"]');
  await border.waitFor({ state: 'visible' });
  assert.equal(await border.getAttribute('aria-label'), 'Borders');
  const visualState = () =>
    border.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
      outline: getComputedStyle(node).borderColor,
      pressed: node.getAttribute('aria-pressed'),
    }));

  // The shared selected-control appearance communicates Border state without
  // a duplicated ON/OFF caption. Toggling must not edit the physical model.
  assert.equal(await border.locator('.three-border-status').count(), 0);
  const starting = await visualState();
  assert.equal(
    starting.pressed,
    String((await snapshot()).threeDisplay.borders),
    'Restored M3D Border toolbar reflects saved display state before interaction',
  );
  await border.click();
  const inspector = page.locator('[data-border-inspector]');
  await inspector.waitFor({ state: 'visible' });
  assert.equal(
    await border.getAttribute('aria-pressed'),
    starting.pressed,
    'Opening Border Inspector must not change the border display state',
  );
  const enabled = inspector.getByRole('button', { name: 'Show 3D borders' });
  assert.equal(await enabled.getAttribute('aria-pressed'), starting.pressed);
  await enabled.click();
  const toggled = await visualState();
  assert.notEqual(
    toggled.pressed,
    starting.pressed,
    'Inspector pressed button changes pressed state',
  );
  assert.equal(
    toggled.pressed,
    String((await snapshot()).threeDisplay.borders),
    'Toolbar stays in sync with the physical renderer display state',
  );
  assert.ok(
    toggled.fill !== starting.fill ||
      toggled.color !== starting.color ||
      toggled.outline !== starting.outline,
    'Border toggle changes its selected visual appearance',
  );
  await enabled.click();
  const restored = await visualState();
  assert.equal(restored.pressed, starting.pressed, 'Border pressed state is reversible');
  assert.equal(restored.fill, starting.fill, 'Border selected fill is reversible');
  assert.equal(restored.color, starting.color, 'Border selected text color is reversible');
  // The pointer remains over the button after click; hover/focus outlines are
  // transient accessibility feedback, not persisted Border selection state.

  const after = await snapshot();
  assert.deepEqual(after.model, before.model, 'Border and History navigation preserve M3D model');
  assert.equal(after.workflow.steps.length, 36);
  assert.equal(after.workflow.bookmarks.length, 27);
  assert.deepEqual(errors, [], 'Opening the real v2 M3D project must not throw');
  await page.screenshot({
    path: 'test-results/m3d/welcome/m3d-welcome-opened.png',
    fullPage: true,
    animations: 'disabled',
  });
  await context.close();

  // Fault-inject the REAL Surface Plan Worker after a real preview arrives.
  // Recovery must not promote approximate geometry into the exact cache.
  const faultContext = await newUiContext(browser, {
    viewport: { width: 1440, height: 960 },
  });
  try {
    const faultPage = await faultContext.newPage();
    faultPage.setDefaultTimeout(120000);
    await faultPage.addInitScript(() => {
      const NativeWorker = window.Worker;
      const state = (window.__m3dFault = {
        workers: 0,
        previews: 0,
        errors: 0,
        terminated: 0,
      });
      window.Worker = class {
        constructor(url, options) {
          if (!String(url).includes('renderer-surface-plan-worker.js'))
            return new NativeWorker(url, options);
          state.workers++;
          this.native = new NativeWorker(url, options);
          this.onmessage = null;
          this.onerror = null;
          this.onmessageerror = null;
          this.native.onmessage = (event) => {
            if (event.data?.type === 'preview') {
              state.previews++;
              this.onmessage?.(event);
              if (state.errors === 0) {
                state.errors++;
                this.native.terminate();
                globalThis.queueMicrotask(() =>
                  this.onmessage?.({
                    data: { id: 1, type: 'error', message: 'Injected exact Surface Plan failure' },
                  }),
                );
                return;
              }
            } else this.onmessage?.(event);
          };
          this.native.onerror = (event) => this.onerror?.(event);
          this.native.onmessageerror = (event) => this.onmessageerror?.(event);
        }
        postMessage(...args) {
          this.native.postMessage(...args);
        }
        terminate() {
          state.terminated++;
          this.native.terminate();
        }
      };
    });
    await gotoWelcome(faultPage);
    await faultPage
      .locator(
        '.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"] .welcome-example-title-link',
      )
      .click();
    await faultPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 120000 });
    await faultPage.waitForFunction(() => document.body.dataset.ready === 'true');
    const initialModel = await faultPage.evaluate(
      () => window.WaferCadV2Workstation.snapshot().model,
    );
    await selectScientificView(faultPage, 'three', 1440);
    await faultPage.waitForFunction(() => {
      const d = document.getElementById('threeHost')?.dataset;
      return (
        window.__m3dFault?.errors === 1 &&
        d?.rendererBuildFailure === 'Injected exact Surface Plan failure' &&
        d.renderFidelity === 'approximate' &&
        Number(d.rendererProgressiveFirstFrameMs || 0) > 0
      );
    });
    const failed = await faultPage.evaluate(() => {
      const d = document.getElementById('threeHost').dataset;
      return {
        fidelity: d.renderFidelity,
        state: d.renderState,
        failure: d.rendererBuildFailure,
        fault: { ...window.__m3dFault },
      };
    });
    assert.ok(failed.fault.previews >= 1);
    assert.notEqual(failed.fidelity, 'exact-surface-plan');
    await faultPage.screenshot({
      path: 'test-results/m3d/welcome/m3d-exact-worker-failed.png',
      animations: 'disabled',
    });
    // Retry using the actual 3D Quality control; only the first Worker fails.
    await faultPage.locator('#threePanel [data-action="quality:three"]').click();
    await faultPage.waitForFunction(
      () => {
        const d = document.getElementById('threeHost')?.dataset;
        return (
          d?.renderState === 'ready' &&
          d.renderFidelity === 'exact-surface-plan' &&
          Number(d.rendererExactFirstFrameMs || 0) > 0
        );
      },
      null,
      { timeout: 120000 },
    );
    const recovered = await faultPage.evaluate(() => {
      const d = document.getElementById('threeHost').dataset;
      return {
        fidelity: d.renderFidelity,
        error: d.rendererBuildFailure || null,
        disposalFailures: Number(d.rendererDisposalFailures || 0),
        topology: JSON.parse(d.surfaceTopology || '{}'),
        fault: { ...window.__m3dFault },
      };
    });
    assert.equal(recovered.error, null);
    assert.equal(recovered.disposalFailures, 0);
    assert.ok(recovered.topology.caps > 0 && recovered.topology.sidewalls > 0);
    assert.deepEqual(
      await faultPage.evaluate(() => window.WaferCadV2Workstation.snapshot().model),
      initialModel,
    );
    await faultPage.screenshot({
      path: 'test-results/m3d/welcome/m3d-exact-worker-recovered.png',
      animations: 'disabled',
    });
    await writeFile(
      'test-results/m3d/welcome/m3d-worker-failure-evidence.json',
      JSON.stringify({ failed, recovered }, null, 2) + '\n',
    );
    console.log('M3D_EXACT_WORKER_RECOVERY', JSON.stringify({ failed, recovered }));
  } finally {
    await faultContext.close();
  }
} finally {
  await browser.close();
}
console.log('M3D Welcome v2: thumbnail / 36 History / 27 bookmarks / reversible 3D Border PASS');
