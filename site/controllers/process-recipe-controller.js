import {
  normalizeProcessRecipe,
  parseProcessRecipeSource,
  recipeLengthUm,
  recipeStepLabel,
  recipeStepSummary,
  recipeTemplate,
  serializeProcessRecipe,
} from '../process-recipe.js';
import { validateRecipeExecution } from '../process-recipe-preflight.js';

function clone(value) {
  return structuredClone(value);
}

function make(root, tag, className = '', text = '') {
  const node = root.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function option(select, value, label = value) {
  const item = new Option(label, value);
  select.add(item);
  return item;
}

function selectedOptionByLabel(select, label) {
  return [...(select?.options || [])].find((item) => item.textContent === label) || null;
}

function recipeLengthText(valueUm) {
  const value = Number(valueUm);
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) < 1 && Math.abs(value) >= 1e-3) {
    return `${Number((value * 1000).toPrecision(8))} nm`;
  }
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toPrecision(8))} mm`;
  return `${Number(value.toPrecision(8))} µm`;
}

export function createProcessRecipeController({
  root = document,
  getRecipe = () => null,
  setRecipe = () => {},
  getModel,
  getMaskState,
  setMaskState = () => {},
  setActiveFace = () => {},
  processPanelController,
  processTaskController,
  snapshotManager,
  formatLengthField,
  updateOperationUI,
  renderAll,
  renderSnapshots = () => {},
  resetToBase = async () => false,
  confirmContinue = async () => false,
  status,
  onChanged = () => {},
}) {
  const $ = (id) => root.getElementById(id);
  let recipe = recipeTemplate('blank'),
    activeStepId = null,
    running = false,
    stopRequested = false,
    bound = false,
    recordManual = true,
    undoStack = [],
    redoStack = [],
    codeDraftDirty = false,
    invalidFields = new Map(),
    lastRunResult = null;
  const recipeHistoryLimit = 100;
  const recipeSignature = () => JSON.stringify(recipe.steps);
  const fieldId = (stepId, key) => `${stepId}:${key}`;

  function markInvalidField(stepId, key, input, label, error) {
    invalidFields.set(fieldId(stepId, key), {
      message: `Step ${recipe.steps.findIndex((step) => step.id === stepId) + 1}: ${label}: ${error.message}`,
      value: input.value,
    });
    input.setAttribute('aria-invalid', 'true');
    input.title = error.message;
    showValidation();
    status(error.message, 'error');
  }

  function restoreField(stepId, key, input) {
    const invalid = invalidFields.get(fieldId(stepId, key));
    if (invalid) {
      input.value = invalid.value;
      input.setAttribute('aria-invalid', 'true');
      input.title = invalid.message;
    }
    return input;
  }

  function updateUndoRedoUi() {
    const undo = $('recipeUndoBtn'),
      redo = $('recipeRedoBtn');
    if (undo) undo.disabled = running || undoStack.length === 0;
    if (redo) redo.disabled = running || redoStack.length === 0;
  }

  function persist(next = recipe, { recordHistory = true } = {}) {
    const normalized = normalizeProcessRecipe(next);
    if (
      recordHistory &&
      JSON.stringify(normalized) !== JSON.stringify(recipe)
    ) {
      undoStack.push(clone(recipe));
      if (undoStack.length > recipeHistoryLimit) undoStack.shift();
      redoStack = [];
    }
    recipe = normalized;
    activeStepId =
      recipe.steps.some((step) => step.id === activeStepId)
        ? activeStepId
        : recipe.activeStepId || recipe.steps[0]?.id || null;
    recipe.activeStepId = activeStepId;
    setRecipe(clone(recipe));
    onChanged();
    updateUndoRedoUi();
  }

  function restoreRecipe(targetStack, sourceStack, message) {
    if (running || !sourceStack.length) return;
    targetStack.push(clone(recipe));
    if (targetStack.length > recipeHistoryLimit) targetStack.shift();
    const restored = sourceStack.pop();
    recipe = normalizeProcessRecipe(restored);
    activeStepId = recipe.activeStepId || recipe.steps[0]?.id || null;
    setRecipe(clone(recipe));
    onChanged();
    render();
    updateUndoRedoUi();
    status(message, 'success');
  }

  function undoRecipe() {
    restoreRecipe(redoStack, undoStack, 'Recipe change undone.');
  }

  function redoRecipe() {
    restoreRecipe(undoStack, redoStack, 'Recipe change redone.');
  }

  function loadPersisted() {
    try {
      recipe = normalizeProcessRecipe(getRecipe() || recipeTemplate('blank'));
    } catch (error) {
      recipe = recipeTemplate('blank');
      status(`Stored Process Recipe was reset: ${error.message}`, 'warning');
    }
    activeStepId = recipe.activeStepId || recipe.steps[0]?.id || null;
    undoStack = [];
    redoStack = [];
    invalidFields.clear();
    codeDraftDirty = false;
    lastRunResult = null;
    updateUndoRedoUi();
  }

  function currentMaskContext() {
    const state = getMaskState?.() || {};
    return {
      sourceMode: state.maskSourceMode === 'draw' ? 'draw' : 'file',
      ...(state.activeCell || state.layout?.root
        ? { cell: state.activeCell || state.layout?.root }
        : {}),
      layerKeys: [...(state.selectedLayerKeys || [])].map(String),
      transform: { ...(state.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 }) },
      roi: state.maskRoi ? clone(state.maskRoi) : null,
      ...(state.maskSourceMode === 'draw' ? { drawMask: clone(state.drawMask) } : {}),
    };
  }

  function nextId() {
    let ordinal = recipe.steps.length + 1;
    const used = new Set(recipe.steps.map((step) => step.id));
    while (used.has(`recipe-step-${ordinal}`)) ordinal += 1;
    return `recipe-step-${ordinal}`;
  }

  function defaultStep(command) {
    const mask = currentMaskContext(),
      layers = getModel()?.layers || [],
      topMaterial = layers.at(-1)?.name || 'Base';
    const source =
      command === 'deposit'
        ? {
            command,
            params: {
              material: `Layer ${getModel()?.nextLayerId || 1}`,
              thickness: '1 µm',
              coverage: 'directional',
              area: 'full',
              face: 'front',
            },
          }
        : command === 'extend'
          ? {
              command,
              params: {
                material: topMaterial,
                thickness: '1 µm',
                coverage: 'directional',
                area: 'full',
                face: 'front',
              },
            }
          : command === 'etch'
            ? {
                command,
                params: {
                  target: '',
                  depth: '1 µm',
                  profile: 'directional',
                  surface: 'smooth',
                  area: 'mask',
                  face: 'front',
                  mask,
                },
              }
            : command === 'implant'
              ? {
                  command,
                  params: {
                    name: `Implant ${(getModel()?.implants?.length || 0) + 1}`,
                    depth: '0.5 µm',
                    tilt: 0,
                    area: 'mask',
                    face: 'front',
                    mask,
                  },
                }
              : command === 'electrical'
                ? {
                    command,
                    params: {
                      name: `Electrical Region ${(getModel()?.electricalRegions?.length || 0) + 1}`,
                      depth: '0.2 µm',
                      regionType: 'p-inversion',
                      source: 'induced',
                      area: 'mask',
                      face: 'front',
                      mask,
                    },
                  }
                : command === 'record'
                  ? {
                      command,
                      params: {
                        process: 'anneal',
                        label: 'Anneal',
                        temperatureC: null,
                        durationMin: null,
                        ambient: null,
                        note: null,
                      },
                    }
                  : { command: 'snapshot', params: { name: 'Milestone' } };
    const normalized = normalizeProcessRecipe({ name: recipe.name, steps: [source] }).steps[0];
    normalized.id = nextId();
    return normalized;
  }

  function changeStepCommand(stepId, command) {
    const index = recipe.steps.findIndex((step) => step.id === stepId);
    if (index < 0 || recipe.steps[index].command === command) return;
    const previous = recipe.steps[index],
      previousParams = previous.params || {},
      nextStep = defaultStep(command),
      nextParams = nextStep.params || {},
      previousLength =
        Number.isFinite(Number(previousParams.thicknessUm))
          ? Number(previousParams.thicknessUm)
          : Number.isFinite(Number(previousParams.depthUm))
            ? Number(previousParams.depthUm)
            : null;

    nextStep.id = previous.id;

    if (!['record', 'snapshot'].includes(command)) {
      if (previousParams.face) nextParams.face = previousParams.face;
      if (previousParams.area) nextParams.area = previousParams.area;
      if (previousParams.mask) nextParams.mask = clone(previousParams.mask);
    }

    if (previousLength != null && previousLength > 0) {
      if (['deposit', 'extend', 'etch'].includes(command)) nextParams.thicknessUm = previousLength;
      if (['implant', 'electrical'].includes(command)) nextParams.depthUm = previousLength;
    }

    if (
      ['deposit', 'extend'].includes(previous.command) &&
      ['deposit', 'extend'].includes(command) &&
      previousParams.material
    ) {
      nextParams.material = previousParams.material;
    }

    if (
      ['implant', 'electrical'].includes(previous.command) &&
      ['implant', 'electrical'].includes(command) &&
      previousParams.name
    ) {
      nextParams.name = previousParams.name;
    }

    const next = clone(recipe);
    next.steps[index] = nextStep;
    activeStepId = nextStep.id;
    persist(next);
    render();
    status(
      `Step ${index + 1} changed to ${recipeStepLabel(nextStep)}. Compatible face, area, mask, and length values were kept.`,
      'success',
    );
  }

  function initMarkup() {
    const host = $('recipeProcessPane');
    if (!host || host.dataset.ready === 'true') return;
    host.dataset.ready = 'true';
    host.innerHTML = `
      <div class="recipe-toolbar">
        <input id="recipeNameInput" class="recipe-name-input" maxlength="160" aria-label="Recipe name" />
        <select id="recipeTemplateSelect" class="compact-select" aria-label="Recipe template">
          <option value="">Template…</option>
          <option value="blank">Blank</option>
          <option value="deposit-etch">Deposit + Etch</option>
          <option value="conformal">Conformal coating</option>
          <option value="implant">Implant</option>
        </select>
      </div>
      <div class="recipe-options-row">
        <label class="recipe-record-toggle" title="Append successful Step-mode operations to this recipe">
          <input id="recipeRecordManual" type="checkbox" checked />
          <span>Record Step-mode operations</span>
        </label>
        <div class="recipe-history-actions" aria-label="Recipe edit history">
          <button id="recipeUndoBtn" class="compact-btn" type="button" title="Undo Recipe edit" disabled>Undo</button>
          <button id="recipeRedoBtn" class="compact-btn" type="button" title="Redo Recipe edit" disabled>Redo</button>
        </div>
      </div>
      <div class="segmented recipe-view-mode">
        <button id="recipeStepsTab" class="active" type="button">Steps</button>
        <button id="recipeCodeTab" type="button">Code</button>
      </div>
      <div id="recipeStepsPane">
        <div id="recipeStepsList" class="recipe-steps-list"></div>
        <div class="recipe-add-row">
          <select id="recipeAddKind" class="compact-select" aria-label="Process step type">
            <option value="deposit">Deposit</option>
            <option value="extend">Extend</option>
            <option value="etch">Etch</option>
            <option value="implant">Implant</option>
            <option value="electrical">Electrical</option>
            <option value="record">Record</option>
            <option value="snapshot">Snapshot</option>
          </select>
          <button id="recipeAddStepBtn" class="compact-btn" type="button">+ Add</button>
        </div>
        <div id="recipeStepEditor" class="recipe-step-editor"></div>
      </div>
      <div id="recipeCodePane" class="recipe-code-pane" hidden>
        <textarea id="recipeCodeEditor" class="recipe-code-editor" spellcheck="false" aria-label="Process Recipe code"></textarea>
        <div class="recipe-code-actions">
          <button id="recipeApplyCodeBtn" class="compact-btn" type="button">Apply code</button>
          <button id="recipeFormatCodeBtn" class="compact-btn" type="button">Format</button>
        </div>
        <p class="hint compact-hint">Safe Process Recipe syntax only. Arbitrary JavaScript is not executed.</p>
      </div>
      <div id="recipeValidation" class="recipe-validation" aria-live="polite"></div>
      <div id="recipeProgress" class="recipe-progress" hidden>
        <div><span id="recipeProgressLabel">Preparing…</span><span id="recipeProgressCount"></span></div>
        <progress id="recipeProgressBar" max="1" value="0"></progress>
      </div>
      <label class="recipe-start-mode">
        <span>Start</span>
        <select id="recipeRunStart" class="compact-select" aria-label="Recipe run starting state">
          <option value="continue">Continue current model</option>
          <option value="new-base">Rebuild Base first (new Main)</option>
        </select>
      </label>
      <div class="recipe-run-actions">
        <button id="recipeValidateBtn" class="compact-btn" type="button">Validate</button>
        <button id="recipeRunToBtn" class="compact-btn" type="button">Run to Step</button>
        <button id="recipeRunAllBtn" class="primary compact-btn" type="button">Run All</button>
        <button id="recipeStopBtn" class="compact-btn" type="button" disabled>Stop</button>
      </div>`;
  }

  function field(label, control) {
    const wrap = make(root, 'label', 'param-field');
    wrap.append(make(root, 'span', '', label), control);
    return wrap;
  }

  function textInput(value = '', { type = 'text', min = null, max = null, step = null } = {}) {
    const input = root.createElement('input');
    input.type = type;
    input.value = value ?? '';
    if (min != null) input.min = min;
    if (max != null) input.max = max;
    if (step != null) input.step = step;
    return input;
  }

  function selectInput(values, selected) {
    const select = root.createElement('select');
    for (const item of values) {
      const value = typeof item === 'string' ? item : item.value;
      option(select, value, typeof item === 'string' ? item : item.label);
    }
    if ([...select.options].some((item) => item.value === selected)) select.value = selected;
    return select;
  }

  function updateStep(stepId, mutate, fieldInfo = null) {
    const index = recipe.steps.findIndex((step) => step.id === stepId);
    if (index < 0) return;
    const next = clone(recipe);
    mutate(next.steps[index]);
    try {
      const normalized = normalizeProcessRecipe(next);
      normalized.steps[index].id = stepId;
      if (fieldInfo) invalidFields.delete(fieldId(stepId, fieldInfo.key));
      persist(normalized);
      render();
      return true;
    } catch (error) {
      if (fieldInfo) markInvalidField(stepId, fieldInfo.key, fieldInfo.input, fieldInfo.label, error);
      else status(error.message, 'error');
      return false;
    }
  }

  function attachCommit(control, callback, event = 'change') {
    control.addEventListener(event, callback);
    return control;
  }

  function renderMaskContext(step, host) {
    if (!['mask', 'invert'].includes(step.params.area)) return;
    const mask = step.params.mask;
    const row = make(root, 'div', 'recipe-mask-context');
    const summary = make(
      root,
      'span',
      '',
      mask
        ? mask.sourceMode === 'draw'
          ? `Draw mask · ${mask.drawMask?.shapes?.length || 0} shapes`
          : `${mask.cell || 'Current cell'} · ${mask.layerKeys?.length || 0} layer(s)`
        : 'No mask captured',
    );
    const button = make(root, 'button', 'compact-btn', 'Use current Mask');
    button.type = 'button';
    button.addEventListener('click', () => {
      updateStep(step.id, (target) => {
        target.params.mask = currentMaskContext();
      });
    });
    row.append(summary, button);
    host.append(row);
  }

  function renderEditor() {
    const host = $('recipeStepEditor');
    if (!host) return;
    host.replaceChildren();
    const step = recipe.steps.find((item) => item.id === activeStepId);
    if (!step) {
      host.append(make(root, 'p', 'hint compact-hint', 'Add a step, choose a template, or switch to Code.'));
      return;
    }

    const head = make(root, 'div', 'recipe-step-editor-head');
    const operationSelect = selectInput(
      [
        { value: 'deposit', label: 'Deposit' },
        { value: 'extend', label: 'Extend' },
        { value: 'etch', label: 'Etch' },
        { value: 'implant', label: 'Implant' },
        { value: 'electrical', label: 'Electrical' },
        { value: 'record', label: 'Record' },
        { value: 'snapshot', label: 'Snapshot' },
      ],
      step.command,
    );
    operationSelect.id = 'recipeStepOperation';
    operationSelect.className = 'recipe-step-type-select';
    operationSelect.title =
      'Change this step type. Compatible face, area, mask, and length values are kept.';
    operationSelect.setAttribute('aria-label', 'Operation type');
    operationSelect.addEventListener('change', () => changeStepCommand(step.id, operationSelect.value));
    const actions = make(root, 'div', 'recipe-step-editor-actions');
    for (const [text, delta] of [
      ['↑', -1],
      ['↓', 1],
    ]) {
      const button = make(root, 'button', 'compact-btn', text);
      button.type = 'button';
      button.title = delta < 0 ? 'Move step up' : 'Move step down';
      button.addEventListener('click', () => {
        const index = recipe.steps.findIndex((item) => item.id === step.id),
          nextIndex = index + delta;
        if (index < 0 || nextIndex < 0 || nextIndex >= recipe.steps.length) return;
        const next = clone(recipe),
          [moved] = next.steps.splice(index, 1);
        next.steps.splice(nextIndex, 0, moved);
        persist(next);
        render();
      });
      actions.append(button);
    }
    const duplicate = make(root, 'button', 'compact-btn', 'Copy');
    duplicate.type = 'button';
    duplicate.addEventListener('click', () => {
      const index = recipe.steps.findIndex((item) => item.id === step.id),
        next = clone(recipe),
        copy = clone(step);
      copy.id = nextId();
      next.steps.splice(index + 1, 0, copy);
      persist(next);
      activeStepId = copy.id;
      render();
    });
    const remove = make(root, 'button', 'compact-btn quiet', '×');
    remove.type = 'button';
    remove.title = 'Delete step';
    remove.addEventListener('click', () => {
      const index = recipe.steps.findIndex((item) => item.id === step.id),
        next = clone(recipe);
      next.steps.splice(index, 1);
      activeStepId = next.steps[Math.min(index, next.steps.length - 1)]?.id || null;
      persist(next);
      render();
    });
    actions.append(duplicate, remove);
    const operationWrap = make(root, 'label', 'recipe-step-operation-field');
    operationWrap.append(make(root, 'span', '', 'Operation'), operationSelect);
    head.append(operationWrap, actions);
    host.append(head);

    const grid = make(root, 'div', 'param-grid-2');
    const p = step.params;

    const bindText = (label, key, value = p[key], opts = {}) => {
      const input = textInput(value ?? '', opts);
      restoreField(step.id, key, input);
      attachCommit(input, () => updateStep(step.id, (target) => (target.params[key] = input.value), { key, input, label }), 'change');
      grid.append(field(label, input));
      return input;
    };
    const bindSelect = (label, key, values, selected = p[key]) => {
      const select = selectInput(values, selected);
      attachCommit(select, () => updateStep(step.id, (target) => (target.params[key] = select.value)));
      grid.append(field(label, select));
      return select;
    };
    const bindLength = (label, key, valueUm) => {
      const input = textInput(recipeLengthText(valueUm));
      input.placeholder = 'e.g. 30 nm, 0.5 µm';
      restoreField(step.id, key, input);
      attachCommit(input, () => {
        try {
          const microns = recipeLengthUm(input.value, label);
          updateStep(step.id, (target) => (target.params[key] = microns), { key, input, label });
        } catch (error) {
          markInvalidField(step.id, key, input, label, error);
        }
      }, 'change');
      grid.append(field(label, input));
    };

    if (step.command === 'snapshot') {
      bindText('Name', 'name');
    } else if (step.command === 'record') {
      bindSelect('Process', 'process', [
        { value: 'anneal', label: 'Anneal' },
        { value: 'clean', label: 'Clean' },
        { value: 'oxidation', label: 'Oxidation' },
        { value: 'surface-treatment', label: 'Surface treatment' },
        { value: 'activation', label: 'Activation' },
        { value: 'custom', label: 'Custom' },
      ]);
      bindText('Label', 'label');
      bindText('Temp. °C', 'temperatureC', p.temperatureC ?? '', { type: 'number', step: 'any' });
      bindText('Time min', 'durationMin', p.durationMin ?? '', { type: 'number', min: '0', step: 'any' });
      bindText('Ambient', 'ambient', p.ambient || '');
      bindText('Note', 'note', p.note || '');
    } else {
      bindSelect('Face', 'face', [
        { value: 'front', label: 'Front' },
        { value: 'back', label: 'Back' },
      ]);
      bindSelect('Area', 'area', [
        { value: 'full', label: 'Whole face' },
        { value: 'mask', label: 'Selected mask' },
        { value: 'invert', label: 'Invert mask' },
      ]);

      if (step.command === 'deposit') {
        bindText('Material', 'material');
        bindLength('Thickness', 'thicknessUm', p.thicknessUm);
        bindSelect('Coverage', 'coverage', [
          { value: 'direct', label: 'Directional' },
          { value: 'conformal', label: 'Conformal' },
          { value: 'transfer', label: 'Transfer / Laminate' },
        ]);
        if (p.coverage === 'transfer') {
          bindSelect('Placement', 'placement', [
            { value: 'follow', label: 'Follow surface' },
            { value: 'flat', label: 'Flat bridge' },
          ]);
        }
      } else if (step.command === 'extend') {
        bindText('Material', 'material');
        bindLength('Thickness', 'thicknessUm', p.thicknessUm);
        bindSelect('Coverage', 'coverage', [
          { value: 'direct', label: 'Directional' },
          { value: 'conformal', label: 'Conformal' },
        ]);
      } else if (step.command === 'etch') {
        bindText('Target', 'target');
        bindLength(p.profile === 'planarize' ? 'Target Z' : 'Depth', 'thicknessUm', p.thicknessUm);
        bindSelect('Profile', 'profile', [
          { value: 'directional', label: 'Directional' },
          { value: 'isotropic', label: 'Isotropic' },
          { value: 'planarize', label: 'Planarize' },
          { value: 'undercut', label: 'Undercut' },
        ]);
        if (p.profile === 'directional') {
          const appearance = p.surface && p.surface !== 'smooth' ? p.surface : null,
            surfaceMode = appearance
              ? appearance.morphology === 'pyramid'
                ? 'pyramid'
                : 'rough'
              : 'smooth',
            surfaceSelect = selectInput(
              [
                { value: 'smooth', label: 'Smooth' },
                { value: 'rough', label: 'Rough' },
                { value: 'pyramid', label: 'Pyramid' },
              ],
              surfaceMode,
            );
          surfaceSelect.addEventListener('change', () => {
            updateStep(step.id, (target) => {
              const mode = surfaceSelect.value;
              if (mode === 'smooth') {
                target.params.surface = 'smooth';
                return;
              }
              const previous =
                  target.params.surface && target.params.surface !== 'smooth'
                    ? target.params.surface
                    : {},
                depth = Number(target.params.thicknessUm) || 0.5;
              target.params.surface = {
                kind: 'rough',
                morphology: mode === 'pyramid' ? 'pyramid' : 'stochastic',
                polarity: previous.polarity || 'inverted',
                featureSize: Number(previous.featureSize) || 0.5,
                meanHeight:
                  Number(previous.meanHeight) > 0
                    ? Math.min(Number(previous.meanHeight), depth)
                    : Math.min(depth, 0.5),
                featureCv: Number.isFinite(Number(previous.featureCv))
                  ? Number(previous.featureCv)
                  : 0.25,
                heightCv: Number.isFinite(Number(previous.heightCv))
                  ? Number(previous.heightCv)
                  : 0.25,
                ...(previous.seed == null ? {} : { seed: Number(previous.seed) }),
                geometryMode: 'ideal',
              };
            });
          });
          grid.append(field('Surface', surfaceSelect));

          if (appearance) {
            const nestedLength = (label, key) => {
                const input = textInput(recipeLengthText(appearance[key]));
                input.placeholder = 'e.g. 500 nm';
                const fieldKey = `surface.${key}`;
                restoreField(step.id, fieldKey, input);
                input.addEventListener('change', () => {
                  try {
                    const value = recipeLengthUm(input.value, `etch.surface.${key}`);
                    updateStep(step.id, (target) => {
                      target.params.surface = { ...target.params.surface, [key]: value };
                    }, { key: fieldKey, input, label });
                  } catch (error) {
                    markInvalidField(step.id, fieldKey, input, label, error);
                  }
                });
                grid.append(field(label, input));
              },
              nestedPercent = (label, key) => {
                const input = textInput(String(Number(appearance[key] || 0) * 100), {
                  type: 'number',
                  min: '0',
                  max: '100',
                  step: '1',
                });
                input.addEventListener('change', () => {
                  const value = Math.max(0, Math.min(100, Number(input.value) || 0)) / 100;
                  updateStep(step.id, (target) => {
                    target.params.surface = { ...target.params.surface, [key]: value };
                  });
                });
                grid.append(field(label, input));
              };
            const polarity = selectInput(
              [
                { value: 'inverted', label: 'Inverted' },
                { value: 'normal', label: 'Normal' },
              ],
              appearance.polarity || 'inverted',
            );
            polarity.addEventListener('change', () => {
              updateStep(step.id, (target) => {
                target.params.surface = { ...target.params.surface, polarity: polarity.value };
              });
            });
            grid.append(field('Orientation', polarity));
            nestedLength(
              appearance.morphology === 'pyramid' ? 'Pyramid XY' : 'Feature XY',
              'featureSize',
            );
            nestedLength(
              appearance.morphology === 'pyramid' ? 'Height' : 'Height mean',
              'meanHeight',
            );
            nestedPercent('Feature CV %', 'featureCv');
            nestedPercent('Height CV %', 'heightCv');
            const seed = textInput(appearance.seed ?? '', {
              type: 'number',
              min: '0',
              max: '4294967295',
              step: '1',
            });
            seed.placeholder = 'auto';
            seed.addEventListener('change', () => {
              updateStep(step.id, (target) => {
                const value = String(seed.value).trim();
                const nextSurface = { ...target.params.surface };
                if (value) nextSurface.seed = Number(value);
                else delete nextSurface.seed;
                target.params.surface = nextSurface;
              });
            });
            grid.append(field('Seed', seed));
          }
        }
      } else if (step.command === 'implant') {
        bindText('Name', 'name');
        bindLength('Depth', 'depthUm', p.depthUm);
        bindText('Tilt X °', 'tilt', p.tilt ?? 0, { type: 'number', min: '-80', max: '80', step: '1' });
      } else if (step.command === 'electrical') {
        bindText('Name', 'name');
        bindLength('Depth', 'depthUm', p.depthUm);
        bindSelect('Type', 'regionType', [
          { value: 'p-type', label: 'P-type' },
          { value: 'n-type', label: 'N-type' },
          { value: 'p-inversion', label: 'P inversion' },
          { value: 'n-inversion', label: 'N inversion' },
          { value: 'p-accumulation', label: 'P accumulation' },
          { value: 'n-accumulation', label: 'N accumulation' },
          { value: 'depletion', label: 'Depletion' },
          { value: 'custom', label: 'Custom' },
        ]);
        bindSelect('Source', 'source', [
          { value: 'induced', label: 'Induced' },
          { value: 'doped', label: 'Doped' },
          { value: 'interface', label: 'Interface' },
          { value: 'custom', label: 'Custom' },
        ]);
      }
    }
    host.append(grid);
    renderMaskContext(step, host);
  }

  function renderSteps() {
    const host = $('recipeStepsList');
    if (!host) return;
    host.replaceChildren();
    for (const [index, step] of recipe.steps.entries()) {
      const button = make(root, 'button', 'recipe-step-row');
      button.type = 'button';
      button.classList.toggle('active', step.id === activeStepId);
      const num = make(root, 'span', 'recipe-step-num', String(index + 1).padStart(2, '0'));
      const copy = make(root, 'span', 'recipe-step-copy');
      const fullTitle = recipeStepLabel(step),
        fullSummary = recipeStepSummary(step);
      copy.title = [fullTitle, fullSummary].filter(Boolean).join(' — ');
      button.title = copy.title;
      copy.append(
        make(root, 'strong', '', fullTitle),
        make(root, 'small', '', fullSummary),
      );
      const run = lastRunResult && lastRunResult.signature === recipeSignature() &&
        lastRunResult.modelRevision === Number(getModel()?.processRevision || 0)
        ? lastRunResult : null;
      const stateText = run?.failedIndex === index ? '✕' :
        (run && index < run.completed ? '✓' : '○');
      button.classList.toggle('complete', stateText === '✓');
      button.classList.toggle('failed', stateText === '✕');
      const state = make(root, 'span', 'recipe-step-state', stateText);
      button.append(num, copy, state);
      button.addEventListener('click', () => {
        activeStepId = step.id;
        recipe.activeStepId = activeStepId;
        setRecipe(clone(recipe));
        renderSteps();
        renderEditor();
      });
      host.append(button);
    }
  }

  function syncCode() {
    const editor = $('recipeCodeEditor');
    if (!editor || codeDraftDirty || root.activeElement === editor) return;
    editor.value = serializeProcessRecipe(recipe);
  }

  function validateContext(limit = recipe.steps.length, startMode = $('recipeRunStart')?.value || 'continue') {
    let sourceSteps = recipe.steps;
    const fieldErrors = [...invalidFields.values()].map((entry) => entry.message);
    if (codeDraftDirty) {
      try {
        sourceSteps = parseProcessRecipeSource($('recipeCodeEditor').value, {
          name: $('recipeNameInput').value || recipe.name,
        }).steps;
      } catch (error) {
        return { errors: [...fieldErrors, `Code draft: ${error.message}`], warnings: [] };
      }
    }
    const report = validateRecipeExecution(sourceSteps, {
      model: getModel(),
      maskState: getMaskState?.(),
      limit,
      startMode,
    });
    return {
      errors: [...report.errors, ...fieldErrors,
        ...(codeDraftDirty ? ['Code draft is unapplied. Apply code before running.'] : [])],
      warnings: report.warnings,
    };
  }

  function showValidation(report = validateContext()) {
    const host = $('recipeValidation');
    if (!host) return report;
    host.replaceChildren();
    const lines = report.errors.length
      ? report.errors.map((message) => ['error', `✕ ${message}`])
      : [['success', `✓ ${recipe.steps.length} step(s) structurally valid`]];
    for (const message of report.warnings) lines.push(['warning', `⚠ ${message}`]);
    for (const [kind, text] of lines) host.append(make(root, 'div', `recipe-validation-${kind}`, text));
    return report;
  }

  function render() {
    if (!$('recipeProcessPane')) return;
    $('recipeNameInput').value = recipe.name;
    $('recipeRecordManual').checked = recordManual;
    renderSteps();
    renderEditor();
    syncCode();
    showValidation();
  }

  function setMode(mode) {
    const recipeMode = mode === 'recipe';
    $('manualProcessPane').hidden = recipeMode;
    $('recipeProcessPane').hidden = !recipeMode;
    for (const button of root.querySelectorAll('[data-process-input-mode]')) {
      const active = button.dataset.processInputMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function setCodeMode(codeMode) {
    $('recipeStepsPane').hidden = codeMode;
    $('recipeCodePane').hidden = !codeMode;
    $('recipeStepsTab').classList.toggle('active', !codeMode);
    $('recipeCodeTab').classList.toggle('active', codeMode);
    if (codeMode) syncCode(); // Never overwrite an unapplied draft.
    showValidation();
  }

  function maskStateFromRecipe(mask) {
    if (!mask) return null;
    return {
      maskSourceMode: mask.sourceMode || 'file',
      activeCell: mask.cell || null,
      selectedLayerKeys: [...(mask.layerKeys || [])],
      maskTransform: { ...(mask.transform || { x: 0, y: 0, scale: 1, rotation: 0 }) },
      maskRoi: mask.roi ? clone(mask.roi) : null,
      ...(mask.sourceMode === 'draw' && mask.drawMask ? { drawMask: clone(mask.drawMask) } : {}),
    };
  }

  function setThickness(valueUm) {
    $('operationThickness').value = formatLengthField(Number(valueUm));
  }

  function selectMaterialByName(selectId, name, { optional = false } = {}) {
    const select = $(selectId),
      match = selectedOptionByLabel(select, name);
    if (!match) {
      if (optional && !name) {
        select.value = '';
        return;
      }
      throw new Error(`Material "${name}" is not available for this step.`);
    }
    select.value = match.value;
  }

  async function applyProcessStep(step) {
    const p = step.params;
    if (step.command === 'snapshot') {
      snapshotManager?.create?.(p.name);
      renderSnapshots();
      return true;
    }

    if (p.face) setActiveFace(p.face);
    if (p.area && p.area !== 'full') {
      const state = maskStateFromRecipe(p.mask);
      if (!state) throw new Error('This step requires a captured Mask context.');
      setMaskState(state);
    }

    if (step.command === 'record') {
      $('operationType').value = 'record';
      updateOperationUI();
      $('recordProcessType').value = p.process || 'custom';
      $('recordProcessLabel').value = p.label || p.process || 'Process';
      $('recordTemperature').value = p.temperatureC ?? '';
      $('recordDuration').value = p.durationMin ?? '';
      $('recordAmbient').value = p.ambient || '';
      $('recordNote').value = p.note || '';
    } else {
      $('operationArea').value = p.area || 'full';
      if (step.command === 'deposit') {
        $('operationType').value = 'add';
        $('growthMode').value = p.coverage || 'direct';
        $('layerName').value = p.material;
        setThickness(p.thicknessUm);
        updateOperationUI();
        if (p.coverage === 'transfer' && $('transferMode')) {
          $('transferMode').value = p.placement === 'flat' ? 'flat' : 'follow';
        }
      } else if (step.command === 'extend') {
        $('operationType').value = 'grow';
        $('growthMode').value = p.coverage || 'direct';
        setThickness(p.thicknessUm);
        updateOperationUI();
        selectMaterialByName('targetLayer', p.material);
      } else if (step.command === 'etch') {
        $('operationType').value = 'etch';
        $('etchProfile').value = p.profile || 'directional';
        setThickness(p.thicknessUm);
        updateOperationUI();
        if (p.profile !== 'planarize') {
          selectMaterialByName('etchTargetLayer', p.target, { optional: true });
        }
        const surface = p.surface;
        if (p.profile === 'directional' && surface && surface !== 'smooth') {
          const appearance = typeof surface === 'object' ? surface : {};
          $('etchSurfaceMode').value =
            appearance.morphology === 'pyramid' || surface === 'pyramid' ? 'pyramid' : 'rough';
          updateOperationUI();
          if (appearance.featureSize != null)
            $('roughFeatureSize').value = formatLengthField(
              recipeLengthUm(appearance.featureSize, 'surface.featureSize'),
            );
          if (appearance.meanHeight != null || appearance.height != null)
            $('roughAmplitude').value = formatLengthField(
              recipeLengthUm(appearance.meanHeight ?? appearance.height, 'surface.height'),
            );
          if (appearance.featureCv != null)
            $('roughFeatureCv').value = String(
              Number(appearance.featureCv) <= 1
                ? Number(appearance.featureCv) * 100
                : Number(appearance.featureCv),
            );
          if (appearance.heightCv != null)
            $('roughHeightCv').value = String(
              Number(appearance.heightCv) <= 1
                ? Number(appearance.heightCv) * 100
                : Number(appearance.heightCv),
            );
          if (appearance.polarity) $('roughPolarity').value = appearance.polarity;
          if (appearance.seed != null) $('roughSeed').value = String(appearance.seed);
        } else {
          $('etchSurfaceMode').value = 'smooth';
        }
      } else if (step.command === 'implant') {
        $('operationType').value = 'implant';
        $('implantName').value = p.name;
        $('implantTilt').value = String(p.tilt || 0);
        setThickness(p.depthUm);
      } else if (step.command === 'electrical') {
        $('operationType').value = 'electrical';
        $('electricalName').value = p.name;
        $('electricalRegionType').value = p.regionType;
        $('electricalRegionSource').value = p.source;
        setThickness(p.depthUm);
      }
      updateOperationUI();
    }

    const before = Number(getModel()?.processRevision || 0);
    await processPanelController.applyOperation();
    const after = Number(getModel()?.processRevision || 0);
    if (after <= before) throw new Error('The Process step did not commit a model revision.');
    return true;
  }

  function setRunningUi(value) {
    running = value;
    $('recipeRunAllBtn').disabled = value;
    $('recipeRunToBtn').disabled = value;
    $('recipeValidateBtn').disabled = value;
    $('recipeApplyCodeBtn').disabled = value;
    $('recipeStopBtn').disabled = !value;
    $('recipeProgress').hidden = !value;
    updateUndoRedoUi();
  }

  async function run(limit = recipe.steps.length) {
    if (running) return;
    if (processTaskController?.isBusy?.()) {
      status('Another background task is already running.', 'warning');
      return;
    }
    // A Recipe is a sequence of mutations, so replaying it on an already
    // processed model would silently double-deposit or double-etch. Expose
    // the starting-state policy before any Process worker requests.
    const startMode = $('recipeRunStart')?.value || 'continue';
    if (startMode === 'new-base') {
      const rebuilt = await resetToBase();
      if (!rebuilt) {
        status('Process Recipe run cancelled: Base was not rebuilt.', 'warning');
        return;
      }
    } else if (Number(getModel()?.processRevision || 0) > 0) {
      const allowed = await confirmContinue();
      if (!allowed) {
        status('Process Recipe run cancelled; existing process was not changed.', 'warning');
        return;
      }
    }
    const report = showValidation();
    if (report.errors.length) {
      status('Recipe validation failed. Fix the highlighted issues before running.', 'error');
      return;
    }

    const total = Math.min(Math.max(0, limit), recipe.steps.length);
    if (!total) return status('Recipe has no steps to run.', 'warning');
    setRunningUi(true);
    stopRequested = false;
    const rows = () => [...root.querySelectorAll('.recipe-step-row')];

    try {
      for (let index = 0; index < total; index += 1) {
        if (stopRequested) break;
        const step = recipe.steps[index],
          row = rows()[index];
        row?.classList.add('running');
        row?.querySelector('.recipe-step-state')?.replaceChildren('▶');
        $('recipeProgressLabel').textContent = recipeStepLabel(step);
        $('recipeProgressCount').textContent = `${index + 1} / ${total}`;
        $('recipeProgressBar').max = total;
        $('recipeProgressBar').value = index;
        await applyProcessStep(step);
        row?.classList.remove('running');
        row?.classList.add('complete');
        row?.querySelector('.recipe-step-state')?.replaceChildren('✓');
        $('recipeProgressBar').value = index + 1;
      }
      if (stopRequested) status('Process Recipe stopped.', 'warning');
      else status(`Process Recipe completed ${total} step(s).`, 'success');
    } catch (error) {
      if (stopRequested) status('Process Recipe stopped.', 'warning');
      else status(`Process Recipe stopped: ${error.message}`, 'error');
    } finally {
      setRunningUi(false);
      renderAll();
      renderSteps();
    }
  }

  function applyCode() {
    try {
      const parsed = parseProcessRecipeSource($('recipeCodeEditor').value, {
        name: $('recipeNameInput').value || recipe.name,
      });
      persist(parsed);
      codeDraftDirty = false;
      invalidFields.clear();
      activeStepId = recipe.steps[0]?.id || null;
      render();
      syncCode();
      status('Recipe code applied.', 'success');
      return true;
    } catch (error) {
      showValidation({ errors: [error.message], warnings: [] });
      status(`Recipe code error: ${error.message}`, 'error');
      return false;
    }
  }

  function stepFromManualOperation(operation) {
    const replay = operation?.replay?.version === 1 ? operation.replay : null;
    if (!replay) return null;
    const p = replay.params || {},
      common = {
        face: operation.face || p.face || 'front',
        area: replay.areaMode || operation.areaMode || 'full',
        mask: clone(replay.maskContext || operation.maskContext || null),
      };
    let source = null;
    if (operation.kind === 'add') {
      source = {
        command: 'deposit',
        params: {
          material: p.name || operation.name,
          thickness: Number(p.thickness),
          coverage: p.growth || 'direct',
          placement: p.transferMode || operation.transferMode || 'follow',
          ...common,
        },
      };
    } else if (operation.kind === 'grow') {
      source = {
        command: 'extend',
        params: {
          material: operation.name || p.targetLayerId || 'Layer',
          thickness: Number(p.thickness),
          coverage: p.growth || 'direct',
          ...common,
        },
      };
    } else if (operation.kind === 'etch') {
      const targetId = p.etchTargetLayerIds?.[0] || operation.etchTargetLayerIds?.[0] || null,
        targetName = targetId
          ? getModel()?.layers?.find((layer) => layer.id === targetId)?.name || ''
          : '';
      source = {
        command: 'etch',
        params: {
          target: targetName,
          [p.etchProfile === 'planarize' ? 'targetZ' : 'depth']: Number(
            p.targetZ ?? p.thickness,
          ),
          profile: p.etchProfile || 'directional',
          surface: p.surface || 'smooth',
          ...common,
        },
      };
    } else if (operation.kind === 'implant') {
      source = {
        command: 'implant',
        params: {
          name: p.name || operation.name,
          depth: Number(p.thickness),
          tilt: Number(p.tilt || 0),
          ...common,
        },
      };
    } else if (operation.kind === 'electrical') {
      source = {
        command: 'electrical',
        params: {
          name: p.name || operation.name,
          depth: Number(p.thickness),
          regionType: p.electricalRegionType,
          source: p.electricalRegionSource,
          ...common,
        },
      };
    } else if (operation.kind === 'record') {
      source = {
        command: 'record',
        params: {
          process: operation.processType,
          label: operation.label,
          temperatureC: operation.temperatureC,
          durationMin: operation.durationMin,
          ambient: operation.ambient,
          note: operation.note,
        },
      };
    }
    if (!source) return null;
    const step = normalizeProcessRecipe({ name: recipe.name, steps: [source] }).steps[0];
    step.id = nextId();
    return step;
  }

  function recordManualOperation(operation) {
    if (running || !recordManual) return false;
    const step = stepFromManualOperation(operation);
    if (!step) return false;
    const next = clone(recipe);
    next.steps.push(step);
    activeStepId = step.id;
    persist(next);
    render();
    return true;
  }

  function bind() {
    if (bound) return;
    initMarkup();
    if (!$('recipeProcessPane')) return;
    bound = true;
    loadPersisted();

    root.querySelectorAll('[data-process-input-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.processInputMode));
    });
    $('recipeStepsTab').addEventListener('click', () => setCodeMode(false));
    $('recipeCodeTab').addEventListener('click', () => setCodeMode(true));
    $('recipeNameInput').addEventListener('change', () => {
      const next = clone(recipe);
      next.name = $('recipeNameInput').value || 'Process Recipe';
      persist(next);
      render();
    });
    $('recipeRecordManual').addEventListener('change', () => {
      recordManual = $('recipeRecordManual').checked;
    });
    $('recipeUndoBtn').addEventListener('click', undoRecipe);
    $('recipeRedoBtn').addEventListener('click', redoRecipe);
    $('recipeTemplateSelect').addEventListener('change', () => {
      const id = $('recipeTemplateSelect').value;
      if (!id) return;
      const next = recipeTemplate(id);
      persist(next);
      activeStepId = next.steps[0]?.id || null;
      $('recipeTemplateSelect').value = '';
      render();
    });
    $('recipeAddStepBtn').addEventListener('click', () => {
      const next = clone(recipe),
        step = defaultStep($('recipeAddKind').value),
        activeIndex = next.steps.findIndex((item) => item.id === activeStepId),
        insertIndex = activeIndex >= 0 ? activeIndex + 1 : next.steps.length;
      next.steps.splice(insertIndex, 0, step);
      activeStepId = step.id;
      persist(next);
      render();
      status(`Added ${recipeStepLabel(step)} after Step ${insertIndex}.`, 'success');
    });
    $('recipeCodeEditor').addEventListener('input', () => {
      codeDraftDirty = $('recipeCodeEditor').value !== serializeProcessRecipe(recipe);
      showValidation();
    });
    $('recipeApplyCodeBtn').addEventListener('click', applyCode);
    $('recipeFormatCodeBtn').addEventListener('click', () => {
      if (applyCode()) syncCode();
    });
    $('recipeValidateBtn').addEventListener('click', () => {
      const report = showValidation();
      status(
        report.errors.length
          ? `Recipe validation failed with ${report.errors.length} error(s).`
          : `Recipe valid: ${recipe.steps.length} step(s).`,
        report.errors.length ? 'error' : 'success',
      );
    });
    $('recipeRunAllBtn').addEventListener('click', () => void run(recipe.steps.length));
    $('recipeRunToBtn').textContent = 'Replay 1 → Step';
    $('recipeRunToBtn').title = 'Always replays Steps 1 through the selected Step from the chosen starting model.';
    $('recipeRunStart').addEventListener('change', () => showValidation());
    $('recipeRunToBtn').addEventListener('click', () => {
      const index = recipe.steps.findIndex((step) => step.id === activeStepId);
      void run(index < 0 ? 0 : index + 1);
    });
    $('recipeStopBtn').addEventListener('click', () => {
      stopRequested = true;
      processTaskController?.abort?.();
    });

    setMode('manual');
    setCodeMode(false);
    render();
  }

  function refresh() {
    loadPersisted();
    if (bound) render();
  }

  return {
    bind,
    refresh,
    recordManualOperation,
    getRecipe: () => clone(recipe),
    isRunning: () => running,
  };
}
