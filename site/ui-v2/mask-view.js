// Mask v2 presentation/config only. The existing controllers own shape/ROI operations.
import { readProjectFile } from '../project-io.js';
import { createMaskRuntime } from './mask-runtime.js';
import { createFloatingStrip } from './view-kit/floating-strip.js';
import { createFloatingEditorManager } from './view-kit/floating-editor.js';
import { createInspectionFields } from './view-kit/inspection-fields.js';
import { createDialogConfirmation } from './view-kit/confirmation-dialog.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { mountToolPopover } from './view-kit/tool-popover.js';
import { createEmptyHint, isEmptyActiveMask } from './view-kit/empty-state.js';
import { maskRoiAnchorPoint } from '../mask-roi-geometry.js';

export async function createMaskView({ project, sharedState, workstation } = {}) {
  const { el, button, toolbar, panelHeader } = window.WaferCadV2Components;
  const hooks = new Map();
  const hook = (id, node) => {
    node.id = id;
    hooks.set(id, node);
    return node;
  };
  const root = {
    getElementById: (id) => document.getElementById(id) || hooks.get(id),
    createElement: (...args) => document.createElement(...args),
    querySelectorAll: (...args) => document.querySelectorAll(...args),
    get activeElement() {
      return document.activeElement;
    },
    body: document.body,
  };
  const units = createDisplayUnits(() => state);
  const { input, choice, pair, textarea } = createInspectionFields({ hook, units });
  const source = 'site/examples/m3d-selfpowered-full-replay.wafercad';
  const expectedHash = '473c1ed296d417db6f9ba1e49eb56cc955efb8ad3257063c65ed81aada8bea0e';
  let state,
    shell,
    overlays,
    runtime,
    strip,
    roiStrip,
    roiOpen = false,
    message = 'Ready',
    modelBefore,
    editorShapeId;
  const uiState = workstation?.uiState || {
    layout: 'a',
    font: 'inter',
    domain: 'project',
    mode: 'single',
    view: 'mask',
    section: false,
    mobile: 'view',
    splitViews: ['main', 'three'],
    maximize: null,
  };
  const emptyHint = createEmptyHint({
    label: 'Empty mask',
    parts: [
      {
        text: 'Draw',
        onClick: () => document.querySelector('#maskPanel [data-action="draw-toggle"]')?.click(),
      },
      ' or ',
      {
        text: 'import',
        // The existing Mask workflow owns the native GDS/OAS change handler.
        onClick: () => document.getElementById('gdsInput')?.click(),
      },
      ' a mask.',
    ],
  });
  const updateEmptyHint = () =>
    emptyHint.update(
      Boolean(workstation && !workstation.readOnlyPreview && isEmptyActiveMask(state)),
    );
  const caption = () =>
    `${state.maskSourceMode === 'draw' ? `${state.drawMask.shapes.length} drawn shapes` : `${state.layout.elements.length} File elements`} · ${units.label()}`;
  const iconButton = (hint, action, glyph, extra = {}) =>
    button('', action, glyph, {
      title: hint,
      'aria-label': hint,
      'data-help': {
        'fit:mask': 'view.fit',
        'tool:pan:mask': 'view.pan',
        'tool:zoom:mask': 'view.zoom',
        'mask-source': 'mask.source',
        'draw-toggle': 'mask.draw',
        'opacity:mask': 'mask.opacity',
        'mask-roi-toggle': 'mask.roi',
        'mask-alignment-settings': 'mask.alignment',
        'maximize:mask': 'shell.maximize',
      }[action],
      ...extra,
    });
  function sync() {
    syncDisplayUnitFields(document, units.key());
    if (!state) return;
    updateEmptyHint();
    const opacity = Number.isFinite(state.maskOpacity) ? state.maskOpacity : 0.65;
    if (document.activeElement !== maskOpacityRange) maskOpacityRange.value = String(opacity);
    maskOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
    state.drawOpen = state.maskSourceMode === 'draw';
    for (const node of document.querySelectorAll('[data-action^="mask-source:"]'))
      node.setAttribute(
        'aria-pressed',
        String(node.dataset.action === `mask-source:${state.maskSourceMode}`),
      );
    const sourceButton = document.querySelector('[data-action="mask-source"]');
    if (sourceButton) {
      const drawn = state.maskSourceMode === 'draw';
      sourceButton.setAttribute('aria-pressed', String(drawn));
      sourceButton.title = `Mask source: ${drawn ? 'Draw' : 'File'}`;
      sourceButton
        .querySelector('use')
        .setAttribute('href', `#p-icon-${drawn ? 'palette' : 'folder'}`);
    }
    document
      .querySelector('[data-action="draw-toggle"]')
      ?.setAttribute('aria-pressed', String(state.drawOpen));
    workstation?.changed('mask');
    strip?.update({ open: state.drawOpen && !roiOpen, selected: state.drawUi?.tool || 'select' });
    roiStrip?.update({
      open: roiOpen,
      selected: state.maskRoiTool === 'rect' ? 'square' : state.maskRoiTool || 'select',
    });
    for (const key of ['pan', 'zoom'])
      document
        .querySelector(`[data-action="tool:${key}:mask"]`)
        ?.setAttribute('aria-pressed', String(state[`${key}Enabled`]));
    root.getElementById('maskCanvas')?.classList.toggle('plan-pan-active', state.panEnabled);
    shell?.getSlot('view.mask.readout')?.replaceChildren(caption());
    if (!workstation) shell?.getSlot('status.message')?.replaceChildren(message);
    if (hooks.has('maskSourceToggleBtn'))
      hooks.get('maskSourceToggleBtn').value = state.maskSourceMode;
  }
  function shapeFields(shape) {
    if (shape.type === 'polygon')
      return [
        [
          'Points · µm (one x, y pair per line)',
          'drawShapePoints',
          shape.points.map((p) => p.map(units.format).join(', ')).join('\n'),
          'points',
        ],
      ];
    const center = shape.type === 'rect' ? shape.a.map((v, i) => (v + shape.b[i]) / 2) : shape.c;
    const fields = [
      ['X · µm', 'drawShapeCx', center[0]],
      ['Y · µm', 'drawShapeCy', center[1]],
    ];
    if (shape.type === 'rect')
      fields.push(
        ['Width · µm', 'drawShapeWidth', shape.b[0] - shape.a[0]],
        ['Height · µm', 'drawShapeHeight', shape.b[1] - shape.a[1]],
      );
    else if (shape.type === 'circle') fields.push(['Radius · µm', 'drawShapeRadius', shape.r]);
    else
      fields.push(
        ['Inner radius · µm', 'drawShapeInnerRadius', shape.innerR],
        ['Outer radius · µm', 'drawShapeOuterRadius', shape.outerR],
      );
    if (shape.type === 'ring-sector')
      fields.push(
        ['Start angle · °', 'drawShapeStartDeg', shape.startDeg, 'angle'],
        ['End angle · °', 'drawShapeEndDeg', shape.endDeg, 'angle'],
      );
    return fields;
  }
  function editorSync(kind, shape) {
    if (kind === 'close') {
      overlays?.closeFloating('maskDrawSettings', 'hidden');
      hooks.get('drawShapeEditor').hidden = true;
      editorShapeId = null;
      return;
    }
    if (!shape || (kind !== 'open' && !overlays.hasFloating('maskDrawSettings'))) return;
    if (kind === 'open') {
      if (overlays.hasFloating('maskDrawSettings'))
        overlays.closeFloating('maskDrawSettings', 'hidden');
      const form = hooks.get('drawShapeEditor');
      form.hidden = false;
      editorShapeId = shape.id;
      form.replaceChildren(
        ...shapeFields(shape).map(([label, id, value, type]) =>
          type === 'points'
            ? textarea(label, id, value, { kind: 'points' })
            : input(label, id, value, { kind: type || 'length' }),
        ),
        el('span', { class: 'p-aux' }, 'Position and size precision · 0.1 nm'),
        el(
          'div',
          { class: 'v2-floating-editor-actions' },
          button('Delete selected', 'draw-delete', 'delete'),
          button('Apply', 'draw-apply', 'check', { primary: true }),
        ),
      );
      overlays.mountFloating({
        id: 'maskDrawSettings',
        title: 'Draw shape settings',
        content: form,
        trigger: document.querySelector('[data-action="draw-settings"]'),
        onClose: () => {
          form.hidden = true;
          editorShapeId = null;
        },
      });
    } else if (editorShapeId === shape.id)
      for (const [, id, value, type] of shapeFields(shape)) {
        const control = hooks.get(id);
        if (control && control !== document.activeElement)
          control.value = type === 'points' || type === 'angle' ? value : units.format(value);
      }
  }
  const anchorOptions = [
    ['center', 'Center / origin'],
    ['top-left', 'Top-left'],
    ['top-right', 'Top-right'],
    ['bottom-left', 'Bottom-left'],
    ['bottom-right', 'Bottom-right'],
  ];
  const roiForm = el(
    'div',
    { class: 'p-form' },
    el(
      'div',
      { class: 'p-actions' },
      button('Square', 'mask-roi:square', 'rectangle'),
      button('Circle', 'mask-roi:circle', 'circle'),
    ),
    choice('Reference', 'maskRoiAnchorSelect', anchorOptions, 'center'),
    pair(input('X · µm', 'maskRoiX'), input('Y · µm', 'maskRoiY')),
    input('Size · µm', 'maskRoiSize', 10),
    input('Radius · µm', 'maskRoiRadius', 5),
    input('Rotation · °', 'maskRoiRotation', 0, { kind: 'angle' }),
    el(
      'span',
      { class: 'p-aux' },
      'Create a Square or Circle by dragging in Mask. Precision · 0.1 nm',
    ),
    el(
      'div',
      { class: 'v2-floating-editor-actions' },
      hook('clearMaskRoiBtn', button('Clear ROI', null, 'clear')),
      button('Apply', 'roi-apply', 'check', { primary: true }),
    ),
  );
  function roiSync(roi) {
    for (const id of ['maskRoiX', 'maskRoiY', 'maskRoiSize', 'maskRoiRadius', 'maskRoiRotation'])
      hooks.get(id).closest('label').hidden =
        !roi ||
        (id === 'maskRoiRadius'
          ? roi.type !== 'circle'
          : ['maskRoiSize', 'maskRoiRotation'].includes(id) && roi.type !== 'square');
    if (!roi) return;
    const p = maskRoiAnchorPoint(roi, state.maskRoiAnchor);
    for (const [id, value] of [
      ['maskRoiX', p[0]],
      ['maskRoiY', p[1]],
      ['maskRoiSize', roi.size],
      ['maskRoiRadius', roi.r],
      ['maskRoiRotation', roi.rotation],
    ])
      if (value != null && hooks.get(id) !== document.activeElement)
        hooks.get(id).value = id.includes('Rotation') ? value : units.format(value);
  }
  const alignmentForm = el(
    'div',
    { class: 'p-form' },
    pair(input('Offset X · µm', 'maskOffsetX'), input('Offset Y · µm', 'maskOffsetY')),
    pair(
      input('Scale', 'maskScale', 1, { kind: 'scalar' }),
      input('Rotation · °', 'maskRotation', 0, { kind: 'angle' }),
    ),
    el(
      'span',
      { class: 'p-aux' },
      'Alignment applies to the File source; Draw stays in physical coordinates.',
    ),
    button('Apply', 'alignment-apply', 'check', { primary: true }),
  );
  const maskOpacityRange = el('input', {
    id: 'maskOpacityRange',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    value: 0.65,
    'aria-label': 'Mask opacity',
  });
  const maskOpacityValue = el('output', { id: 'maskOpacityValue', for: 'maskOpacityRange' }, '65%');
  const opacityForm = el(
    'div',
    { class: 'p-form' },
    el(
      'label',
      { class: 'wc-field', for: 'maskOpacityRange' },
      el('span', { class: 'wc-label' }, 'Opacity ', maskOpacityValue),
      maskOpacityRange,
    ),
  );
  maskOpacityRange.oninput = () => {
    state.maskOpacity = Math.max(0, Math.min(1, Number(maskOpacityRange.value)));
    maskOpacityValue.textContent = `${Math.round(state.maskOpacity * 100)}%`;
    runtime.render();
    workstation?.changed('mask');
  };
  for (const id of ['maskOffsetXUnit', 'maskOffsetYUnit'])
    hook(id, el('span', { hidden: true }, 'µm'));
  for (const id of [
    'drawMaskDeleteBtn',
    'drawMaskClearBtn',
    'drawShapeEditorDelete',
    'drawShapeEditorClose',
    'drawShapeEditorApply',
  ])
    hook(id, button('', null, null));
  hook('drawShapeEditor', el('div', { class: 'p-form', hidden: true }));
  const exportFilters = hook(
    'maskExportFilterGroup',
    el(
      'div',
      { class: 'p-form' },
      ...[
        ['maskExportCells', 'Cells'],
        ['maskExportLayers', 'Layers'],
      ].map(([id, label]) =>
        el(
          'label',
          { class: 'wc-field' },
          el('span', { class: 'wc-label' }, label),
          hook(id, el('select', { class: 'wc-select', multiple: true })),
        ),
      ),
    ),
  );
  const exportNote = hook(
    'maskExportDrawNote',
    el('p', { class: 'p-aux' }, 'Export Draw shapes; Mask ROI crops the output.'),
  );
  function floating(id, title, content, trigger) {
    overlays.mountFloating({ id, title, content, trigger });
  }
  function confirmAction({ title, message, confirmLabel, danger = false }) {
    return createDialogConfirmation({ overlays, el, button }).confirm({
      title,
      message,
      confirmLabel,
      danger,
    });
  }
  function buildMask() {
    const preview = workstation?.readOnlyPreview === true;
    const tools = toolbar(
      'Mask',
      [
        [
          iconButton('Fit', 'fit:mask', 'fit'),
          iconButton('Pan', 'tool:pan:mask', 'pan'),
          iconButton('Zoom', 'tool:zoom:mask', 'zoom'),
        ],
        [
          ...(workstation ? [] : [iconButton('Mask source', 'mask-source', 'folder')]),
          iconButton('Draw', 'draw-toggle', 'palette'),
          iconButton('Mask opacity', 'opacity:mask', 'eye'),
          iconButton('ROI', 'mask-roi-toggle', 'roi'),
          iconButton('Mask alignment', 'mask-alignment-settings', 'alignment'),
        ],
      ],
      [button('Export', 'mask-export-menu', 'export', { 'data-help': 'view.export' })],
    );
    tools.append(iconButton('Maximize view', 'maximize:mask', 'maximize'));
    const descriptors = [
      ['select', 'Select', 'select'],
      ['rect', 'Rectangle', 'rectangle'],
      ['circle', 'Circle', 'circle'],
      ['polygon', 'Polygon', 'polygon'],
      ['ring', 'Ring', 'ring'],
      ['ring-sector', 'Ring sector', 'ringSector'],
    ].map(([key, label, glyph]) => ({
      key,
      label,
      glyph,
      action: `draw-tool:${key}`,
      helpKey: 'mask.draw',
      enabled: () => state.maskSourceMode === 'draw',
    }));
    if (!preview) {
      strip = createFloatingStrip({
        id: 'maskDrawTools',
        label: 'Mask drawing tools',
        groups: [
          descriptors.slice(0, 1),
          descriptors.slice(1),
          [
            {
              label: 'Delete selected',
              action: 'draw-delete',
              helpKey: 'mask.draw.delete',
              glyph: 'delete',
              enabled: () => state.maskSourceMode === 'draw' && Boolean(state.drawUi?.selected),
            },
            {
              label: 'Clear Draw shapes',
              action: 'draw-clear',
              helpKey: 'mask.draw.clear',
              glyph: 'clear',
              enabled: () => state.maskSourceMode === 'draw' && state.drawMask.shapes.length > 0,
            },
          ],
        ],
        settings: {
          label: 'Draw settings',
          action: 'draw-settings',
          helpKey: 'mask.draw.settings',
          glyph: 'settings',
          enabled: () => state.maskSourceMode === 'draw' && Boolean(state.drawUi?.selected),
        },
        owner: () => document.querySelector('[data-action="draw-toggle"]'),
      });
      roiStrip = createFloatingStrip({
        id: 'maskRoiTools',
        label: 'Mask ROI tools',
        groups: [
          [
            {
              key: 'select',
              label: 'Select',
              glyph: 'select',
              action: 'mask-roi-tool:select',
              helpKey: 'mask.roi',
            },
          ],
          [
            {
              key: 'square',
              label: 'Square',
              glyph: 'rectangle',
              action: 'mask-roi-tool:square',
              helpKey: 'mask.roi',
            },
            {
              key: 'circle',
              label: 'Circle',
              glyph: 'circle',
              action: 'mask-roi-tool:circle',
              helpKey: 'mask.roi',
            },
          ],
        ],
        settings: {
          label: 'ROI settings',
          action: 'mask-roi-settings',
          glyph: 'settings',
          helpKey: 'mask.roi.settings',
        },
        toolAttribute: 'data-mask-roi-tool',
        owner: () => document.querySelector('#maskPanel [data-action="mask-roi-toggle"]'),
      });
    }
    const stage = el(
      'div',
      { class: 'p-science v2-plan-stage', 'data-v2-stage-host': '' },
      hook('maskCanvas', el('canvas', { 'aria-label': 'Mask scientific plan', tabindex: 0 })),
      ...(strip && roiStrip ? [strip.node, roiStrip.node] : []),
      emptyHint.node,
      hook('maskCoords', el('span', { class: 'p-scale' }, 'µm')),
    );
    return window
      .createWaferCadV2ViewPanels()
      .update(
        'mask',
        { class: 'p-view', id: 'maskPanel', 'data-view': 'mask', 'aria-label': 'Mask view' },
        el('header', { class: 'p-panel-head p-view-head' }, el('strong', {}, 'Mask'), tools),
        stage,
        el('div', {}, caption()),
      );
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
        if (!['view:mask', 'mode:single', 'expand-empty'].includes(node.dataset.action))
          node.disabled = true;
      });
    runtime?.render();
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
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== expectedHash) throw Error('M3D source no longer matches the M2 reference');
        return { data: await readProjectFile(new Blob([bytes])), hash };
      })());
    const hash = loaded.hash;
    const data = loaded.data;
    state = sharedState || {
      ...data,
      selectedLayerKeys: [...data.selectedLayerKeys],
      activeFace: 'front',
      maskOpacity: 0.65,
      maskRoi: structuredClone(data.maskRoi),
      maskRoiAnchor: data.maskRoiAnchor || 'center',
      maskRoiTool: null,
      maskRoiDraft: null,
      drawOpen: false,
      panEnabled: true,
      zoomEnabled: true,
      planViews: { mask: { zoom: 1, panX: 0, panY: 0 } },
    };
    modelBefore = JSON.stringify(state.model);
    hook('maskSourceToggleBtn', el('select'));
    const adapters = workstation?.adapters || window.WaferCadV2DomainAdapters.create(),
      panel = buildMask();
    adapters.register('view.mask', {
      mount: (host) => {
        host.append(panel);
        return panel;
      },
      onShow() {},
      onHide() {},
      destroy() {},
    });
    workstation?.mount(panel);
    shell =
      workstation?.shell ||
      window.createWaferCadV2Workstation({
        root: document.getElementById('app-root'),
        state: uiState,
        adapters,
        registry: window.WaferCadV2ShellRegistry.define({
          views: [{ key: 'mask', label: 'Mask', icon: 'mask' }],
        }),
        getProjectName: () => data.name,
        presentation: () => ({
          selectedPanel: 'project',
          selectedNavigation: 'project',
          editorHidden: uiState.editorHidden,
          message,
          save: 'Mask-only review',
        }),
      });
    overlays = workstation?.overlays || createFloatingEditorManager(shell.overlays);
    if (!workstation)
      shell
        .getSlot('panel.project')
        .querySelector('[data-slot-content]')
        .append(panelHeader('Project', 'Not connected in this Mask-only review'));
    renderShell();
    runtime = createMaskRuntime({
      state,
      root,
      readOnly: Boolean(workstation?.readOnlyPreview),
      onChange: sync,
      onEditorSync: editorSync,
      onRoiSync: roiSync,
      status: (value) => {
        message = value;
        workstation?.status(value);
        sync();
      },
      confirmAction,
      selectedMaskElement: workstation?.selectedMaskElement,
    });
    const renderMask = runtime.render;
    runtime.render = (...args) => {
      updateEmptyHint();
      return renderMask(...args);
    };
    updateEmptyHint();
    new ResizeObserver(() => runtime.render()).observe(hooks.get('maskCanvas'));
    roiSync(state.maskRoi);
    document.addEventListener('click', async (event) => {
      if (workstation?.readOnlyPreview) return;
      const trigger = event.target.closest('button[data-action]');
      if (!trigger || trigger.disabled) return;
      if (
        workstation &&
        !trigger.closest('#maskPanel, .v2-mask-floating') &&
        !trigger.matches('[data-action^="mask-source:"]')
      )
        return;
      const action = trigger.dataset.action;
      if (action === 'fit:mask') runtime.fit();
      else if (action === 'tool:pan:mask') runtime.setPanEnabled(!state.panEnabled);
      else if (action === 'tool:zoom:mask') runtime.setZoomEnabled(!state.zoomEnabled);
      else if (action === 'draw-toggle') {
        runtime.draw.setSourceMode('draw');
        roiOpen = false;
        if (!state.drawOpen) overlays.closeFloating('maskDrawSettings', 'hidden');
        sync();
      } else if (action.startsWith('draw-tool:')) runtime.chooseDrawTool(action.split(':')[1]);
      else if (action === 'draw-settings') runtime.draw.openEditor();
      else if (action === 'draw-apply') runtime.draw.applyEditor();
      else if (action === 'draw-delete') runtime.draw.removeSelected();
      else if (action === 'draw-clear') await runtime.draw.clear();
      else if (action === 'mask-source' || action.startsWith('mask-source:')) {
        runtime.draw.setSourceMode(
          action === 'mask-source'
            ? state.maskSourceMode === 'draw'
              ? 'file'
              : 'draw'
            : action.split(':')[1],
        );
        roiOpen = false;
        if (state.maskSourceMode === 'file') overlays.closeFloating('maskDrawSettings', 'hidden');
        sync();
      } else if (action === 'mask-roi-toggle') {
        roiOpen = !roiOpen;
        if (!roiOpen) overlays.closeFloating('maskRoiSettings', 'hidden');
      } else if (action.startsWith('mask-roi-tool:')) {
        const tool = action.split(':')[1];
        if (tool === 'select') {
          runtime.setPanEnabled(false);
          runtime.roi.clearDrawingMode();
          runtime.render();
        } else runtime.chooseRoiTool(tool);
      } else if (action === 'mask-roi-settings') {
        roiSync(state.maskRoi);
        floating('maskRoiSettings', 'Mask ROI settings', roiForm, trigger);
      } else if (action.startsWith('mask-roi:')) runtime.chooseRoiTool(action.split(':')[1]);
      else if (action === 'roi-apply') hooks.get('maskRoiSize').dispatchEvent(new Event('change'));
      else if (action === 'mask-alignment-settings') {
        runtime.alignment.syncTransformInputs();
        floating('maskAlignmentSettings', 'Mask alignment', alignmentForm, trigger);
      } else if (action === 'alignment-apply') runtime.alignment.updateTransform();
      else if (action === 'opacity:mask') {
        sync();
        mountToolPopover(overlays, { label: 'Mask opacity', content: opacityForm, trigger });
      } else if (action === 'mask-export-menu') {
        runtime.exporter.syncMaskExportOptions();
        floating(
          'maskExportSettings',
          'Export Mask',
          el(
            'div',
            { class: 'p-form' },
            exportFilters,
            exportNote,
            ...['svg', 'gds', 'oas'].map((type) =>
              button(type.toUpperCase(), `mask-export:${type}`, 'export'),
            ),
          ),
          trigger,
        );
      } else if (action.startsWith('mask-export:'))
        await runtime.exporter[
          { svg: 'exportMaskSvg', gds: 'exportMaskGds', oas: 'exportMaskOas' }[action.split(':')[1]]
        ]();
      else if (action === 'maximize:mask' && !workstation) {
        uiState.maximize = uiState.maximize ? null : 'mask';
        renderShell();
      } else if (['hide-editor', 'return-results'].includes(action)) {
        uiState.editorHidden = true;
        uiState.mobile = 'view';
        renderShell();
      } else if (['expand-empty', 'show-editor'].includes(action)) {
        uiState.editorHidden = false;
        uiState.mobile = 'edit';
        renderShell();
      }
      sync();
    });
    window.WaferCadV2Mask = {
      ready: true,
      snapshot: () =>
        structuredClone({
          source,
          hash,
          caption: caption(),
          drawMask: state.drawMask,
          drawUi: state.drawUi,
          sourceMode: state.maskSourceMode,
          drawOpen: state.drawOpen,
          panEnabled: state.panEnabled,
          zoomEnabled: state.zoomEnabled,
          maskRoi: state.maskRoi,
          maskTransform: state.maskTransform,
          plan: state.planViews.mask,
          scientificUnchanged: modelBefore === JSON.stringify(state.model),
        }),
      projection: () => {
        const rect = hooks.get('maskCanvas').getBoundingClientRect();
        return runtime.plan.viewport(rect.width, rect.height, 'mask');
      },
    };
    if (!workstation) document.body.dataset.ready = 'true';
    return { panel, state, runtime, sync, root, snapshot: window.WaferCadV2Mask.snapshot };
  } catch (error) {
    if (workstation) throw error;
    document.body.dataset.ready = 'error';
    document
      .getElementById('app-root')
      .replaceChildren(el('p', { role: 'alert' }, `Mask unavailable: ${error.message}`));
    console.error(error);
  }
}
if (!document.body.hasAttribute('data-workstation')) await createMaskView();
