// M2 mock controller and simulated domain actions. Replaced through adapters in M3; never imports core.
(async () => {
  // Optional M2 developer adapter modules: loaded on demand by the mock entry.
  // Production bootstrap does not import fixtures, mock data or simulated actions.
  for (const name of ['shell-registry', 'domain-adapters', 'overlay-manager']) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `./ui-v2/${name}.js`;
      script.onload = resolve;
      script.onerror = () => reject(Error(`Unable to load ${name}`));
      document.head.append(script);
    });
  }
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
    domain: ['project', 'mask', 'process', 'recipe', 'code', 'diagnostics', 'history'].includes(
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
    legendColors: {},
    legendPalette: 'balanced',
    legendPaletteOpen: null,
    historyMenuNode: null,
    maximize: null,
    maskMode: 'draw',
    roi: false,
    zbreak: false,
    detail: false,
    quality: 'Fast',
    task: null,
    failure: null,
    message: 'Ready',
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
    maskRoiOpen: false,
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
    state.baseDraft = Object.fromEntries(
      ['width', 'height', 'thickness'].map((key) => [key, currentModel()[key]]),
    );
    state.baseError = null;
    state.baseApplied = null;
    state.baseShape = 'rect';
    state.maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    state.maskRoiOpen = false;
    state.legendColors = {};
    state.legendPalette = 'balanced';
    state.legendPaletteOpen = null;
    state.historyMenuNode = null;
    state.historyBranchMenu = null;
    state.historyNames = {};
    state.historyDeletedBranches = [];
    state.historyCollapsed = {};
    state.historyBookmarks = structuredClone(data.bookmarks);
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
  const historyBranches = () =>
    [...data.branches, ...variants]
      .filter((item) => !state.historyDeletedBranches.includes(item.id))
      .map((item) => ({ ...item, name: state.historyNames[item.id] || item.name }));
  const domainContext = () => ({
    state,
    data: {
      ...data,
      branches: historyBranches(),
      bookmarks: state.historyBookmarks,
    },
    recipe,
    cursor,
    branch,
    variants: [],
    activeStep,
    fileMask,
    currentModel,
    stepTitle,
  });
  const registry = window.WaferCadV2ShellRegistry.defaults;
  const adapters = window.WaferCadV2DomainAdapters.create();
  const renderMockPanel = (host) => {
    const panels = window.createWaferCadV2MockDomainPanels(domainContext());
    if (host.dataset.slot === 'panel.base') {
      host.querySelector(':scope > [data-slot-content]').replaceChildren(panels.renderBase());
      return;
    }
    const draft = panels.render();
    const header = draft.querySelector('.p-panel-head');
    const titleHost = host.closest('.p-inspector')?.querySelector('.p-panel-shell-header');
    if (header && titleHost) titleHost.replaceChildren(...header.childNodes);
    const contents = host.querySelector(':scope > [data-slot-content]');
    const source = draft.querySelector('.p-panel-content');
    // Only the adapter's own content leaf may be refreshed. The named panel
    // host, its ancestors and the four scientific stages retain identity.
    if (contents && source) contents.replaceChildren(...source.childNodes);
  };
  // Mock presenters implement exactly the M3 lifecycle contract.
  for (const id of registry.panels
    .map((name) => `panel.${name}`)
    .concat(registry.processModes.map((name) => `panel.process.${name}`))) {
    adapters.register(
      id,
      window.WaferCadV2DomainAdapters.presentationAdapter({
        render: renderMockPanel,
      }),
    );
  }
  for (const { key } of registry.views) {
    adapters.register(`view.${key}`, {
      mount(host) {
        const panel = window
          .createWaferCadV2MockViews({ ...domainContext(), viewPanels })
          .render(key);
        host.append(panel);
        return panel;
      },
      onShow() {
        window.createWaferCadV2MockViews({ ...domainContext(), viewPanels }).render(key);
      },
      onHide() {},
      destroy() {},
    });
  }
  let renderAction = null;
  const shell = window.createWaferCadV2Workstation({
    root,
    state,
    adapters,
    registry,
    getProjectName: () => state.projectName || data.name,
    presentation: () => {
      const processChild = ['recipe', 'code', 'diagnostics'].includes(state.domain);
      const panel = processChild ? 'process' : state.domain;
      return {
        selectedNavigation: panel,
        selectedPanel: panel,
        visibleNestedPanels: panel === 'project' ? ['base'] : [],
        selectedSubpanel: processChild ? state.domain : 'step',
        emptyInspector: state.domain === 'history' && state.empty && !state.emptyExpanded,
        editorHidden: Boolean(state.editorHidden),
        preserveScroll: Boolean(renderAction && /^(history:|branch:|history-)/.test(renderAction)),
        scrollSelectors: [
          '.p-panel-content',
          '[data-history-scroll]',
          '[data-history-list]',
          '[data-variant-list]',
        ],
        badge: state.dirty ? 'Unsaved changes' : 'Example',
        message: state.message,
        save: '',
        version: '',
      };
    },
  });
  const render = (action) => {
    renderAction = action;
    shell.render(action);
    renderAction = null;
    if (state.task) {
      root
        .querySelectorAll(
          '.p-panel-content input, .p-panel-content select, .p-panel-content textarea, [data-action^="step:"]',
        )
        .forEach((control) => {
          control.disabled = true;
        });
    }
  };
  function presetRecipeFailure() {
    activeStep = Math.min(2, recipe.steps.length - 1);
    state.failedStep = activeStep;
    state.failure = `Preview failed at Step ${activeStep + 1}. Edit this step, then Continue or Rebuild.`;
  }
  function dialog(title, text, accept, action, choices = []) {
    state.historyMenuNode = null;
    state.historyBranchMenu = null;
    state.legendPaletteOpen = null;
    const content = el(
      'div',
      { class: 'p-dialog-content', 'aria-labelledby': 'p-dialog-title' },
      el('h2', { id: 'p-dialog-title' }, title),
      el('div', { class: 'p-dialog-body' }, text),
      el(
        'div',
        { class: 'p-actions' },
        button('Cancel', 'dialog-cancel', 'close'),
        ...choices.map(([label, choice]) => button(label, choice, 'warning')),
        button(accept, action, 'check', { primary: true }),
      ),
    );
    return shell.overlays.mount('dialog', {
      content,
      id: 'p-dialog',
      className: 'p-dialog',
      label: title,
      trigger: document.activeElement,
    });
  }
  function closeDialog() {
    shell.overlays.close('dialog');
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
      ? `Recipe validation: ${errors.length} issue(s).`
      : 'Recipe validation passed.';
  }
  function newRecipeStep(command) {
    const id = `prototype-step-${Date.now().toString(36)}-${recipe.steps.length + 1}`;
    const params = { face: 'front', area: 'full' };
    if (['deposit', 'extend'].includes(command))
      Object.assign(params, {
        material: 'New material',
        thicknessUm: 0.1,
        coverage: 'direct',
      });
    if (command === 'etch')
      Object.assign(params, {
        target: currentModel().layers.at(-1)?.name || '',
        thicknessUm: 0.1,
        profile: 'directional',
        surface: 'smooth',
      });
    if (command === 'implant')
      Object.assign(params, { name: 'New Implant', depthUm: 0.05, tilt: 0 });
    if (command === 'electrical')
      Object.assign(params, {
        name: 'New Electrical Region',
        depthUm: 0.05,
        regionType: 'p-type',
        source: 'induced',
      });
    if (command === 'liftoff') Object.assign(params, { sacrificial: 'Resist' });
    if (command === 'record')
      Object.assign(params, {
        label: 'New record',
        process: 'custom',
        temperatureC: null,
        durationMin: null,
        ambient: '',
        note: '',
      });
    if (command === 'snapshot') Object.assign(params, { name: 'Review point' });
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
    const scale = state.displayUnit === 'nm' ? 0.001 : state.displayUnit === 'mm' ? 1000 : 1;
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
    } else if (
      ['thickness', 'processDepth', 'processFeatureSize', 'processMeanHeight'].includes(key)
    ) {
      state[key] = length;
    } else if (
      [
        'processTilt',
        'processTemperature',
        'processDuration',
        'processFeatureCv',
        'processHeightCv',
        'processSeed',
      ].includes(key)
    ) {
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
    const displayLength = (value) => Number(value) * unitFactor;
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
        'Apply display settings',
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
          notice('Adjust rendering quality and opacity.'),
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
          notice('Set position and size in µm.'),
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
      state.message = `${kind === 'code-apply' ? 'Applying code' : 'Formatting'} is unavailable in this preview. Your text is retained.`;
    } else if (kind === 'show-editor') {
      state.mobile = 'edit';
      state.editorHidden = false;
    } else if (kind === 'hide-editor' || kind === 'return-results') {
      state.mobile = 'view';
      state.editorHidden = !narrow();
      state.message = 'Editor hidden. Select a workspace to reopen it.';
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
      state.message = 'Display settings updated.';
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
      state.message = 'ROI cleared.';
    } else if (kind === 'clear-detail-roi') {
      state.detail = false;
      closeDialog();
      state.message = 'Detail ROI cleared.';
    } else if (kind === 'mask-roi-settings') {
      state.maskRoiOpen = !state.maskRoiOpen;
    } else if (kind === 'mask-roi-close') {
      state.maskRoiOpen = false;
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
      state.message = 'Form edit history updated.';
    } else if (kind === 'section-borders') state.sectionBorders = !state.sectionBorders;
    else if (kind === 'borders') state.borders = !state.borders;
    else if (kind === 'draw-tool') {
      state.drawTool = value;
      state.message = `${target.title || 'Draw'} selected. Use Add to preview a shape.`;
    } else if (kind === 'draw-add') {
      const w = currentModel().width,
        h = currentModel().height,
        index = state.drawDraft.length;
      const cx = ((index % 5) - 2) * w * 0.08,
        cy = ((index % 3) - 1) * h * 0.08;
      const draftId = `draft-${crypto.randomUUID()}`;
      const next = structuredClone(state.drawDraft);
      if (state.drawTool === 'circle')
        next.push({
          id: draftId,
          type: 'circle',
          c: [cx, cy],
          r: Math.min(w, h) * 0.08,
        });
      else if (state.drawTool === 'ring' || state.drawTool === 'ring-sector')
        next.push({
          id: draftId,
          type: state.drawTool,
          c: [cx, cy],
          innerR: Math.min(w, h) * 0.06,
          outerR: Math.min(w, h) * 0.1,
          startAngle: 0,
          endAngle: 180,
        });
      else if (state.drawTool === 'polygon')
        next.push({
          id: draftId,
          type: 'polygon',
          points: [
            [cx, cy],
            [cx + w * 0.08, cy],
            [cx + w * 0.04, cy + h * 0.08],
          ],
        });
      else
        next.push({
          id: draftId,
          type: 'rect',
          a: [cx, cy],
          b: [cx + w * 0.1, cy + h * 0.1],
        });
      state.drawDraft = next;
      state.message = `Shape added · ${next.length} shapes.`;
    } else if (kind === 'draw-delete' || kind === 'draw-clear') {
      state.drawDraft = kind === 'draw-clear' ? [] : state.drawDraft.slice(0, -1);
      state.message = 'Draw shapes updated.';
    } else if (kind === 'mask-layer') {
      state.layerVisibility[value] = !state.layerVisibility[value];
      state.message = 'Layer visibility updated.';
    } else if (kind === 'mask-opacity') {
      state.maskOpacity = Number(value);
    } else if (kind === 'mask-export') {
      state.message = `${value.toUpperCase()} export settings.`;
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
          notice('Choose export settings. File generation is unavailable in this preview.'),
        ),
        'Close',
        'apply-settings',
      );
      return;
    } else if (kind === 'base-revert') {
      state.baseDraft = Object.fromEntries(
        ['width', 'height', 'thickness'].map((key) => [key, currentModel()[key]]),
      );
      state.baseShape = 'rect';
      state.baseError = null;
      state.baseApplied = null;
    } else if (kind === 'base-rebuild') {
      dialog(
        'Rebuild Base · choose source handling',
        'Choose how to handle existing History when rebuilding Base. This preview changes the selected dimensions only.',
        'Keep source in a Variant',
        'base-keep',
        [['Clear source History', 'base-clear']],
      );
      return;
    } else if (kind === 'base-clear') {
      dialog(
        'Clear source History?',
        'Keep the new dimensions without preserving a Variant? Existing example History stays available in this preview.',
        'Confirm Clear',
        'base-clear-confirm',
      );
      return;
    } else if (kind === 'base-keep' || kind === 'base-clear-confirm') {
      closeDialog();
      state.baseApplied = { ...structuredClone(state.baseDraft), shape: state.baseShape };
      state.dirty = true;
      state.message =
        kind === 'base-keep'
          ? 'Base dimensions confirmed · keep existing Variant.'
          : 'Base dimensions confirmed · start fresh.';
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
    } else if (kind === 'copy-step') {
      saveRecipeUndoPoint();
      const step = structuredClone(recipe.steps[activeStep]);
      step.id = `prototype-step-${crypto.randomUUID()}`;
      recipe.steps.splice(activeStep + 1, 0, step);
      activeStep += 1;
      state.dirty = true;
    } else if (kind === 'recipe-capture-mask') {
      saveRecipeUndoPoint();
      recipe.steps[activeStep].params.mask = {
        sourceMode: state.maskMode,
        layerKeys:
          state.maskMode === 'file'
            ? Object.keys(state.fileLayersVisible || {}).filter((id) => state.fileLayersVisible[id])
            : [],
        transform: structuredClone(state.maskTransform),
        roi: state.roi ? structuredClone(state.roiSettings) : null,
        drawMask: { shapes: structuredClone(state.drawDraft) },
      };
      state.dirty = true;
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
        `Replace the current ${recipe.steps.length}-step Recipe with ${count} steps? Undo restores the previous Recipe.`,
        'Replace Recipe',
        'confirm-template',
      );
      return;
    } else if (kind === 'confirm-template') {
      closeDialog();
      saveRecipeUndoPoint();
      if (pendingRecipeTemplate === 'blank') recipe = { name: 'New Recipe', steps: [] };
      else if (pendingRecipeTemplate === 'deposit-etch')
        recipe = {
          name: 'Deposit + Etch',
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
      state.message = 'Quality selected. This preview uses a fixed example image.';
    } else if (kind === 'roi') {
      state.roi = !state.roi;
      state.message = 'ROI display updated.';
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
          notice('Z-break affects display scale only.'),
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
      state.message = `${value === 'pan' ? 'Pan' : value === 'zoom' ? 'Zoom' : 'Section line'} selected. Canvas gestures are unavailable in this preview.`;
    } else if (
      kind === 'fit' ||
      kind === 'borders' ||
      kind === 'layer' ||
      kind === 'draw-rect' ||
      kind === 'draw-ring'
    )
      state.message = `${target.title || target.textContent.trim() || 'View control'} selected.`;
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
      state.message = `Step ${activeStep + 1} updated.`;
    } else if (kind === 'legend-palette') {
      const key = action.slice('legend-palette:'.length);
      state.legendPaletteOpen = state.legendPaletteOpen === key ? null : key;
    } else if (kind === 'legend-set' || kind === 'legend-random') {
      const prefix = `${kind}:`;
      const key = action.slice(prefix.length);
      let color = target?.dataset.color;
      if (kind === 'legend-random') {
        const options = window.WaferCadV2LegendPalette.filter(
          (option) => option !== state.legendColors[key],
        );
        color = options[Math.floor(Math.random() * options.length)];
      }
      if (color) state.legendColors = { ...state.legendColors, [key]: color };
      state.legendPaletteOpen = null;
      state.dirty = true;
    } else if (kind === 'history-collapse') {
      state.historyCollapsed[value] = !state.historyCollapsed[value];
    } else if (kind === 'history-branch-menu') {
      state.historyBranchMenu = state.historyBranchMenu === value ? null : value;
      state.historyMenuNode = null;
    } else if (kind === 'history-rename' || kind === 'history-bookmark-rename') {
      const bookmark = kind === 'history-bookmark-rename';
      const item = (bookmark ? state.historyBookmarks : historyBranches()).find(
        (entry) => entry.id === value,
      );
      if (!item) return;
      state.historyRenameTarget = { id: value, bookmark };
      state.historyRenameName = item.name;
      dialog(
        bookmark ? 'Rename bookmark' : 'Rename Variant',
        field('Name', 'historyRenameName', item.name, { maxlength: 256 }),
        'Save name',
        'history-rename-confirm',
      );
      return;
    } else if (kind === 'history-rename-confirm') {
      const name = String(state.historyRenameName || '').trim();
      if (!name) {
        const input = root.querySelector('dialog [data-key="historyRenameName"]');
        input.setCustomValidity('Enter a name.');
        input.reportValidity();
        input.focus();
        return;
      }
      const target = state.historyRenameTarget;
      if (target.bookmark) {
        const item = state.historyBookmarks.find((entry) => entry.id === target.id);
        if (item) item.name = name;
      } else state.historyNames[target.id] = name;
      closeDialog();
      state.historyBranchMenu = null;
      state.dirty = true;
      state.message = 'Name updated.';
    } else if (kind === 'history-delete-branch') {
      const item = historyBranches().find((entry) => entry.id === value);
      if (!item || value === 'main') return;
      if (historyBranches().some((entry) => entry.parentBranchId === value)) {
        state.message = 'Delete child Variants first. This Variant is still referenced.';
      } else {
        state.historyDeleteBranch = value;
        dialog(
          'Delete Variant?',
          `Remove "${item.name}"? Refreshing restores the example.`,
          'Delete Variant',
          'history-delete-branch-confirm',
        );
        return;
      }
    } else if (kind === 'history-delete-branch-confirm') {
      const id = state.historyDeleteBranch;
      const item = historyBranches().find((entry) => entry.id === id);
      if (!item || id === 'main' || historyBranches().some((entry) => entry.parentBranchId === id))
        return;
      closeDialog();
      state.historyDeletedBranches.push(id);
      variants = variants.filter((entry) => entry.id !== id);
      if (branch === id) {
        branch = item.parentBranchId || 'main';
        cursor = historyBranches().find((entry) => entry.id === branch)?.headNodeId || data.cursor;
      }
      state.historyBranchMenu = null;
      state.dirty = true;
    } else if (kind === 'history-bookmark-add') {
      const node = data.history.find((entry) => entry.id === value);
      if (!node) return;
      state.historyBookmarks.push({
        id: `draft-bookmark-${crypto.randomUUID()}`,
        name: node.label,
        historyNodeId: value,
      });
      state.historyMenuNode = null;
      state.dirty = true;
    } else if (kind === 'history-bookmark-delete') {
      state.historyDeleteBookmark = value;
      dialog(
        'Delete bookmark?',
        'The Step remains available. Source bookmarks are unchanged.',
        'Delete bookmark',
        'history-bookmark-delete-confirm',
      );
      return;
    } else if (kind === 'history-bookmark-delete-confirm') {
      closeDialog();
      state.historyBookmarks = state.historyBookmarks.filter(
        (item) => item.id !== state.historyDeleteBookmark,
      );
      state.dirty = true;
    } else if (kind === 'history-return-head' || kind === 'history-cancel-edit') {
      cursor = historyBranches().find((entry) => entry.id === branch)?.headNodeId || data.cursor;
      state.editOld = false;
      state.domain = 'history';
      state.historyMenuNode = null;
      state.historyBranchMenu = null;
    } else if (kind === 'history-menu') {
      state.historyMenuNode = state.historyMenuNode === value ? null : value;
      state.historyBranchMenu = null;
    } else if (kind === 'history-select' || kind === 'history-restore') {
      cursor = value;
      const node = data.history.find((entry) => entry.id === value);
      if (node?.branchId) branch = node.branchId;
      state.historyMenuNode = null;
      state.message =
        kind === 'history-select'
          ? `Inspecting ${node?.label || 'Selected step'}.`
          : `Restore preview · ${node?.label || 'Selected step'}.`;
    } else if (
      kind === 'history-edit' ||
      kind === 'history-insert' ||
      kind === 'history-continue'
    ) {
      cursor = value;
      const node = data.history.find((entry) => entry.id === value);
      if (node?.branchId) branch = node.branchId;
      state.historyMenuNode = null;
      state.domain = 'process';
      state.mobile = 'edit';
      state.editOld = true;
      state.historyEditMode = kind.slice(8);
      state.message = `Editing ${node?.label || 'Selected step'}.`;
    } else if (kind === 'history-variant') {
      cursor = value;
      const node = data.history.find((entry) => entry.id === value);
      if (node?.branchId) branch = node.branchId;
      const id = `prototype-variant-${crypto.randomUUID()}`;
      variants.push({
        id,
        name: `Variant ${variants.length + 1}`,
        parentBranchId: branch,
        rootNodeId: value,
        headNodeId: value,
        recipe: structuredClone(recipe),
      });
      branch = id;
      state.historyMenuNode = null;
      state.dirty = true;
      state.message = 'Variant created.';
    } else if (kind === 'history') {
      cursor = value;
      state.message = `Inspecting ${data.history.find((node) => node.id === value)?.label || 'Selected step'}.`;
    } else if (kind === 'branch') {
      branch = value;
      const b = historyBranches().find((item) => item.id === value);
      if (!b) return;
      cursor = b.headNodeId;
      if (b.recipe) {
        recipe = structuredClone(b.recipe);
        activeStep = 0;
      }
      state.message = `Inspecting ${b.name}.`;
    } else if (kind === 'restore') state.message = 'Restore preview selected.';
    else if (kind === 'edit-old') {
      state.domain = 'process';
      state.mobile = 'edit';
      state.message = 'Editing selected step.';
      state.editOld = true;
    } else if (kind === 'create-variant') {
      const id = `prototype-variant-${crypto.randomUUID()}`;
      variants.push({
        id,
        name: `Variant ${variants.length + 1}`,
        parentBranchId: branch,
        rootNodeId: cursor,
        headNodeId: cursor,
        recipe: structuredClone(recipe),
      });
      branch = id;
      state.dirty = true;
      state.message = 'Variant created.';
    } else if (kind === 'apply' && state.editOld) {
      dialog(
        'Create Variant before Apply',
        'Create a Variant to keep your changes separate from the original branch?',
        'Create Variant',
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
        ? `Preview failed at Step ${state.failedStep + 1}. Edit this step, then Continue or Rebuild.`
        : 'Simulated Apply rejection · original model unchanged. Correct parameters and retry.';
      if (recipeTask) activeStep = state.failedStep;
    } else if (kind === 'advance-task') {
      state.task.done = Math.min(state.task.total, state.task.done + 1);
    } else if (kind === 'cancel-task') {
      state.task = null;
      state.message = 'Cancelled.';
    } else if (kind === 'complete') {
      const completed = state.task;
      state.task = null;
      state.failure = null;
      state.dirty = true;
      if (completed?.kind === 'process' && state.processAddToRecipe === 'true') {
        saveRecipeUndoPoint();
        const step = newRecipeStep(state.operation || 'deposit');
        const params = step.params;
        if (step.command !== 'record') {
          params.face = state.face || 'front';
          params.area = state.area || 'mask';
        }
        if (['deposit', 'extend'].includes(step.command)) {
          params.material =
            state.processName ||
            currentModel().layers.find((item) => item.id === state.material)?.name ||
            params.material;
          params.thicknessUm = state.thickness ?? 0.07;
          params.coverage = state.processCoverage || 'direct';
          if (params.coverage === 'transfer') params.placement = state.processPlacement || 'follow';
        } else if (step.command === 'etch') {
          params.target =
            currentModel().layers.find((item) => item.id === state.material)?.name || params.target;
          params.thicknessUm = state.thickness ?? 0.07;
          params.profile = state.processProfile || 'directional';
          params.surface = state.processSurface || 'smooth';
          if (['rough', 'pyramid'].includes(params.surface))
            params.surface = {
              kind: params.surface,
              featureSize: state.processFeatureSize ?? 0.1,
              meanHeight: state.processMeanHeight ?? 0.1,
              featureCv: (state.processFeatureCv || 0) / 100,
              heightCv: (state.processHeightCv || 0) / 100,
              polarity: state.processPolarity || 'inverted',
              ...(state.processSeed === '' || state.processSeed == null
                ? {}
                : { seed: state.processSeed }),
            };
        } else if (step.command === 'record')
          Object.assign(params, {
            process: state.processRecordKind || 'custom',
            label: state.processRecordLabel || 'Record',
            temperatureC: state.processTemperature || null,
            durationMin: state.processDuration || null,
            ambient: state.processAmbient || '',
            note: state.processNote || '',
          });
        else if (step.command === 'liftoff')
          params.sacrificial = state.liftoffSacrificial || currentModel().layers.at(-1)?.name || '';
        else
          Object.assign(params, {
            name: state.processName || params.name,
            depthUm: state.processDepth ?? params.depthUm,
            ...(step.command === 'implant'
              ? { tilt: state.processTilt || 0 }
              : {
                  regionType: state.processRegionType || params.regionType,
                  source: state.processRegionSource || params.source,
                }),
          });
        if (['mask', 'invert'].includes(params.area))
          params.mask = {
            sourceMode: state.maskMode,
            transform: structuredClone(state.maskTransform),
            drawMask: { shapes: structuredClone(state.drawDraft) },
            layerKeys: [],
          };
        recipe.steps.push(step);
        activeStep = recipe.steps.length - 1;
      }
      state.message =
        completed?.kind === 'recipe'
          ? `Recipe simulation complete · ${completed.total} steps.`
          : `Manual simulation complete · ${state.operation || 'deposit'}.`;
    } else if (kind === 'continue-confirm' || kind === 'rebuild-confirm') {
      dialog(
        kind === 'continue-confirm' ? 'Continue current model' : 'Rebuild Base · new Main',
        kind === 'continue-confirm'
          ? 'Preview continuing from the selected step?'
          : 'Preview rebuilding from Base? Existing example Variants remain available.',
        kind === 'continue-confirm' ? 'Confirm Continue' : 'Preview rebuild',
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
        'new-project': 'New project',
        'load-project': 'Load example',
        recovery: 'Review Recovery candidate',
        'file-import': 'File import walkthrough',
      };
      dialog(
        titles[kind],
        kind === 'new-project'
          ? el(
              'div',
              { class: 'p-form' },
              notice('Choose a project name and Base dimensions.'),
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
            ? 'Inspect Cells and Layers in gds-basic-instances.gds. This preview keeps the existing Draw shapes.'
            : 'Unsaved changes will be reset. Continue?',
        kind === 'file-import' ? 'Inspect real sample inventory' : 'Confirm simulation',
        `confirm-${kind}`,
      );
      return;
    } else if (kind === 'confirm-file-import') {
      closeDialog();
      state.maskMode = 'file';
      state.fileLoaded = true;
      state.fileCell = fileMask.cells[0].name;
      state.message = 'Sample Cells and Layers loaded.';
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
      state.message =
        kind === 'confirm-new-project' ? 'Project settings updated.' : 'Example loaded.';
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
      state.message = 'Settings downloaded as JSON.';
    } else if (kind === 'cancel-export') {
      state.exportTask = null;
      state.message = 'Export cancelled.';
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
          ? 'View SVG downloaded.'
          : `${format?.toUpperCase() || 'View'} file generation is unavailable in this preview.`;
    }
    render(action);
    if (['history-menu', 'history-branch-menu', 'legend-palette'].includes(kind)) {
      const menu = root.querySelector('.p-history-menu, .v2-legend-palette');
      const trigger = root.querySelector(`[data-action="${action}"]`);
      if (menu && trigger) {
        menu.popover = 'manual';
        menu.style.position = 'fixed';
        menu.style.inset = 'auto';
        menu.style.top = '0px';
        menu.style.left = '0px';
        shell.overlays.adoptPopover(menu, trigger);
        menu.showPopover();
        const rect = trigger.getBoundingClientRect(),
          bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - bounds.height - 8))}px`;
        menu.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
      }
    }
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
      if (event.target.dataset.key === 'historyRenameName') {
        state.historyRenameName = event.target.value;
        event.target.setCustomValidity('');
        return;
      }
      if (event.target.dataset.key !== 'codeDraft') return;
      state.codeDraft = event.target.value;
      state.dirty = true;
    });
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (target && !target.disabled) handleAction(target.dataset.action, target);
    });
    root.addEventListener('dblclick', (event) => {
      const row = event.target.closest('.p-history-row--branch');
      if (row) handleAction(`history-rename:${row.dataset.action.slice(7)}`, row);
    });
    document.addEventListener('pointerdown', (event) => {
      if (
        event.target.closest('.p-history-menu, .p-history-more, .v2-legend-palette-anchor, dialog')
      )
        return;
      if (!state.historyMenuNode && !state.historyBranchMenu && !state.legendPaletteOpen) return;
      state.historyMenuNode = null;
      state.historyBranchMenu = null;
      state.legendPaletteOpen = null;
      root.querySelectorAll('.p-history-menu, .v2-legend-palette').forEach((node) => node.remove());
      root
        .querySelectorAll('.p-history-more, .v2-legend-palette-trigger')
        .forEach((node) => node.setAttribute('aria-expanded', 'false'));
    });
    root.addEventListener('change', (event) => {
      const key = event.target.dataset.key;
      if (!key) return;
      const value = event.target.value;
      if (key.startsWith('base:')) {
        const physical =
          Number(value) *
          (state.displayUnit === 'nm' ? 0.001 : state.displayUnit === 'mm' ? 1000 : 1);
        state.baseDraft[key.slice(5)] = physical;
        if (state.baseShape === 'circle' && key === 'base:width') state.baseDraft.height = physical;
        state.baseError = Object.values(state.baseDraft).every(
          (length) => Number.isFinite(length) && length > 0,
        )
          ? null
          : 'Enter positive Base dimensions.';
        state.dirty = true;
        render();
        return;
      }
      if (key === 'baseShape') {
        state.baseShape = value;
        if (value === 'circle') state.baseDraft.height = state.baseDraft.width;
        state.dirty = true;
        render();
        return;
      }
      if (key === 'stepCommand') {
        saveRecipeUndoPoint();
        const step = newRecipeStep(value);
        step.id = recipe.steps[activeStep].id;
        recipe.steps[activeStep] = step;
        state.recipeErrors = [];
        state.dirty = true;
        render();
        return;
      }
      if (event.target.closest('dialog')) {
        assignMockField(key, value);
        return;
      }
      if (key === 'legendPalette') {
        state.legendPalette = value;
        if (value === 'random') {
          const palette = window.WaferCadV2RandomLegendPalette();
          const all = [
            ...currentModel().layers.map((item) => ['layer', item]),
            ...currentModel().annotations.map((item) => ['annotation', item]),
          ];
          state.legendColors = Object.fromEntries(
            all.map(([kind, item], index) => [
              `${kind}:${item.id}`,
              palette[index % palette.length],
            ]),
          );
        } else state.legendColors = {};
        state.legendPaletteOpen = null;
        state.dirty = true;
        render();
        return;
      }
      if (key.startsWith('legendColor:')) {
        state.legendColors = { ...state.legendColors, [key.slice(12)]: value };
        state.dirty = true;
        render();
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
        if (param === 'surface' && ['rough', 'pyramid'].includes(value))
          params.surface = {
            kind: value,
            featureSize: 0.1,
            meanHeight: 0.1,
            featureCv: 0,
            heightCv: 0,
            polarity: 'inverted',
            seed: 0,
          };
        state.dirty = true;
        return;
      }
      if (key.startsWith('step-surface:')) {
        saveRecipeUndoPoint();
        const path = key.slice(13),
          surface = recipe.steps[activeStep].params.surface;
        surface[path] =
          typeof surface[path] === 'number'
            ? Number(value) *
              (['featureSize', 'meanHeight'].includes(path)
                ? state.displayUnit === 'nm'
                  ? 0.001
                  : state.displayUnit === 'mm'
                    ? 1000
                    : 1
                : 1)
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
      if (key === 'operation' && value === 'extend' && state.processCoverage === 'transfer')
        state.processCoverage = 'direct';
      if (key === 'layout') {
        state.panelSize = null;
        state.bottomSize = null;
      }
      render();
      root.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
    });
    root.addEventListener('keydown', (event) => {
      if (event.target.dataset.key === 'historyRenameName') {
        event.target.setCustomValidity('');
        if (event.key === 'Enter') {
          event.preventDefault();
          handleAction('history-rename-confirm', event.target);
          return;
        }
      }
      if (
        event.key === 'Escape' &&
        !event.target.closest('dialog') &&
        (state.historyMenuNode || state.historyBranchMenu || state.legendPaletteOpen)
      ) {
        const action = state.historyMenuNode
          ? `history-menu:${state.historyMenuNode}`
          : state.historyBranchMenu
            ? `history-branch-menu:${state.historyBranchMenu}`
            : `legend-palette:${state.legendPaletteOpen}`;
        event.preventDefault();
        state.historyMenuNode = null;
        state.historyBranchMenu = null;
        state.legendPaletteOpen = null;
        render('history-close-menu');
        root.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
        return;
      }
      const menu = event.target.closest('[role="menu"]');
      if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = [...menu.querySelectorAll('[role="menuitem"]')].filter(
          (item) => !item.disabled,
        );
        const index = items.indexOf(document.activeElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        event.preventDefault();
        items[next]?.focus();
        return;
      }
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
      getSlot: shell.getSlot,
    };
    window.dispatchEvent(new Event('wafercad-v2-ready'));
  } catch (error) {
    root.replaceChildren(notice(`Prototype failed to load: ${error.message}`, 'error'));
    window.dispatchEvent(new ErrorEvent('error', { message: error.message }));
  }
})();
