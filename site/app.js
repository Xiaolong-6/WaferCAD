import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeDemoLayout } from './gds.js';
import { parseLayoutFile } from './layout-io.js';
import {
  applyOperation,
  cloneModel,
  createModel,
  fullFaceGeometry,
  layerById,
  modelBoundsZ,
  recolorLayer,
  renameLayer,
  surfacePatches,
  surfaceSegment,
  surfaceZ,
} from './model.js';
import {
  bufferPolyline,
  circleMulti,
  difference,
  intersection,
  isEmpty,
  lineIntervalsInMulti,
  rectMulti,
  transformMulti,
  unionGeometries,
} from './vector-geometry.js';
import { downloadProject, readProjectFile } from './project-io.js';
import { validateProjectFile } from './project-schema.js';
import { formatXY as formatXYValue, fromMicron, toMicron, unitMeta, XY_UNITS } from './units.js';
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
  roiDraft = null;
let section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
  history = [],
  future = [],
  baseRevertSnapshot = null;
const planViews = { mask: { zoom: 1, panX: 0, panY: 0 }, main: { zoom: 1, panX: 0, panY: 0 } };

function status(msg) {
  $('statusText').textContent = msg;
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
    host.title = commit;
  } catch {
    host.textContent = 'commit local';
    host.removeAttribute('title');
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
  syncTransformInputs();
}
function syncTransformInputs() {
  $('maskOffsetX').value = formatXY(maskTransform.x);
  $('maskOffsetY').value = formatXY(maskTransform.y);
  $('maskOffsetXUnit').textContent = xyUnit().label;
  $('maskOffsetYUnit').textContent = xyUnit().label;
  $('maskScale').value = maskTransform.scale.toPrecision(5);
  $('maskRotation').value = maskTransform.rotation;
}
function setActiveCell(name) {
  activeCell = name || null;
  scopeCacheCell = null;
  renderCellTree();
  renderMaskList();
  renderMask();
  $('maskCellLabel').textContent = activeCell || '—';
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
  const selected = layers.filter((item) => selectedLayerKeys.has(item.key));
  $('maskSelectionSummary').textContent = !activeCell
    ? 'No cell selected'
    : selected.length === 1
      ? `Cell: ${activeCell} · Layer: ${selected[0].layer}/${selected[0].datatype}`
      : selected.length
        ? `Cell: ${activeCell} · ${selected.length} layers selected`
        : `Cell: ${activeCell} · no layer selected`;
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
  state.zoom = Math.max(0.3, Math.min(12, state.zoom * factor));
  const after = viewport(w, h, kind),
    mapped = worldToCanvas(anchor, after, back);
  state.panX += px - mapped[0];
  state.panY += py - mapped[1];
  kind === 'mask' ? renderMask() : renderMain();
}
function niceStep(range) {
  const raw = Math.max(1e-9, range / 6),
    p = 10 ** Math.floor(Math.log10(raw)),
    n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
function drawPlanAxes(ctx, v, w, h, back = false) {
  const left = 28,
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
  const xs = niceStep(dxmax - dxmin),
    ys = niceStep(dymax - dymin);
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
    ctx.fillText(Math.abs(xd) < 1e-12 ? '0' : formatXY(x), p[0], bottom + 1);
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
  }
  ctx.fill();
  ctx.stroke();
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
  ctx.clearRect(0, 0, w, h);
  drawBaseOutline(ctx, v);
  const patches = surfacePatches(model, activeFace);
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
    ctx.fillStyle = '#cc5062';
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 9px system-ui';
    ctx.fillText(label, p[0] + 6, p[1] - 6);
  }
  drawPlanAxes(ctx, v, w, h, back);
}
function renderSection() {
  const c = $('sectionCanvas'),
    { ctx, w, h } = setupCanvas(c);
  ctx.clearRect(0, 0, w, h);
  const [lo, hi] = modelBoundsZ(model),
    pad = Math.max(1.5, (hi - lo) * 0.08),
    z0 = lo - pad,
    z1 = hi + pad,
    left = 27,
    right = 10,
    top = 10,
    bottom = 22,
    iw = w - left - right,
    ih = h - top - bottom;
  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, w, h);
  for (const region of model.regions) {
    const intervals = lineIntervalsInMulti(section.a, section.b, region.geom);
    for (const [t0, t1] of intervals)
      for (const seg of region.stack) {
        const layer = layerById(model, seg.layerId);
        if (!layer) continue;
        const x0 = left + t0 * iw,
          x1 = left + t1 * iw,
          yy0 = top + ((z1 - seg.z1) / (z1 - z0)) * ih,
          yy1 = top + ((z1 - seg.z0) / (z1 - z0)) * ih;
        ctx.fillStyle = layer.color;
        ctx.fillRect(x0, yy0, Math.max(0.7, x1 - x0), yy1 - yy0);
        ctx.strokeStyle = 'rgba(40,50,60,.18)';
        ctx.lineWidth = 0.55;
        ctx.strokeRect(x0, yy0, Math.max(0.7, x1 - x0), yy1 - yy0);
      }
  }
  ctx.strokeStyle = '#8995a1';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(left, top, iw, ih);
  ctx.fillStyle = '#707b86';
  ctx.font = '8px system-ui';
  ctx.fillText(z1.toFixed(1), 3, top + 7);
  ctx.fillText(z0.toFixed(1), 3, top + ih);
  ctx.fillText('A', left, top + ih + 15);
  ctx.fillText('B', left + iw - 7, top + ih + 15);
  $('sectionMeta').textContent =
    `${xyText(Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]))} span`;
  $('sectionRange').textContent = `Z (relative) ${lo.toFixed(1)} → ${hi.toFixed(1)}`;
}

let renderer,
  scene,
  camera,
  controls,
  group,
  axesHelper,
  threeReady = false,
  threeOpacity = 1,
  threeShowBorders = false;
function zVisualScale() {
  return Math.max(model.width, model.height) / 100;
}
function initThree() {
  const host = $('threeHost');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xf5f7f9);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 1, 1e9);
  camera.up.set(0, 0, 1);
  camera.position.set(115, -125, 95);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8794, 2.25));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(80, -70, 130);
  scene.add(d);
  group = new THREE.Group();
  scene.add(group);
  axesHelper = new THREE.AxesHelper(12);
  scene.add(axesHelper);
  host.prepend(renderer.domElement);
  new ResizeObserver(() => resizeThree()).observe(host);
  threeReady = true;
  resizeThree();
  animate();
}
function resizeThree() {
  if (!renderer) return;
  const r = $('threeHost').getBoundingClientRect();
  renderer.setSize(Math.max(2, r.width), Math.max(2, r.height), false);
  camera.aspect = Math.max(2, r.width) / Math.max(2, r.height);
  camera.updateProjectionMatrix();
}
function disposeGroup() {
  while (group.children.length) {
    const o = group.children.pop();
    o.geometry?.dispose();
    o.material?.dispose();
  }
}
function shapeFromPolygon(poly) {
  if (!poly?.length) return null;
  const outer = poly[0].slice(0, -1);
  if (outer.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
  shape.closePath();
  for (let r = 1; r < poly.length; r++) {
    const pts = poly[r].slice(0, -1);
    if (pts.length < 3) continue;
    const hole = new THREE.Path();
    hole.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) hole.lineTo(pts[i][0], pts[i][1]);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}
function renderThree() {
  if (!threeReady) return;
  disposeGroup();
  group.scale.z = zVisualScale();
  const clip = roiGeometry(),
    groups = new Map();
  for (const region of model.regions) {
    const geom = clip ? intersection(region.geom, clip) : region.geom;
    if (isEmpty(geom)) continue;
    for (const seg of region.stack) {
      const key = `${seg.layerId}|${seg.z0.toFixed(8)}|${seg.z1.toFixed(8)}`;
      if (!groups.has(key))
        groups.set(key, { layerId: seg.layerId, z0: seg.z0, z1: seg.z1, polys: [] });
      groups.get(key).polys.push(...geom);
    }
  }
  for (const item of groups.values()) {
    const shapes = item.polys.map(shapeFromPolygon).filter(Boolean);
    if (!shapes.length) continue;
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: item.z1 - item.z0,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 2,
    });
    geometry.translate(0, 0, item.z0);
    const layer = layerById(model, item.layerId),
      material = new THREE.MeshStandardMaterial({
        color: layer?.color || '#999',
        roughness: 0.78,
        metalness: 0.015,
        side: THREE.DoubleSide,
        transparent: threeOpacity < 0.999,
        opacity: threeOpacity,
        depthWrite: threeOpacity >= 0.999,
      });
    group.add(new THREE.Mesh(geometry, material));
    if (threeShowBorders) {
      const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x111820,
        transparent: true,
        opacity: 0.9,
      });
      group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
    }
  }
  $('threeStats').textContent = roi ? 'focus region' : 'full model';
}
function animate() {
  requestAnimationFrame(animate);
  if (renderer) {
    controls.update();
    renderer.render(scene, camera);
  }
}
function fit3d() {
  const [lo, hi] = modelBoundsZ(model),
    zs = zVisualScale(),
    zSpan = (hi - lo) * zs,
    size = Math.max(model.width, model.height, zSpan);
  camera.near = Math.max(0.1, size / 10000);
  camera.far = Math.max(1e6, size * 50);
  camera.updateProjectionMatrix();
  camera.position.set(size * 1.05, -size * 1.15, size * 0.82);
  controls.target.set(0, 0, ((lo + hi) / 2) * zs);
  controls.update();
  axesHelper.scale.setScalar(Math.max(0.6, size / 100));
}

function renderAll() {
  renderCellTree();
  renderMaskList();
  renderLayerLegend();
  renderMask();
  renderMain();
  renderSection();
  renderThree();
  $('mainFaceLabel').textContent = `${activeFace} surface`;
  $('activeFacePill').textContent = activeFace[0].toUpperCase() + activeFace.slice(1);
  $('maskSummary').textContent = layout.name || 'No mask';
  $('maskCellLabel').textContent = activeCell || '—';
  $('baseSummary').textContent =
    `${formatXY(model.width)} × ${formatXY(model.height)} ${xyUnit().label} · Z ${Number(model.thickness.toFixed(2))} rel.`;
  syncUndo();
}
function syncBaseControls() {
  $('baseWidth').value = formatXY(model.width);
  $('baseHeight').value = formatXY(model.height);
  $('baseThickness').value = Number(model.thickness.toFixed(3));
  $('baseHeight').disabled = model.shape === 'circle';
  $('baseWidthUnit').textContent = xyUnit().label;
  $('baseHeightUnit').textContent = xyUnit().label;
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
    thickness = Number($('operationThickness').value);
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
    $('layerName').value = `Layer ${model.layers.length}`;
  }
  renderAll();
  status(
    `${type === 'etch' ? 'Etched' : type === 'grow' ? `Grew ${layerById(model, targetLayerId)?.name || 'layer'}` : `Added ${name}`} on the ${activeFace}.`,
  );
}

function buildProjectSnapshot(includeSnapshots = false) {
  ensureHierarchy();
  const project = {
    format: 'WaferCAD-vector',
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
    section,
    planViews,
    display: {
      xyUnit: xyDisplayUnit,
      structurePalette: activeStructurePalette,
      customStructurePalette,
    },
  };
  if (includeSnapshots) project.snapshots = snapshotManager.exportRecords();
  return project;
}

function loadProjectSnapshot(project) {
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
  roi = project.roi;
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
      width = xyFromDisplay(Number($('baseWidth').value)),
      height = shape === 'circle' ? width : xyFromDisplay(Number($('baseHeight').value)),
      thickness = Number($('baseThickness').value);
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

  $('demoMaskBtn').onclick = () => {
    parsedLayout = null;
    layout = makeDemoLayout();
    activeCell = layout.root || 'TOP';
    expandedCells = new Set([activeCell]);
    hoveredLayerKey = null;
    selectedLayerKeys = new Set(globalLayers().map((x) => x.key));
    maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    resetPlanView('mask');
    syncTransformInputs();
    renderAll();
    status('Demo mask loaded.');
  };
  $('gdsInput').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      status(`Reading ${f.name}…`);
      const imported = await parseLayoutFile(await f.arrayBuffer(), f.name);
      parsedLayout = imported.parsed;
      layout = imported.layout;
      layout.hierarchy = hierarchyFromParsed(parsedLayout);
      activeCell = parsedLayout.root;
      expandedCells = new Set([activeCell]);
      hoveredLayerKey = null;
      selectedLayerKeys = new Set(globalLayers().map((x) => x.key));
      fitImportedLayout();
      planViews.mask = { zoom: 1, panX: 0, panY: 0 };
      renderAll();
      status(
        `${f.name} (${imported.format}): XY imported in ${layout.units?.xy || 'µm'} at native scale; ${layout.elements.length} area objects; ${layout.linework.length} zero-width line objects ignored for operations.`,
      );
    } catch (err) {
      console.error(err);
      status(`Layout import failed: ${err.message}`);
    }
    e.target.value = '';
  };
  for (const id of ['maskOffsetX', 'maskOffsetY', 'maskScale', 'maskRotation'])
    $(id).oninput = () => {
      maskTransform = {
        x: xyFromDisplay(Number($('maskOffsetX').value) || 0),
        y: xyFromDisplay(Number($('maskOffsetY').value) || 0),
        scale: Math.max(1e-8, Number($('maskScale').value) || 1),
        rotation: Number($('maskRotation').value) || 0,
      };
      renderMask();
    };
  $('xyUnitSelect').onchange = () => {
    const oldUnit = xyUnit(),
      draftWidth = (Number($('baseWidth').value) || 0) * oldUnit.toMicron,
      draftHeight = (Number($('baseHeight').value) || 0) * oldUnit.toMicron;
    xyDisplayUnit = $('xyUnitSelect').value in XY_UNITS ? $('xyUnitSelect').value : 'um';
    $('baseWidth').value = formatXY(draftWidth);
    $('baseHeight').value = formatXY(draftHeight);
    $('baseWidthUnit').textContent = xyUnit().label;
    $('baseHeightUnit').textContent = xyUnit().label;
    syncTransformInputs();
    renderAll();
    status(`XY display unit: ${xyUnit().label}. Geometry is unchanged.`);
  };

  document.querySelectorAll('.roi-tool').forEach(
    (b) =>
      (b.onclick = () => {
        roiTool = b.dataset.tool;
        roiDraft = null;
        document
          .querySelectorAll('.roi-tool')
          .forEach((x) => x.classList.toggle('active', x === b));
        status('3D focus: drag in Mask to draw the render region.');
      }),
  );
  $('clearRoiBtn').onclick = () => {
    roi = null;
    roiDraft = null;
    roiTool = null;
    document.querySelectorAll('.roi-tool').forEach((x) => x.classList.remove('active'));
    renderAll();
  };
  document.querySelectorAll('#faceSelect button').forEach(
    (b) =>
      (b.onclick = () => {
        activeFace = b.dataset.face;
        document
          .querySelectorAll('#faceSelect button')
          .forEach((x) => x.classList.toggle('active', x === b));
        renderAll();
      }),
  );

  $('operationType').onchange = updateOperationUI;
  $('growthMode').onchange = updateOperationUI;
  $('applyOperationBtn').onclick = applyOp;
  $('fit3dBtn').onclick = fit3d;
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
    section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] };
    renderMain();
    renderSection();
  };
  $('saveSnapshotBtn').onclick = () => {
    const saved = snapshotManager.create();
    renderSnapshots();
    status(`Saved snapshot "${saved.name}".`);
  };

  $('newProjectBtn').onclick = () => {
    model = createModel();
    layout = emptyLayout();
    selectedLayerKeys = new Set();
    activeCell = null;
    expandedCells = new Set();
    hoveredLayerKey = null;
    roi = null;
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
      zoomPlanView('mask', mc, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    },
    { passive: false },
  );
  mc.addEventListener('pointermove', (e) => {
    const r = mc.getBoundingClientRect(),
      { w, h } = setupCanvas(mc),
      v = viewport(w, h, 'mask'),
      p = canvasToWorld(e.clientX - r.left, e.clientY - r.top, v);
    $('maskCoords').textContent = `x ${xyText(p[0])} · y ${xyText(p[1])}`;
    if (drag && roiTool) {
      roiDraft =
        roiTool === 'rect'
          ? { type: 'rect', a: drag, b: p }
          : { type: 'circle', c: drag, r: Math.hypot(p[0] - drag[0], p[1] - drag[1]) };
      renderMask();
    }
  });
  mc.addEventListener('pointerdown', (e) => {
    if (!roiTool) return;
    const r = mc.getBoundingClientRect(),
      { w, h } = setupCanvas(mc),
      v = viewport(w, h, 'mask');
    drag = canvasToWorld(e.clientX - r.left, e.clientY - r.top, v);
    mc.setPointerCapture(e.pointerId);
  });
  mc.addEventListener('pointerup', () => {
    if (roiDraft) {
      roi = roiDraft;
      roiDraft = null;
      renderAll();
    }
    drag = null;
  });

  const main = $('mainCanvas');
  let secDrag = false;
  main.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomPlanView(
        'main',
        main,
        e.deltaY < 0 ? 1.15 : 1 / 1.15,
        e.clientX,
        e.clientY,
        activeFace === 'back',
      );
    },
    { passive: false },
  );
  main.addEventListener('pointerdown', (e) => {
    const r = main.getBoundingClientRect(),
      { w, h } = setupCanvas(main),
      v = viewport(w, h, 'main'),
      p = canvasToWorld(e.clientX - r.left, e.clientY - r.top, v, activeFace === 'back');
    section = { a: p, b: p };
    secDrag = true;
    main.setPointerCapture(e.pointerId);
    renderMain();
    renderSection();
  });
  main.addEventListener('pointermove', (e) => {
    const r = main.getBoundingClientRect(),
      { w, h } = setupCanvas(main),
      v = viewport(w, h, 'main'),
      p = canvasToWorld(e.clientX - r.left, e.clientY - r.top, v, activeFace === 'back');
    $('mainCoords').textContent = `x ${xyText(p[0])} · y ${xyText(p[1])}`;
    if (!secDrag) return;
    section.b = p;
    renderMain();
    renderSection();
  });
  main.addEventListener('pointerup', () => (secDrag = false));
  window.addEventListener('resize', () => renderAll());
}

bindUi();
loadBuildCommit();
renderSnapshots();
initThree();
syncBaseControls();
updateOperationUI();
syncTransformInputs();
renderAll();
fit3d();
status('Ready. Create a base or import a GDS file.');
