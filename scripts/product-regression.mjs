import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import {
  isotropicReleaseBenchmark,
  loadGeometryKernel,
  processBenchmark,
  projectForBenchmark,
} from './process-benchmarks.mjs';
import {
  captureProductReview,
  checkLayout,
  confirmIfVisible,
  ensurePrimaryViewVisible,
  openFunctionPanel,
  openProductPage,
} from './test-helpers/product.mjs';
import { createProductLayoutChecks } from './test-helpers/product-layout.mjs';
import {
  checkSectionSeams,
  exportCurrentProject,
  loadProject,
  sectionMaterialThickness,
} from './test-helpers/product-scientific.mjs';
import { sampleById } from '../site/sample-layouts.js';

await loadGeometryKernel();
const { parseLayoutFile } = await import('../site/layout-io.js');
const { pointInMulti } = await import('../site/vector-geometry.js');

const productScope = process.env.WAFERCAD_PRODUCT_SCOPE || 'all';
assert.ok(
  ['all', 'layout', 'renderer'].includes(productScope),
  `Unknown WAFERCAD_PRODUCT_SCOPE: ${productScope}`,
);
const runLayout = productScope === 'all' || productScope === 'layout';
const runRenderer = productScope === 'all' || productScope === 'renderer';
const output = resolve(process.env.WAFERCAD_REVIEW_DIR || 'test-results/product-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const cases = [];
const errors = [];
const open = (viewport, touch = false) =>
  openProductPage(browser, viewport, touch, errors);
const capture = (page, name) => captureProductReview(page, name, output, cases);

const {
  checkStickerGrouping,
  checkWorkstationShellLayout,
  checkCompactProcessLayout,
  checkPopover,
  checkSectionCollapse,
  checkAB,
  checkROI,
} = createProductLayoutChecks({ capture });

try {
  const viewportCases = runLayout
    ? [
        ['wide', { width: 1440, height: 900 }, false],
        ['medium', { width: 1000, height: 800 }, false],
        ['phone', { width: 390, height: 844 }, true],
      ]
    : [['wide', { width: 1440, height: 900 }, false]];

  for (const [name, viewport, touch] of viewportCases) {
    const { page, context } = await open(viewport, touch);
    if (runLayout) {
      if (name === 'wide') {
        assert.equal(
          await page.locator('.workstation-view-stage').getAttribute('data-view-mode'),
          'overview',
          'wide: fresh workspace must default to Overview',
        );
        assert.equal(await page.locator('#mainPanel').isVisible(), true);
        assert.equal(await page.locator('#maskPanel').isVisible(), true);
        assert.equal(await page.locator('#threePanel').isVisible(), true);
      }
      await capture(page, `${name}-empty`);
      await checkLayout(page);
      await checkAB(page, name);
      await checkSectionCollapse(page, name);
      await checkWorkstationShellLayout(page, name);
      await checkStickerGrouping(page, name);
      await ensurePrimaryViewVisible(page, 'three');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await checkPopover(page, '#threePanel .three-opacity-popover', '#threePanel');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await ensurePrimaryViewVisible(page, 'main');
      for (const [tool, captureName] of [
        ['base', 'base'],
        ['mask', 'mask'],
        ['process', 'operation'],
        ['snapshots', 'snapshots'],
        ['project', 'settings'],
      ]) {
        await openFunctionPanel(page, tool);
        await capture(page, `${name}-tab-${captureName}`);
        await checkLayout(page);
      }
      await checkCompactProcessLayout(page, name);
      await openFunctionPanel(page, 'snapshots');
      assert.equal(await page.locator('#saveSnapshotBtn').count(), 0);
      assert.equal(await page.locator('.snapshot-other-branch').count(), 0);
      await capture(page, `${name}-history-tree`);
      await checkLayout(page);

      await openFunctionPanel(page, 'mask');
      for (const sample of ['gds-alm', 'gds-basic-instances', 'oas-cblock']) {
        await page.locator('#sampleMaskSelect').selectOption(sample);
        await page.waitForFunction(
          (label) =>
            document.querySelector('#statusText').textContent.startsWith(label) &&
            document.querySelector('#statusText').textContent.includes('area objects;'),
          sampleById(sample).label,
        );
        assert.ok((await page.locator('#cellTree').textContent()).trim());
        const descriptor = sampleById(sample);
        const bytes = await readFile(new URL(`../site/${descriptor.path.slice(2)}`, import.meta.url));
        const imported = await parseLayoutFile(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          descriptor.path,
        );
        const bounds = imported.layout.bounds;
        const baseWidth =
          Math.max(1, ...['minX', 'minY', 'maxX', 'maxY'].map((key) => Math.abs(bounds[key]))) * 2.2;
        await openFunctionPanel(page, 'base');
        await page.locator('#baseWidth').fill(String(baseWidth));
        await page.locator('#applyBaseBtn').click();
        await confirmIfVisible(page);
        await openFunctionPanel(page, 'mask');
        await capture(page, `${name}-${sample}`);
        await checkLayout(page);
      }
    }
    if (runLayout) {
      for (const kind of ['step', 'trench', 'island']) {
        for (const growth of ['direct', 'conformal']) {
          const benchmark = await processBenchmark(kind, growth);
          const project = projectForBenchmark(benchmark);
          await writeFile(
            join(output, `${kind}-${growth}.wafercad`),
            JSON.stringify(project, null, 2),
          );
          await loadProject(page, project, `${kind}-${growth}`);
          await capture(page, `${name}-${kind}-${growth}`);
          await checkSectionSeams(page, project);
          await checkLayout(page);
          if (name === 'phone') {
            await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
            await capture(page, `${name}-${kind}-${growth}-section`);
          }
          if (name === 'wide') {
            const back = projectForBenchmark(await processBenchmark(kind, growth, 'back'));
            back.activeFace = 'back';
            await loadProject(page, back, `${kind}-${growth}-back`);
            const view = await page.locator('#threeHost canvas').boundingBox();
            await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.7);
            await page.mouse.down();
            await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.45, {
              steps: 12,
            });
            await page.mouse.up();
            await page.waitForTimeout(400);
            await capture(page, `${name}-${kind}-${growth}-back`);
            await checkSectionSeams(page, back);
          }
          const etched = structuredClone(project);
          const { applyOperation } = await import('../site/model.js');
          const { rectMulti } = await import('../site/vector-geometry.js');
          applyOperation(etched.model, {
            type: 'etch',
            thickness: 1.5,
            area: rectMulti(6, 8),
            face: 'front',
          });
          await writeFile(
            join(output, `${kind}-${growth}-etch.wafercad`),
            JSON.stringify(etched, null, 2),
          );
          await loadProject(page, etched, `${kind}-${growth}-etch`);
          await capture(page, `${name}-${kind}-${growth}-etch`);
          await checkSectionSeams(page, etched);
          await checkLayout(page);
          if (name === 'phone') {
            await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
            await capture(page, `${name}-${kind}-${growth}-etch-section`);
          }
        }
      }
    }
    if (runRenderer && name === 'wide') {
      // Literature acceptance path: open the pre-release spoked silica disk,
      // execute Isotropic release through the real Process/worker UI, verify the
      // exported canonical cavity, then capture both Section and 3D.
      const releaseBenchmark = await isotropicReleaseBenchmark({ released: false }),
        releaseProject = projectForBenchmark(releaseBenchmark);
      await loadProject(page, releaseProject, 'wide-isotropic-release-pre');
      await openFunctionPanel(page, 'process');
      await page.locator('[data-process-mode="etch"]').click();
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#etchProfile').selectOption('isotropic');
      await page.locator('#etchTargetLayer').selectOption('base');
      await page.locator('#operationThickness').fill(String(releaseBenchmark.releaseRadius));
      await page.locator('#applyOperationBtn').click();
      assert.equal(
        await page.locator('#processTaskDialog').evaluate((element) => element.hidden),
        false,
        'Isotropic release must run through the process worker task UI',
      );
      await page.waitForFunction(
        () => Boolean(document.getElementById('processTaskDialog')?.hidden),
        null,
        { timeout: 120000 },
      );
      // Export is the acceptance barrier: browser events cannot service the
      // export click until the Apply continuation has committed its model/history
      // updates after the worker result. Validate the exported canonical model
      // instead of coupling this test to transient status-text timing.
      const releasedProject = await exportCurrentProject(page, 120000),
        ringRegion = releasedProject.model.regions.find((region) =>
          pointInMulti(releaseBenchmark.probes.ring, region.geom),
        ),
        hubRegion = releasedProject.model.regions.find((region) =>
          pointInMulti(releaseBenchmark.probes.hub, region.geom),
        ),
        ringOxide = ringRegion?.stack.find(
          (segment) => segment.layerId === releaseBenchmark.oxideLayerId,
        ),
        ringSi = ringRegion?.stack.find((segment) => segment.layerId === 'base'),
        hubOxide = hubRegion?.stack.find(
          (segment) => segment.layerId === releaseBenchmark.oxideLayerId,
        ),
        hubSi = hubRegion?.stack.find((segment) => segment.layerId === 'base');

      assert.equal(releasedProject.version, 14);
      assert.ok(ringOxide && ringSi, 'UI release export must retain oxide over lower silicon');
      assert.ok(ringOxide.z0 - ringSi.z1 > 10, 'UI release export must contain a true air gap');
      assert.ok(hubOxide && hubSi, 'UI release export must retain the central support');
      assert.ok(
        Math.abs(hubOxide.z0 - hubSi.z1) < 1e-9,
        'UI release export must keep the support mechanically attached',
      );

      await page.getByRole('button', { name: 'Overview' }).click();
      await page.locator('#fit3dBtn').click();
      await capture(page, 'wide-isotropic-release-overview');
      await checkLayout(page);

      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.55');
      await page.locator('#threeOpacityRange').dispatchEvent('input');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeMaxBtn').click();
      await page.waitForTimeout(250);
      await capture(page, 'wide-isotropic-release-3d-max');
      await page.locator('#threeMaxBtn').click();

      await page.locator('#sectionMaxBtn').click();
      await page.waitForTimeout(150);
      await capture(page, 'wide-isotropic-release-section-max');
      await page.locator('#sectionMaxBtn').click();
      await page.waitForFunction(() => {
        const canvas = document.getElementById('sectionCanvas');
        if (!canvas?.checkVisibility()) return false;
        const rect = canvas.getBoundingClientRect(),
          dpr = Math.min(devicePixelRatio || 1, 2);
        return (
          Math.abs(canvas.width - rect.width * dpr) <= 2 &&
          Math.abs(canvas.height - rect.height * dpr) <= 2
        );
      });
      await checkLayout(page);
    }

    if (runRenderer && name === 'wide') {
      const { applyOperation, createModel } = await import('../site/model.js');
      const { rectMulti } = await import('../site/vector-geometry.js');
      const roughModel = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 }),
        roughArea = rectMulti(10, 12);
      applyOperation(roughModel, {
        type: 'etch',
        thickness: 1.5,
        face: 'front',
        area: roughArea,
        surface: {
          kind: 'rough',
          featureSize: 0.45,
          meanHeight: 0.6,
          featureCv: 0.3,
          heightCv: 0.35,
          geometryMode: 'ideal',
        },
      });
      applyOperation(roughModel, {
        type: 'add',
        name: 'Rough coat',
        thickness: 0.8,
        face: 'front',
        area: roughArea,
        growth: 'direct',
      });
      const roughProject = projectForBenchmark({
        model: roughModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, roughProject, 'wide-rough-buried-interface');
      await checkSectionSeams(page, roughProject);
      const normalThickness = await sectionMaterialThickness(page, '#6C8EBF'),
        normalZMax = await page.locator('#sectionCanvas').getAttribute('data-z-max-um');
      assert.ok(
        Math.abs(normalThickness - 0.8) < 0.06,
        `rough coating physical thickness changed: ${normalThickness} µm`,
      );
      assert.ok(Number(normalZMax) >= 4.8 - 1e-9, `rough Auto Z max too small: ${normalZMax}`);
      await capture(page, 'wide-rough-buried-interface');
      await page.locator('#sectionMaxBtn').click();
      await page.waitForTimeout(120);
      const maxThickness = await sectionMaterialThickness(page, '#6C8EBF');
      assert.ok(
        Math.abs(maxThickness - 0.8) < 0.04,
        `maximized rough coating thickness changed: ${maxThickness} µm`,
      );
      assert.ok(
        Math.abs(maxThickness - normalThickness) < 0.04,
        `rough coating thickness depends on zoom: ${normalThickness} vs ${maxThickness} µm`,
      );
      await capture(page, 'wide-rough-buried-interface-max');
      await page.locator('#sectionMaxBtn').click();
      await page.waitForTimeout(120);

      // 3D integration guardrails: clean opaque rough surfaces and sorted
      // translucent layers should remain layer-colored without screen-door noise.
      await page.locator('#threeMaxBtn').click();
      const roughCanvas = page.locator('#threeHost canvas');
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#threeHost canvas');
          return canvas?.dataset.roughMeshMode === 'detailed' && canvas.dataset.roughMeshWorker === 'true';
        },
        null,
        { timeout: 10000 },
      );
      const fitLodZones = Number(await roughCanvas.getAttribute('data-rough-lod-zones')),
        fitTriangles = Number(await roughCanvas.getAttribute('data-rough-triangle-count')),
        fitSubdivisionTriangles = Number(
          await roughCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        fitSceneBudget = Number(
          await roughCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        fitPlanBuilds = Number(
          await roughCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        fitRoughRebuilds = Number(
          await roughCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        fitSpatialZoneBuilds = Number(
          await roughCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        fitBaseTriangulations = Number(
          await roughCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.ok(fitLodZones >= 1, `rough LOD diagnostics missing at Fit: ${fitLodZones}`);
      assert.ok(fitTriangles > 0, `rough triangle diagnostics missing at Fit: ${fitTriangles}`);
      assert.ok(
        fitSubdivisionTriangles <= fitSceneBudget,
        `rough subdivision budget exceeded at Fit: ${fitSubdivisionTriangles} > ${fitSceneBudget}`,
      );
      assert.ok(fitPlanBuilds >= 1, `surface plan build diagnostics missing: ${fitPlanBuilds}`);
      assert.ok(fitRoughRebuilds >= 1, `rough rebuild diagnostics missing: ${fitRoughRebuilds}`);
      assert.ok(fitSpatialZoneBuilds >= 1, `rough spatial zones were not prepared: ${fitSpatialZoneBuilds}`);
      assert.ok(
        fitBaseTriangulations >= fitSpatialZoneBuilds,
        `rough base triangulation cache is incomplete: ${fitBaseTriangulations} < ${fitSpatialZoneBuilds}`,
      );
      await capture(page, 'wide-rough-3d-opaque-max');

      // Interaction LOD: switch to a cached coarse mesh once at drag start,
      // avoid topology rebuilds during mousemove, then refine asynchronously.
      const dragBox = await roughCanvas.boundingBox();
      assert.ok(dragBox, 'rough 3D canvas has no interaction bounds');
      const dragX = dragBox.x + dragBox.width * 0.55,
        dragY = dragBox.y + dragBox.height * 0.52;
      await page.mouse.move(dragX, dragY);
      await page.mouse.down();
      await page.mouse.move(dragX + 4, dragY + 2);
      await page.waitForFunction(
        () => document.querySelector('#threeHost canvas')?.dataset.roughMeshMode === 'interactive',
        null,
        { timeout: 5000 },
      );
      const dragStartRebuilds = Number(
        await roughCanvas.getAttribute('data-rough-rebuild-count'),
      );
      for (let step = 1; step <= 12; step++) {
        await page.mouse.move(dragX + 4 + step * 5, dragY - step * 2);
      }
      const dragMoveRebuilds = Number(
        await roughCanvas.getAttribute('data-rough-rebuild-count'),
      );
      assert.equal(
        dragMoveRebuilds,
        dragStartRebuilds,
        `rough mesh rebuilt during drag: ${dragStartRebuilds} -> ${dragMoveRebuilds}`,
      );
      await page.mouse.up();
      await page.waitForFunction(
        (previous) => {
          const canvas = document.querySelector('#threeHost canvas');
          return (
            canvas?.dataset.roughMeshMode === 'detailed' &&
            Number(canvas.dataset.roughRebuildCount || 0) > previous
          );
        },
        dragMoveRebuilds,
        { timeout: 10000 },
      );

      await roughCanvas.hover();
      for (let step = 0; step < 8; step++) await page.mouse.wheel(0, -600);
      await page.waitForFunction(
        (previous) => {
          const canvas = document.querySelector('#threeHost canvas');
          return (
            canvas?.dataset.roughMeshMode === 'detailed' &&
            Number(canvas.dataset.roughRebuildCount || 0) > previous
          );
        },
        fitRoughRebuilds,
        { timeout: 10000 },
      );
      const zoomLodZones = Number(await roughCanvas.getAttribute('data-rough-lod-zones')),
        zoomStitches = Number(await roughCanvas.getAttribute('data-rough-lod-stitches')),
        zoomTriangles = Number(await roughCanvas.getAttribute('data-rough-triangle-count')),
        zoomSubdivisionTriangles = Number(
          await roughCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        zoomSceneBudget = Number(
          await roughCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        zoomPlanBuilds = Number(
          await roughCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        zoomRoughRebuilds = Number(
          await roughCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        zoomSpatialZoneBuilds = Number(
          await roughCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        zoomBaseTriangulations = Number(
          await roughCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.equal(
        zoomLodZones,
        fitLodZones,
        `camera LOD changed the cached spatial zone count: ${fitLodZones} -> ${zoomLodZones}`,
      );
      assert.ok(zoomStitches > 0, `adaptive LOD zoom has no seam stitches: ${zoomStitches}`);
      assert.ok(zoomTriangles > 0, `adaptive LOD zoom lost rough triangles: ${zoomTriangles}`);
      assert.ok(
        zoomSubdivisionTriangles <= zoomSceneBudget,
        `rough subdivision budget exceeded after zoom: ${zoomSubdivisionTriangles} > ${zoomSceneBudget}`,
      );
      assert.equal(
        zoomPlanBuilds,
        fitPlanBuilds,
        `camera LOD rebuilt the static surface plan: ${fitPlanBuilds} -> ${zoomPlanBuilds}`,
      );
      assert.ok(
        zoomRoughRebuilds > fitRoughRebuilds,
        `camera zoom did not rebuild rough geometry: ${fitRoughRebuilds} -> ${zoomRoughRebuilds}`,
      );
      assert.equal(
        zoomSpatialZoneBuilds,
        fitSpatialZoneBuilds,
        `camera zoom rebuilt rough spatial zones: ${fitSpatialZoneBuilds} -> ${zoomSpatialZoneBuilds}`,
      );
      assert.equal(
        zoomBaseTriangulations,
        fitBaseTriangulations,
        `camera zoom retriangulated rough base geometry: ${fitBaseTriangulations} -> ${zoomBaseTriangulations}`,
      );
      await capture(page, 'wide-rough-3d-adaptive-zoom-max');
      await page.locator('#fit3dBtn').click();
      await page.waitForTimeout(180);
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-3d-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      // Multi-cap stress: several independent rough patches must share one
      // scene-wide subdivision budget, and camera LOD changes must not rebuild
      // the static ownership plan.
      const roughStressModel = createModel({
        shape: 'rect',
        width: 40,
        height: 40,
        thickness: 8,
      });
      for (const [index, [cx, cy]] of [
        [-10, -10],
        [10, -10],
        [-10, 10],
        [10, 10],
      ].entries()) {
        applyOperation(roughStressModel, {
          type: 'etch',
          thickness: 1 + index * 0.15,
          face: 'front',
          area: rectMulti(8, 8, cx, cy),
          surface: {
            kind: 'rough',
            featureSize: 0.35 + index * 0.04,
            meanHeight: 0.5,
            featureCv: 0.25,
            heightCv: 0.3,
            seed: 101 + index,
            morphology: 'stochastic',
            polarity: 'inverted',
            geometryMode: 'ideal',
          },
        });
      }
      const roughStressProject = projectForBenchmark({
        model: roughStressModel,
        section: { a: [-19, 0], b: [19, 0] },
      });
      await loadProject(page, roughStressProject, 'wide-rough-stress');
      await page.locator('#threeMaxBtn').click();
      const stressCanvas = page.locator('#threeHost canvas');
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#threeHost canvas');
          return canvas?.dataset.roughMeshMode === 'detailed' && canvas.dataset.roughMeshWorker === 'true';
        },
        null,
        { timeout: 10000 },
      );
      const stressBudget = Number(
          await stressCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        stressSubdivision = Number(
          await stressCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        stressPlanBuilds = Number(
          await stressCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        stressRebuilds = Number(
          await stressCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        stressSpatialZoneBuilds = Number(
          await stressCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        stressBaseTriangulations = Number(
          await stressCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.ok(stressBudget > 0, `rough stress budget missing: ${stressBudget}`);
      assert.ok(
        stressSubdivision <= stressBudget,
        `multi-cap rough subdivision exceeded global budget: ${stressSubdivision} > ${stressBudget}`,
      );
      await stressCanvas.hover();
      for (let step = 0; step < 5; step++) await page.mouse.wheel(0, -500);
      await page.waitForFunction(
        (previous) => {
          const canvas = document.querySelector('#threeHost canvas');
          return (
            canvas?.dataset.roughMeshMode === 'detailed' &&
            Number(canvas.dataset.roughRebuildCount || 0) > previous
          );
        },
        stressRebuilds,
        { timeout: 10000 },
      );
      const stressZoomPlanBuilds = Number(
          await stressCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        stressZoomRebuilds = Number(
          await stressCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        stressZoomBudget = Number(
          await stressCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        stressZoomSubdivision = Number(
          await stressCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        stressZoomSpatialZoneBuilds = Number(
          await stressCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        stressZoomBaseTriangulations = Number(
          await stressCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.equal(
        stressZoomPlanBuilds,
        stressPlanBuilds,
        `multi-cap camera zoom rebuilt surface plan: ${stressPlanBuilds} -> ${stressZoomPlanBuilds}`,
      );
      assert.ok(
        stressZoomRebuilds > stressRebuilds,
        `multi-cap camera zoom did not rebuild rough meshes: ${stressRebuilds} -> ${stressZoomRebuilds}`,
      );
      assert.equal(
        stressZoomSpatialZoneBuilds,
        stressSpatialZoneBuilds,
        `multi-cap camera zoom rebuilt spatial zones: ${stressSpatialZoneBuilds} -> ${stressZoomSpatialZoneBuilds}`,
      );
      assert.equal(
        stressZoomBaseTriangulations,
        stressBaseTriangulations,
        `multi-cap camera zoom retriangulated base geometry: ${stressBaseTriangulations} -> ${stressZoomBaseTriangulations}`,
      );
      assert.ok(
        stressZoomSubdivision <= stressZoomBudget,
        `multi-cap zoom exceeded global budget: ${stressZoomSubdivision} > ${stressZoomBudget}`,
      );
      await capture(page, 'wide-rough-stress-global-budget');
      await page.locator('#threeMaxBtn').click();

      // Rough Etch -> Conformal regression: inherited rough interfaces are
      // buried material interfaces and must not create closure skirts inside 3D.
      const roughConformalModel = createModel({
        shape: 'rect',
        width: 20,
        height: 12,
        thickness: 8,
      });
      applyOperation(roughConformalModel, {
        type: 'etch',
        thickness: 1.5,
        face: 'front',
        area: rectMulti(10, 8),
        surface: {
          kind: 'rough',
          featureSize: 0.45,
          meanHeight: 0.6,
          featureCv: 0.3,
          heightCv: 0.35,
          morphology: 'stochastic',
          polarity: 'inverted',
          geometryMode: 'ideal',
        },
      });
      applyOperation(roughConformalModel, {
        type: 'add',
        name: 'Rough conformal coat',
        thickness: 0.8,
        face: 'front',
        area: roughConformalModel.boundary,
        growth: 'conformal',
      });
      const roughConformalProject = projectForBenchmark({
        model: roughConformalModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, roughConformalProject, 'wide-rough-conformal');
      await checkSectionSeams(page, roughConformalProject);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-conformal-3d-opaque-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-conformal-3d-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      // Opaque host material must occlude a buried Implant. Lowering global
      // 3D opacity reveals the same internal annotation volume.
      const implantModel = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 });
      applyOperation(implantModel, {
        type: 'implant',
        name: 'Buried implant',
        thickness: 1,
        face: 'front',
        area: rectMulti(10, 8),
        color: '#9B5DE5',
      });
      applyOperation(implantModel, {
        type: 'add',
        name: 'Opaque cap',
        thickness: 0.8,
        face: 'front',
        area: implantModel.boundary,
        growth: 'direct',
      });
      const implantProject = projectForBenchmark({
        model: implantModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, implantProject, 'wide-implant-buried');
      await page.locator('#threeMaxBtn').click();
      assert.equal(
        Number(await page.locator('#threeHost').getAttribute('data-implant-internal-count')),
        0,
        'Opaque 3D must not add buried implant volume meshes',
      );
      assert.equal(
        Number(await page.locator('#threeHost').getAttribute('data-implant-surface-count')),
        0,
        'Opaque 3D must not add a surface overlay for a fully buried implant',
      );
      await capture(page, 'wide-implant-buried-opaque-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      assert.ok(
        Number(await page.locator('#threeHost').getAttribute('data-implant-internal-count')) > 0,
        'Transparent 3D must add the buried implant volume for inspection',
      );
      await capture(page, 'wide-implant-buried-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      // Etching into an Implant exposes its surviving outer face. Opaque 3D
      // must render that surface overlay without rendering the buried volume.
      const exposedImplantModel = createModel({
        shape: 'rect',
        width: 20,
        height: 12,
        thickness: 8,
      });
      applyOperation(exposedImplantModel, {
        type: 'implant',
        name: 'Etch-exposed implant',
        thickness: 1,
        face: 'front',
        area: rectMulti(10, 8),
        color: '#9B5DE5',
      });
      applyOperation(exposedImplantModel, {
        type: 'etch',
        thickness: 0.4,
        face: 'front',
        area: exposedImplantModel.boundary,
      });
      await loadProject(
        page,
        projectForBenchmark({
          model: exposedImplantModel,
          section: { a: [-9, 0], b: [9, 0] },
        }),
        'wide-implant-etched-exposed',
      );
      await page.locator('#threeMaxBtn').click();
      assert.equal(
        Number(await page.locator('#threeHost').getAttribute('data-implant-internal-count')),
        0,
      );
      assert.ok(
        Number(await page.locator('#threeHost').getAttribute('data-implant-surface-count')) > 0,
        'Opaque 3D must keep an Implant overlay after Etch exposes its surviving surface',
      );
      await capture(page, 'wide-implant-etched-exposed-opaque-max');
      await page.locator('#threeMaxBtn').click();

      await checkLayout(page);
    }

    if (runLayout) {
      await ensurePrimaryViewVisible(page, 'main');
      await checkROI(page, name);
    }
    await context.close();
    console.log(`${name}: A/B, units, ROI, tabs, imports and six process views passed`);
  }
  // Breakpoint edges catch wrap/overflow changes without multiplying every dataset.
  if (runLayout) for (const width of [600, 601, 900, 901]) {
    const { page, context } = await open({ width, height: 900 });
    await checkLayout(page);
    await page.locator('#sectionControlsBtn').click();
    await capture(page, `breakpoint-${width}`);
    await checkLayout(page);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'report.json'), JSON.stringify({ cases, errors }, null, 2));
  const cards = cases
    .map(
      (name) =>
        `<figure><a href="${name}.png"><img src="${name}.png" loading="lazy"></a><figcaption>${name}</figcaption></figure>`,
    )
    .join('');
  await writeFile(
    join(output, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>WaferCAD product review</title><style>body{font:14px system-ui;margin:24px;background:#f4f6f8}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;background:white;padding:10px}img{width:100%;height:280px;object-fit:contain}figcaption{margin-top:8px}</style><h1>WaferCAD product review</h1><p>${cases.length} captures · actual Chromium/WebGL · 1440 / 1000 / 390 px plus breakpoint edges. Open each image to inspect full resolution.</p><main>${cards}</main>`,
  );
  console.log(`WaferCAD product ${productScope} regression: OK (${cases.length} captures)`);
} finally {
  await browser.close();
}
