import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const feedback = await readFile(
  new URL('../controllers/feedback-controller.js', import.meta.url),
  'utf8',
);
const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const workstationStyle = await readFile(new URL('../workstation.css', import.meta.url), 'utf8');
const projectState = await readFile(
  new URL('../controllers/project-state-controller.js', import.meta.url),
  'utf8',
);
const threeView = await readFile(new URL('../three-view.js', import.meta.url), 'utf8');
const planRenderers = await readFile(new URL('../plan-renderers.js', import.meta.url), 'utf8');
const selectionGeometry = await readFile(
  new URL('../selection-geometry.js', import.meta.url),
  'utf8',
);
const roiController = await readFile(
  new URL('../controllers/roi-controller.js', import.meta.url),
  'utf8',
);
const maskRoiController = await readFile(
  new URL('../controllers/mask-roi-controller.js', import.meta.url),
  'utf8',
);
const processTaskController = await readFile(
  new URL('../controllers/process-task-controller.js', import.meta.url),
  'utf8',
);
const processPanelController = await readFile(
  new URL('../controllers/process-panel-controller.js', import.meta.url),
  'utf8',
);
const exportController = await readFile(
  new URL('../controllers/export-controller.js', import.meta.url),
  'utf8',
);
const workspaceActions = await readFile(
  new URL('../controllers/workspace-actions-controller.js', import.meta.url),
  'utf8',
);
const viewPopoverController = await readFile(
  new URL('../controllers/view-popover-controller.js', import.meta.url),
  'utf8',
);

test('function panel uses Process and Project labels with one operation selector', () => {
  assert.match(html, /id="operationTab"[\s\S]*?>\s*Process\s*<\/button>/);
  assert.match(html, /id="settingsTab"[\s\S]*?>\s*Project\s*<\/button>/);
  for (const mode of ['add', 'grow', 'etch', 'implant', 'electrical', 'record']) {
    assert.match(html, new RegExp(`<option value="${mode}">[\\s\\S]*?<\\/option>`));
  }
  assert.match(html, /id="operationType" aria-label="Process action"/);
  assert.doesNotMatch(html, /id="processMode"/);
  assert.doesNotMatch(html, /experimental-tag|>\s*EXP\s*</);
  assert.match(html, /<span>Coverage<\/span\s*>/);
  assert.match(html, />Directional<\/option>/);
  assert.match(html, /id="processSummary"/);
  assert.match(html, /id="processVisualGuide"[\s\S]*?class="process-visual-guide"/);
  assert.match(html, /id="recipeRecordManual" type="checkbox" \/>/);
});

test('function panel groups related engineering parameters compactly', () => {
  assert.match(
    html,
    /class="process-step-toolbar"[\s\S]*?id="operationType"[\s\S]*?id="faceToggleBtn"/,
  );
  assert.match(html, /id="faceToggleBtn" aria-label="Process surface"/);
  assert.match(html, /id="processParametersHeading"/);
  assert.match(style, /#manualProcessPane \.process-step-toolbar/);
  assert.match(style, /#manualProcessPane #operationAreaRow/);
  assert.match(style, /#manualProcessPane #operationThicknessRow/);
  assert.match(html, /class="param-grid-2 process-area-grid"[\s\S]*?id="operationAreaRow"/);
  assert.match(html, /class="param-grid-2 process-main-grid"[\s\S]*?id="growthModeRow"[\s\S]*?id="operationThicknessRow"/);
  assert.match(
    html,
    /class="param-grid-2 rough-param-grid"[\s\S]*?id="roughFeatureRow"[\s\S]*?id="roughFeatureCvRow"/,
  );
  assert.match(
    html,
    /class="param-grid-2 rough-param-grid"[\s\S]*?id="roughHeightRow"[\s\S]*?id="roughHeightCvRow"/,
  );
  assert.match(html, /id="operationThicknessRow" class="param-field"/);
  assert.match(html, /workspace-recovery-controls compact-action-row/);
  assert.match(style, /\.param-grid-2 \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(
    style,
    /\.param-field \{[\s\S]*?grid-template-columns: max-content minmax\(0, 1fr\) auto/,
  );
  assert.match(
    style,
    /@media \(max-width: 600px\)[\s\S]*?\.param-grid-2 \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  );
});

test('typed feedback is centralized in the status bar', () => {
  assert.match(html, /id="statusBar"[^>]*data-level="passive"/);
  assert.doesNotMatch(html, /id="feedbackToasts"/);
  assert.doesNotMatch(html, /id="operationValidation"/);
  assert.match(feedback, /return 'progress'/);
  assert.match(feedback, /return 'warning'/);
  assert.match(feedback, /return 'success'/);
  assert.match(feedback, /return 'error'/);
  assert.match(feedback, /return 'passive'/);
  assert.doesNotMatch(feedback, /createElement\('div'\)/);
});

test('Process UI is driven by material presence and exposed Extend targets', () => {
  assert.match(processPanelController, /baseCoverageState\(model\)/);
  assert.match(processPanelController, /exposedLayerIds\(model, area, activeFace\)/);
  assert.match(processPanelController, /All material has been removed/);
  assert.match(processPanelController, /Base fully removed/);
  assert.match(html, /id="etchTargetLayer"/);
  assert.match(processPanelController, /params\.etchTargetLayerIds/);
  assert.match(processPanelController, /Material-selective Etch/);
});

test('Process panel exposes first-class electrical region semantics', () => {
  assert.match(html, /id="electricalName"/);
  assert.match(html, /id="electricalRegionType"/);
  assert.match(html, /value="p-inversion"/);
  assert.match(html, /value="n-accumulation"/);
  assert.match(html, /id="electricalRegionSource"/);
  assert.match(processPanelController, /params\.electricalRegionType/);
  assert.match(processPanelController, /params\.electricalRegionSource/);
  assert.match(processPanelController, /colorNewElectricalRegion\(result\.electricalRegionId\)/);
  assert.match(planRenderers, /electricalRegionSurfaceGroups/);
  assert.match(planRenderers, /electricalRegionSectionBands/);
  assert.match(threeView, /electricalRegionSolids/);
});

test('Process panel can record non-geometric fabrication steps', () => {
  assert.match(html, /id="recordProcessParams"/);
  assert.match(html, /id="recordProcessType"/);
  assert.match(html, /id="recordTemperature"/);
  assert.match(html, /id="recordDuration"/);
  assert.match(processPanelController, /async function recordProcessStep\(\)/);
  assert.match(processPanelController, /geometryChanged: false/);
  assert.match(processPanelController, /nextModel\.processRevision/);
  assert.match(processPanelController, /without changing material geometry/);
});

test('Mask alignment view overlays neutral structure outlines beneath adjustable mask opacity', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(html, /id="maskOpacityValue"/);
  assert.match(planRenderers, /function drawMaskStructureReference\(/);
  assert.match(planRenderers, /maskStructurePatches\(\)/);
  assert.match(planRenderers, /ctx\.globalAlpha = maskOpacity/);
  assert.match(planRenderers, /drawMaskStructureReference\(ctx, v\)/);
});

test('Mask alignment opacity is persisted and applies only to the mask overlay', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(planRenderers, /ctx\.globalAlpha = maskOpacity/);
  assert.match(planRenderers, /drawMaskStructureReference\(ctx, v\)/);
  assert.match(planRenderers, /same-height surface groups across materials/);
  assert.match(projectState, /maskOpacity: state\.maskOpacity/);
  assert.match(projectState, /project\.display\?\.maskOpacity == null \? 0\.65/);
});

test('landscape workspace keeps panel sizes while reordering the five windows', () => {
  assert.match(
    style,
    /grid-template-areas:\s*'main main mask mask tools tools'\s*'three three section section section section'/,
  );
  assert.match(
    style,
    /@media \(max-width: 900px\)[\s\S]*?'tools three'[\s\S]*?'main mask'[\s\S]*?'section section'/,
  );
});

test('workstation visual system keeps scientific controls visually unified', () => {
  assert.match(style, /\/\* Workstation visual system/);
  assert.match(style, /\.view-head \.mini-btn,[\s\S]*?\.view-head \.three-control/);
  assert.match(style, /\.view-panel,[\s\S]*?\.tool-panel \{/);
  assert.match(style, /\.tool-tab\.active[\s\S]*?inset 0 -2px 0 var\(--accent\)/);
  assert.match(style, /\.control-section input,[\s\S]*?\.control-section select/);
  assert.match(style, /\.statusbar\[data-level='warning'\]/);
});

test('view headers use shared explicit modes, Display and More controls', () => {
  assert.match(planRenderers, /ctx\.setLineDash\(\[4, 3\]\)/);
  assert.match(planRenderers, /ctx\.setLineDash\(\[7, 4\]\)/);
  assert.match(style, /View UX v3: shared mode, popover and responsive header language/);
  assert.match(style, /\.view-mode-select/);
  assert.match(workstationStyle, /View UX v3/);
  for (const id of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
    const from = html.indexOf(`id="${id}"`);
    const next = html.indexOf('<section class="view-panel"', from + id.length);
    const markup = html.slice(from, next === -1 ? undefined : next);
    assert.match(markup, /view-more-control/, `${id}: missing More`);
  }
  assert.match(html, /<select\b[^>]*id="maskSourceToggleBtn"/);
  assert.match(html, /<select\b[^>]*id="threeFastBtn"/);
  assert.match(html, /<select\b[^>]*id="sectionScaleModeBtn"/);
  assert.match(html, /id="threeBorders"[^>]*aria-label="Show 3D borders"/);
  assert.match(html, /id="sectionCollapseAxisBtn"[^>]*>\s*Z Break\s*<\/button>/);
  assert.match(html, /id="sectionCollapseEnabled"/);
  assert.match(html, /id="sectionCollapseTopInput"/);
  assert.match(html, /id="sectionCollapseBottomInput"/);
  assert.doesNotMatch(html, /sectionCollapseMinus|sectionCollapsePlus|sectionCollapseStep/);
  assert.doesNotMatch(html, /three-border-status/);
  assert.match(workspaceActions, /select\.value = fast \? 'fast' : 'quality'/);
  assert.match(planRenderers, /scaleButton\.value = sectionScaleMode/);
});

test('ROI belongs to Main and Mask double-click fits the Mask view', () => {
  const mainStart = html.indexOf('id="mainPanel"');
  const maskStart = html.indexOf('id="maskPanel"');
  const threeStart = html.indexOf('id="threePanel"');
  assert.ok(mainStart >= 0 && maskStart > mainStart && threeStart > maskStart);
  assert.ok(html.indexOf('id="focusEditor"') > mainStart);
  assert.ok(html.indexOf('id="focusEditor"') < maskStart);
  assert.doesNotMatch(
    planRenderers.slice(
      planRenderers.indexOf('function renderMask()'),
      planRenderers.indexOf('function shadeColor'),
    ),
    /drawRoi/,
  );
  assert.match(
    planRenderers.slice(
      planRenderers.indexOf('function renderMain()'),
      planRenderers.indexOf('function renderSection()'),
    ),
    /drawRoi\(ctx, v, back\)/,
  );
  assert.match(
    roiController,
    /canvas\.addEventListener\('dblclick'[\s\S]*?resetPlanView\('mask'\)/,
  );
});

test('3D borders are derived from owned surfaces and stay depth-tested', () => {
  assert.match(threeView, /buildRenderSurfacePlan\(model, clip\)/);
  assert.match(threeView, /variantBuild && physicalSurfacePlan/);
  assert.match(threeView, /physicalSurfacePlan = plan/);
  assert.match(threeView, /function addBorderPositions\([\s\S]*?order = 100000/);
  assert.match(threeView, /edges\.renderOrder = order/);
  assert.match(
    threeView,
    /opacity: opacity < 0\.999 \? 0\.46 : 1,[\s\S]*?depthFunc: THREE\.LessEqualDepth/,
  );
  assert.match(threeView, /presentation: \{ kind: 'border' \}/);
  assert.match(threeView, /visible: Boolean\(inspection\.borders\)/);
  assert.match(
    threeView,
    /addBorderPositions\(displayBorderPositions\(plan\.borderLines\.flat\(2\)\), \{/,
  );
  assert.match(threeView, /order: 100000/);
});

test('Mask File Draw source is explicit and Draw feeds Process geometry', () => {
  assert.match(html, /id="maskSourceToggleBtn"/);
  assert.match(html, /<option value="file">File<\/option>/);
  assert.match(html, /id="drawMaskToolbar"[^>]*hidden/);
  assert.match(html, /data-draw-tool="rect"/);
  assert.match(html, /data-draw-tool="circle"/);
  assert.match(html, /data-draw-tool="polygon"/);
  assert.match(html, /data-draw-tool="ring"/);
  assert.match(html, /data-draw-tool="ring-sector"/);
  assert.match(html, /id="drawShapeEditor"[^>]*hidden/);
  assert.match(app, /maskSourceMode = 'file'/);
  assert.match(selectionGeometry, /function selectedFileMaskGeometry\(\)/);
  assert.match(selectionGeometry, /function activeMaskGeometry\(\)/);
  assert.match(selectionGeometry, /maskSourceMode === 'draw' \? drawMaskGeometry\(drawMask\)/);
  assert.match(selectionGeometry, /const selected = activeMaskGeometry\(\)/);
  assert.match(planRenderers, /getDrawMaskController\(\)\?\.render\(ctx, v, maskOpacity\)/);
});

test('Draw mode and File mode keep separate UI contexts', () => {
  assert.match(html, /id="maskFileControls"/);
  assert.match(html, /id="maskDrawInfo"[^>]*hidden/);
  assert.match(style, /\/\* Mask File \/ Draw source \*\//);
  assert.match(style, /\.draw-mask-toolbar/);
  assert.match(style, /\.draw-shape-editor/);
});

test('Mask owns an independent Square/Circle ROI for Process and export', () => {
  assert.match(html, /id="maskRoiEditor"/);
  assert.match(html, /data-tool="rect"[^>]*>\s*Square\s*</);
  assert.match(html, /data-tool="circle"[^>]*>\s*Circle\s*</);
  assert.match(html, /id="maskRoiSize"/);
  assert.match(selectionGeometry, /function maskRoiGeometry\(\)/);
  assert.match(
    selectionGeometry,
    /const result = limiter \? intersection\(area, limiter\) : area;[\s\S]*return result;/,
  );
  assert.match(planRenderers, /getMaskRoiController\(\)\?\.render\(ctx, v\)/);
  assert.match(maskRoiController, /Math\.max\(Math\.abs\(dx\), Math\.abs\(dy\)\)/);
  assert.match(maskRoiController, /canMoveBody\(world\)/);
});

test('each view uses one shared exclusive popover surface', () => {
  assert.match(html, /class="section-coords-panel view-popover-surface"\s+data-view-popover-panel/);
  assert.match(html, /class="draw-shape-editor view-popover-surface"\s+data-view-popover-panel/);
  assert.match(html, /class="focus-popover[^"]*view-popover-surface"/);
  assert.match(html, /class="three-opacity-popover[^"]*view-popover-surface"/);
  assert.match(html, /class="export-popover[^"]*view-popover-surface"/);
  assert.match(style, /\.view-popover-surface \{/);
  assert.match(style, /\.view-head details\[open\] > summary/);
  assert.match(viewPopoverController, /\.view-panel details/);
  assert.match(viewPopoverController, /details\[open\]/);
  assert.match(viewPopoverController, /data-view-popover-panel/);
  assert.match(viewPopoverController, /wafercad:popover-close/);
});

test('Apply runs as a single cancelable task with elapsed time and Abort', () => {
  assert.match(html, /id="processTaskDialog"[^>]*hidden/);
  assert.match(html, /id="processTaskElapsed"/);
  assert.match(html, /id="processTaskAbortBtn"[^>]*>Abort</);
  assert.match(
    processPanelController,
    /processTaskController\.run\(model, params, taskLabel, areaRequest\)/,
  );
  assert.match(processPanelController, /processTaskController\?\.isBusy\(\)/);
  assert.match(processTaskController, /new Worker\(/);
  assert.match(processTaskController, /setInterval\(syncDialog, 100\)/);
  assert.match(processTaskController, /worker\?\.terminate\(\)/);
  assert.match(processTaskController, /Operation aborted/);
});

test('all four view headers expose one More with reachable export actions and Mask filters', () => {
  for (const [panel, exportId] of [
    ['mainPanel', 'mainExportSvgBtn'],
    ['maskPanel', 'maskExportSvgBtn'],
    ['threePanel', 'threeExportModelBtn'],
    ['sectionPanel', 'sectionExportSvgBtn'],
  ]) {
    const start = html.indexOf(`id="${panel}"`);
    assert.ok(start >= 0);
    const nextPanel = html.indexOf('<section class="view-panel"', start + 20);
    const slice = html.slice(start, nextPanel > start ? nextPanel : undefined);
    assert.match(slice, /view-more-control/);
    assert.match(slice, new RegExp(`id="${exportId}"`));
  }
  assert.match(html, /id="maskExportCells"[^>]*multiple/);
  assert.match(html, /id="maskExportLayers"[^>]*multiple/);
  assert.match(app, /syncMaskExportOptions/);
  assert.match(exportController, /element\.sourceCell \|\| layout\.root \|\| 'ROOT'/);
  assert.match(workspaceActions, /\.export-control/);
  assert.match(workspaceActions, /syncMaskExportOptions\(\)/);
});

test('experimental Implant keeps process inputs structural and display styling in views', () => {
  assert.match(html, /id="implantName"/);
  assert.match(html, /id="implantTilt"/);
  assert.doesNotMatch(html, /id="implantColor"/);
  assert.doesNotMatch(html, /id="implantBorder"/);
  assert.match(html, /id="sectionBordersBtn"/);
  assert.match(processPanelController, /starts at the outermost selected surface/);
  assert.match(processPanelController, /params\.tilt = tilt/);
  assert.match(processPanelController, /colorNewImplant\(result\.implantId\)/);
  assert.doesNotMatch(html, /implantDose|implantEnergy|dopantSpecies/i);
});

test('buried rough interfaces do not create ideal-plane skirts in 3D', () => {
  assert.match(threeView, /closeToIdeal: !cap\.buried/);
  assert.match(threeView, /buildRenderSurfacePlan\(model, clip\)/);
});
