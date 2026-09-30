import { parseLayoutFile } from './layout-io.js';
import {
  applyOperation,
  cloneModel,
  createModel,
  fullFaceGeometry,
  layerById,
  modelBoundsZ,
  surfaceSegment,
  surfaceZ,
} from './model.js';
import {
  bufferPolyline,
  circleMulti,
  difference,
  intersection,
  isEmpty,
  rectMulti,
  transformMulti,
  unionGeometries,
} from './vector-geometry.js';
import { downloadProject } from './project-io.js';
import { createThreeView } from './three-view.js';
import { sectionContours, sectionSlices, surfaceGroups } from './model-view-geometry.js';
import { sectorAngleHandlePoints, sectorBoundaryPoints, roiHandlePoints } from './roi-editor.js';
import {
  formatLengthInput,
  formatXY as formatXYValue,
  fromMicron,
  roundMicronToNanometre,
  toMicron,
  unitMeta,
} from './units.js';
import { minimumSegmentLength, zoomLimitForFeature } from './view-interactions.js';
import { createSnapshotManager } from './workspace-snapshots.js';
import { takeStartupFile } from './startup-file.js';
import { createBuildController } from './controllers/build-controller.js';
import { createStartupController } from './controllers/startup-controller.js';
import { bindToolTabs } from './controllers/tool-tabs-controller.js';
import { createViewMaximizeController } from './controllers/view-maximize-controller.js';
import { createMaskBrowserController } from './controllers/mask-browser-controller.js';
import { createExportController } from './controllers/export-controller.js';
import { createRoiController } from './controllers/roi-controller.js';
import { createLayerLegendController } from './controllers/layer-legend-controller.js';
import { createProjectController } from './controllers/project-controller.js';
import { createSectionControlsController } from './controllers/section-controls-controller.js';
import { createBaseControlsController } from './controllers/base-controls-controller.js';
import { createMaskImportController } from './controllers/mask-import-controller.js';
import { createMainCanvasController } from './controllers/main-canvas-controller.js';
import { createWorkspaceActionsController } from './controllers/workspace-actions-controller.js';
import { createProjectStateController } from './controllers/project-state-controller.js';

const $ = (id) => document.getElementById(id);
const MASK_PALETTE = [
  '#4F86C6',
  '#4FAF9F',
  '#E6A23C',
  '#D96C5F',
  '#8A72BE',
  '#57A6C7',
  '#6C8E5E',
  '#C5678B',
];
function emptyLayout() {
  return {
    name: 'No mask',
    root: '',
    elements: [],
    linework: [],
    bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 },
    combos: [],
    hierarchy: {},
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}

let model = createModel(),
  layout = emptyLayout(),
  parsedLayout = null,
  selectedLayerKeys = new Set();
let xyDisplayUnit = 'um',
  activeStructurePalette = 'balanced',
  customStructurePalette = null,
  openLayerPaletteId = null;
let activeCell = null,
  expandedCells = new Set(),
  hoveredLayerKey = null;
let maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 },
  activeFace = 'front',
  roi = null,
  roiTool = null,
  roiDraft = null,
  roiAnchor = 'center';
let section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
  sectionScaleMode = 'auto',
  sectionEditEnabled = false,
  sectionEditor = null,
  history = [],
  future = [],
  baseRevertSnapshot = null;
const planViews = { mask: { zoom: 1, panX: 0, panY: 0 }, main: { zoom: 1, panX: 0, panY: 0 } };
const featureSizeCache = {
  mask: { layout: null, scale: null, value: null },
  main: { model: null, revision: null, value: null },
};

function status(msg) {
  $('statusText').textContent = msg;
}

const loadedBuildVersion = new URL(import.meta.url).searchParams.get('v') || '';
const { checkForBuildUpdate, loadBuildCommit } = createBuildController({
  buildVersion: loadedBuildVersion,
  status,
});

const sectionControls = createSectionControlsController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
  },
  getSectionEditor: () => sectionEditor,
  getSectionEditEnabled: () => sectionEditEnabled,
  setSectionEditEnabledValue: (value) => {
    sectionEditEnabled = value;
  },
  getModel: () => model,
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  manualMicron,
  renderMain,
  renderSection,
  status,
});
const {
  syncInputs: syncSectionInputs,
  setEditEnabled: setSectionEditEnabled,
  setPanelVisible: setSectionPanelVisible,
} = sectionControls;

function xyUnit() {
  return unitMeta(xyDisplayUnit);
}
function xyToDisplay(value) {
  return fromMicron(value, xyDisplayUnit);
}
function xyFromDisplay(value) {
  return toMicron(value, xyDisplayUnit);
}
function formatXY(value, digits = 3) {
  return formatXYValue(value, xyDisplayUnit, digits);
}
function xyText(value) {
  return `${formatXY(value)} ${xyUnit().label}`;
}
function manualMicron(value) {
  return roundMicronToNanometre(xyFromDisplay(Number(value)));
}
function formatLengthField(valueMicron) {
  return formatLengthInput(valueMicron, xyDisplayUnit);
}
function formatNumericField(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Number(number.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
function invMaskPoint([x, y]) {
  const a = (-maskTransform.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    dx = x - maskTransform.x,
    dy = y - maskTransform.y;
  return [(dx * c - dy * s) / maskTransform.scale, (dx * s + dy * c) / maskTransform.scale];
}
function maskPoint([x, y]) {
  const a = (maskTransform.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    sx = x * maskTransform.scale,
    sy = y * maskTransform.scale;
  return [sx * c - sy * s + maskTransform.x, sx * s + sy * c + maskTransform.y];
}
function layerKey(layer, datatype) {
  return `${layer}|${datatype}`;
}
function layerColor(key, alpha = 1) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hex = MASK_PALETTE[h % MASK_PALETTE.length];
  if (alpha >= 0.999) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const maskBrowser = createMaskBrowserController({
  getLayout: () => layout,
  getActiveCell: () => activeCell,
  setActiveCellValue: (value) => {
    activeCell = value;
  },
  getExpandedCells: () => expandedCells,
  getSelectedLayerKeys: () => selectedLayerKeys,
  getHoveredLayerKey: () => hoveredLayerKey,
  setHoveredLayerKey: (value) => {
    hoveredLayerKey = value;
  },
  layerKey,
  layerColor,
  renderMask,
  renderAll,
});
const {
  hierarchyFromParsed,
  ensureHierarchy,
  activeScopeCells,
  selectedElement,
  globalLayers,
  syncMaskCellLabel,
  setActiveCell,
  renderCellTree,
  renderMaskList,
} = maskBrowser;

const exportController = createExportController({
  getState: () => ({
    model,
    layout,
    activeFace,
    section,
    maskTransform,
    roi,
    sectionScaleMode,
  }),
  viewport,
  worldToCanvas,
  maskPoint,
  selectedElement,
  layerKey,
  layerColor,
  formatXY,
  status,
});
const { downloadBlob, exportMainSvg, exportMaskSvg, exportSectionSvg } = exportController;

const roiController = createRoiController({
  getRoi: () => roi,
  setRoi: (value) => {
    roi = value;
  },
  getRoiTool: () => roiTool,
  setRoiTool: (value) => {
    roiTool = value;
  },
  getRoiDraft: () => roiDraft,
  setRoiDraft: (value) => {
    roiDraft = value;
  },
  getRoiAnchor: () => roiAnchor,
  setRoiAnchor: (value) => {
    roiAnchor = value;
  },
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  formatNumericField,
  manualMicron,
  xyText,
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  zoomPlanView,
  renderMask,
  renderAll,
  status,
});
const { clearDrawingMode: clearRoiDrawingMode, syncEditor: syncRoiEditor } = roiController;

const layerLegendController = createLayerLegendController({
  getModel: () => model,
  getActiveStructurePalette: () => activeStructurePalette,
  setActiveStructurePalette: (value) => {
    activeStructurePalette = value;
  },
  getCustomStructurePalette: () => customStructurePalette,
  setCustomStructurePalette: (value) => {
    customStructurePalette = value;
  },
  getOpenLayerPaletteId: () => openLayerPaletteId,
  setOpenLayerPaletteId: (value) => {
    openLayerPaletteId = value;
  },
  saveHistory,
  discardLastHistory: () => {
    history.pop();
  },
  syncUndo,
  renderMain,
  renderSection,
  renderThree,
  renderAll,
  updateOperationUI,
  status,
});
const { renderLayerLegend, colorNewLayer } = layerLegendController;

function selectedMaskGeometry() {
  const geoms = [];
  for (const e of layout.elements || []) {
    if (!selectedElement(e)) continue;
    if (e.kind === 'polygon') {
      geoms.push([[e.points.map(maskPoint)]]);
    } else if (e.kind === 'path' && e.width > 0) {
      geoms.push(
        bufferPolyline(e.points.map(maskPoint), (e.width * maskTransform.scale) / 2, 28, false),
      );
    }
  }
  const merged = unionGeometries(geoms);
  return isEmpty(merged) ? [] : intersection(merged, model.boundary);
}
function operationAreaGeometry(mode) {
  if (mode === 'full') return fullFaceGeometry(model);
  const selected = selectedMaskGeometry();
  if (isEmpty(selected)) return [];
  return mode === 'invert' ? difference(model.boundary, selected) : selected;
}
function roiGeometry() {
  if (!roi) return null;
  if (roi.type === 'rect') {
    const x0 = Math.min(roi.a[0], roi.b[0]),
      x1 = Math.max(roi.a[0], roi.b[0]),
      y0 = Math.min(roi.a[1], roi.b[1]),
      y1 = Math.max(roi.a[1], roi.b[1]);
    return rectMulti(x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  if (roi.type === 'circle') return circleMulti(roi.r * 2, roi.r * 2, 96, roi.c[0], roi.c[1]);
  if (roi.type === 'sector') {
    const ring = sectorBoundaryPoints(roi, 96);
    return ring.length ? [[ring]] : null;
  }
  return null;
}
function stateSnapshot() {
  return { model: cloneModel(model), section: structuredClone(section) };
}
function restoreSnapshot(snapshot) {
  model = cloneModel(snapshot.model);
  section = structuredClone(snapshot.section || section);
}
function saveHistory() {
  history.push(stateSnapshot());
  if (history.length > 40) history.shift();
  future = [];
  syncUndo();
}
function syncUndo() {
  $('undoBtn').disabled = !history.length;
  $('redoBtn').disabled = !future.length;
  $('revertBaseBtn').disabled = !baseRevertSnapshot;
}
function hasProcessEdits() {
  return (model.processRevision || 0) > 0;
}

function fitImportedLayout() {
  maskTransform = { scale: 1, rotation: 0, x: 0, y: 0 };
  planViews.mask = { zoom: 1, panX: 0, panY: 0 };
  maskImportController.maskImportController.syncTransformInputs();
}

function applyImportedLayout(imported, displayName) {
  parsedLayout = imported.parsed;
  layout = imported.layout;
  layout.name = displayName || layout.name;
  layout.hierarchy = hierarchyFromParsed(parsedLayout);
  activeCell = parsedLayout.root || null;
  expandedCells = new Set(activeCell ? [activeCell] : []);
  hoveredLayerKey = null;
  selectedLayerKeys = new Set(globalLayers().map((item) => item.key));
  fitImportedLayout();
  planViews.mask = { zoom: 1, panX: 0, panY: 0 };
  renderAll();

  const units = layout.units?.xy || 'µm';
  const emptyNote =
      layout.elements.length || layout.linework.length
        ? ''
        : ' This is a valid layout with no renderable mask geometry.',
    warningNote = layout.warnings?.length
      ? ` ${layout.warnings.length} unresolved cell reference${layout.warnings.length === 1 ? '' : 's'} skipped.`
      : '';
  status(
    `${displayName} (${imported.format}): XY imported in ${units} at native scale; ${layout.elements.length} area objects; ${layout.linework.length} zero-width line objects ignored for operations.${emptyNote}${warningNote}`,
  );
}

async function importLayoutBuffer(arrayBuffer, filename, displayName = filename) {
  const imported = await parseLayoutFile(arrayBuffer, filename);
  applyImportedLayout(imported, displayName);
  return imported;
}

function setupCanvas(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    r = canvas.getBoundingClientRect(),
    w = Math.max(2, Math.round(r.width * dpr)),
    h = Math.max(2, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function maskWorldBounds() {
  const base = {
    minX: -model.width / 2,
    maxX: model.width / 2,
    minY: -model.height / 2,
    maxY: model.height / 2,
  };
  if (!(layout.elements?.length || layout.linework?.length))
    return { ...base, width: model.width, height: model.height };
  const b = layout.bounds,
    corners = [
      [b.minX, b.minY],
      [b.minX, b.maxY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
    ].map(maskPoint);
  let minX = base.minX,
    maxX = base.maxX,
    minY = base.minY,
    maxY = base.maxY;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1e-9, maxX - minX),
    height: Math.max(1e-9, maxY - minY),
  };
}
function viewport(w, h, kind = 'mask') {
  const margin = 34,
    view = planViews[kind],
    b =
      kind === 'mask'
        ? maskWorldBounds()
        : {
            minX: -model.width / 2,
            maxX: model.width / 2,
            minY: -model.height / 2,
            maxY: model.height / 2,
            width: model.width,
            height: model.height,
          };
  const base = Math.min(
      (w - margin * 2) / Math.max(b.width, 1e-9),
      (h - margin * 2) / Math.max(b.height, 1e-9),
    ),
    scale = base * view.zoom;
  const centerX = (b.minX + b.maxX) / 2,
    centerY = (b.minY + b.maxY) / 2;
  return {
    s: scale,
    cx: w / 2 - centerX * scale + view.panX,
    cy: h / 2 + centerY * scale + view.panY,
  };
}

function maskMinimumFeatureSize() {
  const scale = Math.abs(maskTransform.scale) || 1;
  if (featureSizeCache.mask.layout === layout && featureSizeCache.mask.scale === scale)
    return featureSizeCache.mask.value;

  const pointGroups = [];
  const widths = [];
  for (const element of [...(layout.elements || []), ...(layout.linework || [])]) {
    if (Array.isArray(element.points)) pointGroups.push(element.points);
    if (element.width > 0) widths.push(element.width);
  }
  const raw = minimumSegmentLength(pointGroups, widths);
  const value = raw == null ? null : raw * scale;
  featureSizeCache.mask = { layout, scale, value };
  return value;
}

function mainMinimumFeatureSize() {
  if (featureSizeCache.main.model === model && featureSizeCache.main.revision === model.revision)
    return featureSizeCache.main.value;

  const pointGroups = [];
  for (const region of model.regions || [])
    for (const polygon of region.geom || [])
      for (const ring of polygon || []) pointGroups.push(ring);
  const value = minimumSegmentLength(pointGroups, [model.width, model.height]);
  featureSizeCache.main = { model, revision: model.revision, value };
  return value;
}

function maximumPlanZoom(kind, w, h) {
  const state = planViews[kind];
  const current = viewport(w, h, kind);
  const baseScale = current.s / Math.max(state.zoom, 1e-12);
  const feature = kind === 'mask' ? maskMinimumFeatureSize() : mainMinimumFeatureSize();
  return zoomLimitForFeature(baseScale, feature);
}
function worldToCanvas(p, v, back = false) {
  const x = back ? -p[0] : p[0];
  return [v.cx + x * v.s, v.cy - p[1] * v.s];
}
function canvasToWorld(x, y, v, back = false) {
  let wx = (x - v.cx) / v.s;
  if (back) wx = -wx;
  return [wx, (v.cy - y) / v.s];
}
function resetPlanView(kind) {
  planViews[kind] = { zoom: 1, panX: 0, panY: 0 };
  kind === 'mask' ? renderMask() : renderMain();
}
function zoomPlanView(kind, canvas, factor, clientX = null, clientY = null, back = false) {
  const state = planViews[kind],
    r = canvas.getBoundingClientRect(),
    { w, h } = setupCanvas(canvas);
  const px = clientX == null ? w / 2 : clientX - r.left,
    py = clientY == null ? h / 2 : clientY - r.top;
  const before = viewport(w, h, kind),
    anchor = canvasToWorld(px, py, before, back);
  state.zoom = Math.max(0.3, Math.min(maximumPlanZoom(kind, w, h), state.zoom * factor));
  const after = viewport(w, h, kind),
    mapped = worldToCanvas(anchor, after, back);
  state.panX += px - mapped[0];
  state.panY += py - mapped[1];
  kind === 'mask' ? renderMask() : renderMain();
}
function niceStep(range, count = 6) {
  const raw = Math.max(1e-9, range / Math.max(1, count)),
    p = 10 ** Math.floor(Math.log10(raw)),
    n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
function drawPlanAxes(ctx, v, w, h, back = false) {
  ctx.save();
  ctx.font = '7.5px system-ui';
  const yLabelWidth = Math.max(
    ...[7, h - 17].map((y) => ctx.measureText(formatXY(canvasToWorld(0, y, v, back)[1])).width),
  );
  ctx.restore();
  const left = Math.max(28, Math.ceil(yLabelWidth + 6)),
    bottom = h - 17,
    right = w - 7,
    top = 7;
  const xa = canvasToWorld(left, bottom, v, back),
    xb = canvasToWorld(right, bottom, v, back),
    ya = canvasToWorld(left, bottom, v, back),
    yb = canvasToWorld(left, top, v, back);
  const xmin = Math.min(xa[0], xb[0]),
    xmax = Math.max(xa[0], xb[0]),
    ymin = Math.min(ya[1], yb[1]),
    ymax = Math.max(ya[1], yb[1]);
  const dxmin = xyToDisplay(xmin),
    dxmax = xyToDisplay(xmax),
    dymin = xyToDisplay(ymin),
    dymax = xyToDisplay(ymax);
  ctx.save();
  ctx.font = '7.5px system-ui';
  const labelWidth = Math.max(
    ctx.measureText(formatXY(xmin)).width,
    ctx.measureText(formatXY(xmax)).width,
    16,
  );
  const xs = niceStep(dxmax - dxmin, Math.max(2, (right - left) / (labelWidth + 14))),
    ys = niceStep(dymax - dymin, Math.max(2, (bottom - top) / 30));
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(70,82,95,.24)';
  ctx.fillStyle = '#78838f';
  ctx.lineWidth = 0.7;
  ctx.font = '7.5px system-ui';
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let xd = Math.ceil(dxmin / xs) * xs; xd <= dxmax + xs * 0.001; xd += xs) {
    const x = xyFromDisplay(xd),
      p = worldToCanvas([x, 0], v, back);
    if (p[0] < left - 1 || p[0] > right + 1) continue;
    ctx.beginPath();
    ctx.moveTo(p[0], bottom);
    ctx.lineTo(p[0], bottom - 3);
    ctx.stroke();
    const label = Math.abs(xd) < 1e-12 ? '0' : formatXY(x);
    const halfWidth = ctx.measureText(label).width / 2;
    if (p[0] - halfWidth >= 1 && p[0] + halfWidth <= w - 1) ctx.fillText(label, p[0], bottom + 1);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let yd = Math.ceil(dymin / ys) * ys; yd <= dymax + ys * 0.001; yd += ys) {
    const y = xyFromDisplay(yd),
      p = worldToCanvas([0, y], v, back);
    if (p[1] < top - 1 || p[1] > bottom + 1) continue;
    ctx.beginPath();
    ctx.moveTo(left, p[1]);
    ctx.lineTo(left + 3, p[1]);
    ctx.stroke();
    ctx.fillText(Math.abs(yd) < 1e-12 ? '0' : formatXY(y), left - 3, p[1]);
  }
  ctx.font = '700 7.5px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`X (${xyUnit().label})`, right, bottom - 3);
  ctx.textAlign = 'left';
  ctx.fillText(`Y (${xyUnit().label})`, left + 3, top + 8);
  ctx.restore();
}
function canvasPathMulti(ctx, geom, v, back = false) {
  ctx.beginPath();
  for (const poly of geom || [])
    for (const ring of poly)
      ring.forEach((p, i) => {
        const q = worldToCanvas(p, v, back);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
}
function drawBaseOutline(ctx, v) {
  canvasPathMulti(ctx, model.boundary, v);
  ctx.fillStyle = '#f1f4f6';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#96a1ad';
  ctx.lineWidth = 1;
  ctx.stroke();
}
function traceElement(ctx, e, v, selected) {
  const key = layerKey(e.layer, e.datatype),
    hovered = hoveredLayerKey === key;
  ctx.beginPath();
  if (e.kind === 'polygon') {
    e.points.map(maskPoint).forEach((p, i) => {
      const q = worldToCanvas(p, v);
      i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    ctx.fillStyle = selected
      ? layerColor(key, hovered ? 0.8 : 0.58)
      : hovered
        ? layerColor(key, 0.28)
        : 'rgba(155,166,178,.10)';
    ctx.fill();
    ctx.strokeStyle = selected || hovered ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)';
    ctx.lineWidth = hovered ? 1.7 : selected ? 1 : 0.6;
    ctx.stroke();
  } else {
    e.points.map(maskPoint).forEach((p, i) => {
      const q = worldToCanvas(p, v);
      i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    });
    ctx.strokeStyle = selected ? layerColor(key, 0.95) : '#aab3bd';
    ctx.lineWidth = Math.max(0.8, e.width * maskTransform.scale * v.s);
    ctx.stroke();
  }
}
function drawRoi(ctx, v) {
  if (!roi && !roiDraft) return;
  const r = roiDraft || roi;
  ctx.save();
  ctx.strokeStyle = '#d65361';
  ctx.fillStyle = 'rgba(214,83,97,.05)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (r.type === 'rect') {
    const a = worldToCanvas(r.a, v),
      b = worldToCanvas(r.b, v);
    ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  } else if (r.type === 'circle') {
    const c = worldToCanvas(r.c, v);
    ctx.arc(c[0], c[1], r.r * v.s, 0, Math.PI * 2);
  } else if (r.type === 'sector') {
    sectorBoundaryPoints(r, 96)
      .map((point) => worldToCanvas(point, v))
      .forEach((point, index) => {
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0], point[1]);
      });
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  if (!roiDraft && roi) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    for (const point of Object.values(roiHandlePoints(roi))) {
      const q = worldToCanvas(point, v);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d65361';
      ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10);
      ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10);
    }
    if (roi.type === 'sector') {
      for (const point of Object.values(sectorAngleHandlePoints(roi))) {
        const q = worldToCanvas(point, v);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f5c04a';
        ctx.strokeStyle = '#8f6500';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function renderMask() {
  const c = $('maskCanvas'),
    { ctx, w, h } = setupCanvas(c),
    v = viewport(w, h, 'mask');
  ctx.clearRect(0, 0, w, h);
  drawBaseOutline(ctx, v);
  for (const e of layout.linework || []) traceElement(ctx, e, v, false);
  for (const e of layout.elements || []) traceElement(ctx, e, v, selectedElement(e));
  drawRoi(ctx, v);
  drawPlanAxes(ctx, v, w, h, false);
}
function shadeColor(hex, delta) {
  const n = parseInt(hex.slice(1), 16),
    r = Math.max(0, Math.min(255, (n >> 16) + delta)),
    g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta)),
    b = Math.max(0, Math.min(255, (n & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

function renderMain() {
  const c = $('mainCanvas'),
    { ctx, w, h } = setupCanvas(c),
    v = viewport(w, h, 'main'),
    back = activeFace === 'back';
  $('mainCoords').style.bottom = `${$('mainPanel').clientHeight - c.offsetTop - h + 26}px`;
  ctx.clearRect(0, 0, w, h);
  drawBaseOutline(ctx, v);
  const patches = surfaceGroups(model, activeFace);
  for (const patch of patches) {
    const layer = layerById(model, patch.layerId);
    if (!layer) continue;
    canvasPathMulti(ctx, patch.geom, v, back);
    const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
    ctx.fillStyle = shadeColor(layer.color, shade);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(36,46,56,.24)';
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
  canvasPathMulti(ctx, model.boundary, v, back);
  ctx.strokeStyle = '#87939f';
  ctx.lineWidth = 1;
  ctx.stroke();
  const a = worldToCanvas(section.a, v, back),
    b = worldToCanvas(section.b, v, back);
  ctx.strokeStyle = '#cc5062';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
  for (const [p, label] of [
    [a, 'A'],
    [b, 'B'],
  ]) {
    if (sectionEditEnabled) continue;
    ctx.fillStyle = '#cc5062';
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 9px system-ui';
    ctx.fillText(label, p[0] + 6, p[1] - 6);
  }
  drawPlanAxes(ctx, v, w, h, back);
  syncSectionInputs();
  sectionEditor?.update();
}
function renderSection() {
  const c = $('sectionCanvas'),
    { ctx, w, h } = setupCanvas(c);
  ctx.clearRect(0, 0, w, h);

  const [lo, hi] = modelBoundsZ(model),
    pad = Math.max(1e-9, (hi - lo) * 0.08),
    z0 = lo - pad,
    z1 = hi + pad,
    zSpan = Math.max(z1 - z0, 1e-12),
    sectionSpan = Math.max(
      Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]),
      1e-12,
    ),
    left = 27,
    right = 10,
    top = 10,
    bottom = 22,
    iw = w - left - right,
    ih = h - top - bottom,
    autoXScale = iw / sectionSpan,
    autoZScale = ih / zSpan;

  let plotLeft = left,
    plotTop = top,
    plotWidth = iw,
    plotHeight = ih;

  if (sectionScaleMode === 'physical') {
    const scale = Math.min(autoXScale, autoZScale);
    plotWidth = sectionSpan * scale;
    plotHeight = zSpan * scale;
    plotLeft = left + (iw - plotWidth) / 2;
    plotTop = top + (ih - plotHeight) / 2;
  }

  const xScale = plotWidth / sectionSpan,
    zScale = plotHeight / zSpan,
    zExaggeration = zScale / xScale,
    mapT = (t) => plotLeft + t * plotWidth,
    mapZ = (z) => plotTop + ((z1 - z) / zSpan) * plotHeight;

  c.dataset.scaleMode = sectionScaleMode;
  c.dataset.xPxPerUm = String(xScale);
  c.dataset.zPxPerUm = String(zScale);

  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, w, h);
  for (const contour of sectionContours(model, section.a, section.b)) {
    const layer = layerById(model, contour.layerId);
    if (!layer) continue;
    ctx.beginPath();
    for (const poly of contour.polys)
      for (const ring of poly) {
        ring.forEach(([t, z], i) => {
          const point = [mapT(t), mapZ(z)];
          if (i === 0) ctx.moveTo(...point);
          else ctx.lineTo(...point);
        });
        ctx.closePath();
      }
    ctx.fillStyle = layer.color;
    ctx.fill('evenodd');
  }

  // Auto mode keeps sub-pixel physical sidewalls legible. Physical 1:1 mode
  // disables this screen-space widening so X and Z use the same px/µm scale.
  for (const slice of sectionSlices(model, section.a, section.b)) {
    if (slice.role !== 'conformal-sidewall') continue;
    const layer = layerById(model, slice.layerId);
    if (!layer) continue;
    const x0 = mapT(slice.t0),
      x1 = mapT(slice.t1),
      center = (x0 + x1) / 2,
      minWidth = sectionScaleMode === 'auto' ? 3 : 0,
      sx0 = Math.min(x0, center - minWidth / 2),
      sx1 = Math.max(x1, center + minWidth / 2),
      sy0 = mapZ(slice.z1),
      sy1 = mapZ(slice.z0);
    ctx.fillStyle = layer.color;
    ctx.fillRect(sx0, sy0, Math.max(minWidth, sx1 - sx0), sy1 - sy0);
  }

  ctx.strokeStyle = '#8995a1';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
  ctx.fillStyle = '#707b86';
  ctx.font = '8px system-ui';
  ctx.fillText(formatXY(z1), 3, plotTop + 7);
  ctx.fillText(formatXY(z0), 3, plotTop + plotHeight);
  ctx.fillText('A', plotLeft, Math.min(h - 5, plotTop + plotHeight + 15));
  ctx.fillText('B', plotLeft + plotWidth - 7, Math.min(h - 5, plotTop + plotHeight + 15));

  const scaleButton = $('sectionScaleModeBtn');
  scaleButton.textContent = sectionScaleMode === 'auto' ? 'Auto' : '1:1';
  scaleButton.classList.toggle('active', sectionScaleMode === 'physical');
  scaleButton.setAttribute('aria-pressed', String(sectionScaleMode === 'physical'));
  scaleButton.title =
    sectionScaleMode === 'auto'
      ? 'Auto: X and Z fit independently. Click for physical 1:1 X:Z scale.'
      : 'Physical 1:1: X and Z use the same px/µm. Click for Auto fit.';

  const scaleLabel =
    sectionScaleMode === 'auto' ? `Z ×${Number(zExaggeration.toPrecision(3))}` : '1:1';
  $('sectionMeta').textContent = `${xyText(sectionSpan)} span · ${scaleLabel}`;
  $('sectionRange').textContent = `Z (${xyUnit().label}) ${formatXY(lo)} → ${formatXY(hi)}`;
}

let threeView = null,
  threeOpacity = 1,
  threeShowBorders = false;

function initThree() {
  threeView = createThreeView({
    host: $('threeHost'),
    stats: $('threeStats'),
    getModel: () => model,
    getClipGeometry: roiGeometry,
    getInspection: () => ({ opacity: threeOpacity, borders: threeShowBorders }),
  });
  threeView.init();
}

function renderThree() {
  threeView?.render();
}

function fit3d() {
  threeView?.fit();
}

function renderAll() {
  renderCellTree();
  renderMaskList();
  renderLayerLegend();
  renderMask();
  renderMain();
  renderSection();
  renderThree();
  syncRoiEditor();
  $('mainFaceLabel').textContent = `${activeFace} surface`;
  const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
  $('faceToggleBtn').textContent = faceLabel;
  $('faceToggleBtn').setAttribute('aria-label', `Switch active face; currently ${faceLabel}`);
  $('maskSummary').textContent = layout.name || 'No mask';
  syncMaskCellLabel();
  $('baseSummary').textContent =
    `${formatXY(model.width)} × ${formatXY(model.height)} ${xyUnit().label} · Z ${formatXY(model.thickness)} ${xyUnit().label}`;
  syncUndo();
}
function syncBaseControls() {
  $('baseWidth').value = formatLengthField(model.width);
  $('baseHeight').value = formatLengthField(model.height);
  $('baseThickness').value = formatLengthField(model.thickness);
  $('baseHeight').disabled = model.shape === 'circle';
  $('baseWidthUnit').textContent = xyUnit().label;
  $('baseHeightUnit').textContent = xyUnit().label;
  $('baseThicknessUnit').textContent = xyUnit().label;
  $('operationThicknessUnit').textContent = xyUnit().label;
  $('xyUnitSelect').value = xyDisplayUnit;
  document
    .querySelectorAll('#substrateShape button')
    .forEach((b) => b.classList.toggle('active', b.dataset.shape === model.shape));
}
function updateOperationUI() {
  const t = $('operationType').value;
  $('layerNameRow').classList.toggle('hidden', t !== 'add');
  $('targetLayerRow').classList.toggle('hidden', t !== 'grow');
  $('growthModeRow').classList.toggle('hidden', t === 'etch');
  $('operationNote').textContent =
    t === 'etch'
      ? 'Etch removes the requested depth vertically through the stack.'
      : $('growthMode').value === 'conformal'
        ? 'Conformal expands across the step and includes a vector sidewall band.'
        : 'Direct follows the selected footprint.';
}
function applyOp() {
  const type = $('operationType').value,
    thickness = manualMicron($('operationThickness').value);
  $('operationThickness').value = formatLengthField(thickness);
  if (!(thickness > 0)) return status('Thickness must be greater than zero.');
  const areaMode = $('operationArea').value,
    area = operationAreaGeometry(areaMode);
  if (isEmpty(area))
    return status(
      areaMode === 'full'
        ? 'The base has no editable area.'
        : 'Select a mask layer that overlaps the base first.',
    );
  const name = $('layerName').value.trim() || `Layer ${model.layers.length}`,
    targetLayerId = $('targetLayer').value;
  if (type === 'grow' && !targetLayerId) return status('Create a layer before growing it.');
  saveHistory();
  baseRevertSnapshot = null;
  const params = { type, name, targetLayerId, thickness, face: activeFace, area };
  if (type !== 'etch') params.growth = $('growthMode').value;
  const result = applyOperation(model, params);
  if (!result.changed) {
    restoreSnapshot(history.pop());
    syncUndo();
    return status(result.error || 'The operation did not change the model.');
  }
  if (type === 'add' && result.layerId) {
    colorNewLayer(result.layerId);
    $('layerName').value = `Layer ${model.nextLayerId}`;
  }
  renderAll();
  const growthLabel =
    type === 'etch' ? '' : params.growth === 'conformal' ? ' · Conformal' : ' · Direct';
  status(
    `${type === 'etch' ? 'Etched' : type === 'grow' ? `Grew ${layerById(model, targetLayerId)?.name || 'layer'}` : `Added ${name}`}${growthLabel} on the ${activeFace}.`,
  );
}

const projectStateController = createProjectStateController({
  ensureHierarchy,
  getState: () => ({
    model,
    layout,
    selectedLayerKeys,
    activeCell,
    maskTransform,
    activeFace,
    roi,
    roiAnchor,
    section,
    planViews,
    xyDisplayUnit,
    activeStructurePalette,
    customStructurePalette,
    threeOpacity,
    threeShowBorders,
  }),
  applyState: (next) => {
    model = next.model;
    layout = next.layout;
    selectedLayerKeys = next.selectedLayerKeys;
    activeCell = next.activeCell;
    expandedCells = next.expandedCells;
    hoveredLayerKey = next.hoveredLayerKey;
    maskTransform = next.maskTransform;
    activeFace = next.activeFace;
    roi = next.roi;
    roiAnchor = next.roiAnchor;
    section = next.section;
    if (next.xyDisplayUnit) xyDisplayUnit = next.xyDisplayUnit;
    if (next.activeStructurePalette) activeStructurePalette = next.activeStructurePalette;
    customStructurePalette = next.customStructurePalette;
    threeOpacity = next.threeOpacity;
    threeShowBorders = next.threeShowBorders;
    Object.assign(planViews.mask, next.planViews.mask);
    Object.assign(planViews.main, next.planViews.main);
    parsedLayout = null;
    history = [];
    future = [];
    baseRevertSnapshot = null;
  },
  getSnapshotRecords: () => snapshotManager.exportRecords(),
  syncThreeControls: ({ threeOpacity: opacity, threeShowBorders: borders }) => {
    $('threeOpacityRange').value = String(opacity);
    $('threeOpacityValue').value = `${Math.round(opacity * 100)}%`;
    $('threeBorders').checked = borders;
  },
  setSectionEditEnabled,
});
const { buildProjectSnapshot, loadProjectSnapshot, isValidSnapshotState } =
  projectStateController;

const snapshotManager = createSnapshotManager({
  capture: () => buildProjectSnapshot(false),
  restore: (state) => loadProjectSnapshot(state),
  validateState: isValidSnapshotState,
});

const projectController = createProjectController({
  importLayoutBuffer,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  fit3d,
  status,
});
const { renderSnapshots, openLayoutFile, openProjectFile, openVisualizationExample } =
  projectController;

const maskImportController = createMaskImportController({
  getMaskTransform: () => maskTransform,
  setMaskTransform: (value) => {
    maskTransform = value;
  },
  manualMicron,
  formatLengthField,
  formatNumericField,
  xyUnitLabel: () => xyUnit().label,
  importLayoutBuffer,
  openLayoutFile,
  renderMask,
  status,
});

const baseControls = createBaseControlsController({
  getModel: () => model,
  setModel: (value) => {
    model = value;
  },
  setSection: (value) => {
    section = value;
  },
  getBaseRevertSnapshot: () => baseRevertSnapshot,
  setBaseRevertSnapshot: (value) => {
    baseRevertSnapshot = value;
  },
  getHistory: () => history,
  getFuture: () => future,
  stateSnapshot,
  restoreSnapshot,
  saveHistory,
  hasProcessEdits,
  manualMicron,
  formatLengthField,
  syncBaseControls,
  renderAll,
  fit3d,
  status,
});

const workspaceActions = createWorkspaceActionsController({
  getXyUnit: xyUnit,
  setXyDisplayUnit: (value) => {
    xyDisplayUnit = value;
  },
  formatLengthField,
  manualMicron,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  status,
  getActiveFace: () => activeFace,
  setActiveFace: (value) => {
    activeFace = value;
  },
  updateOperationUI,
  applyOperation: applyOp,
  fit3d,
  exportMainSvg,
  exportMaskSvg,
  exportSectionSvg,
  getThreeView: () => threeView,
  downloadBlob,
  getRoi: () => roi,
  getSectionScaleMode: () => sectionScaleMode,
  setSectionScaleMode: (value) => {
    sectionScaleMode = value;
  },
  renderSection,
  getThreeOpacity: () => threeOpacity,
  setThreeOpacity: (value) => {
    threeOpacity = value;
  },
  getThreeShowBorders: () => threeShowBorders,
  setThreeShowBorders: (value) => {
    threeShowBorders = value;
  },
  renderThree,
  zoomPlanView,
  resetPlanView,
  getHistory: () => history,
  getFuture: () => future,
  stateSnapshot,
  restoreSnapshot,
  setBaseRevertSnapshot: (value) => {
    baseRevertSnapshot = value;
  },
  syncBaseControls,
  snapshotManager,
  renderSnapshots,
});

const mainCanvasController = createMainCanvasController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
  },
  getActiveFace: () => activeFace,
  setSectionEditEnabled,
  setSectionEditor: (value) => {
    sectionEditor = value;
  },
  viewport,
  worldToCanvas,
  canvasToWorld,
  zoomPlanView,
  resetPlanView,
  xyText,
  renderMain,
  renderMask,
  renderSection,
  renderAll,
});

const { initializeWorkspaceStart } = createStartupController({
  takeStartupFile,
  openLayoutFile,
  openProjectFile,
  openVisualizationExample,
  status,
});

const viewMaximizeController = createViewMaximizeController({
  status,
  renderMain,
  renderMask,
  renderSection,
  renderThree,
  fit3d,
  updateSectionEditor: () => sectionEditor?.update(),
});

function bindUi() {
  bindToolTabs();
  viewMaximizeController.bind();
  roiController.bind();
  sectionControls.bind();
  baseControls.bind();
  maskImportController.bind();
  workspaceActions.bind();
  mainCanvasController.bind();

  $('newProjectBtn').onclick = () => {
    setSectionEditEnabled(false);
    model = createModel();
    layout = emptyLayout();
    selectedLayerKeys = new Set();
    activeCell = null;
    expandedCells = new Set();
    hoveredLayerKey = null;
    roi = null;
    roiAnchor = 'center';
    clearRoiDrawingMode();
    history = [];
    future = [];
    baseRevertSnapshot = null;
    activeFace = 'front';
    snapshotManager.clear();
    section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] };
    planViews.mask = { zoom: 1, panX: 0, panY: 0 };
    planViews.main = { zoom: 1, panX: 0, panY: 0 };
    syncBaseControls();
    renderAll();
    renderSnapshots();
    fit3d();
    status('New empty project.');
  };

  $('saveProjectBtn').onclick = () => {
    try {
      downloadProject(buildProjectSnapshot(true));
      status('Project saved.');
    } catch (error) {
      console.error(error);
      status(`Save failed: ${error.message}`);
    }
  };

  $('openProjectInput').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await openProjectFile(file);
    event.target.value = '';
  };
}

bindUi();
loadBuildCommit();
window.addEventListener('focus', checkForBuildUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForBuildUpdate();
});
renderSnapshots();
initThree();
syncBaseControls();
updateOperationUI();
syncTransformInputs();
renderAll();
fit3d();
status('Ready. Create a base or import a layout.');
initializeWorkspaceStart();
