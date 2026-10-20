// Project/Base and Mask browser adapters own new v2 controls, with legacy controllers injected.
import { createBaseControlsController } from '../controllers/base-controls-controller.js';
import { createMaskBrowserController } from '../controllers/mask-browser-controller.js';
import { createMaskImportController } from '../controllers/mask-import-controller.js';
import { MAX_PROJECT_FILE_BYTES, readProjectFile } from '../project-io.js';
import { buildProcessReportData } from '../process-report.js';
import { captureHistorySections } from '../report-history-captures.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { modelInventoryCount } from './view-kit/model-inventory.js';
import { mountProjectExportMenu } from './view-kit/project-export-menu.js';

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
  replayBaseOperations = async () => ({ ok: false, error: 'Replay unavailable.' }),
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
  const exportMenuTrigger = hook(
    'projectExportMenuBtn',
    button('Export', null, 'export', {
      'data-variant': 'ghost',
      'data-help': 'project.export',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    }),
  );
  const projectExportItem = hook(
    'exportProjectBtn',
    button('Project file · .wafercad', null, 'export', {
      'data-help': 'project.export.file',
      role: 'menuitem',
    }),
  );
  const reportExportItem = hook(
    'exportReportBtn',
    button('Process report · .zip', null, 'export', {
      'data-help': 'project.export.report',
      role: 'menuitem',
    }),
  );
  const open = hook(
    'openProjectInput',
    el('input', { type: 'file', accept: '.wafercad,.json', hidden: true }),
  );
  hook(
    'saveProjectBtn',
    button('Save', null, 'save', { 'data-variant': 'ghost', 'data-help': 'project.save' }),
  );
  projectHost.append(
    el(
      'a',
      {
        class: 'wc-button p-mobile-welcome-link',
        href: './index.html',
        'aria-label': 'Back to Welcome',
        'data-size': 'sm',
        'data-variant': 'ghost',
      },
      window.WaferCadV2Icons.icon('back'),
      'Back to Welcome',
    ),
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
      exportMenuTrigger,
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
  mountProjectExportMenu({
    overlays: workstation.shell.overlays,
    trigger: exportMenuTrigger,
    projectItem: projectExportItem,
    reportItem: reportExportItem,
    el,
  });
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
      hook(
        'applyBaseBtn',
        button('Rebuild Base', null, 'history', {
          primary: true,
          'data-help': 'project.base.rebuild',
        }),
      ),
      hook(
        'revertBaseBtn',
        button('Revert changes', null, 'undo', {
          disabled: true,
          'data-help': 'project.base.revert',
        }),
      ),
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
    // A worker can finish while the Mask domain remains selected. An ordinary
    // view refresh does not necessarily re-run the editor adapter's onShow.
    // Reconcile its cell/layer controls immediately with the imported layout.
    browser.renderCellTree();
    browser.renderMaskList();
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
        message: 'Choose how to change the Starting Wafer.',
        detail:
          'Replay rebuilds the current Main on the new Base and archives the previous Main. Keep starts a clean Main with the old History archived. Clear removes History.',
        actions: [
          { value: 'cancel', label: 'Cancel' },
          { value: 'clear', label: 'Clear history', kind: 'danger' },
          { value: 'keep', label: 'Keep previous history' },
          { value: 'replay', label: 'Replace Base & Replay', kind: 'primary' },
        ],
      }),
    getHistoryDetails: () => ({
      hasHistory:
        history.listHistory().length > 0 ||
        history.list().length > 0 ||
        history.listBranches().length > 1,
    }),
    captureBaseSnapshot: transaction,
    prepareBaseReplay: () => {
      const branch = history.activeBranch();
      if (branch.id !== 'main' || history.continuationContext()) {
        throw new Error('Return to the Main Variant HEAD before replaying a new Base.');
      }
      const nodes = new Map(history.listHistory().map((node) => [node.id, node]));
      const reverse = [],
        visited = new Set();
      let nodeId = branch.headNodeId;
      while (nodeId) {
        if (visited.has(nodeId)) throw new Error('Process History contains a cycle.');
        visited.add(nodeId);
        const node = nodes.get(nodeId);
        if (!node || node.branchId !== 'main' || !node.replayable) {
          throw new Error('Every Main Step must contain replay metadata.');
        }
        const sourceState = history.readProcessNodeState(node.id);
        if (!sourceState) throw new Error('A Main Step has no validated replay input state.');
        reverse.push({ operation: node.operation, state: sourceState, entityRefs: node.entityRefs });
        nodeId = node.parentId;
      }
      const steps = reverse.reverse();
      if (steps.length && !history.canRecordOperation(steps.length)) {
        throw new Error('Not enough History capacity to archive and replay these Steps.');
      }
      return { steps };
    },
    checkpointBeforeBaseReplay: () => checkpoint('pre-starting-wafer-replay'),
    replayBaseOperations,
    collapseBaseReplayUndo: (start, original) => {
      undo.splice(start);
      undo.push(original);
      redo.length = 0;
    },
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
    readProjectFileTask: async (file, { trustedBundledExample } = {}) => {
      if (file.size > MAX_PROJECT_FILE_BYTES)
        throw Error('Project exceeds the 256 MB safety limit.');
      const openStart = performance.now();
      const arrayBuffer = await file.arrayBuffer();
      const result = await task.runWorker(
        '../project-worker.js',
        { arrayBuffer, trustedBundledExample },
        {
          label: `Opening ${file.name}…`,
          transfer: [arrayBuffer],
          startupFallback:
            file.size <= 8 * 1024 * 1024
              ? async ({ signal }) => {
                  if (signal.aborted) return { aborted: true };
                  const project = await readProjectFile(file, { trustedBundledExample });
                  return signal.aborted ? { aborted: true } : { project };
                }
              : null,
        },
      );
      if (result?.error) throw Error(result.error);
      if (!result?.project) return null;
      const workerDoneAt = performance.now();
      const validated = await projectState.readWorkerValidatedProjectSnapshotAsync(result.project);
      performance.measure('wafercad:project:load-task', {
        start: openStart,
        end: performance.now(),
        detail: {
          fileBytes: file.size,
          workerAndTransferMs: workerDoneAt - openStart,
          attestationMs: performance.now() - workerDoneAt,
          ...(result.timingsMs ? { worker: result.timingsMs } : {}),
        },
      });
      return validated;
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
  const reportButton = root.getElementById('exportReportBtn');
  reportButton.onclick = async () => {
    if (task.isBusy()) {
      workstation.status('Finish or abort the current task before exporting a report.');
      return;
    }
    reportButton.disabled = true;
    try {
      const result = await task.runTask(
        async ({ signal, updateStage, runWorker }) => {
          const project = projectState.buildProjectSnapshot(false);
          project.name = normalizedProjectName();
          const data = buildProcessReportData({
            project,
            history: history.listHistory(),
            branches: history.listBranches(),
            bookmarks: history.list(),
            position: history.currentPosition(),
          });
          const revision = state.model.revision;
          const captures = [];
          const warnings = [];
          updateStage('Capturing visible inspection views…');
          for (const [view, selector] of [
            ['main', '#mainCanvas'],
            ['mask', '#maskCanvas'],
            ['section', '#sectionCanvas'],
            ['three', '#threeHost canvas'],
          ]) {
            if (signal.aborted) return { aborted: true };
            const canvas = document.querySelector(selector);
            if (!canvas || !canvas.width || !canvas.height || !canvas.checkVisibility()) {
              warnings.push(`${view}: canvas not visible at export time.`);
              continue;
            }
            try {
              const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
              if (!blob || blob.type !== 'image/png') throw new Error('PNG capture unavailable');
              if (blob.size > 16 * 1024 * 1024) {
                warnings.push(`${view}: capture exceeds 16 MB; omitted.`);
                continue;
              }
              captures.push({ view, bytes: new Uint8Array(await blob.arrayBuffer()) });
            } catch (error) {
              warnings.push(`${view}: ${error.message}.`);
            }
          }
          if (signal.aborted) return { aborted: true };
          if (state.model.revision !== revision) {
            captures.length = 0;
            warnings.push('Model changed while capturing; view images omitted.');
          }
          updateStage('Rendering selected saved Sections…');
          const sections = await captureHistorySections({
            data,
            readNodeState: (nodeId) => history.readProcessNodeState(nodeId),
            render: ({ state: savedState, nodeId }) =>
              runWorker('../report-history-section-worker.js', {
                state: savedState,
                nodeId,
              }),
            signal,
            onProgress: (index, count) => updateStage(`Historical Section ${index} of ${count}…`),
          });
          if (sections.aborted || signal.aborted) return { aborted: true };
          // Report data and saved-node captures must refer to one immutable
          // ledger. Never silently include mixed before/after workspace states.
          const latestHistory = history.listHistory();
          if (
            state.model.revision !== revision ||
            latestHistory.length !== data.steps.length ||
            latestHistory.some(
              (step, index) =>
                step.id !== data.steps[index].id ||
                step.processRevision !== data.steps[index].processRevision,
            )
          ) {
            throw new Error('Workspace or Process History changed during report export.');
          }
          updateStage('Building offline report…');
          return runWorker(
            '../process-report-worker.js',
            {
              data,
              captures,
              warnings,
              historicalSections: sections.figures,
              historicalFailures: sections.failures,
            },
            { transfer: captures.map((capture) => capture.bytes.buffer) },
          );
        },
        {
          label: 'Exporting Process Report…',
          abortMessage: 'Report export aborted. No file was downloaded.',
          failurePrefix: 'Report export failed',
        },
      );
      if (!result || result.aborted || result.error || !result.arrayBuffer) return;
      const blob = new Blob([result.arrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      try {
        const link = el('a', { href: url, download: result.filename });
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      workstation.status(
        `Report requested: ${result.stepCount} steps, ${result.imageCount} current views, ${result.historicalImageCount} saved Sections.`,
      );
    } catch (error) {
      console.error(error);
      workstation.status(`Report export failed: ${error.message}`, 'error');
    } finally {
      reportButton.disabled = false;
    }
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
