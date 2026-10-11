// Main-only v2 presentation. Every visible control originates in M2 components.
import { readProjectFile } from '../project-io.js';
import { createMainRuntime, formatMainPosition } from './main-runtime.js';
import { roiAnchorPoint } from '../roi-editor.js';
import { createMainOverlayManager } from './main-overlay-manager.js';

const { el, button, field, select, toolbar, panelHeader } = window.WaferCadV2Components;
const source = 'site/examples/m3d-selfpowered-full-replay.wafercad';
const expectedHash = '31f07d85c32d44685ef7f49485e432c2b73f713550dd981998376c61de46995b';
const hooks = new Map();
const hook = (id, node) => {
  node.id = id;
  hooks.set(id, node);
  return node;
};
const root = {
  getElementById: (id) => document.getElementById(id) || hooks.get(id),
  createElement: (...args) => document.createElement(...args),
  body: document.body,
  querySelectorAll: (...args) => document.querySelectorAll(...args),
  addEventListener: (...args) => document.addEventListener(...args),
};
let runtime,
  shell,
  overlays,
  data,
  state,
  modelBefore,
  roiEditorDirty = false,
  message = 'Ready';
const uiState = {
  layout: 'a',
  font: 'inter',
  domain: 'project',
  mode: 'single',
  view: 'main',
  section: false,
  maximize: null,
  roiOpen: false,
  mobile: 'view',
  splitViews: ['main', 'three'],
};
const input = (label, id, value = 0) => {
  const angle = id.includes('Angle');
  const node = field(label, id, value, { type: 'number', step: angle ? '0.001' : '0.0001' });
  const control = hook(id, node.querySelector('input'));
  if (!angle)
    control.addEventListener('change', () => {
      if (control.value !== '' && Number.isFinite(Number(control.value)))
        control.value = formatMainPosition(control.value);
    });
  return node;
};
const pair = (...children) => el('div', { class: 'v2-main-pair' }, children);
const slicePanel = hook(
  'sectionCoordsPanel',
  el(
    'div',
    { class: 'p-form', hidden: true },
    hook('sectionCoordUnit', el('span', { class: 'p-aux', hidden: true }, 'µm')),
    ...['A', 'B'].map((key) =>
      pair(input(`${key} X · µm`, `section${key}x`), input(`${key} Y · µm`, `section${key}y`)),
    ),
  ),
);
const caption = () =>
  `${state.model.layers.length} layers · ${state.model.regions.length} regions · µm`;
function sync() {
  if (!state) return;
  for (const key of ['pan', 'zoom', 'line']) {
    const action = document.querySelector(`#mainPanel [data-action="tool:${key}:main"]`);
    action?.setAttribute(
      'aria-pressed',
      String(key === 'line' ? state.sectionEditEnabled : state[`${key}Enabled`]),
    );
  }
  document
    .querySelector('#mainPanel [data-action="roi"]')
    ?.setAttribute('aria-pressed', String(uiState.roiOpen));
  const strip = document.getElementById('mainRoiTools');
  if (strip) strip.hidden = !uiState.roiOpen;
  for (const node of strip?.querySelectorAll('[data-roi-tool]') || []) {
    const selected = state.roiTool || (state.sectionEditEnabled ? 'line' : state.tool);
    node.setAttribute('aria-pressed', String(node.dataset.roiTool === selected));
  }
  if (hooks.has('sectionControlsBtn')) hooks.get('sectionControlsBtn').title = 'Slice';
  const canvas = root.getElementById('mainCanvas');
  canvas.dataset.tool = state.tool;
  shell?.getSlot('view.main.readout')?.replaceChildren(caption());
  shell?.getSlot('status.message')?.replaceChildren(message);
}
function displayLengths(roi) {
  if (!roi || roiEditorDirty) return;
  if (hooks.has('roiShapeSelect')) hooks.get('roiShapeSelect').value = state.roiShape;
  const point = roiAnchorPoint(roi, state.roiAnchor);
  const values =
    roi.type === 'rect'
      ? {
          roiX: (roi.a[0] + roi.b[0]) / 2,
          roiY: (roi.a[1] + roi.b[1]) / 2,
          roiWidth: roi.b[0] - roi.a[0],
          roiHeight: roi.b[1] - roi.a[1],
        }
      : {
          roiX: roi.c[0],
          roiY: roi.c[1],
          roiRadius: roi.r,
          roiStartAngle: roi.startDeg ?? 0,
          roiEndAngle: roi.endDeg ?? 90,
        };
  for (const [id, value] of Object.entries(values))
    if (hooks.has(id))
      hooks.get(id).value = id.includes('Angle') ? value : formatMainPosition(value);
  for (const [id, value] of [
    ['roiX', point[0]],
    ['roiY', point[1]],
  ])
    if (hooks.has(id)) hooks.get(id).value = formatMainPosition(value);
  updateRoiFields();
}
function updateRoiFields() {
  if (!hooks.has('roiShapeSelect')) return;
  const shape = hooks.get('roiShapeSelect').value;
  for (const id of ['roiWidth', 'roiHeight'])
    hooks.get(id).closest('label').hidden = !['rect', 'square'].includes(shape);
  hooks.get('roiHeight').disabled = shape === 'square';
  hooks.get('roiRadius').closest('label').hidden = shape !== 'sector';
  for (const id of ['roiStartAngle', 'roiEndAngle'])
    hooks.get(id).closest('label').hidden = shape !== 'sector';
}
function openRoiSettings(trigger) {
  if (overlays.hasFloating('mainRoiSettings')) {
    overlays.closeFloating('mainRoiSettings');
    return;
  }
  const shape = select(
    'ROI shape',
    'roiShape',
    [
      ['rect', 'Rectangle'],
      ['square', 'Square'],
      ['sector', 'Sector'],
    ],
    state.roiShape,
  );
  hook('roiShapeSelect', shape.querySelector('select'));
  const anchor = select(
    'Reference',
    'roiAnchor',
    [
      ['center', 'Center / origin'],
      ['top-left', 'Top-left'],
      ['bottom-left', 'Bottom-left'],
      ['top-right', 'Top-right'],
      ['bottom-right', 'Bottom-right'],
    ],
    state.roiAnchor,
  );
  hook('roiAnchorSelect', anchor.querySelector('select'));
  anchor.querySelector('select').onchange = () => {
    state.roiAnchor = anchor.querySelector('select').value;
    roiEditorDirty = false;
    runtime.roi.syncEditor();
  };
  const form = el(
    'div',
    { class: 'p-form' },
    shape,
    anchor,
    pair(input('X · µm', 'roiX'), input('Y · µm', 'roiY')),
    pair(input('Width · µm', 'roiWidth', 10), input('Height · µm', 'roiHeight', 5)),
    input('Radius · µm', 'roiRadius', 5),
    pair(input('Start angle · °', 'roiStartAngle'), input('End angle · °', 'roiEndAngle', 90)),
    el('span', { class: 'p-aux' }, 'Position and size precision · 0.1 nm'),
  );
  roiEditorDirty = false;
  form.addEventListener('input', () => {
    roiEditorDirty = true;
  });
  shape.querySelector('select').onchange = () => {
    roiEditorDirty = true;
    updateRoiFields();
  };
  updateRoiFields();
  displayLengths(state.roi);
  const apply = button('Apply', null, 'check', { primary: true });
  apply.onclick = () => {
    const selected = shape.querySelector('select').value;
    roiEditorDirty = false;
    const geometryType = selected === 'square' ? 'rect' : selected;
    state.roiShape = selected;
    if (!state.roi || state.roi.type !== geometryType) {
      runtime.setTool('roi');
      runtime.drawRoi(selected);
      message = 'Drag in Main to create the selected ROI shape.';
    } else {
      if (selected === 'square') hooks.get('roiHeight').value = hooks.get('roiWidth').value;
      runtime.roi.applyEditor();
    }
    runtime.render();
  };
  overlays.mountFloating({
    id: 'mainRoiSettings',
    trigger,
    title: 'Main ROI settings',
    onClose: () => {
      roiEditorDirty = false;
    },
    content: el(
      'div',
      { class: 'p-form' },
      form,
      el(
        'div',
        { class: 'v2-main-floating-actions' },
        button('Clear ROI', 'clear-roi', 'close'),
        apply,
      ),
    ),
  });
}
function popover(content, trigger, onClose) {
  const menu = trigger.closest('.p-overflow');
  if (menu) trigger = document.querySelector(`[popovertarget="${menu.id}"]`);
  const node = overlays.mount('popover', {
    content,
    trigger,
    onClose,
    label: 'Main tools',
    className: 'v2-main-tools',
  });
  const rect = trigger.getBoundingClientRect();
  node.style.inset = 'auto';
  node.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - node.offsetWidth - 8))}px`;
  node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - node.offsetHeight - 8))}px`;
  return node;
}
function buildRoiTools() {
  const glyphButton = (label, action, glyph, path) => {
    const node = button('', action, glyph, {
      title: label,
      'aria-label': label,
      'aria-pressed': 'false',
    });
    if (path) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('wc-icon');
      const shape = document.createElementNS(svg.namespaceURI, 'path');
      shape.setAttribute('d', path);
      svg.append(shape);
      node.append(svg);
    }
    return node;
  };
  const tool = (key, label, glyph, path) => {
    const node = glyphButton(label, `roi-tool:${key}`, glyph, path);
    node.dataset.roiTool = key;
    if (key === 'line') hook('sectionControlsBtn', node);
    return node;
  };
  const divider = () => el('span', { class: 'p-mask-tool-divider', 'aria-hidden': 'true' });
  return el(
    'div',
    { id: 'mainRoiTools', class: 'p-mask-controls', hidden: true },
    el(
      'div',
      { class: 'p-mask-tools', role: 'toolbar', 'aria-label': 'Main ROI tools' },
      tool('select', 'Select', 'select'),
      divider(),
      tool('line', 'Slice', 'line'),
      glyphButton('Slice settings', 'slice-coordinates', null, 'M3 10l7-7 3 3-7 7H3Zm6-6 3 3'),
      divider(),
      tool('rect', 'Rectangle', 'rectangle'),
      tool('square', 'Square', null, 'M3 3h10v10H3Z'),
      tool('sector', 'Sector', null, 'M3 13V3a10 10 0 0 1 10 10Z'),
      glyphButton('ROI settings', 'settings:main', 'settings'),
    ),
  );
}
function toggleRoiTools() {
  uiState.roiOpen = !uiState.roiOpen;
  if (!uiState.roiOpen) overlays.closeFloatings();
  if (uiState.roiOpen) runtime.setTool('select');
  else if (['select', 'roi', 'line'].includes(state.tool)) runtime.setTool('none');
  sync();
}
function chooseRoiTool(key) {
  runtime.setTool(key === 'line' || key === 'select' ? key : 'roi');
  if (key === 'line') runtime.slice.setCreateMode(true);
  else if (key !== 'select') runtime.drawRoi(key);
  sync();
}
function openSliceCoordinates(trigger) {
  if (overlays.hasFloating('mainSliceSettings')) {
    overlays.closeFloating('mainSliceSettings');
    return;
  }
  runtime.setTool('select');
  runtime.slice.setPanelVisible(true, { create: false, claim: false });
  const done = button('Done', null, null);
  done.onclick = () => overlays.closeFloating('mainSliceSettings');
  overlays.mountFloating({
    id: 'mainSliceSettings',
    title: 'Section line',
    width: 260,
    trigger,
    content: el(
      'div',
      {},
      slicePanel,
      el(
        'div',
        { class: 'v2-main-floating-actions' },
        el('span', { class: 'p-aux' }, 'Precision · 0.1 nm'),
        done,
      ),
    ),
    onClose: () => runtime.slice.setPanelVisible(false, { create: false, claim: false }),
  });
}
function openExport(trigger) {
  popover(
    el(
      'div',
      { class: 'p-form' },
      button('SVG', 'export:main:svg', 'export'),
      button('PNG (deferred)', null, 'export', {
        disabled: true,
        title: 'PNG is deferred in this Main-only review (approved 13b)',
      }),
    ),
    trigger,
  );
}
function buildMain() {
  const common = [
    hook('mainZoomFit', button('', 'fit:main', 'fit', { title: 'Fit', 'aria-label': 'Fit' })),
    hook(
      'mainPanBtn',
      button('', 'tool:pan:main', 'pan', {
        title: 'Pan',
        'aria-label': 'Pan',
        'aria-pressed': 'true',
      }),
    ),
    button('', 'tool:zoom:main', 'zoom', {
      title: 'Zoom',
      'aria-label': 'Zoom',
      'aria-pressed': 'false',
    }),
  ];
  const tools = toolbar(
    'Main',
    [
      common,
      [button('', 'roi', 'roi', { title: 'ROI', 'aria-label': 'ROI', 'aria-pressed': 'false' })],
      [
        button('', 'export-menu', 'export', {
          title: 'Export',
          'aria-label': 'Export',
          'aria-haspopup': 'menu',
        }),
      ],
    ],
    [],
  );
  tools.append(
    button('', 'maximize:main', 'maximize', {
      title: 'Maximize view',
      'aria-label': 'Main maximize',
    }),
  );
  const stage = el(
    'div',
    { class: 'p-science v2-main-stage', 'data-v2-stage-host': '' },
    hook('mainCanvas', el('canvas', { 'aria-label': 'Main scientific plan', tabindex: 0 })),
    buildRoiTools(),
    hook(
      'mainCoords',
      el('span', { class: 'p-scale' }, `${state.model.width} × ${state.model.height} µm`),
    ),
  );
  const views = window.createWaferCadV2ViewPanels();
  const panel = views.update(
    'main',
    {
      class: 'p-view v2-main-view',
      id: 'mainPanel',
      'data-view': 'main',
      'aria-label': 'Main view',
    },
    el('header', {}, el('strong', {}, 'Main'), tools),
    stage,
    el('div', {}, caption()),
  );
  panel.append(
    hook(
      'sectionEndpointHandles',
      el(
        'div',
        {},
        ...['a', 'b'].map((key) =>
          button(key.toUpperCase(), null, null, {
            'data-endpoint': key,
            'aria-label': `Slice endpoint ${key.toUpperCase()}`,
          }),
        ),
      ),
    ),
  );
  return panel;
}
function renderShell() {
  shell.render();
  document
    .querySelectorAll('.p-nav [data-action^="domain:"], .p-viewbar [data-action]')
    .forEach((node) => {
      if (!['view:main', 'mode:single', 'expand-empty'].includes(node.dataset.action))
        node.disabled = true;
    });
  runtime?.render();
}
function bindUi() {
  for (const id of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'])
    hooks.get(id).onchange = () => runtime.slice.updateFromInputs();
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    if (action === 'fit:main') runtime.fit();
    else if (action === 'tool:pan:main') runtime.setPanEnabled(!state.panEnabled);
    else if (action === 'tool:zoom:main') runtime.setZoomEnabled(!state.zoomEnabled);
    else if (action === 'roi') toggleRoiTools();
    else if (action.startsWith('roi-tool:')) chooseRoiTool(action.split(':')[1]);
    else if (action === 'export-menu') openExport(trigger);
    else if (action === 'settings:main') openRoiSettings(trigger);
    else if (action === 'slice-coordinates') openSliceCoordinates(trigger);
    else if (action === 'clear-roi') {
      state.roi = null;
      state.roiAnchor = 'center';
      runtime.roi.clearDrawingMode();
      overlays.closeFloating('mainRoiSettings');
      runtime.render();
    } else if (action === 'close-popover') overlays.close('popover');
    else if (action === 'maximize:main') {
      uiState.maximize = uiState.maximize ? null : 'main';
      renderShell();
      trigger.title = uiState.maximize ? 'Restore view' : 'Maximize view';
      trigger.setAttribute('aria-label', uiState.maximize ? 'Main restore' : 'Main maximize');
    } else if (action === 'hide-editor' || action === 'return-results') {
      uiState.editorHidden = true;
      uiState.mobile = 'view';
      renderShell();
    } else if (action === 'expand-empty' || action === 'show-editor') {
      uiState.editorHidden = false;
      uiState.mobile = 'edit';
      renderShell();
    } else if (action === 'export:main:svg') {
      runtime.exportMainSvg();
      overlays.close('popover');
    }
    sync();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open], :popover-open')) {
      if (event.defaultPrevented) return;
      runtime.setZoomEnabled(false);
      runtime.setTool(uiState.roiOpen ? 'select' : 'none');
    }
  });
}
try {
  window.WaferCadV2Icons.installSprite();
  const response = await fetch('../examples/m3d-selfpowered-full-replay.wafercad');
  if (!response.ok) throw Error(`M3D source: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== expectedHash) throw Error('M3D source no longer matches the M2 reference');
  data = await readProjectFile(new Blob([bytes]));
  state = {
    model: data.model,
    activeFace: 'front',
    section: structuredClone(data.section),
    roi: null,
    roiDraft: null,
    roiTool: null,
    roiShape: 'rect',
    roiAnchor: 'center',
    sectionEditEnabled: false,
    tool: 'none',
    panEnabled: true,
    zoomEnabled: false,
    planViews: { main: { zoom: 1, panX: 0, panY: 0 } },
  };
  modelBefore = JSON.stringify(state.model);
  const adapters = window.WaferCadV2DomainAdapters.create();
  const panel = buildMain();
  adapters.register('view.main', {
    mount: (host) => {
      host.append(panel);
      return panel;
    },
    onShow() {},
    onHide() {},
    destroy() {},
  });
  const registry = window.WaferCadV2ShellRegistry.define({
    views: [{ key: 'main', label: 'Main', icon: 'main' }],
  });
  shell = window.createWaferCadV2Workstation({
    root: document.getElementById('app-root'),
    state: uiState,
    adapters,
    registry,
    getProjectName: () => data.name,
    presentation: () => ({
      selectedPanel: 'project',
      selectedNavigation: 'project',
      editorHidden: uiState.editorHidden,
      message,
      save: 'Main-only review',
    }),
  });
  overlays = createMainOverlayManager(shell.overlays);
  shell
    .getSlot('panel.project')
    .querySelector('[data-slot-content]')
    .append(panelHeader('Project', 'Not connected in this Main-only review'));
  renderShell();
  runtime = createMainRuntime({
    state,
    root,
    onChange: sync,
    status: (value) => {
      message = value;
      sync();
    },
    onRoiSync: displayLengths,
    claimPopover: () => {},
  });
  bindUi();
  window.WaferCadV2Main = {
    ready: true,
    snapshot: () =>
      structuredClone({
        source,
        hash,
        caption: caption(),
        tool: state.tool,
        panEnabled: state.panEnabled,
        zoomEnabled: state.zoomEnabled,
        roiOpen: uiState.roiOpen,
        roi: state.roi,
        roiShape: state.roiShape,
        section: state.section,
        plan: state.planViews.main,
        scientificUnchanged: modelBefore === JSON.stringify(state.model),
      }),
    projection: () =>
      runtime.plan.viewport(
        canvasWidth(),
        root.getElementById('mainCanvas').getBoundingClientRect().height,
        'main',
      ),
  };
  document.body.dataset.ready = 'true';
} catch (error) {
  document.body.dataset.ready = 'error';
  document
    .getElementById('app-root')
    .replaceChildren(el('p', { role: 'alert' }, `Main unavailable: ${error.message}`));
  console.error(error);
}
function canvasWidth() {
  return root.getElementById('mainCanvas').getBoundingClientRect().width;
}
