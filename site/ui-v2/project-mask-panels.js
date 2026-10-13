// Project/Base and Mask browser adapters own new v2 controls, with legacy controllers injected.
import { createBaseControlsController } from '../controllers/base-controls-controller.js';
import { createMaskBrowserController } from '../controllers/mask-browser-controller.js';
import { createMaskImportController } from '../controllers/mask-import-controller.js';
import { MAX_PROJECT_FILE_BYTES } from '../project-io.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { modelInventoryCount } from './view-kit/model-inventory.js';

export function createProjectMaskPanels({
  store,
  workstation,
  controls,
  task,
  confirmation,
  transaction,
  restoreTransaction,
  undo,
  redo,
  checkpoint,
  refresh,
  getProject,
  refreshRecovery,
  dirty,
}) {
  const { state, history, projectState } = store;
  const units = createDisplayUnits(() => state);
  const { el, button } = window.WaferCadV2Components;
  const { hook, root, input, choice, fields, host } = controls;
  let baseRevert = null;
  const normalizedProjectName = (value) =>
    String(value ?? state.projectName ?? '').trim() || 'Untitled';
  const fit3d = () => store.views.get('three')?.renderer.fit();
  const projectHost = host('panel.project');
  const projectSummary = el('p', { class: 'p-aux' });
  const open = hook(
    'openProjectInput',
    el('input', { type: 'file', accept: '.wafercad,.json', hidden: true }),
  );
  hook('saveProjectBtn', button('Save', null, 'save', { 'data-variant': 'ghost', 'data-help': 'project.save' }));
  projectHost.append(
    el(
      'div',
      { class: 'p-actions' },
      hook('newProjectBtn', button('New', null, 'plus', { 'data-variant': 'ghost' })),
      el(
        'label',
        { class: 'wc-button', 'data-size': 'sm', 'data-variant': 'ghost' },
        window.WaferCadV2Icons.icon('folder'),
        'Open',
        open,
      ),
      hook('exportProjectBtn', button('Export', null, 'export', { 'data-variant': 'ghost', 'data-help': 'project.export' })),
    ),
    input('Project name', 'projectNameInput', state.projectName, { maxlength: 256 }),
    choice(
      'XYZ display unit',
      'xyUnitSelect',
      [
        ['nm', 'nm'],
        ['um', 'µm'],
        ['mm', 'mm'],
      ],
      units.key(),
    ),
    projectSummary,
  );
  root.getElementById('xyUnitSelect').dataset.help = 'project.units';
  root.getElementById('xyUnitSelect').onchange = (event) => {
    state.xyDisplayUnit = event.target.value;
    syncDisplayUnitFields(document, units.key());
    importer.syncTransformInputs();
    dirty();
    refresh();
  };
  const shape = hook(
    'substrateShape',
    el(
      'div',
      { class: 'p-actions' },
      button('Rectangle', null, 'rectangle', { 'data-shape': 'rect' }),
      button('Circle', null, 'circle', { 'data-shape': 'circle' }),
    ),
  );
  shape.hidden = true;
  const shapeChoice = choice(
    'Shape',
    'v2BaseShape',
    [
      ['rect', 'Rectangle'],
      ['circle', 'Circle'],
    ],
    state.model.shape,
  );
  hooksShapeBind();
  function hooksShapeBind() {
    root.getElementById('v2BaseShape').onchange = (event) => {
      shape.querySelector(`[data-shape="${event.target.value}"]`).click();
      root.getElementById('baseHeight').closest('label').hidden = event.target.value === 'circle';
    };
  }
  const baseFields = el(
    'div',
    { class: 'p-form' },
    shape,
    shapeChoice,
    fields.input('Width / diameter · µm', 'baseWidth', state.model.width),
    fields.input('Height · µm', 'baseHeight', state.model.height),
    fields.input('Thickness · µm', 'baseThickness', state.model.thickness),
    el(
      'div',
      { class: 'p-actions' },
      hook('applyBaseBtn', button('Rebuild Base', null, 'history', { primary: true, 'data-help': 'project.base.rebuild' })),
      hook('revertBaseBtn', button('Revert changes', null, 'undo', { disabled: true, 'data-help': 'project.base.revert' })),
    ),
  );
  const baseHost = host('panel.base');
  baseHost.append(
    el(
      'section',
      { class: 'p-base-editor', 'aria-label': 'Base dimensions' },
      el('h3', {}, 'Base'),
      baseFields,
    ),
  );
  workstation.adapters.register('panel.base', {
    mount: (node) => node,
    onShow() {},
    onHide() {},
    destroy() {},
  });
  for (const id of ['baseWidthUnit', 'baseHeightUnit', 'baseThicknessUnit']) hook(id, el('span'));
  const syncBaseControls = () => {
    const model = state.model;
    for (const [id, key] of [
      ['baseWidth', 'width'],
      ['baseHeight', 'height'],
      ['baseThickness', 'thickness'],
    ])
      root.getElementById(id).value = units.format(model[key]);
    root.getElementById('baseHeight').disabled = model.shape === 'circle';
    root.getElementById('baseHeight').closest('label').hidden = model.shape === 'circle';
    root.getElementById('v2BaseShape').value = model.shape;
    for (const node of shape.querySelectorAll('button'))
      node.classList.toggle('active', node.dataset.shape === model.shape);
    root.getElementById('revertBaseBtn').disabled = !baseRevert;
  };
  const browser = createMaskBrowserController({
    root,
    getLayout: () => state.layout,
    getActiveCell: () => state.activeCell,
    setActiveCellValue: (value) => {
      state.activeCell = value;
    },
    getExpandedCells: () => state.expandedCells,
    getSelectedLayerKeys: () => state.selectedLayerKeys,
    getHoveredLayerKey: () => state.hoveredLayerKey,
    setHoveredLayerKey: (value) => {
      state.hoveredLayerKey = value;
    },
    layerKey: (l, d) => `${l}|${d}`,
    layerColor: (key) => store.views.get('mask')?.runtime.layerColor(key) || '#4F86C6',
    renderMask: () => {
      store.views.get('mask')?.runtime.render();
    },
    renderAll: refresh,
    onChanged: dirty,
  });
  store.setMaskBrowser(browser);
  const maskHost = host('panel.mask');
  const layoutFile = hook(
    'gdsInput',
    el('input', { type: 'file', accept: '.gds,.gdsii,.oas,.oasis', hidden: true }),
  );
  const tree = hook('cellTree', el('div', { class: 'v2-mask-browser' }));
  const list = hook('maskLayerList', el('div', { class: 'v2-mask-browser' }));
  maskHost.append(
    el(
      'div',
      { class: 'p-actions p-mask-source-controls', role: 'group', 'aria-label': 'Mask source' },
      el('span', { class: 'wc-label' }, 'Source'),
      ...[
        ['file', 'File', 'folder'],
        ['draw', 'Draw', 'palette'],
      ].map(([key, label, icon]) =>
        button(label, `mask-source:${key}`, icon, {
          'data-help': 'mask.source',
          'aria-pressed': String(state.maskSourceMode === key),
        }),
      ),
    ),
    el('label', { class: 'wc-button', 'data-help': 'mask.import' }, 'Import GDS / OAS', layoutFile),
    hook('maskCellLabel', el('p', { class: 'p-aux' })),
    el('details', { open: true }, el('summary', {}, 'Cell'), tree),
    el('details', { open: true }, el('summary', {}, 'Layers'), list),
    el(
      'details',
      {},
      el('summary', {}, 'Transform'),
      el(
        'div',
        { class: 'p-form' },
        fields.input('Offset X · µm', 'maskOffsetX', state.maskTransform.x),
        fields.input('Offset Y · µm', 'maskOffsetY', state.maskTransform.y),
        fields.input('Scale', 'maskScale', state.maskTransform.scale, { kind: 'number' }),
        fields.input('Rotation · °', 'maskRotation', state.maskTransform.rotation, {
          kind: 'angle',
        }),
      ),
    ),
  );
  hook('maskOffsetXUnit', el('span'));
  hook('maskOffsetYUnit', el('span'));
  async function importLayoutBuffer(
    arrayBuffer,
    filename,
    displayName = filename,
    { startupProtected = false } = {},
  ) {
    const result = await task.runWorker(
      '../layout-worker.js',
      { arrayBuffer, filename },
      { label: `Importing ${displayName}…`, transfer: [arrayBuffer] },
    );
    if (result?.busy) throw Error('Another background task is already running.');
    if (result?.error) throw Error(result.error);
    if (!result?.imported || result.aborted) return null;
    if (!startupProtected && !(await checkpoint('pre-import-layout')))
      throw Error('Recovery checkpoint was not created. The mask was preserved.');
    const imported = result.imported;
    state.layout = imported.layout;
    state.layout.name = displayName;
    state.layout.hierarchy = browser.hierarchyFromParsed(imported.parsed);
    state.activeCell = imported.parsed.root || null;
    state.expandedCells = new Set(state.activeCell ? [state.activeCell] : []);
    state.hoveredLayerKey = null;
    browser.invalidateScope();
    state.selectedLayerKeys = new Set(browser.globalLayers().map((item) => item.key));
    state.maskSourceMode = 'file';
    state.maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    state.planViews.mask = { zoom: 1, panX: 0, panY: 0 };
    store.views.get('mask')?.runtime.draw.resetInteraction();
    importer.syncTransformInputs();
    dirty();
    refresh();
    return imported;
  }
  const importer = createMaskImportController({
    root,
    getMaskTransform: () => state.maskTransform,
    setMaskTransform: (value) => {
      state.maskTransform = value;
      dirty();
    },
    manualMicron: units.parse,
    formatLengthField: units.format,
    formatNumericField: String,
    xyUnitLabel: units.label,
    importLayoutBuffer,
    openLayoutFile: (...args) => getProject().openLayoutFile(...args),
    renderMask: refresh,
    status: workstation.status,
  });
  importer.bind();
  const base = createBaseControlsController({
    root,
    getModel: () => state.model,
    setModel: (value) => {
      state.model = value;
      dirty();
    },
    setSection: (value) => {
      state.section = value;
    },
    getBaseRevertSnapshot: () => baseRevert,
    setBaseRevertSnapshot: (value) => {
      baseRevert = value;
    },
    getHistory: () => undo,
    getFuture: () => redo,
    stateSnapshot: transaction,
    restoreSnapshot: restoreTransaction,
    saveHistory: (value = transaction()) => {
      undo.push(value);
      redo.length = 0;
    },
    hasProcessEdits: () => state.model.processRevision > 0,
    manualMicron: units.parse,
    formatLengthField: units.format,
    syncBaseControls,
    renderAll: refresh,
    fit3d,
    status: workstation.status,
    confirmAction: confirmation.confirm,
    chooseHistoryAction: () =>
      confirmation.ask({
        title: 'Rebuild Base',
        message: 'Changing Base starts a new Main lineage.',
        detail:
          'Keep archives the previous HEAD and Steps as a restorable Variant. Clear discards History. Undo and Revert retain the previous workspace.',
        actions: [
          { value: 'cancel', label: 'Cancel' },
          { value: 'clear', label: 'Clear history', kind: 'danger' },
          { value: 'keep', label: 'Keep previous history', kind: 'primary' },
        ],
      }),
    getHistoryDetails: () => ({
      hasHistory:
        history.listHistory().length > 0 ||
        history.list().length > 0 ||
        history.listBranches().length > 1,
    }),
    captureBaseSnapshot: transaction,
    rebuildMainHistory: (options) => history.rebuildMainBase(options),
    refreshHistory: () => getProject()?.renderSnapshots(),
  });
  base.bind();
  syncBaseControls();
  const syncProjectNameInput = () => {
    root.getElementById('projectNameInput').value = state.projectName;
  };
  const load = (value) => {
    undo.length = redo.length = 0;
    baseRevert = null;
    store.restore(value);
    browser.invalidateScope();
  };
  const bindings = {
    importLayoutBuffer,
    loadProjectSnapshot: load,
    syncBaseControls,
    syncTransformInputs: importer.syncTransformInputs,
    fit3d,
    readProjectFileTask: async (file) => {
      if (file.size > MAX_PROJECT_FILE_BYTES)
        throw Error('Project exceeds the 256 MB safety limit.');
      const arrayBuffer = await file.arrayBuffer();
      const result = await task.runWorker(
        '../project-worker.js',
        { arrayBuffer },
        { label: `Opening ${file.name}…`, transfer: [arrayBuffer] },
      );
      if (result?.error) throw Error(result.error);
      if (!result?.project) return null;
      return projectState.readProjectSnapshot(new Blob([JSON.stringify(result.project)]));
    },
    exportProjectFileTask: async (project, filename) => {
      const result = await task.runWorker(
        '../project-export-worker.js',
        { project },
        { label: `Exporting ${filename}…` },
      );
      if (!result?.arrayBuffer) return false;
      const url = URL.createObjectURL(new Blob([result.arrayBuffer], { type: 'application/json' }));
      const link = el('a', { href: url, download: filename });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    normalizedProjectName,
    getProjectName: () => state.projectName,
    setProjectName: (value) => {
      state.projectName = value;
    },
    syncProjectNameInput,
    scheduleWorkspacePersistence: dirty,
    resetProjectState: () => {
      projectState.resetProjectState();
      load(projectState.buildProjectSnapshot(false));
    },
    resetRoughDraftControls: () => {},
    clearRoiDrawingMode: () => store.views.get('main')?.runtime.roi.clearDrawingMode(),
    clearMaskRoiDrawingMode: () => store.views.get('mask')?.runtime.roi.clearDrawingMode(),
    buildProjectSnapshot: projectState.buildProjectSnapshot,
  };
  let projectShown = false;
  for (const id of ['panel.project', 'panel.mask'])
    workstation.adapters.register(id, {
      mount: (node) => node,
      onShow: () => {
        if (id === 'panel.mask') {
          browser.renderCellTree();
          browser.renderMaskList();
          importer.syncTransformInputs();
        } else {
          syncProjectNameInput();
          root.getElementById('xyUnitSelect').value = units.key();
          if (!projectShown)
            void refreshRecovery().catch((error) => workstation.status(error.message));
          projectShown = true;
          projectSummary.textContent = `${state.model.layers.length} layers · ${modelInventoryCount(state.model)} · ${units.label()}`;
          projectHost
            .querySelectorAll('[data-action^="face:"]')
            .forEach((node) =>
              node.setAttribute(
                'aria-pressed',
                String(node.dataset.action === `face:${state.activeFace}`),
              ),
            );
        }
      },
      onHide() {
        if (id === 'panel.project') projectShown = false;
      },
      destroy() {},
    });
  return {
    bindings,
    base,
    browser,
    importer,
    load,
    syncBaseControls,
    syncProjectNameInput,
    clearBaseRevert() {
      baseRevert = null;
      root.getElementById('revertBaseBtn').disabled = true;
    },
  };
}
