// Native v2 hosts around the existing transactional Process and History owners.
import { createProcessTaskController } from '../controllers/process-task-controller.js';
import { createProcessPanelController } from '../controllers/process-panel-controller.js';
import { createProjectController } from '../controllers/project-controller.js';
import { createHistoryMutationController } from '../controllers/history-mutation-controller.js';
import { createWorkspaceSessionController } from '../controllers/workspace-session-controller.js';
import { createWorkspacePersistenceController } from '../controllers/workspace-persistence-controller.js';
import { createProjectMaskPanels } from './project-mask-panels.js';
import { createProcessRecipeController } from '../controllers/process-recipe-controller.js';
import { createProcessDiagnosticsController } from '../controllers/process-diagnostics-controller.js';
import { STRUCTURE_PALETTES } from '../controllers/layer-legend-controller.js';
import { recolorLayer, recolorImplant, recolorElectricalRegion } from '../model.js';
import { createInspectionFields } from './view-kit/inspection-fields.js';
import { createDialogConfirmation } from './view-kit/confirmation-dialog.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { modelInventoryCount } from './view-kit/model-inventory.js';
import { loadBundledProject } from './workstation-runtime.js';
import { readStartupFile, removeStartupFile } from '../startup-file.js';

export function createWorkstationWorkflow({ store, workstation, readOnly = false }) {
  const { el, button, field } = window.WaferCadV2Components;
  const { state, history, projectState } = store;
  const hooks = new Map();
  const hook = (id, node) => {
    node.id = /^(maskOffset|maskScale|maskRotation|maskCellLabel|cellTree|maskLayerList)/.test(id)
      ? `v2-${id}`
      : id;
    hooks.set(id, node);
    return node;
  };
  const root = {
    getElementById: (id) => hooks.get(id) || document.getElementById(id),
    createElement: (...args) => document.createElement(...args),
    querySelectorAll: (...args) => document.querySelectorAll(...args),
    querySelector: (...args) => document.querySelector(...args),
    addEventListener: (...args) => document.addEventListener(...args),
    get activeElement() {
      return document.activeElement;
    },
  };
  const units = createDisplayUnits(() => state);
  const fields = createInspectionFields({ hook, units });
  const row = (id, node) => hook(id, node);
  const input = (label, id, value = '', attrs = {}) => {
    const node = field(label, id, value, attrs);
    hook(id, node.querySelector('input'));
    return node;
  };
  const choice = (label, id, options, value) =>
    fields.choice(label, id, options, value ?? options[0]?.[0]);
  const host = (id) => workstation.shell.getSlot(id).querySelector('[data-slot-content]');
  let process, project, mutation, persistence, domain, recipe, diagnostics;
  let processFace = 'front';
  const undo = [],
    redo = [];
  const status = workstation.status;
  const dirty = () => {
    if (!readOnly) persistence?.scheduleStructural();
  };
  const refresh = () => {
    syncDisplayUnitFields(document, units.key());
    process?.updateUi();
    hooks.get('faceToggleBtn').value = processFace;
    hooks.get('undoBtn').disabled = !undo.length || task.isBusy();
    hooks.get('redoBtn').disabled = !redo.length || task.isBusy();
    if (!readOnly) persistence?.schedule();
    workstation.render();
    // Shell adapter onShow can call process.updateUi() and reset the button contents.
    syncManualPresentation();
    diagnostics?.onModelRendered();
  };
  const confirmation = createDialogConfirmation({
    overlays: workstation.shell.overlays,
    el,
    button,
  });
  const taskPanel = el(
    'section',
    {
      class: 'v2-three-task',
      hidden: true,
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Background task',
    },
    hook('processTaskTitle', el('strong')),
    hook('processTaskStage', el('span')),
    hook('processTaskElapsed', el('span')),
    hook('processTaskAbortBtn', button('Abort', null, 'stop')),
  );
  hook('processTaskDialog', taskPanel);
  document.body.append(taskPanel);
  const task = createProcessTaskController({
    root,
    status,
    setApplyDisabled: (busy) => {
      for (const node of document.querySelectorAll(
        '.p-inspector,#mainPanel,#maskPanel,#sectionPanel',
      ))
        node.inert = busy;
      if (process) process.updateUi();
      document
        .querySelector('[data-action="three-export-menu"]')
        ?.toggleAttribute('disabled', busy);
      hooks.get('undoBtn')?.toggleAttribute('disabled', busy || !undo.length);
      hooks.get('redoBtn')?.toggleAttribute('disabled', busy || !redo.length);
    },
  });
  task.bind();
  const session = createWorkspaceSessionController({
    // A preview never reads or acquires the saved workspace writer lease.
    ...(readOnly ? { storage: null, tabId: 'welcome-preview' } : {}),
    onStateChange: (value) => persistence?.syncSessionState(value),
  });
  window.addEventListener('pagehide', () => {
    // View persistence is synchronous. Structural saves start on hidden/
    // beforeunload; pending structural edits are guarded by the unload prompt.
    // Release on actual departure so a successor document can acquire its lease.
    void persistence?.persistNow({ force: true }).catch(() => false);
    task.dispose();
    session.stop();
  });
  window.addEventListener('beforeunload', (event) => {
    if (task.isBusy() || persistence?.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
    void persistence?.persistNow({ force: true }).catch(() => false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden')
      void persistence?.persistNow({ force: true }).catch(() => false);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) globalThis.location.reload();
  });
  const checkpoint = (reason) => persistence?.checkpointCurrent(reason) ?? Promise.resolve(false);
  const refreshRecovery = () => persistence?.refreshRecoveryOptions() ?? Promise.resolve();
  function transaction() {
    return {
      project: structuredClone(projectState.buildProjectSnapshot(true)),
      workspaceState: structuredClone(projectState.buildProjectSnapshot(false)),
    };
  }
  function restoreTransaction(value) {
    if (!value?.project) return false;
    store.restore(value.project);
    history.importRecords(value.project.snapshots || [], value.project.snapshotBranches);
    mutation?.cancelEdit();
    mutation?.cancelInsert();
    project?.renderSnapshots();
    domain?.syncBaseControls();
    domain?.importer.syncTransformInputs();
    dirty();
    refresh();
    return true;
  }
  const step = host('panel.process.step');
  const face = choice(
    'Surface',
    'faceToggleBtn',
    [
      ['front', 'Front'],
      ['back', 'Back'],
      ['both', 'Both'],
    ],
    processFace,
  );
  step.append(
    el(
      'div',
      { id: 'operationTools', class: 'p-form v2-process-form' },
      choice('Operation', 'operationType', [
        ['add', 'Deposit'],
        ['grow', 'Extend'],
        ['etch', 'Etch'],
        ['liftoff', 'Lift-off'],
        ['implant', 'Implant'],
        ['electrical', 'Electrical'],
        ['record', 'Record'],
      ]),
      face,
      hook('processParametersHeading', el('strong')),
      row(
        'operationAreaRow',
        choice(
          'Area',
          'operationArea',
          [
            ['mask', 'Selected Mask'],
            ['invert', 'Invert Mask'],
            ['full', 'Whole face'],
          ],
          'mask',
        ),
      ),
      row('layerNameRow', input('Layer name', 'layerName', 'New layer')),
      row('targetLayerRow', choice('Target layer', 'targetLayer', [])),
      row(
        'etchTargetLayerRow',
        choice('Material', 'etchTargetLayer', [['', 'All exposed materials']]),
      ),
      row(
        'liftoffTargetRow',
        el(
          'div',
          {},
          choice('Sacrificial layer', 'liftoffTargetLayer', []),
          hook('liftoffTargetHint', el('small', { class: 'p-aux' })),
        ),
      ),
      row('implantNameRow', input('Name', 'implantName', 'Implant 1')),
      row('electricalNameRow', input('Name', 'electricalName', 'Electrical Region 1')),
      row(
        'growthModeRow',
        choice('Coverage', 'growthMode', [
          ['direct', 'Direct'],
          ['conformal', 'Conformal'],
        ]),
      ),
      row(
        'transferModeRow',
        choice('Placement', 'transferMode', [
          ['follow', 'Follow surface'],
          ['flat', 'Flat bridge'],
        ]),
      ),
      row(
        'operationThicknessRow',
        fields.input('Thickness / depth · µm', 'operationThickness', 0.07),
      ),
      row(
        'etchProfileRow',
        choice('Profile', 'etchProfile', [
          ['directional', 'Directional'],
          ['isotropic', 'Isotropic release'],
        ]),
      ),
      row(
        'etchSurfaceRow',
        choice('Surface', 'etchSurfaceMode', [
          ['smooth', 'Smooth'],
          ['rough', 'Rough'],
          ['pyramid', 'Pyramid'],
        ]),
      ),
      row('implantTiltRow', fields.input('Tilt X · °', 'implantTilt', 0, { kind: 'angle' })),
      row(
        'electricalRegionParams',
        el(
          'div',
          { class: 'p-form' },
          choice(
            'Type',
            'electricalRegionType',
            [
              'p-type',
              'n-type',
              'p-inversion',
              'n-inversion',
              'p-accumulation',
              'n-accumulation',
              'depletion',
              'custom',
            ].map((v) => [v, v]),
          ),
          choice(
            'Source',
            'electricalRegionSource',
            ['induced', 'doped', 'interface', 'custom'].map((v) => [v, v]),
          ),
        ),
      ),
      row(
        'recordProcessParams',
        el(
          'div',
          { class: 'p-form' },
          choice(
            'Process',
            'recordProcessType',
            ['anneal', 'clean', 'oxidation', 'surface-treatment', 'activation', 'custom'].map(
              (v) => [v, v],
            ),
          ),
          input('Label', 'recordProcessLabel', 'Anneal'),
          input('Temperature · °C', 'recordTemperature', '', { type: 'number' }),
          input('Time · min', 'recordDuration', '', { type: 'number' }),
          input('Ambient', 'recordAmbient'),
          input('Note', 'recordNote'),
        ),
      ),
      row('roughFeatureRow', fields.input('Feature XY · µm', 'roughFeatureSize', 0.5)),
      row(
        'roughFeatureCvRow',
        fields.input('Feature CV · %', 'roughFeatureCv', 25, { kind: 'number' }),
      ),
      row('roughHeightRow', fields.input('Height mean · µm', 'roughAmplitude', 0.05)),
      row(
        'roughHeightCvRow',
        fields.input('Height CV · %', 'roughHeightCv', 25, { kind: 'number' }),
      ),
      row(
        'roughPolarityRow',
        choice('Orientation', 'roughPolarity', [
          ['inverted', 'Inverted · pits'],
          ['normal', 'Normal · peaks'],
        ]),
      ),
      row('roughSeedRow', input('Seed', 'roughSeed', '', { type: 'number', step: 1 })),
      el(
        'div',
        { class: 'p-actions' },
        hook(
          'applyOperationBtn',
          button('Apply', null, 'play', { primary: true, 'data-help': 'process.apply' }),
        ),
        hook('undoBtn', button('Undo', null, 'back')),
        hook('redoBtn', button('Redo')),
      ),
      hook('processSummary', el('p', { class: 'p-aux' })),
      hook('operationNote', el('p', { class: 'p-aux' })),
    ),
  );
  hook('operationTools', step.querySelector('#operationTools'));
  for (const [id, help] of Object.entries({
    operationType: 'process.operation',
    operationArea: 'process.area',
    operationThickness: 'process.thickness',
    growthMode: 'process.growth',
    transferMode: 'process.transfer',
    etchProfile: 'process.profile',
    etchSurfaceMode: 'process.surface',
    implantTilt: 'process.implant.tilt',
    roughFeatureSize: 'process.rough.feature',
    roughFeatureCv: 'process.rough.featurecv',
    roughAmplitude: 'process.rough.height',
    roughHeightCv: 'process.rough.heightcv',
    roughPolarity: 'process.rough.polarity',
    roughSeed: 'process.rough.seed',
    liftoffTargetLayer: 'process.liftoff',
  }))
    hooks.get(id)?.setAttribute('data-help', help);
  const form = hooks.get('operationTools');
  const materialPreview = choice(
    'Material / target',
    'v2MaterialPreview',
    state.model.layers.map((l) => [l.id, l.name]),
    state.model.layers.at(-1)?.id,
  );
  hooks.get('v2MaterialPreview').disabled = true;
  hooks.get('v2MaterialPreview').title = 'Material mapping is pending separate review.';
  const thickness = hooks.get('operationThickness');
  const stepActions = el('div', { class: 'p-actions' });
  for (const [label, direction] of [
    ['Decrease Thickness / depth', -1],
    ['Increase Thickness / depth', 1],
  ]) {
    const control = button(direction < 0 ? '−' : '+', null, null, { 'aria-label': label });
    control.onclick = () => {
      const before = formSnapshot();
      commitDraft(); // Finish an earlier focused edit before the button owns this change.
      const current = units.parse(thickness.value);
      if (!Number.isFinite(current)) return;
      const physical = Math.max(0, current + direction * 0.001);
      thickness.value = units.format(physical);
      thickness.dispatchEvent(new Event('change', { bubbles: true }));
      if (JSON.stringify(before) !== JSON.stringify(formSnapshot())) {
        draftPast.push(before);
        draftFuture.length = 0;
        draftUndo.disabled = false;
        draftRedo.disabled = true;
      }
    };
    stepActions.append(control);
  }
  // M2 stepper is a two-column wrapper around the entire labelled field.
  // Putting the grid on the label itself stacks +/- below a narrow, wrapped label.
  const thicknessStepper = el('div', { class: 'p-stepper' });
  thicknessStepper.append(hooks.get('operationThicknessRow'), stepActions);
  const addToRecipe = choice(
    'Also add to Recipe',
    'v2RecordManual',
    [
      ['false', 'No'],
      ['true', 'Yes'],
    ],
    'false',
  );
  const inputUnit = el('span', { class: 'p-aux' });
  const operationButtons = hooks.get('applyOperationBtn').parentElement;
  operationButtons.className = 'p-apply-actions';
  hooks.get('applyOperationBtn').dataset.action = 'apply';
  hooks.get('undoBtn').remove();
  hooks.get('redoBtn').remove();
  const draftUndo = button('', null, 'undo', {
    'aria-label': 'Undo form edit',
    title: 'Undo form edit',
    'data-help': 'process.form.undo',
    disabled: true,
  });
  const draftRedo = button('', null, 'redo', {
    'aria-label': 'Redo form edit',
    title: 'Redo form edit',
    'data-help': 'process.form.redo',
    disabled: true,
  });
  operationButtons.append(
    el(
      'div',
      { class: 'p-edit-actions', role: 'toolbar', 'aria-label': 'Form edits' },
      draftUndo,
      draftRedo,
    ),
  );
  const draftPast = [],
    draftFuture = [];
  let draftBefore = null;
  const formSnapshot = () => ({
    unit: units.key(),
    values: [...form.querySelectorAll('input,select')].map((node) => [node.id, node.value]),
  });
  const commitDraft = () => {
    if (draftBefore && JSON.stringify(draftBefore) !== JSON.stringify(formSnapshot())) {
      draftPast.push(draftBefore);
      draftFuture.length = 0;
    }
    draftBefore = null;
    draftUndo.disabled = !draftPast.length;
    draftRedo.disabled = !draftFuture.length;
  };
  form.addEventListener('focusin', (event) => {
    if (event.target.matches('input,select')) draftBefore = formSnapshot();
  });
  form.addEventListener('change', commitDraft);
  form.addEventListener('focusout', commitDraft);
  for (const [control, source, destination] of [
    [draftUndo, draftPast, draftFuture],
    [draftRedo, draftFuture, draftPast],
  ])
    control.onclick = () => {
      if (!source.length) return;
      destination.push(formSnapshot());
      const saved = source.pop();
      for (const [id, value] of saved.values) {
        const node = root.getElementById(id);
        if (!node) continue;
        node.value = value;
        if (node.dataset.displayLength) node.dataset.displayLength = saved.unit;
      }
      processFace = hooks.get('faceToggleBtn').value;
      syncDisplayUnitFields(form, units.key());
      draftUndo.disabled = !draftPast.length;
      draftRedo.disabled = !draftFuture.length;
      refresh();
    };
  const parameterRows = [
    'layerNameRow',
    'growthModeRow',
    'transferModeRow',
    'liftoffTargetRow',
    'implantNameRow',
    'implantTiltRow',
    'electricalNameRow',
    'electricalRegionParams',
    'etchProfileRow',
    'etchSurfaceRow',
    'roughFeatureRow',
    'roughFeatureCvRow',
    'roughHeightRow',
    'roughHeightCvRow',
    'roughPolarityRow',
    'roughSeedRow',
    'recordProcessParams',
  ];
  form.append(
    hooks.get('operationType').closest('label'),
    materialPreview,
    hooks.get('targetLayerRow'),
    hooks.get('etchTargetLayerRow'),
    thicknessStepper,
    ...parameterRows.map((id) => hooks.get(id)),
    face,
    hooks.get('operationAreaRow'),
    addToRecipe,
    inputUnit,
    operationButtons,
  );
  for (const id of ['targetLayer', 'etchTargetLayer'])
    hooks.get(id).closest('label').querySelector('.wc-label').textContent = 'Material / target';
  face.querySelector('.wc-label').textContent = 'Active face';
  hooks.get('faceToggleBtn').dataset.help = 'process.face';
  hooks.get('v2RecordManual').dataset.help = 'process.record';
  const guide = el('details', { class: 'p-process-guide', open: true });
  const processSummary = el('span', { class: 'p-aux' });
  step.append(
    guide,
    el(
      'div',
      { class: 'p-process-summary' },
      processSummary,
      button('View results', 'return-results', 'eye'),
    ),
  );
  function syncManualPresentation() {
    const type = hooks.get('operationType').value;
    hooks.get('operationThickness').dataset.helpContext = type;
    // The Process controller toggles the labelled row, so its wrapper follows it.
    thicknessStepper.hidden = hooks.get('operationThicknessRow').classList.contains('hidden');
    materialPreview.hidden = !['add', 'implant', 'electrical'].includes(type);
    inputUnit.textContent = `Input unit: ${units.label()}`;
    processSummary.textContent = `${modelInventoryCount(state.model)} · ${state.model.layers.length} layers`;
    // The existing Process controller resets button.textContent during refresh.
    // Reinstall the one M2 icon after its public update has completed.
    const apply = hooks.get('applyOperationBtn');
    if (!apply.querySelector('svg.wc-icon')) apply.prepend(window.WaferCadV2Icons.icon('play'));
    for (const id of ['processParametersHeading', 'processSummary', 'operationNote'])
      if (hooks.has(id)) hooks.get(id).hidden = true;
    const api = window.WaferCadProcessGuide;
    const id = api.processGuideKey({
      type,
      growth: hooks.get('growthMode').value,
      placement: hooks.get('transferMode').value,
      profile: hooks.get('etchProfile').value,
      surface: hooks.get('etchSurfaceMode').value,
      polarity: hooks.get('roughPolarity').value,
      targetMaterial: Boolean(hooks.get('etchTargetLayer').value),
    });
    const entry = api.processGuideEntry(id);
    const illustration = (after) => {
      const drawing = el('div', { class: 'p-process-guide-drawing' });
      drawing.innerHTML = api.processGuideSvg(id, after);
      return el('div', {}, el('span', { class: 'p-aux' }, after ? 'After' : 'Before'), drawing);
    };
    const name = {
      add: 'Deposit',
      grow: 'Extend',
      etch: 'Etch',
      liftoff: 'Lift-off',
      implant: 'Implant',
      electrical: 'Electrical',
      record: 'Record',
    }[type];
    guide.replaceChildren(
      el('summary', {}, `How ${name} works`),
      el('strong', {}, entry.title),
      el(
        'div',
        { class: 'p-process-guide-illustrations' },
        illustration(false),
        el('span', {}, '→'),
        illustration(true),
      ),
      el('p', {}, entry.summary),
      el(
        'small',
        { class: 'p-aux' },
        `${hooks.get('operationArea').selectedOptions[0].textContent} · ${processFace === 'both' ? 'Both' : processFace === 'back' ? 'Back' : 'Front'}`,
      ),
      el(
        'a',
        {
          href: `https://github.com/Xiaolong-6/WaferCAD/wiki/Process-Operations#${id}`,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        'Full operation guide ↗',
      ),
    );
  }
  // Label hooks retained by the original controller; new controls own the visible unit labels.
  for (const id of [
    'processThicknessLabel',
    'roughFeatureLabel',
    'roughHeightLabel',
    'processGuideOperation',
  ])
    hook(id, el('span'));
  const historyHost = host('panel.history');
  const bookmark = input('Bookmark name', 'v2BookmarkName');
  bookmark.querySelector('.wc-label').remove();
  hooks.get('v2BookmarkName').placeholder = 'Bookmark name…';
  hooks.get('v2BookmarkName').setAttribute('aria-label', 'Bookmark name');
  const addBookmark = button('Add', null, 'bookmark', {
    'data-variant': 'ghost',
    'aria-label': 'Bookmark current state',
    title: 'Bookmark current state',
    'data-help': 'history.bookmark',
  });
  for (const [id, label, icon] of [
    ['undoBtn', 'Undo', 'undo'],
    ['redoBtn', 'Redo', 'redo'],
  ]) {
    const control = hooks.get(id);
    control.replaceChildren(window.WaferCadV2Icons.icon(icon));
    control.setAttribute('aria-label', label);
    control.removeAttribute('title');
    control.dataset.help = id === 'undoBtn' ? 'history.undo' : 'history.redo';
    control.dataset.variant = 'icon';
  }
  const recovery = choice('Recovery', 'workspaceRecoverySelect', [['', 'Choose checkpoint…']]);
  recovery.querySelector('.wc-label').remove();
  hooks.get('workspaceRecoverySelect').setAttribute('aria-label', 'Recovery checkpoint');
  hooks.get('workspaceRecoverySelect').dataset.help = 'recovery.restore';
  const recover = hook(
    'workspaceRestoreBtn',
    button('Restore', null, 'history', {
      disabled: true,
      'data-variant': 'ghost',
      'data-help': 'recovery.restore',
    }),
  );
  const clearRecovery = hook(
    'workspaceRecoveryClearBtn',
    button('Clear Recovery', null, 'delete', {
      'data-variant': 'ghost',
      'data-help': 'recovery.clear',
    }),
  );
  const takeOver = hook(
    'workspaceTakeOverBtn',
    button('Take over storage', null, null, { 'data-help': 'recovery.takeover' }),
  );
  // Retain the controller hook without exposing the development reload shortcut.
  hook('safeReloadBtn', button('Save and reload', null, 'save', { hidden: true }));
  hook('workspaceSaveStatus', workstation.shell.getSlot('status.save'));
  const conflict = hook(
    'workspaceConflictDialog',
    el('div', { hidden: true, class: 'p-form' }, el('strong'), el('span'), takeOver),
  );
  historyHost.append(
    el(
      'div',
      { class: 'p-history-workspace' },
      el(
        'div',
        { class: 'p-history-fixed' },
        el(
          'div',
          { class: 'p-history-toolbar' },
          el('span', { class: 'p-aux' }, 'Steps · ', hook('snapshotCount', el('span'))),
          el('div', { class: 'p-actions' }, hooks.get('undoBtn'), hooks.get('redoBtn')),
        ),
        el('div', { class: 'p-history-bookmark-row' }, bookmark, addBookmark),
        hook('snapshotContinuation', el('div', { class: 'v2-history p-history-reminder' })),
      ),
      hook('snapshotList', el('div', { class: 'v2-history p-history-scroll' })),
    ),
  );
  const recoveryPanel = el(
    'details',
    { open: true },
    el('summary', {}, el('strong', {}, 'Recovery')),
    recovery,
    el('div', { class: 'p-actions' }, recover, clearRecovery),
  );
  const openProcess = () => {
    workstation.uiState.domain = 'process';
    workstation.uiState.mobile = 'edit';
    workstation.uiState.editorHidden = false;
    refresh();
  };
  mutation = createHistoryMutationController({
    snapshotManager: history,
    getProcessPanelController: () => process,
    confirmationDialog: confirmation,
    checkpointWorkspace: checkpoint,
    markProjectDirty: dirty,
    refreshAfterHistoricalLoad: refresh,
    renderSnapshots: () => project?.renderSnapshots(),
    openProcessPanel: openProcess,
    updateOperationUI: () => {
      process?.updateUi();
      // History edit/insert loads the old Process controller after opening the
      // v2 panel. Keep retired helper rows hidden before the next pointerdown:
      // hiding operationNote later shifts the Apply button during the click.
      syncManualPresentation();
    },
    captureReplayTransaction: transaction,
    restoreReplayTransaction: restoreTransaction,
    status,
  });
  const color = (kind, id) => {
    const values =
      kind === 'layer'
        ? state.model.layers
        : kind === 'implant'
          ? state.model.implants
          : state.model.electricalRegions;
    const palette = STRUCTURE_PALETTES[state.activeStructurePalette] || STRUCTURE_PALETTES.balanced;
    const index = Math.max(
      0,
      values.findIndex((item) => item.id === id),
    );
    ({ layer: recolorLayer, implant: recolorImplant, electrical: recolorElectricalRegion })[kind](
      state.model,
      id,
      palette[index % palette.length],
    );
  };
  process = createProcessPanelController({
    root,
    getModel: () => state.model,
    setModel: (value) => {
      state.model = value;
    },
    getActiveFace: () => processFace,
    setActiveFace: (value) => {
      processFace = ['front', 'back', 'both'].includes(value) ? value : 'front';
      hooks.get('faceToggleBtn').value = processFace;
    },
    getMaskState: () => state,
    operationAreaGeometry: store.selection.operationAreaGeometry,
    selectedElement: store.selectedElement,
    manualMicron: units.parse,
    formatLengthField: units.format,
    processTaskController: task,
    saveHistory: () => {
      undo.push(transaction());
      redo.length = 0;
    },
    beforeApply: mutation.beforeApply,
    commitApplyBranch: mutation.commitApplyBranch,
    afterApply: mutation.afterApply,
    getHistoricalStepEdit: mutation.currentEdit,
    getHistoricalStepInsert: mutation.currentInsert,
    clearBaseRevertSnapshot: () => domain?.clearBaseRevert(),
    recordProcessOperation: (operation) => {
      recipe?.recordManualOperation(operation);
      history.recordOperation(operation);
      dirty();
      project?.renderSnapshots();
    },
    colorNewLayer: (id) => color('layer', id),
    colorNewImplant: (id) => color('implant', id),
    colorNewElectricalRegion: (id) => color('electrical', id),
    renderAll: refresh,
    status,
  });
  domain = createProjectMaskPanels({
    store,
    workstation,
    controls: { hook, root, input, choice, fields, host },
    task,
    confirmation,
    transaction,
    restoreTransaction,
    undo,
    redo,
    checkpoint,
    refresh,
    getProject: () => project,
    refreshRecovery,
    dirty,
  });
  recoveryPanel.querySelector('.p-actions').prepend(hooks.get('saveProjectBtn'));
  host('panel.base').append(recoveryPanel, conflict);
  let historyMenuId = 0;
  project = createProjectController({
    root,
    compactHistory: true,
    decorateHistoryMenu({ details, trigger, content }) {
      // Keep controller-owned content in place while native top-layer popovers
      // avoid clipping inside the History scroller and share overlay lifecycle.
      content.id = `v2-history-menu-${++historyMenuId}`;
      content.popover = 'auto';
      workstation.shell.overlays.adoptPopover(content, trigger);
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) {
          content.showPopover();
          const anchor = trigger.getBoundingClientRect();
          content.style.left = `${Math.max(8, Math.min(anchor.right - content.offsetWidth, innerWidth - content.offsetWidth - 8))}px`;
          content.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, innerHeight - content.offsetHeight - 8))}px`;
        } else if (content.matches(':popover-open')) content.hidePopover();
      });
      content.addEventListener('toggle', (event) => {
        if (event.newState === 'closed') details.open = false;
      });
    },
    ...domain.bindings,
    snapshotManager: history,
    renderAll: refresh,
    status,
    checkpointBeforeReplace: checkpoint,
    onProjectChanged: dirty,
    allowVolatileNewProject: () => !session.hasWriteLease(),
    confirmAction: confirmation.confirm,
    beginHistoricalStepEdit: mutation.beginEdit,
    getHistoricalStepEdit: mutation.currentEdit,
    cancelHistoricalStepEdit: mutation.cancelEdit,
    beginHistoricalStepInsert: mutation.beginInsert,
    getHistoricalStepInsert: mutation.currentInsert,
    cancelHistoricalStepInsert: mutation.cancelInsert,
  });
  project.bind();
  const processModes = el(
    'div',
    { class: 'p-actions', 'aria-label': 'Process modes' },
    ...[
      ['step', 'Manual', 'manual'],
      ['recipe', 'Recipe', 'recipe'],
      ['code', 'Code', 'recipe'],
      ['diagnostics', 'Diagnostics', 'diagnostics'],
    ].map(([key, label, mode]) =>
      button(
        label,
        `process-mode:${key}`,
        key === 'step' ? 'process' : key === 'diagnostics' ? 'settings' : key,
        {
          'data-process-input-mode': mode,
          'aria-pressed': String(key === 'step'),
          'data-help': `process.mode.${key === 'step' ? 'manual' : key}`,
        },
      ),
    ),
  );
  host('panel.process').prepend(processModes);
  const recipePane = hook('recipeProcessPane', el('div', { class: 'v2-recipe' }));
  host('panel.process.recipe').append(recipePane);
  hook('manualProcessPane', step);
  const recordManual = hook('recipeRecordManual', el('input', { type: 'checkbox' }));
  recordManual.hidden = true;
  step.append(recordManual);
  hooks.get('v2RecordManual').onchange = (event) => {
    recordManual.checked = event.target.value === 'true';
    recordManual.dispatchEvent(new Event('change'));
  };
  const diagnosticsPane = hook(
    'geometryDiagnosticsPanel',
    el(
      'div',
      { class: 'v2-diagnostics' },
      hook('diagnosticsAnalyzeBtn', button('Analyze', null, 'process')),
      hook('diagnosticsStatus', el('p', { class: 'p-aux' })),
      hook('diagnosticsResults', el('div')),
    ),
  );
  host('panel.process.diagnostics').append(diagnosticsPane);
  recipe = createProcessRecipeController({
    root,
    inlineStepEditor: true,
    templatesEnabled: false,
    getRecipe: () => state.processRecipe,
    setRecipe: (value) => {
      state.processRecipe = value ? structuredClone(value) : null;
    },
    getModel: () => state.model,
    getMaskState: () => state,
    setMaskState: (next) => {
      if (next.activeCell && Object.hasOwn(state.layout.hierarchy || {}, next.activeCell))
        state.activeCell = next.activeCell;
      if (Array.isArray(next.selectedLayerKeys))
        state.selectedLayerKeys = new Set(next.selectedLayerKeys);
      state.maskSourceMode = next.maskSourceMode === 'draw' ? 'draw' : 'file';
      if (next.maskTransform) state.maskTransform = { ...next.maskTransform };
      state.maskRoi = next.maskRoi ? structuredClone(next.maskRoi) : null;
      if (state.maskSourceMode === 'draw' && next.drawMask)
        state.drawMask = structuredClone(next.drawMask);
      domain.browser.invalidateScope();
      dirty();
      refresh();
    },
    setActiveFace: (value) => {
      processFace = ['front', 'back', 'both'].includes(value) ? value : 'front';
      hooks.get('faceToggleBtn').value = processFace;
    },
    processPanelController: process,
    processTaskController: task,
    snapshotManager: history,
    formatCanonicalLengthInput: units.canonicalInput,
    updateOperationUI: process.updateUi,
    renderAll: refresh,
    renderSnapshots: project.renderSnapshots,
    resetToBase: (recipeBase) => domain.base.applyBase({ recipeBase }),
    checkpointWorkspace: checkpoint,
    confirmContinue: () =>
      confirmation.confirm({
        title: 'Continue Recipe on current model?',
        message: 'This applies the Recipe again to the existing geometry.',
        confirmLabel: 'Continue and apply',
      }),
    status,
    onChanged: dirty,
  });
  recipe.bind();
  diagnostics = createProcessDiagnosticsController({ root, getModel: () => state.model });
  diagnostics.bind();
  window.addEventListener('pagehide', diagnostics.dispose);
  store.onRestore(() => recipe.refresh());
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action^="process-mode:"]');
    if (!target) return;
    workstation.uiState.processMode = target.dataset.action.split(':')[1];
    processModes
      .querySelectorAll('button')
      .forEach((node) => node.setAttribute('aria-pressed', String(node === target)));
    refresh();
  });
  for (const mode of ['recipe', 'code', 'diagnostics'])
    workstation.adapters.register(`panel.process.${mode}`, {
      mount: (node) => node,
      onShow: () => {
        if (mode === 'diagnostics') diagnosticsPane.hidden = false;
        else {
          host(`panel.process.${mode}`).append(recipePane);
          recipePane.hidden = false;
          recipe.setCodeMode(mode === 'code');
        }
      },
      onHide() {},
      destroy() {},
    });
  persistence = createWorkspacePersistenceController({
    root,
    ...(readOnly ? { storage: null, channelFactory: () => null } : {}),
    workspaceSession: session,
    status,
    buildProjectSnapshot: projectState.buildProjectSnapshot,
    progressiveHistoryValidation: true,
    progressiveWorkspaceRestore: true,
    loadProjectSnapshot: domain.load,
    cacheValidatedProjectSnapshots: projectState.readWorkerValidatedProjectSnapshotAsync,
    snapshotManager: history,
    syncBaseControls: domain.syncBaseControls,
    syncTransformInputs: domain.importer.syncTransformInputs,
    renderAll: refresh,
    renderSnapshots: project.renderSnapshots,
    fit3d: domain.bindings.fit3d,
    initializeWorkspaceStart: async () => {
      const params = new URLSearchParams(globalThis.location?.search || '');
      const intent = params.get('start');
      if (!params.has('start')) return true;
      try {
        let staged = false;
        if (intent === 'empty') {
          domain.bindings.resetProjectState();
          history.importRecords([], null);
        } else if (intent === 'example') {
          const bundled = await loadBundledProject(
            params.get('example') || 'photodetector-literature',
            domain.bindings.readProjectFileTask,
          );
          await history.importRecordsAsync(
            bundled.data.snapshots || [],
            bundled.data.snapshotBranches,
            { beforeCommit: () => domain.load(bundled.data) },
          );
          store.project.source = bundled.source;
          store.project.hash = bundled.hash;
        } else if (intent === 'staged') {
          const pending = await readStartupFile();
          if (!pending)
            throw Error(
              'No pending Welcome file was found. Return to Welcome and choose it again.',
            );
          if (pending.kind === 'layout') {
            const imported = await domain.bindings.importLayoutBuffer(
              await pending.file.arrayBuffer(),
              pending.file.name,
              pending.file.name,
              { startupProtected: true },
            );
            if (!imported) throw Error('The staged layout was not imported.');
          } else if (pending.kind === 'project') {
            const imported = await domain.bindings.readProjectFileTask(pending.file);
            if (!imported) throw Error('The staged project could not be read.');
            await history.importRecordsAsync(imported.snapshots || [], imported.snapshotBranches, {
              beforeCommit: () => domain.load(imported),
            });
          } else {
            throw Error('The staged file type is unsupported.');
          }
          await removeStartupFile();
          staged = true;
        } else {
          throw Error(`Unknown startup intent: ${intent}`);
        }
        domain.syncBaseControls();
        domain.importer.syncTransformInputs();
        project.renderSnapshots();
        refresh();
        const url = new URL(globalThis.location.href);
        url.searchParams.delete('start');
        url.searchParams.delete('example');
        globalThis.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        status(
          staged
            ? 'Staged file opened.'
            : intent === 'empty'
              ? 'New empty project.'
              : 'Example opened.',
        );
        return true;
      } catch (error) {
        console.error(error);
        status(`Could not start workspace: ${error.message}`);
        return false;
      }
    },
    hasExplicitStart: new URLSearchParams(globalThis.location?.search || '').has('start'),
    normalizedProjectName: domain.bindings.normalizedProjectName,
    getProjectName: () => state.projectName,
    setProjectName: (value) => {
      state.projectName = value;
    },
    syncProjectNameInput: domain.syncProjectNameInput,
    taskController: task,
    confirmAction: confirmation.confirm,
    chooseAction: confirmation.ask,
  });
  persistence.bind();
  for (const name of ['click', 'change', 'input', 'pointerup'])
    document.addEventListener(name, () => queueMicrotask(() => persistence.schedule()));
  step.addEventListener('change', () => {
    processFace = hooks.get('faceToggleBtn').value;
    refresh();
  });
  hooks.get('applyOperationBtn').onclick = () =>
    void process.applyOperation().catch((error) => status(error.message));
  for (const [id, from, to] of [
    ['undoBtn', undo, redo],
    ['redoBtn', redo, undo],
  ])
    hooks.get(id).onclick = () => {
      if (task.isBusy() || !from.length) return;
      to.push(transaction());
      restoreTransaction(from.pop());
      status(id === 'undoBtn' ? 'Undone.' : 'Redone.');
    };
  addBookmark.onclick = () => {
    if (task.isBusy()) return;
    try {
      history.create(hooks.get('v2BookmarkName').value);
      dirty();
      project.renderSnapshots();
      status('Bookmark saved.');
    } catch (error) {
      status(error.message);
    }
  };
  for (const [id, onShow] of [
    [
      'panel.process.step',
      () => {
        step.hidden = false;
        process.updateUi();
        syncManualPresentation();
      },
    ],
    [
      'panel.history',
      () => {
        project.renderSnapshots();
        void refreshRecovery().catch((error) => status(error.message));
      },
    ],
  ])
    workstation.adapters.register(id, { mount: (node) => node, onShow, onHide() {}, destroy() {} });
  process.updateUi();
  project.renderSnapshots();
  return {
    task,
    process,
    history,
    refresh,
    refreshRecovery,
    confirmation,
    persistence,
    domain,
    async start() {
      if (readOnly) return;
      session.start();
      await persistence.initializePersistedWorkspace();
    },
    snapshot: () => ({
      position: history.currentPosition(),
      processFace,
      steps: history.listHistory(),
      bookmarks: history.list(),
      branches: history.listBranches(),
      busy: task.isBusy(),
      undo: undo.length,
      redo: redo.length,
      writable: session.hasWriteLease(),
      dirty: persistence.isDirty(),
    }),
  };
}
