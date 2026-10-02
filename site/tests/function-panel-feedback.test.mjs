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
const projectState = await readFile(
  new URL('../controllers/project-state-controller.js', import.meta.url),
  'utf8',
);
const threeView = await readFile(new URL('../three-view.js', import.meta.url), 'utf8');
const planRenderers = await readFile(new URL('../plan-renderers.js', import.meta.url), 'utf8');
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

test('function panel uses Process and Project labels with segmented process modes', () => {
  assert.match(html, /id="operationTab"[\s\S]*?>\s*Process\s*<\/button>/);
  assert.match(html, /id="settingsTab"[\s\S]*?>\s*Project\s*<\/button>/);
  for (const mode of ['add', 'grow', 'etch', 'implant']) {
    assert.match(html, new RegExp(`data-process-mode="${mode}"`));
  }
  assert.match(html, />\s*Deposit\s*<\/button>/);
  assert.match(html, />\s*Extend\s*<\/button>/);
  assert.match(html, /Implant[\s\S]*experimental-tag[\s\S]*EXP/);
  assert.match(html, /<span>Coverage<\/span\s*>/);
  assert.match(html, />Directional<\/option>/);
  assert.match(html, /id="processSummary"/);
});

test('function panel groups related engineering parameters compactly', () => {
  assert.match(html, /class="tool-context process-context"[\s\S]*?id="processSummary"[\s\S]*?id="faceToggleBtn"/);
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
  assert.match(style, /\.param-field \{[\s\S]*?grid-template-columns: max-content minmax\(0, 1fr\) auto/);
  assert.match(style, /@media \(max-width: 600px\)[\s\S]*?\.param-grid-2 \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
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
  assert.match(app, /baseCoverageState\(model\)/);
  assert.match(app, /exposedLayerIds\(model, area, activeFace\)/);
  assert.match(app, /All material has been removed/);
  assert.match(app, /Base fully removed/);
});


test('Mask alignment view overlays neutral structure outlines beneath adjustable mask opacity', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(html, /id="maskOpacityValue"/);
  assert.match(app, /function drawMaskStructureReference\(/);
  assert.match(app, /maskStructurePatches\(\)/);
  assert.match(app, /ctx\.globalAlpha = maskOpacity/);
  assert.match(app, /drawMaskStructureReference\(ctx, v\)/);
});


test('Mask alignment opacity is persisted and applies only to the mask overlay', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(app, /ctx\.globalAlpha = maskOpacity/);
  assert.match(app, /drawMaskStructureReference\(ctx, v\)/);
  assert.match(app, /same-height surface groups across materials/);
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

test('Mask topography reference is dashed and all scientific header controls share one style', () => {
  assert.match(app, /ctx\.setLineDash\(\[4, 3\]\)/);
  assert.match(app, /ctx\.setLineDash\(\[7, 4\]\)/);
  assert.match(style, /\/\* Unified scientific header controls \*\//);
  assert.match(style, /\.view-head \.mini-btn,[\s\S]*?\.view-head \.three-control/);
  assert.match(style, /\.view-head \.section-view-tools[\s\S]*?gap: 2px/);
  assert.match(style, /\.view-head \.three-border-toggle > span[\s\S]*?color: inherit/);
  assert.match(html, /id="threePanel"[\s\S]*?class="mini-btn three-control"/);
});



test('ROI belongs to Main and Mask double-click fits the Mask view', () => {
  const mainStart = html.indexOf('id="mainPanel"');
  const maskStart = html.indexOf('id="maskPanel"');
  const threeStart = html.indexOf('id="threePanel"');
  assert.ok(mainStart >= 0 && maskStart > mainStart && threeStart > maskStart);
  assert.ok(html.indexOf('id="focusEditor"') > mainStart);
  assert.ok(html.indexOf('id="focusEditor"') < maskStart);
  assert.doesNotMatch(app.slice(app.indexOf('function renderMask()'), app.indexOf('function shadeColor')), /drawRoi/);
  assert.match(app.slice(app.indexOf('function renderMain()'), app.indexOf('function renderSection()')), /drawRoi\(ctx, v, back\)/);
  assert.match(roiController, /canvas\.addEventListener\('dblclick'[\s\S]*?resetPlanView\('mask'\)/);
});

test('3D border stays above opaque surfaces at 100% opacity', () => {
  assert.match(
    threeView,
    /polygonOffsetFactor: Math\.min\(8, Math\.max\(1, bias\) \* 0\.35\)/,
  );
  assert.match(
    threeView,
    /polygonOffsetUnits: Math\.min\(12, Math\.max\(1, bias\)\)/,
  );
  assert.match(threeView, /edges\.renderOrder = 100000 \+ solidIndex/);
  assert.match(threeView, /opacity: opacity < 0\.999 \? 0\.66 : 1,[\s\S]*?depthFunc: THREE\.LessEqualDepth/);
});


test('Mask File Draw source is explicit and Draw feeds Process geometry', () => {
  assert.match(html, /id="maskSourceToggleBtn"/);
  assert.match(html, />\s*File\s*<\/button>/);
  assert.match(html, /id="drawMaskToolbar"[^>]*hidden/);
  assert.match(html, /data-draw-tool="rect"/);
  assert.match(html, /data-draw-tool="circle"/);
  assert.match(html, /data-draw-tool="polygon"/);
  assert.match(html, /data-draw-tool="ring"/);
  assert.match(html, /data-draw-tool="ring-sector"/);
  assert.match(html, /id="drawShapeEditor"[^>]*hidden/);
  assert.match(app, /maskSourceMode = 'file'/);
  assert.match(app, /function selectedFileMaskGeometry\(\)/);
  assert.match(app, /function activeMaskGeometry\(\)/);
  assert.match(app, /maskSourceMode === 'draw' \? drawMaskGeometry\(drawMask\)/);
  assert.match(app, /const selected = activeMaskGeometry\(\)/);
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
  assert.match(html, /data-tool="rect"[^>]*>Square</);
  assert.match(html, /data-tool="circle"[^>]*>Circle</);
  assert.match(html, /id="maskRoiSize"/);
  assert.match(app, /function maskRoiGeometry\(\)/);
  assert.match(app, /return limiter \? intersection\(area, limiter\) : area/);
  assert.match(planRenderers, /getMaskRoiController\(\)\?\.render\(ctx, v\)/);
  assert.match(maskRoiController, /Math\.max\(Math\.abs\(dx\), Math\.abs\(dy\)\)/);
  assert.match(maskRoiController, /canMoveBody\(world\)/);
});

test('each view uses one shared exclusive popover surface', () => {
  assert.match(html, /class="section-coords-panel view-popover-surface" data-view-popover-panel/);
  assert.match(html, /class="draw-shape-editor view-popover-surface" data-view-popover-panel/);
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
  assert.match(app, /processTaskController\.run\(model, params, taskLabel, areaRequest\)/);
  assert.match(app, /processTaskController\?\.isBusy\(\)/);
  assert.match(processTaskController, /new Worker\(/);
  assert.match(processTaskController, /setInterval\(syncDialog, 100\)/);
  assert.match(processTaskController, /worker\.terminate\(\)/);
  assert.match(processTaskController, /Operation aborted/);
});

test('all view headers expose one Export menu and Mask export filters Cells Layers and ROI', () => {
  for (const panel of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
    const start = html.indexOf(`id="${panel}"`);
    assert.ok(start >= 0);
    const next = html.indexOf('<section', start + 20);
    const slice = html.slice(start, next > start ? next : undefined);
    assert.match(slice, />Export<\/summary>/);
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
  assert.match(app, /starts at the outermost selected surface/);
  assert.match(app, /params\.tilt = tilt/);
  assert.match(app, /colorNewImplant\(result\.implantId\)/);
  assert.doesNotMatch(html, /implantDose|implantEnergy|dopantSpecies/i);
});
