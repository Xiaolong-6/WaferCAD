import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();
const output = new URL('../test-results/renderer-pipeline/', import.meta.url);
await mkdir(output, { recursive: true });

function numericProfile(dataset) {
  const fields = [
    'rendererTopologyMs',
    'rendererSmoothCapsMs',
    'rendererSidewallsMs',
    'rendererAnnotationsMs',
    'rendererAssemblyMs',
    'rendererPresentationMs',
    'rendererRoughMs',
    'rendererPreviewReadyMs',
    'rendererFinalReadyMs',
  ];
  return Object.fromEntries(
    fields
      .filter((key) => dataset[key] != null && dataset[key] !== '')
      .map((key) => [key, Number(dataset[key])]),
  );
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);

  await page.goto(baseUrl + '/app.html');
  await waitForAppReady(page);
  const openStarted = performance.now();
  await page
    .locator('#openProjectInput')
    .setInputFiles(
      fileURLToPath(
        new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
      ),
    );
  await chooseConfirmation(page);
  await page.waitForFunction(() =>
    document.getElementById('statusText').textContent.startsWith('Opened '),
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 180000);
  const initialReadyMs = performance.now() - openStarted;

  const snapshot = () =>
    page.locator('#threeHost').evaluate((host) => ({
      host: { ...host.dataset },
      canvas: { ...(host.querySelector('canvas')?.dataset || {}) },
    }));

  const initial = await snapshot();
  assert.equal(initial.host.renderState, 'ready');

  const opacityStarted = performance.now();
  await page.locator('#threePanel .three-opacity-control > summary').click();
  await page.locator('#threeOpacityRange').fill('0.5');
  await waitForThreeReady(page, 180000);
  const transparentReadyMs = performance.now() - opacityStarted;
  const transparent = await snapshot();

  const restoreStarted = performance.now();
  await page.locator('#threeOpacityRange').fill('1');
  await waitForThreeReady(page, 180000);
  const restoredReadyMs = performance.now() - restoreStarted;
  const restored = await snapshot();

  assert.equal(initial.host.surfaceTopology, transparent.host.surfaceTopology);
  assert.equal(initial.host.surfaceTopology, restored.host.surfaceTopology);
  assert.equal(initial.host.modelRevision, transparent.host.modelRevision);
  assert.equal(initial.host.modelRevision, restored.host.modelRevision);
  assert.equal(
    transparent.host.sceneGeneration,
    initial.host.sceneGeneration,
    'Opacity must keep the physical scene generation stable',
  );
  assert.equal(
    restored.host.sceneGeneration,
    initial.host.sceneGeneration,
    'Restoring opacity must keep the physical scene generation stable',
  );
  assert.equal(
    transparent.host.surfacePlanBuildCount,
    initial.host.surfacePlanBuildCount,
    'Opacity must not rebuild the surface plan',
  );
  assert.equal(
    restored.host.surfacePlanBuildCount,
    initial.host.surfacePlanBuildCount,
    'Restoring opacity must not rebuild the surface plan',
  );
  assert.equal(transparent.host.rendererUpdateKind, 'presentation');
  assert.equal(restored.host.rendererUpdateKind, 'presentation');
  assert.equal(Number(transparent.host.rendererAssemblyMs), 0);
  assert.equal(Number(restored.host.rendererAssemblyMs), 0);
  for (const key of [
    'sceneObjectCount',
    'sceneGeometryCount',
    'sceneMaterialCount',
    'presentationObjectCount',
  ]) {
    assert.equal(transparent.host[key], initial.host[key], `${key} changed on opacity update`);
    assert.equal(restored.host[key], initial.host[key], `${key} changed on opacity restore`);
  }
  assert.deepEqual(errors, []);

  const report = {
    browserVersion: browser.version(),
    initialReadyMs,
    transparentReadyMs,
    restoredReadyMs,
    initial: numericProfile(initial.host),
    transparent: numericProfile(transparent.host),
    restored: numericProfile(restored.host),
    updateKinds: {
      initial: initial.host.rendererUpdateKind,
      transparent: transparent.host.rendererUpdateKind,
      restored: restored.host.rendererUpdateKind,
    },
    resources: {
      initial: {
        objects: initial.host.sceneObjectCount,
        geometries: initial.host.sceneGeometryCount,
        materials: initial.host.sceneMaterialCount,
      },
      transparent: {
        objects: transparent.host.sceneObjectCount,
        geometries: transparent.host.sceneGeometryCount,
        materials: transparent.host.sceneMaterialCount,
      },
      restored: {
        objects: restored.host.sceneObjectCount,
        geometries: restored.host.sceneGeometryCount,
        materials: restored.host.sceneMaterialCount,
      },
    },
    topology: initial.host.surfaceTopology,
    arrayInstances: initial.host.arrayInstances,
    errors,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('RENDERER_PIPELINE_PROFILE_OK', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
