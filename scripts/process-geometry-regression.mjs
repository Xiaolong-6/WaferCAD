import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandProjectStorage } from '../site/project-io.js';
import {
  loadGeometryKernel,
  processBenchmark,
  projectForBenchmark,
} from './process-benchmarks.mjs';
import { exportCurrentProject, loadProject } from './test-helpers/product-scientific.mjs';
import {
  baseUrl,
  canvasInkFraction,
  chooseConfirmation,
  closeFunctionPanel,
  launchBrowser,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForThreeReady,
  newUiContext,
} from './test-helpers/ui.mjs';

await loadGeometryKernel();
const extendedProcess = process.env.WAFERCAD_PROCESS_EXTENDED !== '0';
const { applyOperation, createModel, surfaceSegment } = await import('../site/model.js');
const { circleMulti, pointInMulti } = await import('../site/vector-geometry.js');

function parseGlbJson(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB version');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB byte length');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a, 'first GLB chunk must be JSON');
  return JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString('utf8')
      .trim(),
  );
}

async function processDiagnostics(page) {
  return Promise.race([
    page
      .evaluate(() => ({
        status: document.getElementById('statusText')?.textContent || '',
        stage: document.getElementById('processTaskStage')?.textContent || '',
        taskHidden: Boolean(document.getElementById('processTaskDialog')?.hidden),
        applyDisabled: Boolean(document.getElementById('applyOperationBtn')?.disabled),
        roughRebuilds:
          document.querySelector('#threeHost canvas')?.dataset?.roughRebuildCount || '',
        roughZones: document.querySelector('#threeHost canvas')?.dataset?.roughLodZones || '',
        operationType: document.getElementById('operationType')?.value || '',
        growthMode: document.getElementById('growthMode')?.value || '',
        workerGrowth: globalThis.__lastProcessWorkerPayload?.params?.growth || '',
        workerType: globalThis.__lastProcessWorkerPayload?.params?.type || '',
      }))
      .catch((error) => ({ evaluateError: error.message })),
    new Promise((resolve) => setTimeout(() => resolve({ pageUnresponsive: true }), 2000)),
  ]);
}

const browser = await launchBrowser();

// Process Recipe must exercise the same real Process worker/Kernel path and
// survive project export, not just render a code editor.
const recipeContext = await newUiContext(browser, {
  viewport: { width: 1365, height: 900 },
  acceptDownloads: true,
});
const recipePage = await recipeContext.newPage();
const recipeErrors = observePageErrors(recipePage);
await recipePage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await waitForAppReady(recipePage);
await openFunctionPanel(recipePage, 'process');
assert.equal(await recipePage.locator('#manualProcessPane').isVisible(), true);
assert.equal(await recipePage.locator('#recipeProcessPane').isHidden(), true);
await recipePage.locator('[data-process-input-mode="recipe"]').click();
assert.equal(await recipePage.locator('#manualProcessPane').isHidden(), true);
assert.equal(await recipePage.locator('#recipeProcessPane').isVisible(), true);
assert.equal(await recipePage.locator('#recipeStepsPane').isVisible(), true);
assert.equal(await recipePage.locator('#recipeCodePane').isHidden(), true);

await recipePage.locator('#recipeTemplateSelect').selectOption('conformal');
assert.equal(await recipePage.locator('.recipe-step-row').count(), 1);
assert.match(await recipePage.locator('.recipe-step-row').first().textContent(), /Deposit Al2O3/);

await recipePage.locator('#recipeCodeTab').click();
assert.equal(await recipePage.locator('#recipeCodePane').isVisible(), true);
assert.match(await recipePage.locator('#recipeCodeEditor').inputValue(), /deposit\(\{/);
assert.match(await recipePage.locator('#recipeCodeEditor').inputValue(), /30 nm/);
await recipePage.locator('#recipeStepsTab').click();

await recipePage.locator('#recipeValidateBtn').click();
assert.match(await recipePage.locator('#statusText').textContent(), /Recipe valid: 1 step/);
await recipePage.locator('#recipeRunAllBtn').click();
await recipePage.waitForFunction(
  () => /Process Recipe completed 1 step/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);

// Manual Process remains the source of truth and can teach Recipe by recording
// a successful operation back into the same persisted recipe.
await recipePage.locator('[data-process-input-mode="manual"]').click();
await recipePage.locator('[data-process-mode="add"]').click();
await recipePage.locator('#operationArea').selectOption('full');
await recipePage.locator('#growthMode').selectOption('direct');
await recipePage.locator('#layerName').fill('Manual recipe check');
await recipePage.locator('#operationThickness').fill('0.02');
await recipePage.locator('#applyOperationBtn').click();
await recipePage.waitForFunction(
  () => /Deposited Manual recipe check/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);
await recipePage.locator('[data-process-input-mode="recipe"]').click();
assert.equal(await recipePage.locator('.recipe-step-row').count(), 2);
assert.match(
  await recipePage.locator('.recipe-step-row').nth(1).textContent(),
  /Deposit Manual recipe check/,
);

await openFunctionPanel(recipePage, 'project');
const recipeDownloadPromise = recipePage.waitForEvent('download');
await recipePage.locator('#exportProjectBtn').click();
const recipeDownload = await recipeDownloadPromise;
const recipePath = await recipeDownload.path();
assert.ok(recipePath);
const recipeSaved = expandProjectStorage(JSON.parse(await readFile(recipePath, 'utf8')));
assert.equal(recipeSaved.processRecipe?.version, 1);
assert.equal(recipeSaved.processRecipe?.steps?.length, 2);
assert.equal(recipeSaved.processRecipe?.steps?.[0]?.command, 'deposit');
assert.equal(recipeSaved.processRecipe?.steps?.[0]?.params?.material, 'Al2O3');
assert.equal(recipeSaved.processRecipe?.steps?.[1]?.params?.material, 'Manual recipe check');
assert.ok(recipeSaved.model.processRevision >= 2, 'Recipe and Manual operations must commit through the Process kernel');
assert.deepEqual(recipeErrors, []);
await recipeContext.close();

const context = await newUiContext(browser, {
  viewport: { width: 1365, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = observePageErrors(page);

await page.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await waitForAppReady(page);
await waitForThreeReady(page);
await openFunctionPanel(page, 'process');

// Etch defaults to the legacy directional path. Isotropic release is an explicit
// opt-in profile with material selection and no Rough/Pyramid appearance mode.
await page.locator('[data-process-mode="etch"]').click();
assert.equal(await page.locator('#etchProfileRow').isVisible(), true);
assert.equal(await page.locator('#etchProfile').inputValue(), 'directional');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), true);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Depth');

await page.locator('#etchProfile').selectOption('isotropic');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), false);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Radius');
assert.match(await page.locator('#operationNote').textContent(), /Choose one exposed material/);
assert.match(
  await page.locator('#etchTargetLayer option').first().textContent(),
  /Select material/,
);

await page.locator('#etchProfile').selectOption('directional');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), true);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Depth');

// Rough etch remains render-only metadata; the ideal process geometry stays canonical.
assert.equal(await page.locator('#roughFeatureRow').isVisible(), false);
await page.locator('#etchSurfaceMode').selectOption('rough');
assert.equal(await page.locator('#roughPolarityRow').isVisible(), true);
assert.equal(await page.locator('#roughPolarity').inputValue(), 'inverted');
await page.locator('#roughPolarity').selectOption('normal');
assert.match(await page.locator('#operationNote').textContent(), /Normal points features outward/);
assert.equal(await page.locator('#roughFeatureRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightRow').isVisible(), true);
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);
assert.match(await page.locator('#operationNote').textContent(), /maximum etch depth/);

await page.locator('#etchSurfaceMode').selectOption('pyramid');
assert.equal((await page.locator('#roughFeatureLabel').textContent()).trim(), 'Pyramid XY');
assert.equal((await page.locator('#roughHeightLabel').textContent()).trim(), 'Height');
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);
assert.equal(await page.locator('#roughSeedRow').isVisible(), true);
await page.locator('#roughFeatureCv').fill('30');
await page.locator('#roughHeightCv').fill('20');
await page.locator('#roughSeed').fill('2018');
assert.match(
  await page.locator('#operationNote').textContent(),
  /Seed makes the random field reproducible/,
);
await page.locator('#etchSurfaceMode').selectOption('rough');
assert.equal((await page.locator('#roughFeatureLabel').textContent()).trim(), 'Feature XY');
assert.equal((await page.locator('#roughHeightLabel').textContent()).trim(), 'Height mean');
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);

await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.5');
assert.equal(await page.locator('#roughAmplitude').getAttribute('max'), '0.5');
await page.locator('#roughFeatureSize').fill('0.4');
await page.locator('#roughFeatureCv').fill('35');
await page.locator('#roughAmplitude').fill('0.8');
await page.locator('#roughHeightCv').fill('40');
await page.locator('#roughSeed').fill('4242');
await page.locator('#applyOperationBtn').click();
assert.match(await page.locator('#statusText').textContent(), /Height cannot exceed Etch Depth/);
await page.locator('#operationThickness').fill('1');
assert.equal(await page.locator('#roughAmplitude').getAttribute('max'), '1');
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
try {
  await page.waitForFunction(
    () => {
      const text = document.getElementById('statusText')?.textContent || '';
      return /Etched|Operation failed|Conformal geometry failed/.test(text);
    },
    null,
    { timeout: 30000 },
  );
} catch (error) {
  console.error('Rough Etch timeout diagnostics:', await processDiagnostics(page));
  throw error;
}
assert.match(await page.locator('#statusText').textContent(), /Etched/);

assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');
await page.locator('#undoBtn').click();
assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');
await page.locator('#redoBtn').click();
assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');

await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI rough project');
const roughDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const roughDownload = await roughDownloadPromise;
const roughSavedPath = await roughDownload.path();
assert.ok(roughSavedPath);
const roughSaved = expandProjectStorage(JSON.parse(await readFile(roughSavedPath, 'utf8')));
const roughSegments = roughSaved.model.regions.flatMap((region) => region.stack);
assert.ok(
  roughSegments.some(
    (segment) =>
      segment.frontSurface?.kind === 'rough' &&
      segment.frontSurface.morphology === 'stochastic' &&
      segment.frontSurface.polarity === 'normal' &&
      segment.frontSurface.geometryMode === 'ideal' &&
      Math.abs(segment.frontSurface.featureSize - 0.4) < 1e-12 &&
      Math.abs(segment.frontSurface.meanHeight - 0.8) < 1e-12 &&
      Math.abs(segment.frontSurface.featureCv - 0.35) < 1e-12 &&
      Math.abs(segment.frontSurface.heightCv - 0.4) < 1e-12 &&
      segment.frontSurface.seed === 4242 &&
      typeof segment.frontSurface.profileId === 'string' &&
      Math.abs(segment.frontSurface.etchDepth - 1) < 1e-12,
  ),
);

// Export the actual rough state and parse the GLB contract, rather than only
// checking that a file downloaded. This locks physical units, deterministic
// morphology metadata, and the real exporter path together.
await page.locator('#threePanel .export-control > summary').click();
const roughGlbDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportModelBtn').click();
const roughGlbDownload = await roughGlbDownloadPromise;
assert.equal(roughGlbDownload.suggestedFilename(), 'wafercad-model.glb');
const roughGlbPath = await roughGlbDownload.path();
assert.ok(roughGlbPath);
const roughGlb = parseGlbJson(await readFile(roughGlbPath)),
  roughGlbRoot = (roughGlb.nodes || []).find((node) => node.name === 'WaferCAD'),
  roughGlbScale =
    roughGlbRoot?.scale ||
    (roughGlbRoot?.matrix
      ? [roughGlbRoot.matrix[0], roughGlbRoot.matrix[5], roughGlbRoot.matrix[10]]
      : []),
  roughGlbMorphologyNodes = (roughGlb.nodes || []).filter(
    (node) => node.extras?.wafercadMorphology,
  );
assert.equal(roughGlbScale.length, 3);
assert.ok(roughGlbScale.every((value) => Math.abs(value - 1e-6) < 1e-12));
assert.ok(roughGlbMorphologyNodes.length > 0, 'GLB must contain exported morphology meshes');
assert.ok(
  roughGlbMorphologyNodes.some(
    (node) =>
      node.extras?.wafercadMorphology === 'stochastic' &&
      node.extras?.wafercadMorphologySeed === 4242 &&
      node.extras?.wafercadMorphologyPolarity === 'normal',
  ),
  'GLB must retain deterministic rough morphology metadata',
);
assert.match(await page.locator('#statusText').textContent(), /morphology embedded/i);

await openFunctionPanel(page, 'process');

// Implant uses the same process area but records a structural annotation only.
await page.locator('[data-process-mode="implant"]').click();
assert.equal(await page.locator('#implantNameRow').isVisible(), true);
assert.equal(await page.locator('#implantTiltRow').isVisible(), true);
assert.equal(await page.locator('#implantColor').count(), 0);
assert.match(await page.locator('#operationNote').textContent(), /Structural implant annotation/);
await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.6');
await page.locator('#implantName').fill('UI implant');
await page.locator('#implantTilt').fill('7');
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Marked implant UI implant/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);

const implantLegendRow = page.locator('#layerLegend .implant-row-wrap').first();
assert.equal(await implantLegendRow.count(), 1);
assert.equal(await implantLegendRow.locator('.legend-visibility').isChecked(), true);
assert.doesNotMatch(await implantLegendRow.textContent(), /EXP/);
await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI implant project');
const implantDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const implantDownload = await implantDownloadPromise;
const implantSavedPath = await implantDownload.path();
assert.ok(implantSavedPath);
const implantSaved = expandProjectStorage(JSON.parse(await readFile(implantSavedPath, 'utf8')));
assert.equal(implantSaved.model.implants.length, 1);
assert.equal(implantSaved.model.implants[0].name, 'UI implant');
assert.equal(implantSaved.model.implants[0].thickness, 0.6);
assert.equal(implantSaved.model.implants[0].tilt, 7);
assert.equal(implantSaved.model.implants[0].depthProfile, 'follow');
assert.equal(implantSaved.model.implants[0].visible, true);
assert.equal('border' in implantSaved.model.implants[0], false);
assert.ok(implantSaved.model.implants[0].patches.length > 0);
await openFunctionPanel(page, 'process');

// Electrical Region is a separate annotation semantic: no Implant tilt/gradient
// controls, typed metadata, independent legend row, and persisted v14 state.
await page.locator('[data-process-mode="electrical"]').click();
assert.equal(await page.locator('#electricalNameRow').isVisible(), true);
assert.equal(await page.locator('#electricalRegionParams').isVisible(), true);
assert.equal(await page.locator('#implantTiltRow').isHidden(), true);
assert.match(
  await page.locator('#operationNote').textContent(),
  /Non-material electrical annotation/,
);
await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.2');
await page.locator('#electricalName').fill('UI induced inversion');
await page.locator('#electricalRegionType').selectOption('p-inversion');
await page.locator('#electricalRegionSource').selectOption('induced');
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Marked electrical region UI induced inversion/.test(
    document.getElementById('statusText')?.textContent || '',
  ),
);

const electricalLegendRow = page.locator('#layerLegend .electrical-row-wrap').first();
assert.equal(await electricalLegendRow.count(), 1);
assert.equal(await electricalLegendRow.locator('.legend-visibility').isChecked(), true);
await openFunctionPanel(page, 'project');
const electricalDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const electricalDownload = await electricalDownloadPromise;
const electricalSavedPath = await electricalDownload.path();
assert.ok(electricalSavedPath);
const electricalSaved = expandProjectStorage(
  JSON.parse(await readFile(electricalSavedPath, 'utf8')),
);
assert.equal(electricalSaved.version, 14);
assert.equal(electricalSaved.model.electricalRegions.length, 1);
assert.equal(electricalSaved.model.electricalRegions[0].name, 'UI induced inversion');
assert.equal(electricalSaved.model.electricalRegions[0].regionType, 'p-inversion');
assert.equal(electricalSaved.model.electricalRegions[0].source, 'induced');
assert.equal(electricalSaved.model.electricalRegions[0].thickness, 0.2);
assert.equal(electricalSaved.model.electricalRegions[0].depthProfile, 'follow');
assert.equal(electricalSaved.model.implants.length, 1);
await openFunctionPanel(page, 'process');

// Extend targets follow the exposed surface and include Base when it is exposed.
await page.locator('[data-process-mode="grow"]').click();
await page.locator('#operationArea').selectOption('full');
assert.ok(await page.locator('#targetLayer option[value="base"]').count());
await page.locator('[data-process-mode="add"]').click();

// Exercise Conformal through the real UI path, then save and inspect the canonical model.
const conformalFixture = createModel({
  shape: 'circle',
  width: 100000,
  height: 100000,
  thickness: 12,
});
applyOperation(conformalFixture, {
  type: 'etch',
  thickness: 2,
  area: circleMulti(10000),
  surface: {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'normal',
    featureSize: 4000,
    meanHeight: 0.4,
    featureCv: 0.2,
    heightCv: 0.2,
    seed: 7001,
    profileId: 'rough-conformal-export-probe',
    geometryMode: 'ideal',
  },
});
const conformalProject = projectForBenchmark({
  model: conformalFixture,
  section: { a: [-7000, 0], b: [7000, 0] },
});
await openFunctionPanel(page, 'project');
await page.locator('#openProjectInput').setInputFiles({
  name: 'ui-conformal-round-trench.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(conformalProject)),
});
await chooseConfirmation(page);
await page.waitForFunction(() =>
  (document.getElementById('statusText')?.textContent || '').startsWith('Opened'),
);
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="add"]').click();
await page.locator('#operationArea').selectOption('full');
await page.locator('#growthMode').selectOption('conformal');
await page.locator('#operationThickness').fill('1');
await page.locator('#layerName').fill('UI conformal');
assert.equal(await page.locator('#growthMode').inputValue(), 'conformal');
assert.match(await page.locator('#operationNote').textContent(), /Conformal/);
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), false);
await page.waitForFunction(() =>
  /Deposited UI conformal/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), true);
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);

if (extendedProcess) {
  // The conformal layer inherits the rough trench surface. Export it through the
  // real 3D path and verify the buried shared profile is not closed to the ideal plane.
  await page.locator('#threePanel .export-control > summary').click();
  const conformalGlbDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#threeExportModelBtn').click();
  const conformalGlbDownload = await conformalGlbDownloadPromise,
    conformalGlbPath = await conformalGlbDownload.path();
  assert.ok(conformalGlbPath);
  const conformalGlb = parseGlbJson(await readFile(conformalGlbPath)),
    conformalMorphologyNodes = (conformalGlb.nodes || []).filter(
      (node) => node.extras?.wafercadMorphology,
    ),
    conformalBuriedMorphology = conformalMorphologyNodes.filter(
      (node) => node.extras?.wafercadBuriedInterface === true,
    ),
    conformalExposedMorphology = conformalMorphologyNodes.filter(
      (node) => node.extras?.wafercadBuriedInterface === false,
    );
  assert.ok(conformalBuriedMorphology.length > 0);
  assert.ok(conformalExposedMorphology.length > 0);
  assert.ok(
    conformalBuriedMorphology.every(
      (node) =>
        node.extras?.wafercadSurfaceOwnership === 'interface' &&
        node.extras?.wafercadInterfaceLayerId &&
        node.extras?.wafercadRoughBorderVertexCount === 0,
    ),
    'buried conformal morphology must remain single-owner without ideal-plane closure skirts',
  );
  assert.ok(
    conformalExposedMorphology.every(
      (node) => Number(node.extras?.wafercadRoughBorderVertexCount || 0) === 0,
    ),
    'exposed conformal morphology must hand matched boundaries to textured sidewalls instead of ideal-plane skirts',
  );
}

await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI conformal project');
const downloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), 'UI conformal project.wafercad');
assert.match(await page.locator('#statusText').textContent(), /Download requested/);
const savedPath = await download.path();
assert.ok(savedPath);
const saved = expandProjectStorage(JSON.parse(await readFile(savedPath, 'utf8')));
const coatId = saved.model.layers.find((layer) => layer.name === 'UI conformal')?.id;
assert.ok(coatId);
const stackAtSaved = (x) =>
  saved.model.regions.find((region) => pointInMulti([x, 0], region.geom))?.stack || [];
const sideX = 4999.5;
assert.deepEqual(
  stackAtSaved(sideX).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 7, role: 'conformal-sidewall' },
);
const centerCoat = stackAtSaved(0).find((segment) => segment.layerId === coatId);
assert.ok(centerCoat);
assert.equal(centerCoat.layerId, coatId);
assert.equal(centerCoat.z0, 4);
assert.equal(centerCoat.z1, 5);
assert.equal(centerCoat.frontSurface?.profileId, 'rough-conformal-export-probe');
assert.equal(centerCoat.frontSurface?.morphology, 'stochastic');
assert.deepEqual(
  stackAtSaved(5001).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 6, z1: 7 },
);
const coatColor = saved.model.layers.find((layer) => layer.id === coatId).color;
const sidewallPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, sideX }) => {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(globalThis.devicePixelRatio || 1, 2),
      left = 27,
      right = 10,
      iw = rect.width - left - right,
      t = (sideX + 7000) / 14000,
      x = Math.round((left + t * iw) * dpr),
      z = 6,
      z0 = Number(canvas.dataset.sectionZ0Um),
      z1 = Number(canvas.dataset.sectionZ1Um),
      top = Number(canvas.dataset.sectionCollapseTopUm),
      bottom = Number(canvas.dataset.sectionCollapseBottomUm),
      frameTop = Number(canvas.dataset.sectionFrameTop),
      frameBottom = Number(canvas.dataset.sectionFrameBottom),
      upperY = Number(canvas.dataset.sectionCollapseUpperY),
      lowerY = Number(canvas.dataset.sectionCollapseLowerY);
    const mapZ = (value) => {
      if (value >= top) {
        return frameTop + ((z1 - value) / Math.max(z1 - top, 1e-12)) * (upperY - frameTop);
      }
      if (value <= bottom) {
        return lowerY + ((bottom - value) / Math.max(bottom - z0, 1e-12)) * (frameBottom - lowerY);
      }
      return (upperY + lowerY) / 2;
    };
    const y = Math.round(mapZ(z) * dpr),
      actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)],
      expected = [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ];
    return { actual, expected, z, top, bottom };
  },
  { color: coatColor, sideX },
);
assert.ok(
  sidewallPixel.actual.every(
    (value, index) => Math.abs(value - sidewallPixel.expected[index]) <= 8,
  ),
);

// Region partitions inside one material must never show up as Section seams.
// Probe the trench wall x-position deep inside the continuous Base material,
// where the process model is partitioned but the visible material is identical.
const baseColor = saved.model.layers.find((layer) => layer.id === 'base').color;
const baseCommonLo = Math.max(
  ...saved.model.regions
    .map((region) => region.stack.find((segment) => segment.layerId === 'base')?.z0)
    .filter(Number.isFinite),
);
const baseSeamPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, baseCommonLo }) => {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(globalThis.devicePixelRatio || 1, 2),
      left = 27,
      right = 10,
      iw = rect.width - left - right,
      t = (5000 + 7000) / 14000,
      x = Math.round((left + t * iw) * dpr),
      z0 = Number(canvas.dataset.sectionZ0Um),
      z1 = Number(canvas.dataset.sectionZ1Um),
      top = Number(canvas.dataset.sectionCollapseTopUm),
      bottom = Number(canvas.dataset.sectionCollapseBottomUm),
      frameTop = Number(canvas.dataset.sectionFrameTop),
      frameBottom = Number(canvas.dataset.sectionFrameBottom),
      upperY = Number(canvas.dataset.sectionCollapseUpperY),
      lowerY = Number(canvas.dataset.sectionCollapseLowerY),
      z = (baseCommonLo + bottom) / 2;
    const mapZ = (value) => {
      if (value >= top) {
        return frameTop + ((z1 - value) / Math.max(z1 - top, 1e-12)) * (upperY - frameTop);
      }
      return lowerY + ((bottom - value) / Math.max(bottom - z0, 1e-12)) * (frameBottom - lowerY);
    };
    const y = Math.round(mapZ(z) * dpr),
      actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)],
      expected = [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ];
    return { actual, expected, z };
  },
  { color: baseColor, baseCommonLo },
);
assert.ok(
  baseSeamPixel.actual.every(
    (value, index) => Math.abs(value - baseSeamPixel.expected[index]) <= 8,
  ),
);

if (extendedProcess) {
  // Section defaults to readable Auto fit but offers a true physical 1:1 check.
  const sectionScaleButton = page.locator('#sectionScaleModeBtn');
  assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');
  assert.match(await page.locator('#sectionMeta').textContent(), /Z ×/);
  const autoScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
    x: Number(canvas.dataset.xPxPerUm),
    z: Number(canvas.dataset.zPxPerUm),
  }));
  assert.ok(autoScales.x > 0 && autoScales.z > 0);
  await sectionScaleButton.click();
  assert.equal((await sectionScaleButton.textContent()).trim(), '1:1');
  assert.match(await page.locator('#sectionMeta').textContent(), /1:1/);
  const physicalScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
    mode: canvas.dataset.scaleMode,
    x: Number(canvas.dataset.xPxPerUm),
    z: Number(canvas.dataset.zPxPerUm),
  }));
  assert.equal(physicalScales.mode, 'physical');
  assert.ok(Math.abs(physicalScales.x - physicalScales.z) < 1e-9);
  await sectionScaleButton.click();
  assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');

  // Section Detail ROI keeps the global section visible while re-rendering a local
  // region at higher effective resolution. The inset can be moved out of the way.
  await page.locator('#sectionDetailRoiBtn').click();
  const sectionBox = await page.locator('#sectionCanvas').boundingBox();
  assert.ok(sectionBox);
  await page.mouse.move(
    sectionBox.x + sectionBox.width * 0.34,
    sectionBox.y + sectionBox.height * 0.18,
  );
  await page.mouse.down();
  await page.mouse.move(
    sectionBox.x + sectionBox.width * 0.54,
    sectionBox.y + sectionBox.height * 0.42,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.locator('#sectionDetailRoiOverlay').waitFor({ state: 'visible' });
  await page.locator('#sectionDetailInset').waitFor({ state: 'visible' });
  assert.ok(
    (await canvasInkFraction(page, '#sectionDetailInsetCanvas')) > 0.01,
    'Section Detail inset rendered blank',
  );
  const insetBefore = await page.locator('#sectionDetailInset').boundingBox();
  const insetHeadBox = await page.locator('#sectionDetailInsetHead').boundingBox();
  assert.ok(insetBefore && insetHeadBox);
  await page.mouse.move(insetHeadBox.x + 20, insetHeadBox.y + insetHeadBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(insetHeadBox.x - 45, insetHeadBox.y + 42, { steps: 4 });
  await page.mouse.up();
  const insetAfter = await page.locator('#sectionDetailInset').boundingBox();
  assert.ok(insetAfter);
  assert.ok(
    Math.abs(insetAfter.x - insetBefore.x) > 4 || Math.abs(insetAfter.y - insetBefore.y) > 4,
    'Section Detail inset did not move',
  );
  await page.locator('#sectionDetailShapeBtn').click();
  assert.equal(
    await page
      .locator('#sectionDetailRoiOverlay')
      .evaluate((el) => el.classList.contains('circle')),
    true,
  );
}

// Conformal Extend reuses the Deposit coating kernel with the existing layer id.
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="grow"]').click();
await page.locator('#operationArea').selectOption('full');
await page.locator('#growthMode').selectOption('conformal');
await page.locator('#targetLayer').selectOption(coatId);
await page.locator('#operationThickness').fill('1');
assert.match(await page.locator('#operationNote').textContent(), /every exposed surface/);
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Extended UI conformal · Conformal/.test(
    document.getElementById('statusText')?.textContent || '',
  ),
);
await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI conformal extend project');
const extendDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const extendDownload = await extendDownloadPromise;
const extendSavedPath = await extendDownload.path();
assert.ok(extendSavedPath);
const extendSaved = expandProjectStorage(JSON.parse(await readFile(extendSavedPath, 'utf8')));
if (extendedProcess) {
  assert.equal(extendSaved.display.sectionDetailRoi?.shape, 'circle');
  assert.ok(extendSaved.display.sectionDetailRoi?.width > 0);
  assert.ok(extendSaved.display.sectionDetailRoi?.height > 0);
}
const extendStackAt = (x) =>
  extendSaved.model.regions.find((region) => pointInMulti([x, 0], region.geom))?.stack || [];
const extendedCenter = extendStackAt(0).find((segment) => segment.layerId === coatId),
  extendedOuter = extendStackAt(7000).find((segment) => segment.layerId === coatId),
  extendedSidewall = extendStackAt(sideX).find((segment) => segment.layerId === coatId);
assert.ok(extendedCenter);
assert.equal(extendedCenter.z0, 4);
assert.equal(extendedCenter.z1, 6);
assert.equal(extendedCenter.frontSurface?.profileId, 'rough-conformal-export-probe');
assert.ok(extendedOuter);
assert.equal(extendedOuter.z0, 6);
assert.equal(extendedOuter.z1, 8);
assert.ok(extendedSidewall);
assert.equal(extendedSidewall.z0, 4);
assert.equal(extendedSidewall.z1, 8);
assert.equal(extendedSidewall.role, 'conformal-sidewall');

await closeFunctionPanel(page);

// Run the audited sidewall-only no-op through the real worker/UI. A no-change
// result must not allocate a layer, alter revisions or append a History Step.
for (const face of extendedProcess ? ['front', 'back'] : ['front']) {
  for (const type of extendedProcess ? ['add', 'grow'] : ['add']) {
    const { model } = await processBenchmark('step', 'conformal', face),
      sidewall = model.regions.find(
        (region) => surfaceSegment(region.stack, face)?.role === 'conformal-sidewall',
      ),
      project = projectForBenchmark({ model, section: { a: [-9, 0], b: [9, 0] } });
    project.activeFace = face;
    project.maskSourceMode = 'draw';
    project.drawMask = {
      nextShapeId: 2,
      shapes: [{ id: 'shape-1', type: 'polygon', points: sidewall.geom[0][0] }],
    };
    await loadProject(page, project, `sidewall-only-${type}-${face}`);
    const before = await exportCurrentProject(page);
    await openFunctionPanel(page, 'process');
    await page.locator(`[data-process-mode="${type}"]`).click();
    await page.locator('#operationArea').selectOption('mask');
    await page.locator('#growthMode').selectOption('direct');
    if (type === 'grow')
      await page.locator('#targetLayer').selectOption(surfaceSegment(sidewall.stack, face).layerId);
    await page.locator('#operationThickness').fill('0.2');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        /no eligible horizontal surface/.test(
          document.getElementById('statusText')?.textContent || '',
        ),
      null,
      { timeout: 30000 },
    );
    const after = await exportCurrentProject(page);
    assert.deepEqual(
      after.model,
      before.model,
      `${type}/${face}: no-op must preserve the stored model`,
    );
    assert.deepEqual(
      after.snapshotBranches,
      before.snapshotBranches,
      `${type}/${face}: no-op must preserve all History branches/cursors/HEADs`,
    );
    assert.deepEqual(
      after.snapshots,
      before.snapshots,
      `${type}/${face}: no-op must not append a Step`,
    );
  }
}

assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log('WaferCAD process geometry regression: OK');
