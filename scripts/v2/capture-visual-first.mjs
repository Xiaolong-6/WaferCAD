// Fast, read-only screenshot evidence for visual-first development.
// Capturing is not AI/human approval, a pixel baseline, or a science oracle.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiContext, waitForPaint } from '../test-helpers/ui.mjs';
import { capturePhotodetectorRoughRoi } from './capture-photodetector-rough-roi.mjs';
import {
  parseVisualCaptureSettings,
  resolvePinnedThree,
  sourceEvidence,
} from './visual-first-contract.mjs';

const output = resolve(process.env.WAFERCAD_VISUAL_OUTPUT || 'test-results/visual-first');
const {
  example,
  start,
  scope,
  views,
  untestedViews,
  requiresWebgl,
  viewports,
  softwareWebgl,
  requireRough,
  expectedProject,
  openProject,
  expectedLayers,
  expectedRegions,
} = parseVisualCaptureSettings();
const port = String(process.env.WAFERCAD_VISUAL_PORT || 4189);
const external = process.env.WAFERCAD_V2_BASE;
const base = external || 'http://127.0.0.1:' + port;
const cases = viewports;

await mkdir(output, { recursive: true });
const report = {
  example: start === 'example' ? example : null,
  start,
  scope,
  requestedViews: views,
  untestedViews,
  requiresWebgl,
  requireRough,
  expectedProject,
  openProject,
  expectedLayers,
  expectedRegions,
  visualAcceptance: false,
  base,
  captureKind: 'real-app-native-renderers',
  reviewStatus: 'unreviewed',
  captureStatus: 'running',
  captures: [],
  errors: [],
  warnings: [],
};
const server = external
  ? null
  : spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
      cwd: resolve('.'),
      env: { ...process.env, WAFERCAD_V2_PORT: port },
      stdio: 'ignore',
    });
let browser;
try {
  let available = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(base + '/app.html');
      if (response.ok) {
        available = true;
        break;
      }
    } catch {
      // The locally spawned preview server may not have started yet.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(available, 'Visual-first preview server must respond');
  const threeDir = await resolvePinnedThree(resolve('.'), process.env.WAFERCAD_THREE_DIR || '');
  if (requiresWebgl && !threeDir) {
    throw Error('Pinned Three.js 0.179.1 is required for reproducible 3D screenshots; run npm ci.');
  }
  // Route the production import map to the exact locally pinned Three.js package.
  // This never changes application source or substitutes a new renderer.
  if (threeDir) process.env.WAFERCAD_THREE_DIR = threeDir;
  report.threeSource = threeDir ? 'pinned-local-0.179.1' : 'not-required';
  report.source = await sourceEvidence(resolve('.'));
  browser = softwareWebgl
    ? await chromium.launch({
        headless: true,
        ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
        args: [
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      })
    : await launchBrowser();
  report.browser = browser.version();
  report.softwareWebgl = softwareWebgl;
  for (const { width, height } of cases) {
    const context = await newUiContext(browser, { viewport: { width, height } });
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => report.errors.push(error.message));
      const loadedProjects = [];
      page.on('response', (response) => {
        if (expectedProject && new URL(response.url()).pathname.endsWith('/' + expectedProject)) {
          loadedProjects.push({ url: response.url(), status: response.status() });
        }
      });
      await page.goto(
        base +
          (start === 'empty'
            ? '/app.html?start=empty'
            : '/app.html?start=example&example=' + example),
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
        null,
        { timeout: 120000 },
      );
      if (openProject) {
        const before = await page.evaluate(() => {
          const model = window.WaferCadV2Workstation.snapshot().model;
          return { layers: model.layers.length, regions: model.regions.length };
        });
        await page
          .locator('#openProjectInput')
          .setInputFiles(resolve('site/examples', openProject));
        const confirmation = page.locator('dialog.v2-dialog');
        await confirmation.waitFor({ state: 'visible', timeout: 15000 });
        await confirmation.getByRole('button', { name: 'Open project' }).click();
        await page.waitForFunction(
          ({ layers, regions }) => {
            const model = window.WaferCadV2Workstation?.snapshot()?.model;
            return Boolean(
              model &&
              (layers === null || model.layers.length === layers) &&
              (regions === null || model.regions.length === regions),
            );
          },
          { layers: expectedLayers, regions: expectedRegions },
          { timeout: 120000 },
        );
        const after = await page.evaluate(async () => {
          const model = window.WaferCadV2Workstation.snapshot().model;
          const storage = await import('/workspace-persistence.js');
          const checkpoints = await storage.listWorkspaceRecoveryPoints();
          return {
            layers: model.layers.length,
            regions: model.regions.length,
            recoveryPoints: checkpoints.length,
          };
        });
        assert.ok(
          before.layers !== after.layers || before.regions !== after.regions,
          'Manual Open must replace the initial Workstation model',
        );
        assert.ok(after.recoveryPoints > 0, 'Manual Open requires a real Recovery checkpoint');
        report.manualOpen = {
          filename: openProject,
          before,
          after,
          origin: new URL(page.url()).origin,
        };
        assert.notEqual(
          report.manualOpen.origin,
          'null',
          'Real origin required for Worker/Recovery',
        );
      }
      await waitForPaint(page);
      await page.screenshot({ path: resolve(output, 'initial-' + width + '.png') });
      const initial = await page.evaluate(() => {
        const state = window.WaferCadV2Workstation.snapshot();
        return {
          source: state.source,
          layers: state.model.layers.length,
          regions: state.model.regions.length,
          steps: state.workflow.steps.length,
          mode: state.ui.mode,
        };
      });
      assert.ok(initial.layers > 0, 'Capture a real example, not a placeholder');
      if (expectedLayers !== null)
        assert.equal(initial.layers, expectedLayers, 'Full project layer count');
      if (expectedRegions !== null)
        assert.equal(initial.regions, expectedRegions, 'Full project region count');
      if (expectedProject && !openProject)
        assert.ok(
          loadedProjects.some((item) => item.status === 200),
          'The full .wafercad project must be fetched from the real application origin',
        );
      for (const view of views) {
        await page.evaluate(
          ({ name, width }) => {
            if (width > 820) {
              // Desktop docking uses independent visibility switches. Capture
              // each view by restoring Overview then maximizing that view.
              const overview = document.querySelector(
                '.p-desktop-dock-actions [data-action="dock:overview"]',
              );
              if (!overview) throw new Error('Desktop Overview selector is missing');
              overview.click();
              const maximize = document.querySelector(
                'button[data-action="maximize:' + name + '"]',
              );
              if (!maximize) throw new Error('Maximize selector is missing: ' + name);
              maximize.click();
              return;
            }
            const action = name === 'section' ? 'mobile-section' : 'view:' + name;
            const control = document.querySelector('button[data-action="' + action + '"]');
            if (!control) throw new Error('Compact view selector is missing: ' + name);
            control.click();
          },
          { name: view, width },
        );
        await waitForPaint(page);
        const selectedState = await page.evaluate((compact) => {
          const ui = window.WaferCadV2Workstation.snapshot().ui;
          return {
            view: ui.view,
            maximized: compact ? ui.maximize : ui.desktopLayout?.maximized,
          };
        }, width <= 820);
        if (width <= 820) assert.equal(selectedState.view, view, `Portrait ${view} tab`);
        else assert.equal(selectedState.maximized, view, `Desktop ${view} maximized`);
        const panel = page.locator('#' + view + 'Panel');
        assert.ok(await panel.isVisible(), 'Selected view must be visible: ' + view + '/' + width);
        if (view === 'three') {
          // A placeholder or unfinished WebGL frame is NOT successful visual evidence.
          await page.waitForFunction(
            () => {
              const host = document.getElementById('threeHost');
              const canvas = host?.querySelector('canvas');
              if (!canvas || host.classList.contains('three-unavailable')) return false;
              const gl = canvas.getContext('webgl2');
              return Boolean(
                host.dataset.renderPhase === 'complete' &&
                gl &&
                !gl.isContextLost() &&
                canvas.width > 0 &&
                canvas.height > 0,
              );
            },
            null,
            { timeout: 60000 },
          );
          if (requireRough) {
            await page.waitForFunction(
              () => {
                const canvas = document.querySelector('#threeHost canvas');
                return (
                  document.getElementById('threeHost')?.dataset.renderPhase === 'complete' &&
                  canvas?.dataset.roughMeshMode === 'detailed' &&
                  Number(canvas.dataset.roughTriangleCount) > 0
                );
              },
              null,
              { timeout: 120000 },
            );
          }
        }
        const canvasId = { main: 'mainCanvas', mask: 'maskCanvas', section: 'sectionCanvas' }[view];
        if (canvasId) {
          await page.waitForFunction(
            (id) => {
              const canvas = document.getElementById(id);
              return Boolean(
                canvas?.width > 0 &&
                canvas.height > 0 &&
                canvas.getBoundingClientRect().width > 0 &&
                canvas.getBoundingClientRect().height > 0 &&
                canvas.getContext('2d'),
              );
            },
            canvasId,
            { timeout: 20000 },
          );
        }
        const filename = view + '-' + width + '.png';
        await page.screenshot({ path: resolve(output, filename) });
        await panel.screenshot({ path: resolve(output, view + '-' + width + '-panel.png') });
        report.captures.push({
          width,
          height,
          view,
          screenshot: filename,
          selectedState,
          scope,
          initial,
          frame:
            view === 'three'
              ? await page.locator('#threeHost').getAttribute('data-render-phase')
              : null,
          roughMesh:
            view === 'three'
              ? await page.evaluate(() => {
                  const canvas = document.querySelector('#threeHost canvas');
                  return {
                    mode: canvas?.dataset.roughMeshMode || 'none',
                    triangleCount: Number(canvas?.dataset.roughTriangleCount || 0),
                    worker: canvas?.dataset.roughMeshWorker || null,
                  };
                })
              : null,
          loadedProjects,
          realCanvas: await page.evaluate((view) => {
            const id = { main: 'mainCanvas', mask: 'maskCanvas', section: 'sectionCanvas' }[view];
            const canvas = id
              ? document.getElementById(id)
              : document.querySelector('#threeHost canvas');
            return { width: canvas?.width || 0, height: canvas?.height || 0 };
          }, view),
        });
      }
      if (
        requireRough &&
        openProject === 'photodetector-literature-examples.wafercad' &&
        width > 820
      ) {
        report.roughRoi = await capturePhotodetectorRoughRoi(page, output, width);
      }
    } finally {
      await context.close();
    }
  }
  assert.equal(report.errors.length, 0, 'No uncaught browser errors during visual capture');
  // Three.js was not exercised by the 2D/UI capture scope. The report must
  // not imply that a successful Main/Mask/Section capture validates WebGL.
  report.captureStatus = 'complete';
  console.log('Visual evidence captured at ' + output);
  console.log('Screenshots must be examined by an AI or human before visual acceptance.');
} catch (error) {
  report.captureStatus = 'failed';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill();
}
