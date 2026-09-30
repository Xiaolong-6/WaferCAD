import { assertLayoutByteLength, parseLayoutFile } from './layout-io.js';
import { KLAYOUT_SAMPLES, sampleById } from './sample-layouts.js';
import {
  applyOperation,
  cloneModel,
  createModel,
  deleteExposedLayer,
  fullFaceGeometry,
  isLayerExposed,
  layerById,
  modelBoundsZ,
  recolorLayer,
  renameLayer,
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
import { downloadProject, readProjectFile } from './project-io.js';
import { CURRENT_PROJECT_VERSION, validateProjectFile } from './project-schema.js';
import { createThreeView } from './three-view.js';
import { createSectionEditor } from './section-editor.js';
import { sectionContours, sectionSlices, surfaceGroups } from './model-view-geometry.js';
import {
  circleRoiFromAnchor,
  normalizeRoi,
  rectRoiFromAnchor,
  sectorBoundaryPoints,
  sectorRoiFromAnchor,
  resizeRoiFromHandle,
  roiAnchorPoint,
  roiContainsPoint,
  roiHandlePoints,
  translateRoi,
} from './roi-editor.js';
import {
  formatLengthInput,
  formatXY as formatXYValue,
  fromMicron,
  roundMicronToNanometre,
  toMicron,
  unitMeta,
  XY_UNITS,
} from './units.js';
import {
  availableSelectedLayers,
  minimumSegmentLength,
  nearestNamedPoint,
  zoomLimitForFeature,
} from './view-interactions.js';
import { createSnapshotManager } from './workspace-snapshots.js';

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
const STRUCTURE_PALETTES = {
  balanced: [
    '#6C8EBF',
    '#82B6A6',
    '#D6A85F',
    '#C97B84',
    '#8A7CB8',
    '#6FA9B8',
    '#A98B6C',
    '#7FA178',
    '#B7799C',
    '#7590AA',
  ],
  airy: [
    '#76A9DC',
    '#86C7B5',
    '#E8C97A',
    '#E5A0A8',
    '#A99AD6',
    '#8BC6D2',
    '#C8AA82',
    '#9ABD91',
    '#D29ABD',
    '#91A9C2',
  ],
  warm: [
    '#C77C62',
    '#D49A62',
    '#C9AD68',
    '#A8A36D',
    '#B98273',
    '#C48A9D',
    '#9D8175',
    '#D1A279',
    '#B78D64',
    '#A76F6F',
  ],
  cool: [
    '#5F88B5',
    '#5FA4A5',
    '#7294C6',
    '#7186A7',
    '#7E81B2',
    '#6E9C91',
    '#779FB8',
    '#8A8DB8',
    '#6397A9',
    '#7B94A6',
  ],
};

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
  hoveredLayerKey = null,
  scopeCacheCell = null,
  scopeCacheHierarchy = null,
  scopeCache = new Set();
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
let announcedBuildUpdate = '';

async function checkForBuildUpdate() {
  if (!/^[0-9a-f]{7,64}$/i.test(loadedBuildVersion)) return;
  try {
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) return;
    const info = await response.json();
    const current = String(info.commit || '').trim();
    if (!current || current === loadedBuildVersion || current === announcedBuildUpdate) return;
    announcedBuildUpdate = current;
    const host = $('buildCommit');
    if (host) {
      host.textContent = `commit ${loadedBuildVersion.slice(0, 7)} · update`;
      host.title = `Loaded ${loadedBuildVersion.slice(0, 7)}; deployed ${current.slice(0, 7)}. Save, then reload.`;
    }
    status(`Update ${current.slice(0, 7)} available. Save the project, then reload the page.`);
  } catch {}
}

async function loadBuildCommit() {
  const host = $('buildCommit');
  if (!host) return;

  try {
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('build info unavailable');
    const info = await response.json();
    const commit = String(info.commit || '').trim();
    if (!commit) throw new Error('build commit missing');
    host.textContent = `commit ${commit.slice(0, 7)}`;
    host.href = `https://github.com/Xiaolong-6/WaferCAD/commit/${commit}`;
    host.target = '_blank';
    host.rel = 'noreferrer';
    host.title = `Open commit ${commit}`;
  } catch {
    host.textContent = 'commit local';
    host.removeAttribute('href');
    host.removeAttribute('target');
    host.removeAttribute('rel');
    host.title = 'Local build; no deployed commit is available';
  }
}
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
function syncSectionInputs() {
  const unit = $('sectionCoordUnit');
  if (!unit) return;
  unit.textContent = xyUnit().label;
  $('sectionAx').value = formatLengthField(section.a[0]);
  $('sectionAy').value = formatLengthField(section.a[1]);
  $('sectionBx').value = formatLengthField(section.b[0]);
  $('sectionBy').value = formatLengthField(section.b[1]);
}
function updateSectionFromInputs() {
  sectionEditor?.cancel();
  const values = ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'].map((id) =>
    Number($(id).value),
  );
  if (values.some((value) => !Number.isFinite(value))) {
    syncSectionInputs();
    return status('A–B coordinates must be finite numbers.');
  }
  section = {
    a: [manualMicron(values[0]), manualMicron(values[1])],
    b: [manualMicron(values[2]), manualMicron(values[3])],
  };
  renderMain();
  renderSection();
}
function setSectionEditEnabled(enabled) {
  sectionEditEnabled = Boolean(enabled);
  const button = $('sectionEditBtn');
  button.classList.toggle('active', sectionEditEnabled);
  button.setAttribute('aria-pressed', String(sectionEditEnabled));
  $('mainCanvas').classList.toggle('section-editing', sectionEditEnabled);
  button.textContent = sectionEditEnabled ? 'Done' : 'Drag A/B';
  button.title = sectionEditEnabled ? 'Finish editing A and B' : 'Edit existing A and B endpoints';
  sectionEditor?.setEnabled(sectionEditEnabled);
  renderMain();
  status(sectionEditEnabled ? 'A–B endpoint dragging enabled.' : 'A–B endpoint dragging locked.');
}
function setSectionPanelVisible(visible) {
  const panel = $('sectionCoordsPanel');
  const button = $('sectionControlsBtn');
  panel.hidden = !visible;
  button.classList.toggle('active', visible);
  button.setAttribute('aria-expanded', String(visible));
  button.title = visible ? 'Close A–B controls' : 'Open A–B controls';
  if (!visible && sectionEditEnabled) setSectionEditEnabled(false);
  renderMain();
}
function structurePalette() {
  return (
    customStructurePalette ||
    STRUCTURE_PALETTES[activeStructurePalette] ||
    STRUCTURE_PALETTES.balanced
  );
}
function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}
function randomHarmoniousPalette(count = 10) {
  const seed = Math.random() * 360,
    out = [];
  for (let i = 0; i < count; i++)
    out.push(hslHex((seed + i * 137.508) % 360, 48 + (i % 3) * 4, 61 + (i % 2) * 5));
  return out;
}
function applyStructurePalette(palette) {
  let i = 0;
  for (const layer of model.layers) {
    if (layer.id === 'base') continue;
    recolorLayer(model, layer.id, palette[i % palette.length]);
    i++;
  }
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

function hierarchyFromParsed(parsed) {
  const hierarchy = {};
  for (const name of parsed.cellOrder) {
    const counts = new Map(),
      cell = parsed.cells.get(name);
    for (const e of cell?.elements || []) {
      if (e.kind !== 'sref' && e.kind !== 'aref') continue;
      const n = e.kind === 'aref' ? Math.max(1, e.cols || 1) * Math.max(1, e.rows || 1) : 1;
      counts.set(e.name, (counts.get(e.name) || 0) + n);
    }
    hierarchy[name] = [...counts].map(([child, count]) => ({ name: child, count }));
  }
  return hierarchy;
}
function ensureHierarchy() {
  if (layout.hierarchy && Object.keys(layout.hierarchy).length) return;
  const root = layout.root || '',
    cells = new Set(root ? [root] : []);
  for (const c of layout.combos || []) cells.add(c.cell);
  for (const e of layout.linework || []) if (e.sourceCell) cells.add(e.sourceCell);
  layout.hierarchy = {};
  for (const name of cells) layout.hierarchy[name] = [];
  if (root)
    layout.hierarchy[root] = [...cells]
      .filter((name) => name !== root)
      .map((name) => ({ name, count: 1 }));
}
function cellChildren(name) {
  ensureHierarchy();
  return layout.hierarchy?.[name] || [];
}
function descendantCells(name) {
  const out = new Set();
  function walk(n) {
    if (!n || out.has(n)) return;
    out.add(n);
    for (const child of cellChildren(n)) walk(child.name);
  }
  walk(name);
  return out;
}
function activeScopeCells() {
  if (scopeCacheCell === activeCell && scopeCacheHierarchy === layout.hierarchy) return scopeCache;
  scopeCacheCell = activeCell;
  scopeCacheHierarchy = layout.hierarchy;
  scopeCache = activeCell ? descendantCells(activeCell) : new Set();
  return scopeCache;
}
function selectedElement(e) {
  return (
    activeScopeCells().has(e.sourceCell) && selectedLayerKeys.has(layerKey(e.layer, e.datatype))
  );
}
function globalLayers() {
  const map = new Map();
  for (const combo of layout.combos || []) {
    const key = layerKey(combo.layer, combo.datatype);
    if (!map.has(key))
      map.set(key, {
        key,
        layer: combo.layer,
        datatype: combo.datatype,
        count: 0,
        cells: new Set(),
      });
    const item = map.get(key);
    item.count += combo.count;
    item.cells.add(combo.cell);
  }
  return [...map.values()].sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);
}

function syncMaskCellLabel(layers = globalLayers(), scope = activeScopeCells()) {
  if (!activeCell) {
    $('maskCellLabel').textContent = '—';
    return;
  }
  const selected = availableSelectedLayers(layers, selectedLayerKeys, scope);
  $('maskCellLabel').textContent =
    selected.length === 1
      ? `${activeCell} · ${selected[0].layer}/${selected[0].datatype}`
      : selected.length
        ? `${activeCell} · ${selected.length} layers`
        : `${activeCell} · no active layer`;
}

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
function clearRoiDrawingMode() {
  roiTool = null;
  roiDraft = null;
  document.querySelectorAll('.roi-tool').forEach((button) => button.classList.remove('active'));
}
function syncRoiEditor() {
  const editor = $('roiEditor');
  if (!editor) return;
  editor.hidden = !roi;
  if (!roi) return;
  const point = roiAnchorPoint(roi, roiAnchor);
  if (!point) return;
  $('roiShapeLabel').textContent =
    roi.type === 'rect' ? 'Rectangle' : roi.type === 'sector' ? 'Sector' : 'Circle';
  $('roiUnitLabel').textContent = xyUnit().label;
  $('roiAnchorSelect').value = roiAnchor;
  $('roiX').value = formatLengthField(point[0]);
  $('roiY').value = formatLengthField(point[1]);
  $('roiRectFields').hidden = roi.type !== 'rect';
  $('roiCircleFields').hidden = !['circle', 'sector'].includes(roi.type);
  $('roiSectorFields').hidden = roi.type !== 'sector';
  if (roi.type === 'rect') {
    $('roiWidth').value = formatLengthField(roi.b[0] - roi.a[0]);
    $('roiHeight').value = formatLengthField(roi.b[1] - roi.a[1]);
  } else {
    $('roiRadius').value = formatLengthField(roi.r);
    if (roi.type === 'sector') {
      $('roiStartAngle').value = formatNumericField(roi.startDeg, 3);
      $('roiEndAngle').value = formatNumericField(roi.endDeg, 3);
    }
  }
}
function applyRoiEditor() {
  if (!roi) return;
  const x = manualMicron($('roiX').value),
    y = manualMicron($('roiY').value);
  let next = null;
  if (roi.type === 'rect') {
    const width = manualMicron($('roiWidth').value),
      height = manualMicron($('roiHeight').value);
    next = rectRoiFromAnchor(width, height, roiAnchor, x, y);
  } else {
    const radius = manualMicron($('roiRadius').value);
    next =
      roi.type === 'sector'
        ? sectorRoiFromAnchor(
            radius,
            Number($('roiStartAngle').value),
            Number($('roiEndAngle').value),
            roiAnchor,
            x,
            y,
          )
        : circleRoiFromAnchor(radius, roiAnchor, x, y);
  }
  if (!next) {
    syncRoiEditor();
    return status('ROI geometry requires finite coordinates and positive dimensions.');
  }
  roi = next;
  renderAll();
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
  syncTransformInputs();
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

function populateSampleLayouts() {
  const select = $('sampleMaskSelect');
  if (!select) return;
  for (const sample of KLAYOUT_SAMPLES) {
    const option = document.createElement('option');
    option.value = sample.id;
    option.textContent = sample.label;
    select.append(option);
  }
}
function syncTransformInputs() {
  $('maskOffsetX').value = formatLengthField(maskTransform.x);
  $('maskOffsetY').value = formatLengthField(maskTransform.y);
  $('maskOffsetXUnit').textContent = xyUnit().label;
  $('maskOffsetYUnit').textContent = xyUnit().label;
  $('maskScale').value = formatNumericField(maskTransform.scale, 6);
  $('maskRotation').value = formatNumericField(maskTransform.rotation, 3);
}
function setActiveCell(name) {
  activeCell = name || null;
  scopeCacheCell = null;
  renderCellTree();
  renderMaskList();
  renderMask();
}
function renderCellTree() {
  ensureHierarchy();
  const host = $('cellTree');
  host.innerHTML = '';
  const root = layout.root || Object.keys(layout.hierarchy || {})[0] || '';
  if (!root) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No mask loaded';
    host.append(empty);
    activeCell = null;
    return;
  }
  if (!activeCell || !(activeCell in (layout.hierarchy || {}))) activeCell = root;
  function node(name, depth, path) {
    const children = cellChildren(name),
      row = document.createElement('div');
    row.className =
      'cell-row' + (name === activeCell ? ' active' : '') + (depth === 0 ? ' root' : '');
    row.style.setProperty('--depth', depth);
    const caret = document.createElement('button');
    caret.className = 'cell-caret';
    caret.type = 'button';
    caret.textContent = children.length ? (expandedCells.has(name) ? '▾' : '▸') : '';
    caret.disabled = !children.length;
    caret.onclick = (e) => {
      e.stopPropagation();
      expandedCells.has(name) ? expandedCells.delete(name) : expandedCells.add(name);
      renderCellTree();
    };
    const label = document.createElement('button');
    label.className = 'cell-name';
    label.type = 'button';
    label.textContent = name;
    label.onclick = () => setActiveCell(name);
    row.append(caret, label);
    host.append(row);
    if (children.length && expandedCells.has(name)) {
      for (const child of children) {
        if (path.includes(child.name)) continue;
        const before = host.children.length;
        node(child.name, depth + 1, [...path, name]);
        if (child.count > 1 && host.children[before]) {
          const count = document.createElement('span');
          count.className = 'cell-count';
          count.textContent = `×${child.count}`;
          host.children[before].append(count);
        }
      }
    }
  }
  node(root, 0, []);
}
function renderMaskList() {
  const host = $('maskLayerList');
  host.innerHTML = '';
  const layers = globalLayers(),
    scope = activeScopeCells();
  if (!layers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No area layers';
    host.append(empty);
  }
  for (const item of layers) {
    const available = [...item.cells].some((cell) => scope.has(cell));
    const row = document.createElement('label');
    row.className =
      'layer-row' +
      (selectedLayerKeys.has(item.key) ? ' selected' : '') +
      (available ? '' : ' unavailable');
    row.onmouseenter = () => {
      hoveredLayerKey = item.key;
      renderMask();
    };
    row.onmouseleave = () => {
      if (hoveredLayerKey === item.key) hoveredLayerKey = null;
      renderMask();
    };
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedLayerKeys.has(item.key);
    cb.onchange = () => {
      cb.checked ? selectedLayerKeys.add(item.key) : selectedLayerKeys.delete(item.key);
      renderAll();
    };
    const sw = document.createElement('span');
    sw.className = 'layer-swatch';
    sw.style.background = layerColor(item.key);
    const text = document.createElement('span');
    text.className = 'layer-name';
    text.textContent = `${item.layer}/${item.datatype}`;
    const count = document.createElement('span');
    count.className = 'layer-count';
    count.textContent = item.count;
    row.title = available
      ? `Layer ${item.layer}/${item.datatype} in selected cell hierarchy`
      : `Layer ${item.layer}/${item.datatype} is not present in ${activeCell || 'this cell'}`;
    row.append(cb, sw, text, count);
    host.append(row);
  }
  syncMaskCellLabel(layers, scope);
}

function renderLayerLegend() {
  const host = $('layerLegend');
  host.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'legend-head';
  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = 'Layers';
  const tools = document.createElement('div');
  tools.className = 'legend-tools';
  const paletteSelect = document.createElement('select');
  paletteSelect.className = 'legend-palette-select';
  paletteSelect.title = 'Structure color palette';
  for (const [key, label] of [
    ['balanced', 'Balanced'],
    ['airy', 'Airy'],
    ['warm', 'Warm'],
    ['cool', 'Cool'],
  ])
    paletteSelect.add(new Option(label, key));
  if (customStructurePalette) paletteSelect.add(new Option('Random', 'random'));
  paletteSelect.value = customStructurePalette ? 'random' : activeStructurePalette;
  paletteSelect.onchange = () => {
    customStructurePalette = null;
    activeStructurePalette = paletteSelect.value;
    openLayerPaletteId = null;
    applyStructurePalette(structurePalette());
    renderLayerLegend();
    renderMain();
    renderSection();
    renderThree();
  };
  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.className = 'legend-random';
  randomBtn.textContent = 'Random';
  randomBtn.title = 'Generate and apply a harmonious palette';
  randomBtn.onclick = () => {
    customStructurePalette = randomHarmoniousPalette();
    openLayerPaletteId = null;
    applyStructurePalette(customStructurePalette);
    renderLayerLegend();
    renderMain();
    renderSection();
    renderThree();
  };
  tools.append(paletteSelect, randomBtn);
  head.append(title, tools);
  host.append(head);

  const target = $('targetLayer'),
    previous = target.value;
  target.innerHTML = '';
  const palette = structurePalette();
  for (const layer of model.layers) {
    const row = document.createElement('div');
    row.className = 'legend-row-wrap';
    const main = document.createElement('div');
    main.className = 'legend-row';
    const color = document.createElement('button');
    color.type = 'button';
    color.className = 'legend-color-chip';
    color.style.background = layer.color;
    color.title = 'Choose from the active palette';
    color.onclick = () => {
      openLayerPaletteId = openLayerPaletteId === layer.id ? null : layer.id;
      renderLayerLegend();
    };
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'legend-name';
    name.value = layer.name;
    name.title = 'Rename layer';
    name.onchange = () => {
      if (!renameLayer(model, layer.id, name.value)) name.value = layer.name;
      renderLayerLegend();
      renderMain();
      renderSection();
      renderThree();
    };
    main.append(color, name);
    if (isLayerExposed(model, layer.id)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'legend-delete';
      remove.textContent = '×';
      remove.title = `Delete exposed layer "${layer.name}"`;
      remove.setAttribute('aria-label', `Delete exposed layer ${layer.name}`);
      remove.onclick = () => {
        if (!window.confirm(`Delete exposed layer "${layer.name}"? This can be undone.`)) return;
        saveHistory();
        if (!deleteExposedLayer(model, layer.id)) {
          history.pop();
          syncUndo();
          return status('Layer is no longer fully exposed and cannot be deleted.');
        }
        if (openLayerPaletteId === layer.id) openLayerPaletteId = null;
        renderAll();
        updateOperationUI();
        status(`Deleted exposed layer "${layer.name}".`);
      };
      main.append(remove);
    }
    row.append(main);
    if (openLayerPaletteId === layer.id) {
      const grid = document.createElement('div');
      grid.className = 'legend-palette-grid';
      for (const value of palette) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'legend-palette-chip';
        chip.style.background = value;
        chip.title = value;
        chip.onclick = () => {
          recolorLayer(model, layer.id, value);
          openLayerPaletteId = null;
          renderLayerLegend();
          renderMain();
          renderSection();
          renderThree();
        };
        grid.append(chip);
      }
      row.append(grid);
    }
    host.append(row);
    if (layer.id !== 'base') target.add(new Option(layer.name, layer.id));
  }
  if ([...target.options].some((o) => o.value === previous)) target.value = previous;
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
  }
  ctx.restore();
}

function roiResizeCursor(handle) {
  return handle === 'top-left' || handle === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename, type = 'image/svg+xml') {
  downloadBlob(new Blob([text], { type }), filename);
}

function svgNumber(value) {
  return Number(Number(value).toFixed(3));
}

function svgPathFromMulti(geom, mapPoint) {
  let d = '';
  for (const poly of geom || [])
    for (const ring of poly || []) {
      ring.forEach((point, index) => {
        const mapped = mapPoint(point);
        d += `${index ? 'L' : 'M'}${svgNumber(mapped[0])} ${svgNumber(mapped[1])}`;
      });
      d += 'Z';
    }
  return d;
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(width)}" height="${svgNumber(
    height,
  )}" viewBox="0 0 ${svgNumber(width)} ${svgNumber(height)}"><rect width="100%" height="100%" fill="#fbfcfd"/>${body}</svg>`;
}

function exportMainSvg() {
  const canvas = $('mainCanvas'),
    rect = canvas.getBoundingClientRect(),
    w = Math.max(2, rect.width),
    h = Math.max(2, rect.height),
    v = viewport(w, h, 'main'),
    back = activeFace === 'back',
    map = (point) => worldToCanvas(point, v, back);
  let body = `<path d="${svgPathFromMulti(model.boundary, map)}" fill="#f1f4f6" stroke="#96a1ad" stroke-width="1"/>`;

  for (const patch of surfaceGroups(model, activeFace)) {
    const layer = layerById(model, patch.layerId);
    if (!layer) continue;
    const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
    body += `<path d="${svgPathFromMulti(patch.geom, map)}" fill="${shadeColor(
      layer.color,
      shade,
    )}" fill-rule="evenodd" stroke="rgba(36,46,56,.24)" stroke-width=".65"/>`;
  }
  body += `<path d="${svgPathFromMulti(model.boundary, map)}" fill="none" stroke="#87939f" stroke-width="1"/>`;

  const a = map(section.a),
    b = map(section.b);
  body += `<line x1="${svgNumber(a[0])}" y1="${svgNumber(a[1])}" x2="${svgNumber(
    b[0],
  )}" y2="${svgNumber(b[1])}" stroke="#cc5062" stroke-width="2.3"/>`;
  for (const [point, label] of [
    [a, 'A'],
    [b, 'B'],
  ])
    body += `<circle cx="${svgNumber(point[0])}" cy="${svgNumber(
      point[1],
    )}" r="4.5" fill="#cc5062"/><text x="${svgNumber(point[0] + 6)}" y="${svgNumber(
      point[1] - 6,
    )}" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#cc5062">${label}</text>`;

  downloadText(svgDocument(w, h, body), 'wafercad-main.svg');
  status('Exported Main as SVG.');
}

function svgRoiPath(shape, v) {
  if (!shape) return '';
  if (shape.type === 'rect') {
    const a = worldToCanvas(shape.a, v),
      b = worldToCanvas(shape.b, v);
    return `M${svgNumber(a[0])} ${svgNumber(a[1])}L${svgNumber(b[0])} ${svgNumber(
      a[1],
    )}L${svgNumber(b[0])} ${svgNumber(b[1])}L${svgNumber(a[0])} ${svgNumber(
      b[1],
    )}Z`;
  }
  if (shape.type === 'circle') {
    const center = worldToCanvas(shape.c, v),
      radius = shape.r * v.s;
    return `M${svgNumber(center[0] + radius)} ${svgNumber(center[1])}A${svgNumber(
      radius,
    )} ${svgNumber(radius)} 0 1 0 ${svgNumber(center[0] - radius)} ${svgNumber(
      center[1],
    )}A${svgNumber(radius)} ${svgNumber(radius)} 0 1 0 ${svgNumber(
      center[0] + radius,
    )} ${svgNumber(center[1])}Z`;
  }
  if (shape.type === 'sector') {
    const points = sectorBoundaryPoints(shape, 96);
    return points
      .map((point, index) => {
        const q = worldToCanvas(point, v);
        return `${index ? 'L' : 'M'}${svgNumber(q[0])} ${svgNumber(q[1])}`;
      })
      .join('') + 'Z';
  }
  return '';
}

function exportMaskSvg() {
  const canvas = $('maskCanvas'),
    rect = canvas.getBoundingClientRect(),
    w = Math.max(2, rect.width),
    h = Math.max(2, rect.height),
    v = viewport(w, h, 'mask'),
    map = (point) => worldToCanvas(point, v);
  let body = `<path d="${svgPathFromMulti(model.boundary, map)}" fill="#f1f4f6" stroke="#96a1ad" stroke-width="1"/>`;

  for (const element of layout.linework || []) {
    if (!Array.isArray(element.points) || element.points.length < 2) continue;
    const points = element.points.map(maskPoint).map(map);
    const d = points
      .map((point, index) => `${index ? 'L' : 'M'}${svgNumber(point[0])} ${svgNumber(point[1])}`)
      .join('');
    const selected = selectedElement(element);
    body += `<path d="${d}" fill="none" stroke="${
      selected ? layerColor(layerKey(element.layer, element.datatype), 0.95) : '#aab3bd'
    }" stroke-width="${svgNumber(Math.max(0.8, element.width * maskTransform.scale * v.s))}"/>`;
  }

  for (const element of layout.elements || []) {
    if (element.kind !== 'polygon' || !Array.isArray(element.points)) continue;
    const points = element.points.map(maskPoint).map(map);
    const d =
      points
        .map((point, index) => `${index ? 'L' : 'M'}${svgNumber(point[0])} ${svgNumber(point[1])}`)
        .join('') + 'Z';
    const key = layerKey(element.layer, element.datatype),
      selected = selectedElement(element);
    body += `<path d="${d}" fill="${
      selected ? layerColor(key, 0.58) : 'rgba(155,166,178,.10)'
    }" stroke="${selected ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)'}" stroke-width="${
      selected ? 1 : 0.6
    }"/>`;
  }

  if (roi) {
    body += `<path d="${svgRoiPath(roi, v)}" fill="rgba(214,83,97,.05)" stroke="#d65361" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  }
  downloadText(svgDocument(w, h, body), 'wafercad-mask.svg');
  status('Exported Mask as SVG.');
}

function exportSectionSvg() {
  const canvas = $('sectionCanvas'),
    rect = canvas.getBoundingClientRect(),
    w = Math.max(2, rect.width),
    h = Math.max(2, rect.height),
    [lo, hi] = modelBoundsZ(model),
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
  const map = ([t, z]) => [plotLeft + t * plotWidth, plotTop + ((z1 - z) / zSpan) * plotHeight];
  let body = '';
  for (const contour of sectionContours(model, section.a, section.b)) {
    const layer = layerById(model, contour.layerId);
    if (!layer) continue;
    body += `<path d="${svgPathFromMulti(contour.polys, map)}" fill="${layer.color}" fill-rule="evenodd"/>`;
  }

  for (const slice of sectionSlices(model, section.a, section.b)) {
    if (slice.role !== 'conformal-sidewall') continue;
    const layer = layerById(model, slice.layerId);
    if (!layer) continue;
    const x0 = plotLeft + slice.t0 * plotWidth,
      x1 = plotLeft + slice.t1 * plotWidth,
      center = (x0 + x1) / 2,
      minWidth = sectionScaleMode === 'auto' ? 3 : 0,
      sx0 = Math.min(x0, center - minWidth / 2),
      sx1 = Math.max(x1, center + minWidth / 2),
      sy0 = map([0, slice.z1])[1],
      sy1 = map([0, slice.z0])[1];
    body += `<rect x="${svgNumber(sx0)}" y="${svgNumber(sy0)}" width="${svgNumber(
      Math.max(minWidth, sx1 - sx0),
    )}" height="${svgNumber(sy1 - sy0)}" fill="${layer.color}"/>`;
  }
  body += `<rect x="${svgNumber(plotLeft)}" y="${svgNumber(plotTop)}" width="${svgNumber(
    plotWidth,
  )}" height="${svgNumber(plotHeight)}" fill="none" stroke="#8995a1" stroke-width=".8"/>`;
  body += `<text x="3" y="${svgNumber(plotTop + 7)}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">${formatXY(
    z1,
  )}</text><text x="3" y="${svgNumber(
    plotTop + plotHeight,
  )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">${formatXY(
    z0,
  )}</text><text x="${svgNumber(plotLeft)}" y="${svgNumber(
    Math.min(h - 5, plotTop + plotHeight + 15),
  )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">A</text><text x="${svgNumber(
    plotLeft + plotWidth - 7,
  )}" y="${svgNumber(
    Math.min(h - 5, plotTop + plotHeight + 15),
  )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">B</text>`;

  downloadText(svgDocument(w, h, body), 'wafercad-section-ab.svg');
  status('Exported Section A–B as SVG.');
}

let maximizedPanelId = null;
function setMaximizedView(panelId) {
  const next = maximizedPanelId === panelId ? null : panelId;
  document.querySelectorAll('.view-panel.is-maximized').forEach((panel) =>
    panel.classList.remove('is-maximized'),
  );
  maximizedPanelId = next;
  document.body.classList.toggle('view-maximized', Boolean(next));
  if (next) $(next)?.classList.add('is-maximized');

  document.querySelectorAll('.view-max-btn').forEach((button) => {
    const active = Boolean(next) && button.dataset.viewPanel === next;
    button.classList.toggle('active', active);
    button.textContent = active ? 'Restore' : 'Max';
    button.title = active
      ? 'Restore the workspace layout'
      : `Maximize ${$(button.dataset.viewPanel)?.querySelector('strong')?.textContent || 'view'} in the current page`;
  });

  requestAnimationFrame(() => {
    renderMain();
    renderMask();
    renderSection();
    renderThree();
    sectionEditor?.update();
    if (next === 'threePanel') fit3d();
  });
  status(next ? 'View maximized. Press Restore or Escape to return.' : 'Workspace restored.');
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
    const layers = model.layers.filter((layer) => layer.id !== 'base'),
      idx = layers.findIndex((layer) => layer.id === result.layerId),
      palette = structurePalette();
    if (idx >= 0) recolorLayer(model, result.layerId, palette[idx % palette.length]);
    $('layerName').value = `Layer ${model.nextLayerId}`;
  }
  renderAll();
  const growthLabel =
    type === 'etch' ? '' : params.growth === 'conformal' ? ' · Conformal' : ' · Direct';
  status(
    `${type === 'etch' ? 'Etched' : type === 'grow' ? `Grew ${layerById(model, targetLayerId)?.name || 'layer'}` : `Added ${name}`}${growthLabel} on the ${activeFace}.`,
  );
}

function buildProjectSnapshot(includeSnapshots = false) {
  ensureHierarchy();
  const project = {
    format: 'WaferCAD-vector',
    version: CURRENT_PROJECT_VERSION,
    model,
    layout: {
      name: layout.name,
      root: layout.root,
      elements: layout.elements,
      linework: layout.linework,
      bounds: layout.bounds,
      combos: layout.combos,
      hierarchy: layout.hierarchy,
      units: layout.units,
    },
    selectedLayerKeys: [...selectedLayerKeys],
    activeCell,
    maskTransform,
    activeFace,
    roi,
    roiAnchor,
    section,
    planViews,
    display: {
      xyUnit: xyDisplayUnit,
      structurePalette: activeStructurePalette,
      customStructurePalette,
      threeOpacity,
      threeShowBorders,
    },
  };
  if (includeSnapshots) project.snapshots = snapshotManager.exportRecords();
  return project;
}

function loadProjectSnapshot(project) {
  setSectionEditEnabled(false);
  model = project.model;
  if (model.processRevision == null) {
    model.processRevision = Math.max(0, (model.revision || 1) - 1);
  }

  layout = project.layout;
  ensureHierarchy();
  selectedLayerKeys = new Set(project.selectedLayerKeys);
  activeCell = project.activeCell || layout.root || null;
  expandedCells = new Set(activeCell ? [layout.root || activeCell] : []);
  hoveredLayerKey = null;
  maskTransform = project.maskTransform;
  activeFace = project.activeFace;
  roi = project.roi ? normalizeRoi(project.roi) : null;
  roiAnchor = project.roiAnchor || 'center';
  section = project.section;

  if (project.display?.xyUnit in XY_UNITS) {
    xyDisplayUnit = project.display.xyUnit;
  }
  if (project.display?.structurePalette && STRUCTURE_PALETTES[project.display.structurePalette]) {
    activeStructurePalette = project.display.structurePalette;
  }
  customStructurePalette = Array.isArray(project.display?.customStructurePalette)
    ? project.display.customStructurePalette
    : null;
  threeOpacity = Math.max(0.1, Math.min(1, Number(project.display?.threeOpacity) || 1));
  threeShowBorders = Boolean(project.display?.threeShowBorders);
  $('threeOpacityRange').value = String(threeOpacity);
  $('threeOpacityValue').value = `${Math.round(threeOpacity * 100)}%`;
  $('threeBorders').checked = threeShowBorders;

  Object.assign(planViews.mask, project.planViews.mask);
  Object.assign(planViews.main, project.planViews.main);
  parsedLayout = null;
  history = [];
  future = [];
  baseRevertSnapshot = null;
}

function isValidSnapshotState(state) {
  try {
    validateProjectFile(state);
    return state.snapshots == null;
  } catch {
    return false;
  }
}

const snapshotManager = createSnapshotManager({
  capture: () => buildProjectSnapshot(false),
  restore: (state) => loadProjectSnapshot(state),
  validateState: isValidSnapshotState,
});

function renderSnapshots() {
  const host = $('snapshotList');
  const records = snapshotManager.list();
  $('snapshotCount').textContent = String(records.length);
  host.innerHTML = '';

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No snapshots';
    host.append(empty);
    return;
  }

  for (const record of records) {
    const row = document.createElement('div');
    row.className = 'snapshot-row';

    const name = document.createElement('input');
    name.className = 'snapshot-name';
    name.value = record.name;
    name.title = record.createdAt;
    name.onchange = () => {
      if (!snapshotManager.rename(record.id, name.value)) name.value = record.name;
      renderSnapshots();
    };

    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'snapshot-action';
    restoreButton.textContent = 'Restore';
    restoreButton.onclick = () => {
      if (!snapshotManager.restore(record.id)) {
        status('Snapshot restore failed validation.');
        return;
      }
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      fit3d();
      status(`Restored snapshot "${record.name}".`);
    };

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'snapshot-delete';
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete snapshot';
    deleteButton.onclick = () => {
      snapshotManager.remove(record.id);
      renderSnapshots();
      status(`Deleted snapshot "${record.name}".`);
    };

    row.append(name, restoreButton, deleteButton);
    host.append(row);
  }
}

function activateToolTab(tabName, focus = false) {
  const buttons = [...document.querySelectorAll('[data-tool-tab]')],
    panels = [...document.querySelectorAll('[data-tab-panel]')];

  for (const button of buttons) {
    const active = button.dataset.toolTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }

  for (const panel of panels) panel.hidden = panel.dataset.tabPanel !== tabName;
}

function bindToolTabs() {
  const buttons = [...document.querySelectorAll('[data-tool-tab]')];
  if (!buttons.length) return;

  buttons.forEach((button, index) => {
    button.onclick = () => activateToolTab(button.dataset.toolTab);
    button.onkeydown = (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = buttons.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      activateToolTab(buttons[nextIndex].dataset.toolTab, true);
    };
  });

  const initial =
    buttons.find((button) => button.classList.contains('active'))?.dataset.toolTab ||
    buttons[0].dataset.toolTab;
  activateToolTab(initial);
}

function bindUi() {
  bindToolTabs();
  document.querySelectorAll('#substrateShape button').forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll('#substrateShape button')
          .forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const circle = b.dataset.shape === 'circle';
        $('baseHeight').disabled = circle;
        if (circle) $('baseHeight').value = $('baseWidth').value;
      }),
  );
  $('baseWidth').oninput = () => {
    if (document.querySelector('#substrateShape button.active')?.dataset.shape === 'circle')
      $('baseHeight').value = $('baseWidth').value;
  };
  $('applyBaseBtn').onclick = () => {
    const shape = document.querySelector('#substrateShape button.active').dataset.shape,
      width = manualMicron($('baseWidth').value),
      height = shape === 'circle' ? width : manualMicron($('baseHeight').value),
      thickness = manualMicron($('baseThickness').value);
    if (width <= 0 || height <= 0 || thickness <= 0)
      return status('Base dimensions must be positive.');
    if (
      hasProcessEdits() &&
      !window.confirm(
        'Rebuilding the base will remove the current structure and all applied operations. You can undo this change afterwards. Continue?',
      )
    ) {
      syncBaseControls();
      return;
    }
    baseRevertSnapshot = stateSnapshot();
    saveHistory();
    model = createModel({ shape, width, height, thickness });
    section = { a: [-width * 0.42, 0], b: [width * 0.42, 0] };
    syncBaseControls();
    renderAll();
    fit3d();
    status('Base applied. Use Revert or Undo to restore the previous structure.');
  };
  $('revertBaseBtn').onclick = () => {
    if (!baseRevertSnapshot) return;
    const previous = baseRevertSnapshot;
    baseRevertSnapshot = null;
    future.push(stateSnapshot());
    if (history.length) history.pop();
    restoreSnapshot(previous);
    syncBaseControls();
    renderAll();
    fit3d();
    status('Reverted the last base change.');
  };

  $('sampleMaskSelect').onchange = async (event) => {
    const sample = sampleById(event.target.value);
    if (!sample) return;
    try {
      status(`Reading ${sample.label}…`);
      const response = await fetch(sample.path);
      if (!response.ok) throw new Error(`sample request failed (${response.status})`);
      await importLayoutBuffer(await response.arrayBuffer(), sample.path, sample.label);
    } catch (err) {
      console.error(err);
      status(`Layout import failed: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  };

  $('gdsInput').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      assertLayoutByteLength(f.size);
      status(`Reading ${f.name}…`);
      await importLayoutBuffer(await f.arrayBuffer(), f.name, f.name);
    } catch (err) {
      console.error(err);
      status(`Layout import failed: ${err.message}`);
    }
    e.target.value = '';
  };
  for (const id of ['maskOffsetX', 'maskOffsetY', 'maskScale', 'maskRotation'])
    $(id).oninput = () => {
      maskTransform = {
        x: manualMicron($('maskOffsetX').value || 0),
        y: manualMicron($('maskOffsetY').value || 0),
        scale: Math.max(1e-8, Number($('maskScale').value) || 1),
        rotation: Number($('maskRotation').value) || 0,
      };
      renderMask();
    };
  $('xyUnitSelect').onchange = () => {
    const oldUnit = xyUnit(),
      draftWidth = (Number($('baseWidth').value) || 0) * oldUnit.toMicron,
      draftHeight = (Number($('baseHeight').value) || 0) * oldUnit.toMicron,
      draftThickness = (Number($('baseThickness').value) || 0) * oldUnit.toMicron,
      draftOperation = (Number($('operationThickness').value) || 0) * oldUnit.toMicron;
    xyDisplayUnit = $('xyUnitSelect').value in XY_UNITS ? $('xyUnitSelect').value : 'um';
    $('baseWidth').value = formatLengthField(draftWidth);
    $('baseHeight').value = formatLengthField(draftHeight);
    $('baseThickness').value = formatLengthField(draftThickness);
    $('operationThickness').value = formatLengthField(draftOperation);
    $('baseWidthUnit').textContent = xyUnit().label;
    $('baseHeightUnit').textContent = xyUnit().label;
    $('baseThicknessUnit').textContent = xyUnit().label;
    $('operationThicknessUnit').textContent = xyUnit().label;
    syncTransformInputs();
    renderAll();
    status(`XYZ display/input unit: ${xyUnit().label}. Geometry is unchanged.`);
  };

  document.querySelectorAll('.roi-tool').forEach(
    (b) =>
      (b.onclick = () => {
        roiTool = b.dataset.tool;
        roiDraft = null;
        document
          .querySelectorAll('.roi-tool')
          .forEach((x) => x.classList.toggle('active', x === b));
        $('focusEditor').open = false;
        status('ROI: drag once in Mask to create the region.');
      }),
  );
  $('clearRoiBtn').onclick = () => {
    roi = null;
    roiAnchor = 'center';
    clearRoiDrawingMode();
    renderAll();
    status('ROI cleared.');
  };
  $('roiAnchorSelect').onchange = () => {
    roiAnchor = $('roiAnchorSelect').value;
    syncRoiEditor();
  };
  for (const id of [
    'roiWidth',
    'roiHeight',
    'roiRadius',
    'roiStartAngle',
    'roiEndAngle',
    'roiX',
    'roiY',
  ])
    $(id).onchange = applyRoiEditor;
  for (const id of ['maskOffsetX', 'maskOffsetY', 'maskScale', 'maskRotation'])
    $(id).addEventListener('change', syncTransformInputs);
  for (const id of ['baseWidth', 'baseHeight', 'baseThickness'])
    $(id).addEventListener('change', () => {
      const value = manualMicron($(id).value);
      if (Number.isFinite(value)) $(id).value = formatLengthField(value);
      if (
        id === 'baseWidth' &&
        document.querySelector('#substrateShape button.active')?.dataset.shape === 'circle'
      )
        $('baseHeight').value = $('baseWidth').value;
    });
  $('operationThickness').addEventListener('change', () => {
    const value = manualMicron($('operationThickness').value);
    if (Number.isFinite(value)) $('operationThickness').value = formatLengthField(value);
  });
  $('faceToggleBtn').onclick = () => {
    activeFace = activeFace === 'front' ? 'back' : 'front';
    renderAll();
  };

  $('operationType').onchange = updateOperationUI;
  $('growthMode').onchange = updateOperationUI;
  $('applyOperationBtn').onclick = applyOp;
  $('fit3dBtn').onclick = fit3d;
  $('mainExportSvgBtn').onclick = exportMainSvg;
  $('maskExportSvgBtn').onclick = exportMaskSvg;
  $('sectionExportSvgBtn').onclick = exportSectionSvg;
  $('threeExportModelBtn').onclick = async () => {
    try {
      const blob = await threeView?.exportGlb();
      if (!blob) throw new Error('3D export is unavailable.');
      downloadBlob(blob, 'wafercad-model.glb');
      status(`Exported ${roi ? 'ROI' : 'full'} 3D model as GLB (physical metres).`);
    } catch (error) {
      console.error(error);
      status(`3D model export failed: ${error.message}`);
    }
  };
  $('threeExportPngBtn').onclick = async () => {
    try {
      const blob = await threeView?.capturePng(3);
      if (!blob) throw new Error('3D screenshot is unavailable.');
      downloadBlob(blob, 'wafercad-3d-3x.png');
      status('Exported 3× high-resolution 3D PNG.');
    } catch (error) {
      console.error(error);
      status(`3D screenshot failed: ${error.message}`);
    }
  };
  document
    .querySelectorAll('.view-max-btn')
    .forEach((button) => (button.onclick = () => setMaximizedView(button.dataset.viewPanel)));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && maximizedPanelId) {
      event.preventDefault();
      setMaximizedView(maximizedPanelId);
    }
  });
  $('sectionScaleModeBtn').onclick = () => {
    sectionScaleMode = sectionScaleMode === 'auto' ? 'physical' : 'auto';
    renderSection();
    status(
      sectionScaleMode === 'auto'
        ? 'Section scale: Auto fit (X and Z independently).'
        : 'Section scale: physical 1:1 X:Z.',
    );
  };
  $('threeOpacityRange').oninput = () => {
    threeOpacity = Math.max(0.1, Math.min(1, Number($('threeOpacityRange').value) || 1));
    $('threeOpacityValue').value = `${Math.round(threeOpacity * 100)}%`;
    renderThree();
  };
  $('threeBorders').onchange = () => {
    threeShowBorders = $('threeBorders').checked;
    renderThree();
  };
  $('maskZoomOut').onclick = () => zoomPlanView('mask', $('maskCanvas'), 1 / 1.25);
  $('maskZoomIn').onclick = () => zoomPlanView('mask', $('maskCanvas'), 1.25);
  $('maskZoomFit').onclick = () => resetPlanView('mask');
  $('mainZoomOut').onclick = () =>
    zoomPlanView('main', $('mainCanvas'), 1 / 1.25, null, null, activeFace === 'back');
  $('mainZoomIn').onclick = () =>
    zoomPlanView('main', $('mainCanvas'), 1.25, null, null, activeFace === 'back');
  $('mainZoomFit').onclick = () => resetPlanView('main');
  $('sectionControlsBtn').onclick = () =>
    setSectionPanelVisible($('sectionCoordsPanel').hidden);
  $('sectionEditBtn').onclick = () => setSectionEditEnabled(!sectionEditEnabled);
  for (const id of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'])
    $(id).onchange = updateSectionFromInputs;

  $('undoBtn').onclick = () => {
    if (!history.length) return;
    future.push(stateSnapshot());
    restoreSnapshot(history.pop());
    baseRevertSnapshot = null;
    syncBaseControls();
    renderAll();
    status('Undid operation.');
  };
  $('redoBtn').onclick = () => {
    if (!future.length) return;
    history.push(stateSnapshot());
    restoreSnapshot(future.pop());
    baseRevertSnapshot = null;
    syncBaseControls();
    renderAll();
    status('Redid operation.');
  };
  $('resetSectionBtn').onclick = () => {
    sectionEditor?.cancel();
    section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] };
    renderMain();
    renderSection();
  };
  $('saveSnapshotBtn').onclick = () => {
    try {
      const saved = snapshotManager.create();
      renderSnapshots();
      status(`Saved snapshot "${saved.name}".`);
    } catch (err) {
      console.error(err);
      status(`Snapshot failed: ${err.message}`);
    }
  };

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
    } catch (err) {
      console.error(err);
      status(`Save failed: ${err.message}`);
    }
  };

  $('openProjectInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const project = await readProjectFile(file);
      loadProjectSnapshot(project);
      snapshotManager.importRecords(project.snapshots || []);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      fit3d();
      status(`Opened ${file.name}.`);
    } catch (err) {
      console.error(err);
      status(`Open failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  const mc = $('maskCanvas');
  let drag = null;
  mc.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomPlanView('mask', mc, e.deltaY < 0 ? 1.35 : 1 / 1.35, e.clientX, e.clientY);
    },
    { passive: false },
  );
  mc.addEventListener('pointermove', (e) => {
    const r = mc.getBoundingClientRect(),
      { w, h } = setupCanvas(mc),
      v = viewport(w, h, 'mask'),
      screen = [e.clientX - r.left, e.clientY - r.top],
      p = canvasToWorld(screen[0], screen[1], v);
    $('maskCoords').textContent = `x ${xyText(p[0])} · y ${xyText(p[1])}`;

    if (!drag) {
      if (roiTool) {
        mc.style.cursor = 'crosshair';
        return;
      }
      if (!roi) {
        mc.style.cursor = 'default';
        return;
      }
      const handles = Object.fromEntries(
        Object.entries(roiHandlePoints(roi)).map(([name, point]) => [
          name,
          worldToCanvas(point, v),
        ]),
      );
      const handle = nearestNamedPoint(screen, handles, e.pointerType === 'touch' ? 24 : 14);
      mc.style.cursor = handle
        ? roiResizeCursor(handle)
        : roiContainsPoint(roi, p)
          ? 'move'
          : 'default';
      return;
    }

    if (drag.mode === 'create') {
      roiDraft =
        roiTool === 'rect'
          ? normalizeRoi({ type: 'rect', a: drag.start, b: p })
          : normalizeRoi({
              type: roiTool === 'sector' ? 'sector' : 'circle',
              c: drag.start,
              r: Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]),
              ...(roiTool === 'sector' ? { startDeg: 0, endDeg: 90 } : {}),
            });
      renderMask();
      return;
    }

    if (drag.mode === 'resize') {
      roi = resizeRoiFromHandle(drag.original, drag.handle, [
        p[0] - drag.offset[0],
        p[1] - drag.offset[1],
      ]);
      syncRoiEditor();
      renderMask();
      return;
    }

    roi = translateRoi(drag.original, p[0] - drag.start[0], p[1] - drag.start[1]);
    syncRoiEditor();
    renderMask();
  });
  mc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = mc.getBoundingClientRect(),
      { w, h } = setupCanvas(mc),
      v = viewport(w, h, 'mask'),
      screen = [e.clientX - r.left, e.clientY - r.top],
      p = canvasToWorld(screen[0], screen[1], v);
    if (roiTool) {
      drag = { mode: 'create', start: p };
    } else if (roi) {
      const handles = Object.fromEntries(
        Object.entries(roiHandlePoints(roi)).map(([name, point]) => [
          name,
          worldToCanvas(point, v),
        ]),
      );
      const handle = nearestNamedPoint(screen, handles, e.pointerType === 'touch' ? 24 : 14);
      if (handle) {
        const corner = roiHandlePoints(roi)[handle];
        drag = {
          mode: 'resize',
          handle,
          start: p,
          original: structuredClone(roi),
          offset: [p[0] - corner[0], p[1] - corner[1]],
        };
      } else if (roiContainsPoint(roi, p))
        drag = { mode: 'move', start: p, original: structuredClone(roi) };
      else return;
    } else {
      return;
    }
    mc.setPointerCapture(e.pointerId);
  });
  const finishRoiDrag = (e) => {
    if (!drag) return;
    if (drag.mode === 'create' && roiDraft) {
      const next = normalizeRoi(roiDraft);
      const valid =
        next &&
        (next.type === 'circle' || next.type === 'sector'
          ? next.r > 1e-9
          : next.b[0] - next.a[0] > 1e-9 && next.b[1] - next.a[1] > 1e-9);
      if (valid) {
        roi = next;
        roiAnchor = 'center';
        clearRoiDrawingMode();
        status(
          'ROI created. Drag it to move, use corner handles to resize, or edit values from ROI.',
        );
      }
      roiDraft = null;
    }
    if (mc.hasPointerCapture(e.pointerId)) mc.releasePointerCapture(e.pointerId);
    drag = null;
    renderAll();
  };
  mc.addEventListener('pointerup', finishRoiDrag);
  mc.addEventListener('pointercancel', (e) => {
    if (drag?.original) roi = drag.original;
    syncRoiEditor();
    roiDraft = null;
    drag = null;
    if (mc.hasPointerCapture(e.pointerId)) mc.releasePointerCapture(e.pointerId);
    renderMask();
  });

  const main = $('mainCanvas');
  sectionEditor = createSectionEditor({
    canvas: main,
    host: $('sectionEndpointHandles'),
    getSection: () => section,
    getFrame: () => {
      const rect = main.getBoundingClientRect();
      const panel = $('mainPanel').getBoundingClientRect();
      const v = viewport(rect.width, rect.height, 'main');
      const back = activeFace === 'back';
      return {
        left: rect.left - panel.left - $('mainPanel').clientLeft,
        top: rect.top - panel.top - $('mainPanel').clientTop,
        width: rect.width,
        height: rect.height,
        toScreen: (point) => worldToCanvas(point, v, back),
        toWorld: (point) => canvasToWorld(point[0], point[1], v, back),
      };
    },
    onChange: (next) => {
      section = next;
      renderMain();
      renderSection();
    },
    onExit: () => setSectionEditEnabled(false),
  });
  main.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomPlanView(
        'main',
        main,
        e.deltaY < 0 ? 1.35 : 1 / 1.35,
        e.clientX,
        e.clientY,
        activeFace === 'back',
      );
    },
    { passive: false },
  );
  main.addEventListener('dblclick', (e) => {
    e.preventDefault();
    resetPlanView('main');
  });
  main.addEventListener('pointermove', (e) => {
    const r = main.getBoundingClientRect();
    const v = viewport(r.width, r.height, 'main');
    const p = canvasToWorld(e.clientX - r.left, e.clientY - r.top, v, activeFace === 'back');
    $('mainCoords').textContent = `x ${xyText(p[0])} · y ${xyText(p[1])}`;
  });
  const canvasResizeObserver = new ResizeObserver(() => {
    renderMain();
    renderMask();
    renderSection();
  });
  for (const id of ['mainCanvas', 'maskCanvas', 'sectionCanvas'])
    canvasResizeObserver.observe($(id));
  window.addEventListener('resize', () => renderAll());
}

populateSampleLayouts();
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
