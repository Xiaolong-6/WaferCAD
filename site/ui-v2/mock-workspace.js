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
  };
  let fileMask,
    fixtures,
    data,
    recipe,
    cursor,
    branch,
    variants = [],
    activeStep = 0,
    originFocus;
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
    state.task = null;
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
    getProjectName: () => data.name,
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
  function dialog(title, text, accept, action) {
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
    else if (kind === 'maximize') state.maximize = state.maximize === value ? null : value;
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
        'Display-only collapse. Physical Z is unchanged. M1.5 stack bands are a schematic, not the Section renderer.',
        'Toggle display break',
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
      input.value = String(Math.max(0, Number((Number(input.value) + delta).toPrecision(12))));
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
    } else if (kind === 'export') {
      const view = action.split(':')[1];
      const svg = root.querySelector(`[data-science="${view}"] svg`);
      if (action.endsWith(':svg') && svg)
        download(
          `m15-${view}-presentation.svg`,
          'image/svg+xml',
          new XMLSerializer().serializeToString(svg),
        );
      state.message =
        svg && action.endsWith(':svg')
          ? 'Presentation SVG downloaded (not a physical export).'
          : `${view} export dialog/control simulated; no physical image / GLB / detail export produced.`;
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
        state[key] = value;
        return;
      }
      if (key === 'stepLabel') {
        const params = recipe.steps[activeStep].params;
        params[
          params.material ? 'material' : params.target ? 'target' : params.name ? 'name' : 'label'
        ] = value;
        state.dirty = true;
        return;
      }
      if (key.startsWith('step-param:')) {
        const param = key.slice(11),
          params = recipe.steps[activeStep].params;
        params[param] =
          typeof params[param] === 'number'
            ? Number(value)
            : typeof params[param] === 'boolean'
              ? value === 'true'
              : value;
        state.dirty = true;
        return;
      }
      if (key === 'stepThickness') {
        const params = recipe.steps[activeStep].params;
        params[params.depthUm != null ? 'depthUm' : 'thicknessUm'] = Number(value);
        state.dirty = true;
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
        state[key] = ['thickness', 'roiWidth'].includes(key) ? Number(value) : value;
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
