import { openMetalensUnitProject } from './project-fixtures.mjs';
// Real shared-model 3D acceptance: user gestures, independent inspection and physical exporters.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { captureVisibleThree } from './three-visibility.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const example = process.env.WAFERCAD_V2_EXAMPLE || 'm3d';
const fixtures = { m3d: [27, 551], photodetector: [5, 5], metalens: [5, 2] };
assert.ok(Object.hasOwn(fixtures, example), 'Known shared-workstation example');
const url = `${base}/app.html?start=example&example=${example}`;
const output = resolve(`test-results/ui-v2-three-review${example === 'm3d' ? '' : `-${example}`}`);
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  result: 'running',
  example,
  widths: [],
  errors: [],
};
const distance = (camera) => Math.hypot(...camera.position.map((v, i) => v - camera.target[i]));
const difference = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const browser = await launchBrowser();
try {
  report.browser = browser.version();
  for (const width of [1440, 1024, 768, 390]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width, height: 960 },
      acceptDownloads: true,
    });
    try {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (example === 'metalens') await openMetalensUnitProject(page, base);
      else await page.goto(url);
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 120000,
      });
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const initial = await snapshot();
      assert.equal(initial.sharedIdentity, true);
      assert.equal(initial.model.layers.length, fixtures[example][0]);
      assert.equal(initial.model.regions.length, fixtures[example][1]);
      await selectScientificView(page, 'three', width);
      const host = page.locator('#threeHost'),
        canvas = host.locator('canvas');
      const ready = async () => {
        await page.waitForFunction(
          () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
          null,
          { timeout: 120000 },
        );
        await waitForPaint(page);
      };
      await ready();
      if (!report.webgl)
        report.webgl = await canvas.evaluate((node) => {
          const gl = node.getContext('webgl2');
          const debug = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
          return { renderer, software: /swiftshader|llvmpipe|software/i.test(renderer) };
        });
      assert.equal(await canvas.count(), 1);
      assert.ok(Number(await host.getAttribute('data-renderer-draw-calls')) > 0);
      assert.ok(Number(await host.getAttribute('data-renderer-draw-triangles')) > 0);
      assert.deepEqual(
        await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((n) => /\/app\.(js|html)(\?|$)/.test(n)),
        ),
        [],
      );
      const command = async (action) => {
        const control = page.locator(`[data-action="${action}"]`);
        if (!(await control.isVisible()))
          await page.getByRole('button', { name: '3D more tools', exact: true }).click();
        await control.click();
        await waitForPaint(page);
      };
      const camera = async () => (await snapshot()).threeCamera;
      const wheel = async () => {
        const b = await canvas.boundingBox();
        await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
        await page.mouse.wheel(0, -160);
        await page.waitForTimeout(400);
      };
      const drag = async (dx, dy) => {
        const b = await canvas.boundingBox();
        await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width * 0.5 + dx, b.y + b.height * 0.5 + dy, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(400);
      };
      assert.equal((await snapshot()).local.three.mode, 'rotate');
      assert.equal((await snapshot()).local.three.zoomEnabled, true);
      assert.equal(
        await page.locator('#threePanel [aria-pressed="true"][data-action^="tool:"]').count(),
        2,
      );
      let before = await camera();
      await wheel();
      assert.ok(distance(await camera()) < distance(before), 'Default Orbit allows wheel Zoom');
      await command('tool:zoom:three');
      assert.equal((await snapshot()).local.three.zoomEnabled, false);
      before = await camera();
      await wheel();
      assert.ok(
        Math.abs(distance(await camera()) - distance(before)) < 1e-6,
        'Explicitly disabling Zoom blocks wheel while rotating',
      );
      await drag(32, 18);
      assert.ok(
        difference((await camera()).position, before.position) > 0.01,
        'Original OrbitControls must rotate',
      );
      await command('tool:pan:three');
      before = await camera();
      await drag(24, 16);
      assert.ok(
        difference((await camera()).target, before.target) > 0.01,
        'Pan must move camera target',
      );
      before = await camera();
      await wheel();
      assert.ok(
        Math.abs(distance(await camera()) - distance(before)) < 1e-6,
        'Pan must block wheel zoom',
      );
      await command('tool:zoom:three');
      before = await camera();
      await wheel();
      assert.ok(distance(await camera()) < distance(before), 'Zoom tool must enable wheel');
      before = await camera();
      await drag(0, 28);
      assert.ok(
        difference((await camera()).target, before.target) > 0.01,
        'Pan must remain active with wheel Zoom',
      );
      assert.ok(
        Math.abs(distance(await camera()) - distance(before)) < 1e-6,
        'Left drag must not zoom',
      );
      await command('tool:rotate:three');
      assert.equal((await snapshot()).local.three.zoomEnabled, true);
      before = await camera();
      await wheel();
      assert.ok(distance(await camera()) < distance(before), 'Rotate and wheel Zoom coexist');
      await drag(24, 12);
      assert.ok(difference((await camera()).position, before.position) > 0.01);
      await command('tool:zoom:three');
      assert.equal((await snapshot()).local.three.mode, 'rotate');
      before = await camera();
      await wheel();
      assert.ok(
        Math.abs(distance(await camera()) - distance(before)) < 1e-6,
        'No tool must block wheel zoom',
      );
      await command('fit:three');
      assert.equal(
        await page.locator('#threePanel [aria-pressed="true"][data-action^="tool:"]').count(),
        1,
      );
      // Presentation changes reuse scientific scene resources.
      const generation = await host.getAttribute('data-scene-generation');
      const surfacePlan = await host.getAttribute('data-surface-plan-build-count');
      await command('opacity:three');
      assert.equal(await page.locator('#threeOpacityRange').getAttribute('min'), '0.1');
      if (!(await snapshot()).threeDisplay.borders) await command('borders:three');
      await ready();
      assert.equal((await snapshot()).threeDisplay.borders, true);
      assert.equal(await host.getAttribute('data-scene-generation'), generation);
      assert.equal(await host.getAttribute('data-surface-plan-build-count'), surfacePlan);
      await command('borders:three');
      await ready();
      await page.keyboard.press('Escape');
      await command('opacity:three');
      await page.locator('#threeOpacityRange').focus();
      await page.keyboard.press('Home');
      await ready();
      assert.equal((await snapshot()).threeDisplay.opacity, 0.1);
      await page.keyboard.press('End');
      await ready();
      assert.equal((await snapshot()).threeDisplay.opacity, 1);
      await page.keyboard.press('Escape');
      if (!(await snapshot()).threeDisplay.fast) await command('quality:three');
      await command('quality:three');
      await ready();
      assert.equal(await host.getAttribute('data-render-quality'), 'quality');
      await command('quality:three');
      await ready();
      assert.equal(await host.getAttribute('data-render-quality'), 'fast');
      await command('maximize:three');
      await ready();
      assert.equal(await host.locator('canvas').count(), 1);
      await command('maximize:three');
      await ready();
      // Use real Main drawing tools; a Main ROI must change the real 3D clip.
      if (width === 1440) {
        await selectScientificView(page, 'main', width);
        await page.locator('[data-action="roi"]').click();
        await page.locator('[data-action="roi-tool:rect"]').click();
        const b = await page.locator('#mainCanvas').boundingBox();
        await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 6 });
        await page.mouse.up();
        const roi = (await snapshot()).roi;
        assert.ok(roi);
        await selectScientificView(page, 'three', width);
        await ready();
        assert.equal(await page.locator('#threeStats').innerText(), 'ROI');
        assert.notEqual(await host.getAttribute('data-scene-generation'), generation);
        // Section Z Break follows its original controller; Detail stays independent of 3D clip.
        const collapseEnabled = await host.getAttribute('data-z-collapse-enabled');
        // Z Break belongs to Section. Restore the four-view dock before using
        // its actual toolbar, while keeping the 3D renderer and camera alive.
        await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
        await waitForPaint(page);
        assert.equal(await page.locator('#sectionPanel').isVisible(), true);
        assert.equal(await host.locator('canvas').count(), 1, 'Dock restore retains 3D canvas');
        await page.locator('#sectionPanel [data-action="zbreak-settings"]').click();
        await page.locator('#section-collapse-enabled').setChecked(collapseEnabled !== 'true');
        await ready();
        assert.equal(
          await host.getAttribute('data-z-collapse-enabled'),
          String(collapseEnabled !== 'true'),
        );
        await page.locator('#section-collapse-enabled').setChecked(collapseEnabled === 'true');
        await ready();
        assert.equal(await host.getAttribute('data-z-collapse-enabled'), collapseEnabled);
        await page.getByRole('button', { name: 'Close Z Break', exact: true }).click();
        const clippedGeneration = await host.getAttribute('data-scene-generation');
        await page.locator('#sectionDetailRoiBtn').click();
        const sectionBox = await page.locator('#sectionCanvas').boundingBox();
        await page.mouse.move(
          sectionBox.x + sectionBox.width * 0.25,
          sectionBox.y + sectionBox.height * 0.3,
        );
        await page.mouse.down();
        await page.mouse.move(
          sectionBox.x + sectionBox.width * 0.5,
          sectionBox.y + sectionBox.height * 0.6,
          { steps: 6 },
        );
        await page.mouse.up();
        await waitForPaint(page);
        assert.ok((await snapshot()).sectionDetailRoi);
        assert.deepEqual((await snapshot()).roi, roi);
        assert.equal(await host.getAttribute('data-scene-generation'), clippedGeneration);
        // PNG uses the original 3× snapshot; GLB has a physical metre transform.
        await command('three-export-menu');
        const pngEvent = page.waitForEvent('download', { timeout: 120000 });
        await page.locator('[data-action="export:three:png"]').click();
        const png = await pngEvent,
          bytes = await readFile(await png.path());
        assert.equal(png.suggestedFilename(), 'wafercad-3d-3x.png');
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        const box = await host.boundingBox();
        assert.ok(Math.abs(bytes.readUInt32BE(16) - Math.round(box.width * 3)) <= 2);
        assert.ok(Math.abs(bytes.readUInt32BE(20) - Math.round(box.height * 3)) <= 2);
        await command('three-export-menu');
        const glbEvent = page.waitForEvent('download', { timeout: 120000 });
        await page.locator('[data-action="export:three:glb"]').click();
        const glb = await glbEvent,
          buffer = await readFile(await glb.path());
        assert.equal(glb.suggestedFilename(), 'wafercad-model.glb');
        assert.equal(buffer.readUInt32LE(0), 0x46546c67);
        assert.equal(buffer.readUInt32LE(4), 2);
        const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
        const root = json.nodes.find((n) => n.name === 'WaferCAD');
        assert.ok(root);
        assert.ok(Math.abs(root.matrix[0] - 1e-6) < 1e-12);
        assert.ok(Math.abs(root.matrix[5] - 1e-6) < 1e-12);
        assert.ok(Math.abs(root.matrix[10] - 1e-6) < 1e-12);
        // Cancellation is verified separately on the complete real M3D export:
        // a tiny clipped example can finish before a user's Abort click.
        assert.deepEqual((await snapshot()).roi, roi);
        report.exports = {
          pngBytes: bytes.length,
          glbBytes: buffer.length,
          physicalMetres: true,
        };
      }
      assert.deepEqual(
        (await snapshot()).model,
        initial.model,
        'All gestures and exports must preserve the scientific model',
      );
      assert.deepEqual((await snapshot()).maskRoi, initial.maskRoi);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      const visibility = await captureVisibleThree(page, resolve(output, `three-${width}.png`));
      report.widths.push({
        width,
        gestures: true,
        wheelPolicy: true,
        sharedIdentity: true,
        scientificUnchanged: true,
        visibility,
      });
      console.log(`3D ${width}: PASS`);
    } finally {
      await context.close();
    }
  }
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1024, height: 960 },
    hasTouch: true,
  });
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (example === 'metalens') await openMetalensUnitProject(page, base);
    else await page.goto(url);
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    await selectScientificView(page, 'three', 1024);
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 120000 },
    );
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    const cdp = await context.newCDPSession(page);
    const b = await page.locator('#threeHost canvas').boundingBox(),
      x = b.x + b.width * 0.5,
      y = b.y + b.height * 0.5;
    const dispatch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y })),
      });
      await waitForPaint(page);
    };
    for (const mode of ['rotate', 'pan', 'none']) {
      if ((await snapshot()).local.three.mode !== mode) {
        const action = mode === 'none' ? (await snapshot()).local.three.mode : mode;
        await page.locator(`[data-action="tool:${action}:three"]`).click();
      }
      assert.equal((await snapshot()).local.three.mode, mode);
      if (mode !== 'none') {
        const before = (await snapshot()).threeCamera;
        await dispatch('touchStart', [[1, x, y]]);
        await dispatch('touchMove', [[1, x + 20, y + 24]]);
        await dispatch('touchEnd', []);
        await page.waitForTimeout(400);
        const after = (await snapshot()).threeCamera;
        assert.ok(
          mode === 'pan'
            ? difference(after.target, before.target) > 0.01
            : difference(after.position, before.position) > 0.01,
          `One-finger ${mode} must operate`,
        );
      }
      const before = (await snapshot()).threeCamera;
      await dispatch('touchStart', [[1, x - 25, y]]);
      await dispatch('touchStart', [
        [1, x - 25, y],
        [2, x + 25, y],
      ]);
      await dispatch('touchMove', [
        [1, x - 45, y],
        [2, x + 45, y],
      ]);
      await dispatch('touchEnd', []);
      await page.waitForTimeout(400);
      assert.ok(
        distance((await snapshot()).threeCamera) < distance(before),
        `Pinch must work in ${mode} mode`,
      );
    }
    assert.deepEqual((await snapshot()).model, initial.model);
    assert.deepEqual(errors, []);
    const visibility = await captureVisibleThree(page, resolve(output, 'three-touch.png'), {
      fullPage: false,
    });
    report.touch = {
      rotate: true,
      pan: true,
      independentWheelZoom: true,
      pinchAllModes: true,
      scientificUnchanged: true,
      visibility,
    };
    console.log('3D touch: PASS');
  } finally {
    await context.close();
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
