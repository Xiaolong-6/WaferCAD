// M2 mock controller and simulated domain actions. Replaced through adapters in M3; never imports core.
(() => {
  const { installSprite, icon } = window.WaferCadV2Icons;
  const {
    el,
    button,
    select,
    field,
    stepper,
    emptyState,
    busy,
    panelHeader,
    divider,
    toolbar,
    row,
    notice,
  } = window.WaferCadV2Components;

  const root = document.querySelector('#app-root');
  const query = new URL(window.location.href).searchParams;
  const viewState = window.WaferCadV2ViewState;
  const preferredMode = viewState.preferredMode(
    viewState.viewportWidth(window),
    viewState.readMode(window),
  );
  const state = {
    layout: 'a',
    example: query.get('example') === 'photodetector' ? 'photodetector' : 'm3d',
    placement: 'process',
    font: query.get('font') === 'system' ? 'system' : 'inter',
    domain: ['project', 'mask', 'process', 'recipe', 'code', 'history'].includes(
      query.get('domain'),
    )
      ? query.get('domain')
      : query.get('scene') === 'recipe-failure'
        ? 'recipe'
        : query.get('scene') === 'empty-history'
          ? 'history'
          : 'process',
    mode: ['overview', 'split'].includes(preferredMode) ? preferredMode : 'single',
    view: viewState.singles.includes(preferredMode) ? preferredMode : 'main',
    desktopMode: viewState.compact(window) ? viewState.readMode(window) || 'main' : preferredMode,
    splitViews: viewState.readSplit(window),
    mobile: query.get('scene') === 'empty-history' ? 'view' : 'edit',
    section: true,
    legendOpen: true,
    maximize: null,
    maskMode: 'draw',
    roi: false,
    zbreak: false,
    detail: false,
    quality: 'Fast',
    task: null,
    failure: null,
    message: 'M2 · MOCK SHELL · no core connection / no project persistence.',
    empty: query.get('scene') === 'empty-history',
    emptyExpanded: false,
    dirty: false,
    panelSize: null,
    bottomSize: null,
    tool: 'pan',
    displayUnit: 'um',
    roiShape: 'rect',
    roiAnchor: 'center',
    roiSettings: { x: 0, y: 0, width: 0, height: 0, radius: 0, rotation: 0 },
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskOpacity: 0.65,
    threeOpacity: 1,
    borders: false,
    sectionScale: 'auto',
    sectionBorders: false,
    zBreakSettings: { start: 0.2, end: 0.8, frontScale: 1, backScale: 1, snap: true },
    sectionLine: null,
    drawTool: 'select',
    drawDraft: [],
    layerVisibility: {},
    recipeUndo: false,
    recipeRedo: false,
    draftUndo: false,
    draftRedo: false,
  };
  let fileMask,
    fixtures,
    data,
    recipe,
    cursor,
    branch,
    variants = [],
    activeStep = 0,
    originFocus,
    recipeUndoStack = [],
    recipeRedoStack = [],
    draftUndoStack = [],
    draftRedoStack = [],
    pendingRecipeTemplate = null;
  const narrow = () => viewState.compact(window);
  function rememberView() {
    const mode = state.mode === 'single' ? state.view : state.mode;
    if (!narrow()) state.desktopMode = mode;
    viewState.remember(window, mode, state.splitViews);
  }
  const currentModel = () =>
    data.models[data.history.find((n) => n.id === cursor)?.modelRef ?? 'project'];
  const stepTitle = (s) =>
    s.params.material || s.params.target || s.params.label || s.params.name || s.command;
  function useExample() {
    data = fixtures.find((f) => f.id === state.example);
    recipe = structuredClone(data.recipe);
    cursor = data.cursor;
    branch = data.activeBranch;
    variants = [];
    activeStep = 0;
    recipeUndoStack = [];
    recipeRedoStack = [];
    draftUndoStack = [];
    draftRedoStack = [];
    state.recipeUndo = false;
    state.recipeRedo = false;
    state.draftUndo = false;
    state.draftRedo = false;
    state.maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    state.roiSettings = {
      x: 0,
      y: 0,
      width: Number((currentModel().width * 0.4).toPrecision(8)),
      height: Number((currentModel().height * 0.4).toPrecision(8)),
      radius: Number((Math.min(currentModel().width, currentModel().height) * 0.2).toPrecision(8)),
      rotation: 0,
    };
    state.sectionLine = {
      ax: Number(data.section.a?.[0] || 0),
      ay: Number(data.section.a?.[1] || 0),
      bx: Number(data.section.b?.[0] || currentModel().width / 2),
      by: Number(data.section.b?.[1] || currentModel().height / 2),
    };
    state.drawDraft = structuredClone(data.drawMask.shapes || []);
    state.layerVisibility = Object.fromEntries(
      currentModel().layers.map((layer) => [layer.id, true]),
    );
    state.task = null;
    state.exportTask = null;
    state.failure = null;
    state.dirty = false;
    delete state.projectName;
    delete state.material;
    delete state.fileLoaded;
    delete state.fileCell;
    delete state.fileLayer;
    delete state.codeDraft;
  }
  const viewPanels = window.createWaferCadV2ViewPanels();
  const domainContext = () => ({
    state,
    data,
    recipe,
    cursor,
    branch,
    variants,
    activeStep,
    fileMask,
    currentModel,
    stepTitle,
  });
  const shell = window.createWaferCadV2Workstation({
    root,
    state,
    getProjectName: () => state.projectName || data.name,
    renderGlobalControls: () =>
      el(
        'div',
        { class: 'p-global-controls', role: 'toolbar', 'aria-label': 'Project controls' },
        select(
          'XYZ display unit',
          'displayUnit',
          [
            ['nm', 'nm'],
            ['um', 'µm'],
            ['mm', 'mm'],
          ],
          state.displayUnit,
        ),
        button('Undo', 'draft-undo', 'undo', { disabled: !state.draftUndo }),
        button('Redo', 'draft-redo', 'redo', { disabled: !state.draftRedo }),
      ),
    renderEditor: () => window.createWaferCadV2MockDomainPanels(domainContext()).render(),
    renderView: (name) =>
      window.createWaferCadV2MockViews({ ...domainContext(), viewPanels }).render(name),
  });
  const render = (action) => shell.render(action);
  function presetRecipeFailure() {
    activeStep = Math.min(2, recipe.steps.length - 1);
    state.failedStep = activeStep;
    state.failure = `Simulated failure · Step ${activeStep + 1} · ${recipe.steps[activeStep].id}. Edit here; then Continue or Rebuild. Source remains unchanged.`;
  }
  function dialog(title, text, accept, action, choices = []) {
    originFocus = document.activeElement;
    const modal = el(
      'dialog',
      { class: 'p-dialog', 'aria-labelledby': 'p-dialog-title' },
      el('h2', { id: 'p-dialog-title' }, title),
      el('div', {}, text),
      el(
        'div',
        { class: 'p-actions' },
        button('Cancel', 'dialog-cancel', 'close'),
        ...choices.map(([label, choice]) => button(label, choice, 'warning')),
        button(accept, action, 'check', { primary: true }),
      ),
    );
    modal.addEventListener('close', () => {
      modal.remove();
      originFocus?.focus({ preventScroll: true });
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...modal.querySelectorAll('button,input,select,textarea,a[href]')];
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    root.append(modal);
    modal.showModal();
    modal.querySelector('input,button').focus();
  }
  function closeDialog() {
    root.querySelector('dialog[open]')?.close();
  }
  function updateRecipeControls() {
    state.recipeUndo = recipeUndoStack.length > 0;
    state.recipeRedo = recipeRedoStack.length > 0;
  }
  function saveRecipeUndoPoint() {
    recipeUndoStack.push(structuredClone(recipe));
    if (recipeUndoStack.length > 40) recipeUndoStack.shift();
    recipeRedoStack = [];
    updateRecipeControls();
  }
  function updateRecipeValidation() {
    const errors = [];
    if (!String(recipe.name || '').trim()) errors.push('Recipe name is required.');
    if (!recipe.steps.length) errors.push('Add at least one step.');
    recipe.steps.forEach((step, index) => {
      if (
        !['deposit', 'extend', 'etch', 'implant', 'electrical', 'record', 'snapshot'].includes(
          step.command,
        )
      )
        errors.push(`Step ${index + 1}: unsupported operation.`);
      for (const key of ['thicknessUm', 'depthUm']) {
        if (
          step.params[key] != null &&
          (!Number.isFinite(Number(step.params[key])) || Number(step.params[key]) <= 0)
        )
          errors.push(`Step ${index + 1}: ${key} must be positive.`);
      }
      if (
        ['deposit', 'extend'].includes(step.command) &&
        !String(step.params.material || '').trim()
      )
        errors.push(`Step ${index + 1}: material is required.`);
      if (
        ['implant', 'electrical'].includes(step.command) &&
        !String(step.params.name || '').trim()
      )
        errors.push(`Step ${index + 1}: annotation name is required.`);
    });
    state.recipeErrors = errors;
    state.message = errors.length
      ? `Recipe draft check: ${errors.length} issue(s).`
      : 'Recipe draft check passed. No operations were executed.';
  }
  function newRecipeStep(command) {
    const id = `prototype-step-${Date.now().toString(36)}-${recipe.steps.length + 1}`;
    const params = { face: 'front', area: 'full' };
    if (['deposit', 'extend'].includes(command))
      Object.assign(params, {
        material: 'New material · draft',
        thicknessUm: 0.1,
        coverage: 'direct',
      });
    if (command === 'extend') params.placement = 'follow';
    if (command === 'etch')
      Object.assign(params, {
        target: currentModel().layers.at(-1)?.name || '',
        thicknessUm: 0.1,
        profile: 'directional',
        surface: 'smooth',
      });
    if (command === 'implant')
      Object.assign(params, { name: 'New Implant · draft', depthUm: 0.05, tilt: 0 });
    if (command === 'electrical')
      Object.assign(params, {
        name: 'New Electrical Region · draft',
        depthUm: 0.05,
        regionType: 'p-type',
        source: 'induced',
      });
    if (command === 'record')
      Object.assign(params, { label: 'New record · draft', process: 'custom' });
    if (command === 'snapshot') Object.assign(params, { name: 'Review point · draft' });
    return { id, command, params };
  }
  function rememberDraftChange(key, value) {
    draftUndoStack.push(structuredClone(state));
    if (draftUndoStack.length > 40) draftUndoStack.shift();
    draftRedoStack = [];
    state.draftUndo = draftUndoStack.length > 0;
    state.draftRedo = false;
  }
  function assignMockField(key, raw) {
    const scale = state.displayUnit === 'nm' ? 1000 : state.displayUnit === 'mm' ? 0.001 : 1;
    const length = Number(raw) * scale;
    if (
      key === 'roiX' ||
      key === 'roiY' ||
      key === 'roiWidth' ||
      key === 'roiHeight' ||
      key === 'roiRadius' ||
      key === 'roiRotation'
    ) {
      const path = {
        roiX: 'x',
        roiY: 'y',
        roiWidth: 'width',
        roiHeight: 'height',
        roiRadius: 'radius',
        roiRotation: 'rotation',
      }[key];
      state.roiSettings = {
        ...state.roiSettings,
        [path]: key === 'roiRotation' ? Number(raw) : length,
      };
    } else if (key.startsWith('section')) {
      const path = { sectionAx: 'ax', sectionAy: 'ay', sectionBx: 'bx', sectionBy: 'by' }[key];
      if (path) state.sectionLine = { ...state.sectionLine, [path]: length };
      else state[key] = raw;
    } else if (['alignX', 'alignY'].includes(key)) {
      state.maskTransform = { ...state.maskTransform, [key === 'alignX' ? 'x' : 'y']: length };
    } else if (key === 'alignScale' || key === 'alignRotation') {
      state.maskTransform = {
        ...state.maskTransform,
        [key === 'alignScale' ? 'scale' : 'rotation']: Number(raw),
      };
    } else if (key.startsWith('file-layer-visible:')) {
      const id = key.slice('file-layer-visible:'.length);
      state.fileLayersVisible = { ...state.fileLayersVisible, [id]: raw === 'true' };
    } else if (['thickness', 'processDepth'].includes(key)) {
      state[key] = length;
    } else if (['processTilt', 'processTemperature', 'processDuration'].includes(key)) {
      state[key] = raw === '' ? '' : Number(raw);
    } else if (['threeOpacity', 'maskOpacity'].includes(key)) {
      state[key] = Number(raw);
    } else if (key.startsWith('zBreak')) {
      const path = {
        zBreakStart: 'start',
        zBreakEnd: 'end',
        zBreakFrontScale: 'frontScale',
        zBreakBackScale: 'backScale',
      }[key];
      if (path)
        state.zBreakSettings = {
          ...state.zBreakSettings,
          [path]: Number(raw),
        };
    } else {
      state[key] = ['roiWidth', 'recipeAddKind'].includes(key) ? Number(raw) : raw;
    }
  }
  function openViewSettings(view) {
    const unitFactor = state.displayUnit === 'nm' ? 1000 : state.displayUnit === 'mm' ? 0.001 : 1;
    const unitName = state.displayUnit === 'nm' ? 'nm' : state.displayUnit === 'mm' ? 'mm' : 'µm';
    const displayLength = (value) => Number(value) / unitFactor;
    if (view === 'section') {
      const line = state.sectionLine || { a: data.section.a, b: data.section.b };
      dialog(
        'Section controls · display and A–B line',
        el(
          'div',
          { class: 'p-form' },
          select(
            'Scale',
            'sectionScale',
            [
              ['auto', 'Auto'],
              ['physical', '1:1 X:Z'],
            ],
            state.sectionScale,
          ),
          field(`A · X ${unitName}`, 'sectionAx', displayLength(line.a?.[0] ?? 0), {
            type: 'number',
            step: 'any',
          }),
          field(`A · Y ${unitName}`, 'sectionAy', displayLength(line.a?.[1] ?? 0), {
            type: 'number',
            step: 'any',
          }),
          field(
            `B · X ${unitName}`,
            'sectionBx',
            displayLength(line.b?.[0] ?? currentModel().width / 2),
            {
              type: 'number',
              step: 'any',
            },
          ),
          field(
            `B · Y ${unitName}`,
            'sectionBy',
            displayLength(line.b?.[1] ?? currentModel().height / 2),
            {
              type: 'number',
              step: 'any',
            },
          ),
          button(
            state.sectionBorders ? 'Hide boundaries' : 'Show boundaries',
            'section-borders',
            'cube',
          ),
        ),
        'Apply display draft',
        'apply-settings',
      );
    } else if (view === 'three') {
      dialog(
        '3D display controls',
        el(
          'div',
          { class: 'p-form' },
          field('Opacity', 'threeOpacity', state.threeOpacity, {
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05,
          }),
          button(state.borders ? 'Hide borders' : 'Show borders', 'borders', 'cube'),
          notice(
            'Fast / Quality and opacity affect only this view draft. GLB / PNG actions remain separate.',
          ),
        ),
        'Done',
        'apply-settings',
      );
    } else {
      const transform = state.maskTransform;
      dialog(
        `${view === 'detail' ? 'Detail' : view === 'mask' ? 'Mask' : 'Main'} ROI and alignment`,
        el(
          'div',
          { class: 'p-form' },
          select(
            'ROI shape',
            'roiShape',
            [
              ['rect', 'Rectangle'],
              ['circle', 'Circle'],
              ['ring', 'Ring'],
              ['ring-sector', 'Ring sector'],
            ],
            state.roiShape,
          ),
          select(
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
          ),
          field(`X · ${unitName}`, 'roiX', displayLength(state.roiSettings.x), {
            type: 'number',
            step: 'any',
          }),
          field(`Y · ${unitName}`, 'roiY', displayLength(state.roiSettings.y), {
            type: 'number',
            step: 'any',
          }),
          field(`Width · ${unitName}`, 'roiWidth', displayLength(state.roiSettings.width), {
            type: 'number',
            min: 0,
            step: 'any',
          }),
          field(`Height · ${unitName}`, 'roiHeight', displayLength(state.roiSettings.height), {
            type: 'number',
            min: 0,
            step: 'any',
          }),
          field(`Radius · ${unitName}`, 'roiRadius', displayLength(state.roiSettings.radius), {
            type: 'number',
            min: 0,
            step: 'any',
          }),
          field('Rotation · °', 'roiRotation', state.roiSettings.rotation, {
            type: 'number',
            step: 'any',
          }),
          ...(view === 'mask'
            ? [
                field(`Alignment X · ${unitName}`, 'alignX', displayLength(transform.x), {
                  type: 'number',
                  step: 'any',
                }),
                field(`Alignment Y · ${unitName}`, 'alignY', displayLength(transform.y), {
                  type: 'number',
                  step: 'any',
                }),
                field('Alignment scale', 'alignScale', transform.scale, {
                  type: 'number',
                  min: 0.0001,
                  step: 'any',
                }),
                field('Alignment rotation · °', 'alignRotation', transform.rotation, {
                  type: 'number',
                  step: 'any',
                }),
                field('Mask opacity', 'maskOpacity', state.maskOpacity, {
                  type: 'range',
                  min: 0,
                  max: 1,
                  step: 0.05,
                }),
              ]
            : []),
          button(
            view === 'detail' ? 'Clear Detail ROI' : 'Clear ROI',
            view === 'detail' ? 'clear-detail-roi' : 'clear-roi',
            'close',
          ),
          notice(
            'Display / selection draft in canonical µm. Stored example geometry is unchanged.',
          ),
        ),
        'Apply settings',
        'apply-settings',
      );
    }
  }
  function download(name, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = el('a', { href: url, download: name });
    link.click();
    URL.revokeObjectURL(url);
  }
  function handleAction(action, target) {
    if (!action) return;
    const popupOwner = target?.closest('[popover]')?.id;
    const [kind, value] = action.split(':');
    if (
      [
        'roi',
        'detail',
        'zbreak',
        'draw-tool',
        'draw-add',
        'draw-delete',
        'draw-clear',
        'mask-layer',
        'mask-opacity',
        'section-borders',
        'borders',
      ].includes(kind)
    )
      rememberDraftChange(kind, null);
    if (kind === 'dialog-cancel') {
      closeDialog();
      return;
    }
    if (kind === 'domain') {
      state.domain = value;
      if (value === 'mask') {
        state.view = 'mask';
        state.maximize = 'mask';
      } else {
        state.maximize = null;
      }
      state.mobile = 'edit';
      state.emptyExpanded = false;
      state.editorHidden = false;
    } else if (kind === 'code-apply' || kind === 'code-format') {
      state.message = `${kind === 'code-apply' ? 'Apply code' : 'Format'} UI demonstration only. Draft retained; no parser or execution, saved Recipe unchanged.`;
    } else if (kind === 'show-editor') {
      state.mobile = 'edit';
      state.editorHidden = false;
    } else if (kind === 'hide-editor' || kind === 'return-results') {
      state.mobile = 'view';
      state.editorHidden = !narrow();
      state.message =
        'Results kept visible; draft retained. Use a workspace label to reopen the dock.';
    } else if (kind === 'mode') {
      state.mode = value;
      state.maximize = null;
      if (value === 'single' && state.view === 'section') state.view = 'main';
      rememberView();
    } else if (kind === 'view') {
      state.view = value;
      state.mode = 'single';
      state.maximize = value === 'mask' ? 'mask' : null;
      rememberView();
    } else if (kind === 'mobile-section') {
      state.view = 'section';
      state.maximize = null;
    } else if (kind === 'section') state.section = !state.section;
    else if (kind === 'legend') state.legendOpen = !state.legendOpen;
    else if (kind === 'settings') {
      openViewSettings(value);
      return;
    } else if (kind === 'apply-settings') {
      closeDialog();
      state.message = 'View controls updated in the local M2 presentation draft.';
    } else if (kind === 'clear-roi') {
      state.roi = false;
      state.roiSettings = {
        ...state.roiSettings,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        radius: 0,
        rotation: 0,
      };
      closeDialog();
      state.message = 'ROI draft cleared; source geometry is unchanged.';
    } else if (kind === 'clear-detail-roi') {
      state.detail = false;
      closeDialog();
      state.message = 'Detail ROI draft cleared; source geometry is unchanged.';
    } else if (kind === 'draft-undo' || kind === 'draft-redo') {
      const from = kind === 'draft-undo' ? draftUndoStack : draftRedoStack;
      const to = kind === 'draft-undo' ? draftRedoStack : draftUndoStack;
      const edit = from.pop();
      if (edit) {
        to.push(structuredClone(state));
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, edit);
      }
      state.draftUndo = draftUndoStack.length > 0;
      state.draftRedo = draftRedoStack.length > 0;
      state.message = 'Workspace draft edit history updated; source project remains unchanged.';
    } else if (kind === 'section-borders') state.sectionBorders = !state.sectionBorders;
    else if (kind === 'draw-tool') {
      state.drawTool = value;
      state.message = `${value} Draw tool selected; pointer drawing is represented by the local preview controls.`;
    } else if (kind === 'draw-add') {
      const w = currentModel().width,
        h = currentModel().height,
        index = state.drawDraft.length;
      const cx = ((index % 5) - 2) * w * 0.08,
        cy = ((index % 3) - 1) * h * 0.08;
      const next = structuredClone(state.drawDraft);
      if (state.drawTool === 'circle')
        next.push({
          id: `draft-${index + 1}`,
          type: 'circle',
          c: [cx, cy],
          r: Math.min(w, h) * 0.08,
        });
      else if (state.drawTool === 'ring' || state.drawTool === 'ring-sector')
        next.push({
          id: `draft-${index + 1}`,
          type: state.drawTool,
          c: [cx, cy],
          innerR: Math.min(w, h) * 0.06,
          outerR: Math.min(w, h) * 0.1,
          startAngle: 0,
          endAngle: 180,
        });
      else if (state.drawTool === 'polygon')
        next.push({
          id: `draft-${index + 1}`,
          type: 'polygon',
          points: [
            [cx, cy],
            [cx + w * 0.08, cy],
            [cx + w * 0.04, cy + h * 0.08],
          ],
        });
      else
        next.push({
          id: `draft-${index + 1}`,
          type: 'rect',
          a: [cx, cy],
          b: [cx + w * 0.1, cy + h * 0.1],
        });
      state.drawDraft = next;
      state.message = `Added preview ${state.drawTool} shape ${next.length}; source Draw geometry unchanged.`;
    } else if (kind === 'draw-delete' || kind === 'draw-clear') {
      state.drawDraft = kind === 'draw-clear' ? [] : state.drawDraft.slice(0, -1);
      state.message = 'Draw preview updated; source Draw geometry unchanged.';
    } else if (kind === 'mask-layer') {
      state.layerVisibility[value] = !state.layerVisibility[value];
      state.message = `Layer visibility draft: ${value}. Source material data unchanged.`;
    } else if (kind === 'mask-opacity') {
      state.maskOpacity = Number(value);
    } else if (kind === 'mask-export') {
      state.message = `${value.toUpperCase()} export settings opened from the Mask More menu; UI demonstration only.`;
      dialog(
        'Mask export · presentation only',
        el(
          'div',
          { class: 'p-form' },
          select(
            'Cell scope',
            'exportCells',
            [
              ['selected', 'Selected Cells'],
              ['all', 'All Cells'],
            ],
            state.exportCells || 'selected',
          ),
          select(
            'Layer scope',
            'exportLayers',
            [
              ['visible', 'Visible Layers'],
              ['all', 'All Layers'],
            ],
            state.exportLayers || 'visible',
          ),
          notice(
            'SVG / GDS / OAS controls are represented here. No physical file is generated in M2.',
          ),
        ),
        'Close',
        'apply-settings',
      );
      return;
    } else if (kind === 'base-rebuild') {
      dialog(
        'Rebuild Base · choose source handling',
        'This mock shows the legacy branch choices. It does not archive or clear project History.',
        'Keep source in a Variant',
        'base-keep',
        [['Clear source History', 'base-clear']],
      );
      return;
    } else if (kind === 'base-clear') {
      dialog(
        'Clear source History?',
        'This is a destructive choice in a real Base rebuild. Confirming here only closes the mock flow; no source History is actually cleared.',
        'Confirm Clear',
        'base-clear-confirm',
      );
      return;
    } else if (kind === 'base-keep' || kind === 'base-clear-confirm') {
      closeDialog();
      state.message =
        kind === 'base-keep'
          ? 'Base rebuild draft: source branch would be kept.'
          : 'Base rebuild draft: source History would be cleared after confirmation.';
    } else if (kind === 'recipe-undo' || kind === 'recipe-redo') {
      const from = kind === 'recipe-undo' ? recipeUndoStack : recipeRedoStack;
      const to = kind === 'recipe-undo' ? recipeRedoStack : recipeUndoStack;
      if (from.length) {
        to.push(structuredClone(recipe));
        recipe = from.pop();
        activeStep = Math.min(activeStep, Math.max(0, recipe.steps.length - 1));
        state.failedStep = null;
        state.failure = null;
        state.recipeErrors = [];
      }
      updateRecipeControls();
    } else if (kind === 'add-step') {
      saveRecipeUndoPoint();
      recipe.steps.push(newRecipeStep(state.recipeAddKind || 'deposit'));
      activeStep = recipe.steps.length - 1;
      state.dirty = true;
      state.recipeErrors = [];
    } else if (kind === 'delete-step') {
      saveRecipeUndoPoint();
      recipe.steps.splice(Number(value), 1);
      activeStep = Math.min(activeStep, Math.max(0, recipe.steps.length - 1));
      state.failure = null;
      state.failedStep = null;
    } else if (kind === 'move-up' || kind === 'move-down') {
      const index = Number(value),
        nextIndex = index + (kind === 'move-up' ? -1 : 1);
      if (nextIndex >= 0 && nextIndex < recipe.steps.length) {
        saveRecipeUndoPoint();
        [recipe.steps[index], recipe.steps[nextIndex]] = [
          recipe.steps[nextIndex],
          recipe.steps[index],
        ];
        activeStep = nextIndex;
      }
    } else if (kind === 'recipe-validate') {
      updateRecipeValidation();
    } else if (kind === 'template-preview') {
      pendingRecipeTemplate = state.recipeTemplate || 'source';
      const count =
        pendingRecipeTemplate === 'blank'
          ? 0
          : pendingRecipeTemplate === 'deposit-etch'
            ? 2
            : data.recipe.steps.length;
      dialog(
        'Recipe template preview',
        `Replace the current ${recipe.steps.length}-step draft with ${pendingRecipeTemplate} (${count} steps)? Undo will restore the previous draft.`,
        'Replace Recipe draft',
        'confirm-template',
      );
      return;
    } else if (kind === 'confirm-template') {
      closeDialog();
      saveRecipeUndoPoint();
      if (pendingRecipeTemplate === 'blank') recipe = { name: 'New Recipe', steps: [] };
      else if (pendingRecipeTemplate === 'deposit-etch')
        recipe = {
          name: 'Deposit + Etch draft',
          steps: [newRecipeStep('deposit'), newRecipeStep('etch')],
        };
      else recipe = structuredClone(data.recipe);
      activeStep = 0;
      pendingRecipeTemplate = null;
      state.failure = null;
      state.failedStep = null;
      state.recipeErrors = [];
    } else if (kind === 'maximize') state.maximize = state.maximize === value ? null : value;
    else if (kind === 'quality') {
      state.quality = state.quality === 'Fast' ? 'Quality' : 'Fast';
      state.message = 'Quality mode control simulated. Recorded 3D image is not recomputed.';
    } else if (kind === 'roi') {
      state.roi = !state.roi;
      state.message = 'ROI display demo only. Main/3D registration remains the early M2 gate.';
    } else if (kind === 'detail') state.detail = !state.detail;
    else if (kind === 'zbreak') state.zbreak = !state.zbreak;
    else if (kind === 'zbreak-settings') {
      dialog(
        'Section Z-break',
        el(
          'div',
          { class: 'p-form' },
          field('Start · normalized Z', 'zBreakStart', state.zBreakSettings.start, {
            type: 'number',
            min: 0,
            max: 1,
            step: 0.01,
          }),
          field('End · normalized Z', 'zBreakEnd', state.zBreakSettings.end, {
            type: 'number',
            min: 0,
            max: 1,
            step: 0.01,
          }),
          field('Front scale', 'zBreakFrontScale', state.zBreakSettings.frontScale, {
            type: 'number',
            min: 0.1,
            step: 0.1,
          }),
          field('Back scale', 'zBreakBackScale', state.zBreakSettings.backScale, {
            type: 'number',
            min: 0.1,
            step: 0.1,
          }),
          notice(
            'Display-only collapse; physical Z is unchanged. The stack remains schematic in M2.',
          ),
        ),
        state.zbreak ? 'Disable Z-break' : 'Enable Z-break',
        'confirm-zbreak',
      );
      return;
    } else if (kind === 'confirm-zbreak') {
      closeDialog();
      state.zbreak = !state.zbreak;
    } else if (kind === 'tool') {
      state.tool = value;
      state.message = `${value} tool selected · pointer geometry not connected.`;
    } else if (
      kind === 'fit' ||
      kind === 'borders' ||
      kind === 'layer' ||
      kind === 'draw-rect' ||
      kind === 'draw-ring'
    )
      state.message = `${target.textContent.trim()} control demo · source model / masks unchanged.`;
    else if (kind === 'expand-empty') {
      state.emptyExpanded = true;
      state.mobile = 'edit';
      state.editorHidden = false;
    } else if (kind === 'step') {
      activeStep = Number(value);
      state.mobile = 'edit';
    } else if (kind === 'save-step') {
      state.dirty = true;
      state.failure = null;
      state.message = `Step ${activeStep + 1} draft saved in memory; reload discards it.`;
    } else if (kind === 'history') {
      cursor = value;
      state.message = `Inspecting stored ${value}; source History not mutated.`;
    } else if (kind === 'branch') {
      branch = value;
      const b = [...data.branches, ...variants].find((item) => item.id === value);
      cursor = b.headNodeId;
      if (b.recipe) {
        recipe = structuredClone(b.recipe);
        activeStep = 0;
      }
      state.message = `Inspecting ${b.name}; Main uses this stored model. 3D remains final thumbnail.`;
    } else if (kind === 'restore')
      state.message = `Restore walkthrough at ${cursor} · metadata/polygons shown, no actual History transaction.`;
    else if (kind === 'edit-old') {
      state.domain = 'process';
      state.mobile = 'edit';
      state.message = `Editing from ${cursor}; Apply requires a new prototype Variant, preserving the source branch.`;
      state.editOld = true;
    } else if (kind === 'create-variant') {
      const id = `prototype-variant-${variants.length + 1}`;
      variants.push({
        id,
        name: `Prototype Variant ${variants.length + 1} · from ${cursor}`,
        parentBranchId: branch,
        rootNodeId: cursor,
        headNodeId: cursor,
        recipe: structuredClone(recipe),
      });
      branch = id;
      state.dirty = true;
      state.message =
        'New prototype Variant created. Original source HEAD and node graph unchanged.';
    } else if (kind === 'apply' && state.editOld) {
      dialog(
        'Create Variant before Apply',
        `Detached cursor ${cursor}. Source HEAD will remain intact; this simulates branch creation only.`,
        'Create Variant + simulate',
        'confirm-old-apply',
      );
      return;
    } else if (kind === 'confirm-old-apply') {
      closeDialog();
      handleAction('create-variant', target);
      state.editOld = false;
      state.task = { kind: 'process', done: 0, total: 1 };
    } else if (kind === 'apply' || kind === 'run-all' || kind === 'run-prefix') {
      state.task = {
        kind: kind === 'apply' ? 'process' : 'recipe',
        done: 0,
        total: kind === 'apply' ? 1 : kind === 'run-prefix' ? activeStep + 1 : recipe.steps.length,
      };
      state.failure = null;
    } else if (kind === 'fail') {
      const recipeTask = state.task?.kind === 'recipe';
      state.failedStep = Math.min(2, recipe.steps.length - 1);
      state.task = null;
      state.failure = recipeTask
        ? `Simulated failure at step ${state.failedStep + 1} · ${recipe.steps[state.failedStep].id}. Source model unchanged. Edit, then Continue or Rebuild.`
        : 'Simulated Apply rejection · original model unchanged. Correct parameters and retry.';
      if (recipeTask) activeStep = state.failedStep;
    } else if (kind === 'advance-task') {
      state.task.done = Math.min(state.task.total, state.task.done + 1);
    } else if (kind === 'cancel-task') {
      state.task = null;
      state.message = 'Task cancelled · no source mutation.';
    } else if (kind === 'complete') {
      const completed = state.task;
      state.task = null;
      state.failure = null;
      state.dirty = true;
      state.message =
        completed?.kind === 'recipe'
          ? `Recipe simulation complete · ${completed.total} steps processed in order. Source model / History unchanged; no scientific execution.`
          : `Manual simulation complete · one ${state.operation || 'deposit'} operation. Source model / History unchanged; no scientific execution.`;
    } else if (kind === 'continue-confirm' || kind === 'rebuild-confirm') {
      dialog(
        kind === 'continue-confirm' ? 'Continue current model' : 'Rebuild Base · new Main',
        kind === 'continue-confirm'
          ? 'Additive execution normally needs confirmation on an existing process revision. Here it only starts a simulation.'
          : 'Keep / Clear / Cancel archive semantics are not implemented in this prototype. Source branches remain intact.',
        kind === 'continue-confirm' ? 'Confirm Continue' : 'Keep source + simulate rebuild',
        kind === 'continue-confirm' ? 'confirm-continue' : 'confirm-rebuild',
      );
      return;
    } else if (kind === 'confirm-continue' || kind === 'confirm-rebuild') {
      closeDialog();
      state.task = {
        kind: 'recipe',
        done: kind === 'confirm-continue' ? state.failedStep || 0 : 0,
        total: recipe.steps.length,
      };
      state.failure = null;
      state.message = `${kind === 'confirm-continue' ? 'Continue' : 'Rebuild'} simulation · existing branches preserved.`;
    } else if (kind === 'increment' || kind === 'decrement') {
      const input = root.querySelector(`[data-key="${value}"]`);
      const delta = Number(input.step) * (kind === 'increment' ? 1 : -1);
      const next = Number((Number(input.value) + delta).toPrecision(12));
      const minimum = input.min === '' ? -Infinity : Number(input.min);
      const maximum = input.max === '' ? Infinity : Number(input.max);
      input.value = String(Math.min(maximum, Math.max(minimum, next)));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    } else if (
      kind === 'new-project' ||
      kind === 'load-project' ||
      kind === 'recovery' ||
      kind === 'file-import'
    ) {
      const titles = {
        'new-project': 'Create project · draft safety',
        'load-project': 'Load other bundled real project',
        recovery: 'Review Recovery candidate',
        'file-import': 'File import walkthrough',
      };
      dialog(
        titles[kind],
        kind === 'new-project'
          ? el(
              'div',
              { class: 'p-form' },
              notice(
                'New project setup is a UI draft; real example remains visible, no Base transaction.',
              ),
              field('New project name', 'newProjectName', 'Device study'),
              field('Base width · µm', 'newWidth', currentModel().width, {
                type: 'number',
                min: 0.001,
              }),
              field('Base height · µm', 'newHeight', currentModel().height, {
                type: 'number',
                min: 0.001,
              }),
              field('Base thickness · µm', 'newThickness', currentModel().thickness, {
                type: 'number',
                min: 0.00001,
              }),
              field('Base material', 'newMaterial', currentModel().layers[0].name),
            )
          : kind === 'file-import'
            ? 'Inspect the bundled gds-basic-instances.gds inventory. Cells, references and Layers come from its real binary records. This does not replace the Draw-source project or execute a core import.'
            : 'Unsaved prototype drafts are not persisted. Source files remain untouched. You can cancel or confirm this UI-only transition.',
        kind === 'file-import' ? 'Inspect real sample inventory' : 'Confirm simulation',
        `confirm-${kind}`,
      );
      return;
    } else if (kind === 'confirm-file-import') {
      closeDialog();
      state.maskMode = 'file';
      state.fileLoaded = true;
      state.fileCell = fileMask.cells[0].name;
      state.message =
        'Actual GDS Cells / Layers metadata loaded. Project still uses its original Draw mask; no core import.';
    } else if (kind === 'cell' || kind === 'file-layer') {
      state[kind === 'cell' ? 'fileCell' : 'fileLayer'] = value;
      state.message = `Selected ${value} in real sample inventory · view geometry not replaced.`;
    } else if (['confirm-new-project', 'confirm-load-project', 'confirm-recovery'].includes(kind)) {
      closeDialog();
      if (kind === 'confirm-load-project')
        state.example = state.example === 'm3d' ? 'photodetector' : 'm3d';
      if (kind !== 'confirm-new-project') useExample();
      else {
        state.projectName = state.newProjectName || 'Device study';
        state.dirty = true;
      }
      state.message = `${kind.slice(8)} walkthrough complete · real bundled example loaded; no file/Recovery storage transaction.`;
    } else if (kind === 'save') {
      download(
        'wafercad-m15-ui-draft.json',
        'application/json',
        JSON.stringify(
          {
            format: 'M1.5-UI-DRAFT-NOT-WAFERCAD',
            source: data.source,
            sourceHash: data.sha256,
            choices: state,
            recipeDraft: recipe,
            variants,
          },
          null,
          2,
        ),
      );
      state.message = 'Downloaded UI draft, not a scientific .wafercad project.';
    } else if (kind === 'cancel-export') {
      state.exportTask = null;
      state.message = 'Local 3D export draft cancelled; no file was generated.';
    } else if (kind === 'export') {
      const [, view, format] = action.split(':');
      const svg = root.querySelector(`[data-science="${view}"] svg`);
      if (view === 'three') state.exportTask = { view, format, status: 'running' };
      if (action.endsWith(':svg') && svg)
        download(
          `m15-${view}-presentation.svg`,
          'image/svg+xml',
          new XMLSerializer().serializeToString(svg),
        );
      state.message =
        svg && action.endsWith(':svg')
          ? 'Presentation SVG downloaded (not a physical export).'
          : `${view} ${format?.toUpperCase() || ''} export control simulated; no physical image / GLB / detail export produced. Cancel remains available for the local draft.`;
    }
    render(action);
    if (popupOwner)
      root.querySelector(`[popovertarget="${popupOwner}"]`)?.focus({ preventScroll: true });
    if (kind === 'return-results' && narrow())
      root.querySelector('.p-stage')?.scrollIntoView({ block: 'start' });
    if (kind === 'fail' && state.domain === 'recipe')
      root
        .querySelector(`[data-action="step:${activeStep}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }
  function bindShellUi() {
    root.addEventListener('input', (event) => {
      if (event.target.dataset.key !== 'codeDraft') return;
      state.codeDraft = event.target.value;
      state.dirty = true;
    });
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (target && !target.disabled) handleAction(target.dataset.action, target);
    });
    root.addEventListener('change', (event) => {
      const key = event.target.dataset.key;
      if (!key) return;
      const value = event.target.value;
      if (event.target.closest('dialog')) {
        assignMockField(key, value);
        return;
      }
      if (key === 'stepLabel') {
        saveRecipeUndoPoint();
        const params = recipe.steps[activeStep].params;
        params[
          params.material ? 'material' : params.target ? 'target' : params.name ? 'name' : 'label'
        ] = value;
        state.dirty = true;
        return;
      }
      if (key.startsWith('step-param:')) {
        saveRecipeUndoPoint();
        const param = key.slice(11),
          params = recipe.steps[activeStep].params;
        params[param] =
          typeof params[param] === 'number'
            ? ['thicknessUm', 'depthUm'].includes(param)
              ? Number(value) *
                (state.displayUnit === 'nm' ? 0.001 : state.displayUnit === 'mm' ? 1000 : 1)
              : Number(value)
            : typeof params[param] === 'boolean'
              ? value === 'true'
              : value;
        state.dirty = true;
        return;
      }
      if (key === 'stepThickness') {
        saveRecipeUndoPoint();
        const params = recipe.steps[activeStep].params;
        params[params.depthUm != null ? 'depthUm' : 'thicknessUm'] =
          Number(value) *
          (state.displayUnit === 'nm' ? 0.001 : state.displayUnit === 'mm' ? 1000 : 1);
        state.dirty = true;
        return;
      }
      if (key === 'recipeName') {
        saveRecipeUndoPoint();
        recipe.name = value;
        state.dirty = true;
        state.recipeErrors = [];
        render();
        return;
      }
      if (key === 'scene') {
        state.empty = value === 'empty-history';
        state.domain =
          value === 'process' ? 'process' : value === 'recipe-failure' ? 'recipe' : 'history';
        state.example = value === 'variants' ? 'photodetector' : 'm3d';
        useExample();
        if (value === 'recipe-failure') presetRecipeFailure();
        state.mobile = state.empty ? 'view' : 'edit';
        state.emptyExpanded = false;
      } else if (key === 'split-left' || key === 'split-right') {
        state.splitViews = viewState.replaceSlot(state.splitViews, key.slice(6), value);
        rememberView();
      } else {
        rememberDraftChange(key, state[key]);
        assignMockField(key, value);
      }
      if (key === 'example') useExample();
      if (key === 'layout') {
        state.panelSize = null;
        state.bottomSize = null;
      }
      render();
      root.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
    });
    root.addEventListener('keydown', (event) => {
      const group = event.target.closest('[role="toolbar"]');
      if (!group || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...group.querySelectorAll('button')].filter(
        (b) => !b.disabled && b.getClientRects().length,
      );
      const index = buttons.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next]?.focus();
    });
    window.matchMedia('(max-width: 820px)').addEventListener('change', () => {
      const selected = viewState.preferredMode(viewState.viewportWidth(window), state.desktopMode);
      state.mode = ['overview', 'split'].includes(selected) ? selected : 'single';
      if (viewState.singles.includes(selected)) state.view = selected;
      state.maximize = null;
      render();
    });
    const repositionMenus = () =>
      root
        .querySelectorAll('.p-overflow:popover-open')
        .forEach((menu) => menu.dispatchEvent(new Event('position-menu')));
    window.addEventListener('resize', repositionMenus);
    document.addEventListener('scroll', repositionMenus, true);
  }
  installSprite();
  try {
    const payload = window.WaferCadV2MockData;
    fixtures = payload.fixtures;
    fileMask = payload.fileMask;
    const freeze = (object) => {
      if (object && typeof object === 'object' && !Object.isFrozen(object)) {
        Object.freeze(object);
        Object.values(object).forEach(freeze);
      }
    };
    freeze(payload);
    useExample();
    if (query.get('scene') === 'recipe-failure') presetRecipeFailure();
    render();
    bindShellUi();
    // Read-only audit exposure, not a production API or storage integration.
    window.WaferCadV2Shell = {
      debug: (options) => {
        if (options.example && options.example !== state.example) {
          state.example = options.example;
          useExample();
        }
        if (options.domain && options.domain !== state.domain) {
          state.domain = options.domain;
          state.maximize = options.domain === 'mask' ? 'mask' : null;
          if (options.domain === 'mask') state.view = 'mask';
        }
        if (options.font) state.font = options.font === 'inter' ? 'inter' : 'system';
        state.empty = Boolean(options.empty);
        state.emptyExpanded = false;
        delete state.editorHidden;
        delete state.failedStep;
        state.failure = null;
        if (options.failed) presetRecipeFailure();
        render();
      },
      snapshot: () =>
        structuredClone({
          state,
          source: data.source,
          hash: data.sha256,
          cursor,
          branch,
          sourceBranches: data.branches.length,
          sourceFrozen: Object.isFrozen(data.models.project) && Object.isFrozen(data.recipe.steps),
          prototypeVariants: variants.length,
          recipeSteps: recipe.steps.length,
          modelRegions: currentModel().regionCount,
        }),
      ready: true,
    };
  } catch (error) {
    root.replaceChildren(notice(`Prototype failed to load: ${error.message}`, 'error'));
    window.dispatchEvent(new ErrorEvent('error', { message: error.message }));
  }
})();
