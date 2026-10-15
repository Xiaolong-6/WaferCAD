// Main-only v2 presentation. Every visible control originates in M2 components.
import { readProjectFile } from '../project-io.js';
import { createMainRuntime } from './main-runtime.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { roiAnchorPoint } from '../roi-editor.js';
import { createFloatingEditorManager } from './view-kit/floating-editor.js';
import { createFloatingStrip } from './view-kit/floating-strip.js';
import { createInspectionFields } from './view-kit/inspection-fields.js';
import { mountToolPopover } from './view-kit/tool-popover.js';
import { modelInventoryCount } from './view-kit/model-inventory.js';

export async function createMainView({ project, sharedState, workstation, renderModel } = {}) {
  const { el, button, toolbar, panelHeader } = window.WaferCadV2Components;
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
    roiStrip,
    data,
    state,
    modelBefore,
    roiEditorDirty = false,
    message = 'Ready';
  const uiState = workstation?.uiState || {
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
  const units = createDisplayUnits(() => state);
  const { input, choice, pair } = createInspectionFields({ hook, units });
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
    `${state.model.layers.length} layers · ${modelInventoryCount(state.model)} · ${units.label()}`;
  const dimensionsLabel = () => {
    const { width, height } = state.model;
    return `${units.format(width)} × ${units.format(height)} ${units.label()}`;
  };
  function sync() {
    if (!state) return;
    syncDisplayUnitFields(document, units.key());
    const face = hooks.get('mainFaceBtn');
    if (face) {
      const back = state.activeFace === 'back';
      face.setAttribute('aria-label', back ? 'Back view' : 'Front view');
      face.querySelector('use').setAttribute('href', `#p-icon-${back ? 'faceBack' : 'faceFront'}`);
    }
    workstation?.changed('main');
    for (const key of ['pan', 'zoom', 'line']) {
      const action = document.querySelector(`#mainPanel [data-action="tool:${key}:main"]`);
      action?.setAttribute(
        'aria-pressed',
        String(key === 'line' ? state.sectionEditEnabled : state[`${key}Enabled`]),
      );
    }
    roiStrip?.update({
      open: uiState.roiOpen,
      selected: state.roiTool || (state.sectionEditEnabled ? 'line' : state.tool),
    });
    const canvas = root.getElementById('mainCanvas');
    canvas.dataset.tool = state.tool;
    const dimensions = hooks.get('mainCoords');
    if (dimensions) dimensions.textContent = dimensionsLabel();
    shell?.getSlot('view.main.readout')?.replaceChildren(caption());
    if (!workstation) shell?.getSlot('status.message')?.replaceChildren(message);
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
      if (hooks.has(id)) hooks.get(id).value = id.includes('Angle') ? value : units.format(value);
    for (const [id, value] of [
      ['roiX', point[0]],
      ['roiY', point[1]],
    ])
      if (hooks.has(id)) hooks.get(id).value = units.format(value);
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
    const shape = choice(
      'ROI shape',
      'roiShape',
      [
        ['rect', 'Rectangle'],
        ['square', 'Square'],
        ['sector', 'Sector'],
      ],
      state.roiShape,
      { hookId: 'roiShapeSelect' },
    );
    const anchor = choice(
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
      { hookId: 'roiAnchorSelect' },
    );
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
      pair(
        input('Start angle · °', 'roiStartAngle', 0, { kind: 'angle' }),
        input('End angle · °', 'roiEndAngle', 90, { kind: 'angle' }),
      ),
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
        workstation?.status(message);
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
          { class: 'v2-floating-editor-actions' },
          button('Clear ROI', 'clear-roi', 'close', { 'data-help': 'main.roi.clear' }),
          apply,
        ),
      ),
    });
  }
  function popover(content, trigger, onClose) {
    return mountToolPopover(overlays, {
      content,
      trigger,
      onClose,
      label: 'Main tools',
    });
  }
  function buildRoiTools() {
    const groups = [
      [['select', 'Select', 'select']],
      [
        ['line', 'Slice', 'line'],
        [null, 'Slice settings', null, 'M3 10l7-7 3 3-7 7H3Zm6-6 3 3'],
      ],
      [
        ['rect', 'Rectangle', 'rectangle'],
        ['square', 'Square', null, 'M3 3h10v10H3Z'],
        ['sector', 'Sector', null, 'M3 13V3a10 10 0 0 1 10 10Z'],
      ],
    ].map((group) =>
      group.map(([key, label, glyph, path]) => ({
        key,
        label,
        glyph,
        path,
        action: key ? `roi-tool:${key}` : 'slice-coordinates',
        helpKey: !key ? 'main.slice.settings' : key === 'line' ? 'main.slice' : 'main.roi',
      })),
    );
    roiStrip = createFloatingStrip({
      id: 'mainRoiTools',
      label: 'Main ROI tools',
      groups,
      settings: {
        label: 'ROI settings',
        action: 'settings:main',
        glyph: 'settings',
        helpKey: 'main.roi.settings',
      },
      toolAttribute: 'data-roi-tool',
      owner: () => document.querySelector('#mainPanel [data-action="roi"]'),
      onToolCreated: (key, node) => {
        if (key === 'line') hook('sectionControlsBtn', node);
      },
    });
    return roiStrip.node;
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
          { class: 'v2-floating-editor-actions' },
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
      hook(
        'mainZoomFit',
        button('', 'fit:main', 'fit', {
          title: 'Fit',
          'aria-label': 'Fit',
          'data-help': 'view.fit',
        }),
      ),
      hook(
        'mainPanBtn',
        button('', 'tool:pan:main', 'pan', {
          title: 'Pan',
          'aria-label': 'Pan',
          'data-help': 'view.pan',
          'aria-pressed': 'true',
        }),
      ),
      button('', 'tool:zoom:main', 'zoom', {
        title: 'Zoom',
        'aria-label': 'Zoom',
        'data-help': 'view.zoom',
        'aria-pressed': 'false',
      }),
    ];
    const tools = toolbar(
      'Main',
      [
        common,
        [
          hook(
            'mainFaceBtn',
            button('', 'face:main', 'faceFront', {
              title: 'Front view',
              'aria-label': 'Front view',
              'data-help': 'main.face',
            }),
          ),
          button('', 'roi', 'roi', {
            title: 'ROI',
            'aria-label': 'ROI',
            'aria-pressed': 'false',
            'data-help': 'main.roi',
          }),
        ],
        [
          button('', 'export-menu', 'export', {
            title: 'Export',
            'aria-label': 'Export',
            'data-help': 'view.export',
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
        'data-help': 'shell.maximize',
      }),
    );
    const stage = el(
      'div',
      { class: 'p-science v2-main-stage v2-plan-stage', 'data-v2-stage-host': '' },
      hook('mainCanvas', el('canvas', { 'aria-label': 'Main scientific plan', tabindex: 0 })),
      buildRoiTools(),
      hook('mainCoords', el('span', { class: 'p-scale' }, dimensionsLabel())),
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
    if (workstation) {
      workstation.render();
      runtime?.render();
      return;
    }
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
      if (workstation && !trigger.closest('#mainPanel, .v2-main-floating')) return;
      const action = trigger.dataset.action;
      if (action === 'fit:main') runtime.fit();
      else if (action === 'tool:pan:main') runtime.setPanEnabled(!state.panEnabled);
      else if (action === 'tool:zoom:main') runtime.setZoomEnabled(!state.zoomEnabled);
      else if (action === 'face:main') {
        state.activeFace = state.activeFace === 'back' ? 'front' : 'back';
        renderShell();
      } else if (action === 'roi') toggleRoiTools();
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
      else if (action === 'maximize:main' && !workstation) {
        uiState.maximize = uiState.maximize ? null : 'main';
        renderShell();
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
    const loaded =
      project ||
      (await (async () => {
        const response = await fetch('../examples/m3d-selfpowered-full-replay.wafercad');
        if (!response.ok) throw Error(`M3D source: HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== expectedHash) throw Error('M3D source no longer matches the M2 reference');
        return { data: await readProjectFile(new Blob([bytes])), hash };
      })());
    const hash = loaded.hash;
    data = loaded.data;
    state = sharedState || {
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
    const adapters = workstation?.adapters || window.WaferCadV2DomainAdapters.create();
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
    workstation?.mount(panel);
    const registry = window.WaferCadV2ShellRegistry.define({
      views: [{ key: 'main', label: 'Main', icon: 'main' }],
    });
    shell =
      workstation?.shell ||
      window.createWaferCadV2Workstation({
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
    overlays =
      workstation?.overlays ||
      createFloatingEditorManager(shell.overlays, { className: 'v2-main-floating' });
    if (!workstation)
      shell
        .getSlot('panel.project')
        .querySelector('[data-slot-content]')
        .append(panelHeader('Project', 'Not connected in this Main-only review'));
    renderShell();
    runtime = createMainRuntime({
      state,
      renderModel,
      root,
      onChange: sync,
      status: (value) => {
        message = value;
        workstation?.status(value);
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
    if (!workstation) document.body.dataset.ready = 'true';
    return {
      panel,
      state,
      runtime,
      sync,
      root,
      openSliceCoordinates,
      snapshot: window.WaferCadV2Main.snapshot,
    };
  } catch (error) {
    if (workstation) throw error;
    document.body.dataset.ready = 'error';
    document
      .getElementById('app-root')
      .replaceChildren(el('p', { role: 'alert' }, `Main unavailable: ${error.message}`));
    console.error(error);
  }
  function canvasWidth() {
    return root.getElementById('mainCanvas').getBoundingClientRect().width;
  }
}
if (!document.body.hasAttribute('data-workstation')) await createMainView();
