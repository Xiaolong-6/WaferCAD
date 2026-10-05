import { baseCoverageState, exposedLayerIds, hasMaterial, layerById } from '../model.js';
import { captureHistoryReplayResult, remapHistoryReplayOperation } from '../history-replay.js';

export function createProcessPanelController({
  root = document,
  getModel,
  getActiveFace,
  setActiveFace = () => {},
  getMaskState,
  setModel,
  operationAreaGeometry,
  selectedElement,
  manualMicron,
  formatLengthField,
  processTaskController,
  saveHistory,
  beforeApply = async () => true,
  commitApplyBranch = async () => null,
  recordProcessOperation = () => {},
  afterApply = async () => false,
  getHistoricalStepEdit = () => null,
  getHistoricalStepInsert = () => null,
  clearBaseRevertSnapshot,
  colorNewLayer,
  colorNewImplant,
  colorNewElectricalRegion,
  renderAll,
  status,
}) {
  const $ = (id) => root.getElementById(id);

  function normalizedMaskContext({
    maskSourceMode,
    maskRoi,
    drawMask,
    maskTransform,
    layout,
    activeCell,
    selectedLayerKeys,
    areaMode,
  }) {
    if (maskSourceMode === 'draw') {
      return {
        sourceMode: 'draw',
        shapeCount: Array.isArray(drawMask?.shapes) ? drawMask.shapes.length : 0,
        roi: maskRoi ? structuredClone(maskRoi) : null,
      };
    }

    const requestedLayerKeys = Array.from(selectedLayerKeys || [], (value) => String(value)),
      effectiveLayerKeys =
        areaMode === 'full'
          ? requestedLayerKeys
          : [
              ...new Set(
                (layout?.elements || [])
                  .filter(selectedElement)
                  .map((element) => `${element.layer}|${element.datatype}`),
              ),
            ];

    return {
      sourceMode: 'file',
      cell: activeCell || layout?.root || null,
      layerKeys: effectiveLayerKeys.length ? effectiveLayerKeys : requestedLayerKeys,
      transform: { ...(maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 }) },
      roi: maskRoi ? structuredClone(maskRoi) : null,
    };
  }

  function updateGrowTargets() {
    const select = $('targetLayer');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '';

    const model = getModel(),
      activeFace = getActiveFace(),
      area = operationAreaGeometry($('operationArea').value),
      exposed = new Set(exposedLayerIds(model, area, activeFace));
    for (const layer of model.layers) {
      if (!exposed.has(layer.id)) continue;
      select.add(new Option(layer.name, layer.id));
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    select.disabled = !select.options.length;
  }

  function updateEtchTargets() {
    const select = $('etchTargetLayer');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '';
    const isotropic = $('etchProfile')?.value === 'isotropic';
    select.add(new Option(isotropic ? 'Select material…' : 'All exposed materials', ''));

    const model = getModel(),
      activeFace = getActiveFace(),
      area = operationAreaGeometry($('operationArea').value),
      exposed = new Set(exposedLayerIds(model, area, activeFace));
    for (const layer of model.layers) {
      if (!exposed.has(layer.id)) continue;
      select.add(new Option(layer.name, layer.id));
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function updateOperationUI() {
    const t = $('operationType').value;
    root.querySelectorAll('[data-process-mode]').forEach((button) => {
      const active = button.dataset.processMode === t;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const recordOnly = t === 'record',
      electrical = t === 'electrical';
    $('layerNameRow').classList.toggle('hidden', t !== 'add');
    $('implantNameRow').classList.toggle('hidden', t !== 'implant');
    $('electricalNameRow').classList.toggle('hidden', !electrical);
    $('electricalRegionParams').classList.toggle('hidden', !electrical);
    $('implantTiltRow').classList.toggle('hidden', t !== 'implant');
    $('targetLayerRow').classList.toggle('hidden', t !== 'grow');
    $('etchTargetLayerRow').classList.toggle('hidden', t !== 'etch');
    $('growthModeRow').classList.toggle(
      'hidden',
      t === 'etch' || t === 'implant' || electrical || recordOnly,
    );
    $('operationAreaRow').classList.toggle('hidden', recordOnly);
    $('operationThicknessRow').classList.toggle('hidden', recordOnly);
    $('recordProcessParams').classList.toggle('hidden', !recordOnly);
    $('etchProfileRow').classList.toggle('hidden', t !== 'etch');
    const etchProfile = $('etchProfile')?.value === 'isotropic' ? 'isotropic' : 'directional',
      isotropicEtch = t === 'etch' && etchProfile === 'isotropic';
    $('etchSurfaceRow').classList.toggle('hidden', t !== 'etch' || isotropicEtch);
    const surfaceMode = $('etchSurfaceMode').value,
      texturedEtch = t === 'etch' && !isotropicEtch && surfaceMode !== 'smooth',
      stochasticEtch = texturedEtch && surfaceMode === 'rough',
      pyramidEtch = texturedEtch && surfaceMode === 'pyramid';
    $('roughPolarityRow').classList.toggle('hidden', !texturedEtch);
    $('roughSeedRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureCvRow').classList.toggle('hidden', !texturedEtch);
    $('roughHeightRow').classList.toggle('hidden', !texturedEtch);
    $('roughHeightCvRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureLabel').textContent = pyramidEtch ? 'Pyramid XY' : 'Feature XY';
    $('roughHeightLabel').textContent = pyramidEtch ? 'Height' : 'Height mean';
    $('processThicknessLabel').textContent =
      t === 'etch'
        ? isotropicEtch
          ? 'Radius'
          : 'Depth'
        : t === 'implant' || electrical
          ? 'Depth'
          : 'Z';

    if (t === 'grow') updateGrowTargets();
    if (t === 'etch') updateEtchTargets();

    const model = getModel(),
      activeFace = getActiveFace(),
      materialExists = hasMaterial(model);
    $('applyOperationBtn').disabled =
      (!materialExists && !recordOnly) || Boolean(processTaskController?.isBusy());
    $('applyOperationBtn').textContent = getHistoricalStepEdit()
      ? 'Save edited Step'
      : getHistoricalStepInsert()
        ? 'Insert Step'
        : recordOnly
          ? 'Record'
          : 'Apply';
    const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
    $('processSummary').textContent = recordOnly
      ? 'Process · Record step'
      : `${faceLabel} · ${
          t === 'add'
            ? 'Deposit layer'
            : t === 'grow'
              ? 'Extend layer'
              : t === 'implant'
                ? 'Implant'
                : electrical
                  ? 'Electrical region'
                  : 'Etch'
        }`;

    $('operationNote').hidden = !materialExists && !recordOnly;
    if (!materialExists && !recordOnly) return;

    $('operationNote').textContent = recordOnly
      ? 'Records fabrication metadata in History without changing material geometry.'
      : t === 'implant'
        ? 'Structural implant annotation: starts at the outermost selected surface, ignores material boundaries, and renders a user-defined depth with optional geometric tilt. It is not a dopant-physics solver.'
        : electrical
          ? 'Non-material electrical annotation: marks an induced, doped, or interface region from the selected exposed surface. It follows later Etch geometry but does not solve carrier transport or electrostatics.'
          : t === 'etch'
            ? isotropicEtch
              ? $('etchTargetLayer').value
                ? 'Isotropic release propagates from the selected exposed material into the solid with the chosen radius, including lateral undercut beneath other materials. The selected etch material is removed; masks and stop materials remain.'
                : 'Choose one exposed material for Isotropic release. This mode creates physical undercut/cavity geometry and does not combine with Rough/Pyramid display morphology.'
              : stochasticEtch
                ? `Depth is the maximum etch depth; Height and Feature XY are means, with CV controlling their spread. ${$('roughPolarity').value === 'normal' ? 'Normal points features outward (peaks).' : 'Inverted keeps the existing inward pit/valley orientation.'} Display morphology only for process simulation: the canonical process stack remains ideal, while 3D and GLB inspection surfaces include the deterministic morphology.`
                : pyramidEtch
                  ? `Pyramid XY and Height are means; CV controls deterministic base-size/position and height variation, and Seed makes the random field reproducible. ${$('roughPolarity').value === 'normal' ? 'Normal gives outward pyramids.' : 'Inverted gives inward pyramid pits.'} Display morphology only for process simulation: the canonical process stack remains ideal, while 3D and GLB inspection surfaces include the deterministic morphology.`
                  : $('etchTargetLayer').value
                    ? 'Material-selective Etch removes only the selected material while it is exposed, then stops on the next material.'
                    : 'Etch removes exposed material vertically in stack order and may create through-holes.'
            : $('growthMode').value === 'conformal'
              ? t === 'grow'
                ? `Conformal Extend continues the target material over every exposed surface in the selected area, then follows physical steps and sidewalls.${$('operationArea').value === 'full' ? '' : ' Process-mask edges remain hard-clipped.'} On Rough/Pyramid surfaces, the displayed conformal topography is a visual approximation.`
                : `Conformal coverage follows exposed surfaces, physical steps, and sidewalls.${$('operationArea').value === 'full' ? '' : ' Process-mask edges remain hard-clipped.'} On Rough/Pyramid surfaces, the displayed conformal topography is a visual approximation.`
              : 'Directional coverage follows the selected footprint.';
  }

  function optionalNumber(id, label) {
    const raw = String($(id)?.value ?? '').trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a number or left blank.`);
    return value;
  }

  function replayDescriptor(operation) {
    return operation?.replay?.version === 1 ? operation.replay : null;
  }

  function canReplayOperation(operation) {
    return Boolean(replayDescriptor(operation));
  }

  function loadOperationForEdit(operation = {}) {
    const replay = replayDescriptor(operation);
    if (!replay) return false;

    const params = replay.params || {};
    const kind = operation.kind || params.type;
    if (!['add', 'grow', 'etch', 'implant', 'electrical', 'record'].includes(kind)) {
      return false;
    }

    $('operationType').value = kind;
    if (operation.face || params.face) setActiveFace(operation.face || params.face);

    if (kind === 'record') {
      $('recordProcessType').value = operation.processType || 'custom';
      $('recordProcessLabel').value = operation.label || '';
      $('recordTemperature').value =
        operation.temperatureC == null ? '' : String(operation.temperatureC);
      $('recordDuration').value =
        operation.durationMin == null ? '' : String(operation.durationMin);
      $('recordAmbient').value = operation.ambient || '';
      $('recordNote').value = operation.note || '';
      updateOperationUI();
      return true;
    }

    const thickness = Number(params.thickness ?? operation.thickness);
    if (Number.isFinite(thickness)) $('operationThickness').value = formatLengthField(thickness);
    $('operationArea').value = replay.areaMode || operation.areaMode || 'full';

    if (kind === 'add') {
      $('layerName').value = params.name || operation.name || '';
      $('growthMode').value = params.growth || operation.growth || 'direct';
    } else if (kind === 'grow') {
      $('growthMode').value = params.growth || operation.growth || 'direct';
    } else if (kind === 'implant') {
      $('implantName').value = params.name || operation.name || '';
      $('implantTilt').value = String(params.tilt ?? operation.implantTilt ?? 0);
    } else if (kind === 'electrical') {
      $('electricalName').value = params.name || operation.name || '';
      $('electricalRegionType').value =
        params.electricalRegionType || operation.electricalRegionType || 'inversion';
      $('electricalRegionSource').value =
        params.electricalRegionSource || operation.electricalRegionSource || 'induced';
    } else if (kind === 'etch') {
      $('etchProfile').value = params.etchProfile || operation.etchProfile || 'directional';
      const surface = params.surface || operation.surface || null;
      $('etchSurfaceMode').value = surface
        ? surface.morphology === 'pyramid'
          ? 'pyramid'
          : 'rough'
        : 'smooth';
      if (surface) {
        $('roughPolarity').value = surface.polarity === 'normal' ? 'normal' : 'inverted';
        if (Number.isFinite(Number(surface.featureSize))) {
          $('roughFeatureSize').value = formatLengthField(Number(surface.featureSize));
        }
        if (Number.isFinite(Number(surface.meanHeight))) {
          $('roughAmplitude').value = formatLengthField(Number(surface.meanHeight));
        }
        $('roughFeatureCv').value = String(Math.round(Number(surface.featureCv || 0) * 100));
        $('roughHeightCv').value = String(Math.round(Number(surface.heightCv || 0) * 100));
        if ($('roughSeed')) $('roughSeed').value = surface.seed == null ? '' : String(surface.seed);
      }
    }

    updateOperationUI();

    if (kind === 'grow' && params.targetLayerId) {
      $('targetLayer').value = params.targetLayerId;
    }
    if (kind === 'etch') {
      const target = params.etchTargetLayerIds?.[0] || operation.etchTargetLayerIds?.[0] || '';
      $('etchTargetLayer').value = target;
    }
    updateOperationUI();
    return true;
  }

  function replayScopeCells(state, requestedCell = null) {
    const hierarchy = state?.layout?.hierarchy || {},
      savedCell = requestedCell || state?.activeCell || null,
      activeCell =
        (savedCell && (savedCell in hierarchy || savedCell === state?.layout?.root)
          ? savedCell
          : null) ||
        state?.layout?.root ||
        Object.keys(hierarchy)[0] ||
        null;
    if (!activeCell) return new Set();
    const out = new Set();
    const walk = (name) => {
      if (!name || out.has(name)) return;
      out.add(name);
      const entry = hierarchy?.[name],
        children = Array.isArray(entry) ? entry : entry?.children || [];
      for (const child of children) {
        walk(typeof child === 'string' ? child : child?.name);
      }
    };
    walk(activeCell);
    return out;
  }

  function replayAreaRequest(operation, state) {
    const replay = replayDescriptor(operation);
    if (!replay || !state) {
      throw new Error('This Step does not contain the workspace state required for replay.');
    }
    const mode = replay.areaMode || operation.areaMode || 'full',
      maskContext = replay.maskContext || operation.maskContext || null,
      maskSourceMode =
        maskContext?.sourceMode === 'draw'
          ? 'draw'
          : maskContext?.sourceMode === 'file'
            ? 'file'
            : state.maskSourceMode === 'draw'
              ? 'draw'
              : 'file',
      maskRoi = maskContext?.roi
        ? structuredClone(maskContext.roi)
        : state.maskRoi
          ? structuredClone(state.maskRoi)
          : null;

    if (maskSourceMode === 'draw') {
      return {
        mode,
        maskSourceMode,
        maskRoi,
        drawMask: structuredClone(state.drawMask || { nextShapeId: 1, shapes: [] }),
      };
    }

    const selectedLayers = new Set(
        Array.isArray(maskContext?.layerKeys)
          ? maskContext.layerKeys
          : state.selectedLayerKeys || [],
      ),
      scope = replayScopeCells(state, maskContext?.cell || null),
      elements = (state.layout?.elements || [])
        .filter(
          (element) =>
            scope.has(element.sourceCell) &&
            selectedLayers.has(`${element.layer}|${element.datatype}`),
        )
        .map((element) => ({
          kind: element.kind,
          width: element.width,
          points: element.points,
        }));

    return {
      mode,
      maskSourceMode,
      maskRoi,
      maskTransform: {
        ...(maskContext?.transform || state.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 }),
      },
      elements,
    };
  }

  async function replayOperations(steps = [], { taskLabel = '' } = {}) {
    const executeReplay = async (taskContext = null) => {
      let completed = 0;
      const layerIdMap = new Map(),
        total = steps.length;

      for (let index = 0; index < steps.length; index += 1) {
        if (taskContext?.signal?.aborted) {
          return {
            ok: false,
            aborted: true,
            completed,
            failedOperation: null,
            error: 'Replay aborted.',
          };
        }

        const sourceStep = steps[index],
          operation = structuredClone(sourceStep?.operation || sourceStep || {}),
          sourceState = sourceStep?.operation ? sourceStep.state : null,
          replay = replayDescriptor(operation),
          stepLabel = operation.label || operation.kind || 'process Step',
          stagePrefix = `Step ${index + 1}/${total} · ${stepLabel}`;

        taskContext?.updateStage?.(stagePrefix);

        if (!replay) {
          return {
            ok: false,
            completed,
            failedOperation: operation,
            error: 'This downstream Step predates replay metadata.',
          };
        }

        if (operation.kind === 'record') {
          saveHistory();
          clearBaseRevertSnapshot();
          const nextModel = structuredClone(getModel());
          nextModel.revision = (Number(nextModel.revision) || 0) + 1;
          nextModel.processRevision = (Number(nextModel.processRevision) || 0) + 1;
          setModel(nextModel);
          recordProcessOperation(operation);
          completed += 1;
          continue;
        }

        if (!taskContext && processTaskController?.isBusy()) {
          return {
            ok: false,
            completed,
            failedOperation: operation,
            error: 'Another process task is already running.',
          };
        }

        const params = structuredClone(replay.params || {});
        remapHistoryReplayOperation(operation, params, layerIdMap);

        let areaRequest;
        try {
          areaRequest = replayAreaRequest(operation, sourceState);
        } catch (error) {
          return {
            ok: false,
            completed,
            failedOperation: operation,
            error: error?.message || 'Replay area could not be reconstructed.',
          };
        }

        const task = taskContext
          ? await taskContext.runWorker(
              '../process-worker.js',
              { model: getModel(), params, areaRequest },
              { stagePrefix },
            )
          : await processTaskController.run(
              getModel(),
              params,
              `Replaying ${stepLabel}…`,
              areaRequest,
            );

        if (task?.aborted || task?.error || task?.busy) {
          return {
            ok: false,
            aborted: Boolean(task?.aborted),
            completed,
            failedOperation: operation,
            error: task?.error || (task?.aborted ? 'Replay aborted.' : 'Replay worker is busy.'),
          };
        }
        if (!task.result?.changed) {
          return {
            ok: false,
            completed,
            failedOperation: operation,
            error: task.result?.error || 'The replayed operation did not change the model.',
          };
        }

        saveHistory();
        clearBaseRevertSnapshot();
        setModel(task.model);
        captureHistoryReplayResult(operation, sourceStep, task.result, layerIdMap);
        if (operation.kind === 'add' && task.result.layerId) colorNewLayer(task.result.layerId);
        else if (operation.kind === 'implant' && task.result.implantId) {
          colorNewImplant(task.result.implantId);
        } else if (operation.kind === 'electrical' && task.result.electricalRegionId) {
          colorNewElectricalRegion(task.result.electricalRegionId);
        }
        recordProcessOperation(operation);
        completed += 1;
      }

      renderAll();
      return { ok: true, completed };
    };

    if (!processTaskController?.runTask) return executeReplay();

    const result = await processTaskController.runTask(executeReplay, {
      label:
        taskLabel || `Recalculating ${steps.length} later Step${steps.length === 1 ? '' : 's'}…`,
      abortMessage: 'History recalculation aborted. The previous Variant will be restored.',
      failurePrefix: 'History recalculation failed',
    });
    if (result?.busy) {
      return {
        ok: false,
        completed: 0,
        failedOperation: null,
        error: 'Another background task is already running.',
      };
    }
    return result;
  }

  async function recordProcessStep() {
    const applyGate = await beforeApply();
    if (!applyGate) return;

    let temperatureC;
    let durationMin;
    try {
      temperatureC = optionalNumber('recordTemperature', 'Temperature');
      durationMin = optionalNumber('recordDuration', 'Time');
    } catch (error) {
      return status(error.message, 'error');
    }
    if (durationMin != null && durationMin < 0) {
      return status('Time must be zero or greater.', 'error');
    }

    let branchCommit = null;
    try {
      branchCommit = await commitApplyBranch(applyGate);
    } catch (error) {
      console.error(error);
      return status(`Variant creation failed: ${error.message}`, 'error');
    }

    const model = getModel(),
      processType = $('recordProcessType').value || 'custom',
      defaultLabel = $('recordProcessType').selectedOptions?.[0]?.textContent || 'Process step',
      label = $('recordProcessLabel').value.trim() || defaultLabel,
      ambient = $('recordAmbient').value.trim(),
      note = $('recordNote').value.trim();

    saveHistory();
    clearBaseRevertSnapshot();
    const nextModel = structuredClone(model);
    nextModel.revision = (Number(nextModel.revision) || 0) + 1;
    nextModel.processRevision = (Number(nextModel.processRevision) || 0) + 1;
    setModel(nextModel);

    const operation = {
      kind: 'record',
      label,
      processType,
      geometryChanged: false,
      temperatureC,
      durationMin,
      ambient: ambient || null,
      note: note || null,
      replay: { version: 1, kind: 'record' },
    };
    recordProcessOperation(operation);
    renderAll();
    if (await afterApply({ applyGate, branchCommit, operation })) return;
    status(`Recorded process Step “${label}” without changing geometry.`, 'success');
  }

  async function applyOperation() {
    let model = getModel();
    const activeFace = getActiveFace(),
      { maskSourceMode, maskRoi, drawMask, maskTransform, layout, activeCell, selectedLayerKeys } =
        getMaskState();
    if (processTaskController?.isBusy()) {
      status('An operation is already running. Abort it before starting another.', 'warning');
      return;
    }

    const type = $('operationType').value;
    if (type === 'record') return recordProcessStep();

    const thickness = manualMicron($('operationThickness').value);
    $('operationThickness').value = formatLengthField(thickness);
    if (!(thickness > 0)) return status('Thickness must be greater than zero.', 'error');

    const areaMode = $('operationArea').value,
      maskContext = normalizedMaskContext({
        maskSourceMode,
        maskRoi,
        drawMask,
        maskTransform,
        layout,
        activeCell,
        selectedLayerKeys,
        areaMode,
      });

    const name =
        type === 'implant'
          ? $('implantName').value.trim() || `Implant ${model.nextImplantId || 1}`
          : type === 'electrical'
            ? $('electricalName').value.trim() ||
              `Electrical Region ${model.nextElectricalRegionId || 1}`
            : $('layerName').value.trim() || `Layer ${model.layers.length}`,
      targetLayerId = $('targetLayer').value,
      etchTargetLayerId = $('etchTargetLayer')?.value || '',
      etchProfile = $('etchProfile')?.value === 'isotropic' ? 'isotropic' : 'directional';
    if (type === 'grow' && !targetLayerId) {
      return status('No exposed target layer is available to Extend.', 'warning');
    }
    if (type === 'etch' && etchProfile === 'isotropic' && !etchTargetLayerId) {
      return status('Choose one exposed material for Isotropic release.', 'warning');
    }

    let roughSurface = null;
    const etchSurfaceMode = $('etchSurfaceMode').value;
    if (type === 'etch' && etchProfile === 'directional' && etchSurfaceMode !== 'smooth') {
      const pyramid = etchSurfaceMode === 'pyramid',
        featureSize = manualMicron($('roughFeatureSize').value),
        meanHeight = manualMicron($('roughAmplitude').value),
        featureCvPercent = Number($('roughFeatureCv').value),
        heightCvPercent = Number($('roughHeightCv').value),
        featureCv = featureCvPercent / 100,
        heightCv = heightCvPercent / 100,
        seedText = String($('roughSeed')?.value ?? '').trim(),
        seedValue = seedText === '' ? null : Number(seedText);
      $('roughFeatureSize').value = formatLengthField(featureSize);
      $('roughAmplitude').value = formatLengthField(meanHeight);
      if (!(featureSize > 0) || !(meanHeight > 0)) {
        return status(
          pyramid
            ? 'Pyramid XY and Height must be greater than zero.'
            : 'Rough mean Feature XY and Height must be greater than zero.',
          'error',
        );
      }
      if (meanHeight > thickness + 1e-9) {
        return status(
          pyramid
            ? 'Pyramid Height cannot exceed Etch Depth.'
            : 'Rough mean Height cannot exceed Etch Depth.',
          'error',
        );
      }
      if (
        !Number.isFinite(featureCvPercent) ||
        !Number.isFinite(heightCvPercent) ||
        featureCvPercent < 0 ||
        featureCvPercent > 100 ||
        heightCvPercent < 0 ||
        heightCvPercent > 100
      ) {
        return status('Rough Feature CV and Height CV must be between 0% and 100%.', 'error');
      }
      if (
        seedValue != null &&
        (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 0xffffffff)
      ) {
        return status(
          'Surface Seed must be an integer from 0 to 4294967295, or left blank.',
          'error',
        );
      }
      roughSurface = {
        kind: 'rough',
        morphology: pyramid ? 'pyramid' : 'stochastic',
        polarity: $('roughPolarity').value === 'normal' ? 'normal' : 'inverted',
        featureSize,
        meanHeight,
        featureCv,
        heightCv,
        ...(seedValue == null ? {} : { seed: seedValue >>> 0 }),
        geometryMode: 'ideal',
      };
    }

    const beforeBase = baseCoverageState(model),
      params = { type, name, targetLayerId, thickness, face: activeFace };
    if (type === 'etch') {
      params.surface = roughSurface;
      params.etchProfile = etchProfile;
      params.etchTargetLayerIds = etchTargetLayerId ? [etchTargetLayerId] : [];
    } else if (type === 'implant') {
      const tilt = Number($('implantTilt').value);
      if (!Number.isFinite(tilt) || tilt < -80 || tilt > 80) {
        return status('Implant Tilt X must be between -80° and 80°.', 'error');
      }
      params.tilt = tilt;
    } else if (type === 'electrical') {
      params.electricalRegionType = $('electricalRegionType').value;
      params.electricalRegionSource = $('electricalRegionSource').value;
    } else params.growth = $('growthMode').value;

    const taskLabel =
      type === 'etch'
        ? etchProfile === 'isotropic'
          ? 'Computing isotropic release…'
          : 'Etching structure…'
        : type === 'grow'
          ? 'Extending layer…'
          : type === 'implant'
            ? `Marking ${name} implant…`
            : type === 'electrical'
              ? `Marking ${name} electrical region…`
              : `Depositing ${name}…`;

    const applyGate = await beforeApply();
    if (!applyGate) return;

    const areaRequest = {
      mode: areaMode,
      maskSourceMode,
      maskRoi: maskRoi ? structuredClone(maskRoi) : null,
      ...(maskSourceMode === 'draw'
        ? { drawMask: structuredClone(drawMask) }
        : {
            maskTransform: { ...maskTransform },
            elements: (layout.elements || []).filter(selectedElement).map((element) => ({
              kind: element.kind,
              width: element.width,
              points: element.points,
            })),
          }),
    };

    const task = await processTaskController.run(model, params, taskLabel, areaRequest);
    if (task?.aborted || task?.error || task?.busy) return;

    const result = task.result;
    if (!result?.changed) {
      return status(result?.error || 'The operation did not change the model.', 'warning');
    }

    let branchCommit = null;
    try {
      branchCommit = await commitApplyBranch(applyGate);
    } catch (error) {
      console.error(error);
      return status(`Variant creation failed: ${error.message}`, 'error');
    }

    saveHistory();
    clearBaseRevertSnapshot();
    setModel(task.model);
    model = task.model;

    if (type === 'add' && result.layerId) {
      colorNewLayer(result.layerId);
      $('layerName').value = `Layer ${model.nextLayerId}`;
    } else if (type === 'implant' && result.implantId) {
      colorNewImplant(result.implantId);
      $('implantName').value =
        `Implant ${model.nextImplantId || (model.implants?.length || 0) + 1}`;
    } else if (type === 'electrical' && result.electricalRegionId) {
      colorNewElectricalRegion(result.electricalRegionId);
      $('electricalName').value =
        `Electrical Region ${model.nextElectricalRegionId || (model.electricalRegions?.length || 0) + 1}`;
    }

    const areaLabel =
        areaMode === 'full'
          ? 'Whole face'
          : areaMode === 'invert'
            ? 'Invert mask'
            : 'Selected mask',
      targetName = targetLayerId ? layerById(model, targetLayerId)?.name || 'layer' : '',
      etchTargetName = etchTargetLayerId
        ? layerById(model, etchTargetLayerId)?.name || 'selected material'
        : '',
      surfaceLabel =
        type === 'etch' && roughSurface
          ? roughSurface.morphology === 'pyramid'
            ? 'Pyramid'
            : 'Rough'
          : '',
      thicknessLabel = `${Number(thickness.toPrecision(8))} µm`,
      operationLabel =
        type === 'etch'
          ? `${etchProfile === 'isotropic' ? 'Release' : 'Etch'}${etchTargetName ? ` ${etchTargetName}` : ''} · ${thicknessLabel}${etchProfile === 'isotropic' ? ' · Isotropic' : surfaceLabel ? ` · ${surfaceLabel}` : ''}`
          : type === 'grow'
            ? `Extend ${targetName} · ${params.growth === 'conformal' ? 'Conformal' : 'Directional'} · ${thicknessLabel}`
            : type === 'implant'
              ? `Implant ${name} · ${thicknessLabel}`
              : type === 'electrical'
                ? `Electrical ${name} · ${params.electricalRegionType} · ${thicknessLabel}`
                : `Deposit ${name} · ${params.growth === 'conformal' ? 'Conformal' : 'Directional'} · ${thicknessLabel}`;

    const operation = {
      kind: type,
      label: operationLabel,
      face: activeFace,
      areaMode,
      areaLabel,
      thickness,
      name: type === 'grow' ? targetName : name,
      targetLayerId: targetLayerId || null,
      etchTargetLayerIds: type === 'etch' ? params.etchTargetLayerIds : null,
      etchProfile: type === 'etch' ? params.etchProfile : null,
      growth: type === 'etch' || type === 'implant' || type === 'electrical' ? null : params.growth,
      surface:
        type === 'etch' && roughSurface
          ? {
              morphology: roughSurface.morphology,
              polarity: roughSurface.polarity,
              featureSize: roughSurface.featureSize,
              meanHeight: roughSurface.meanHeight,
              featureCv: roughSurface.featureCv,
              heightCv: roughSurface.heightCv,
              seed: roughSurface.seed ?? null,
            }
          : null,
      implantTilt: type === 'implant' ? params.tilt : null,
      electricalRegionType: type === 'electrical' ? params.electricalRegionType : null,
      electricalRegionSource: type === 'electrical' ? params.electricalRegionSource : null,
      maskSourceMode,
      maskRoi: Boolean(maskRoi),
      maskContext: structuredClone(maskContext),
      resultLayerId: type === 'add' ? result.layerId || null : null,
      resultImplantId: type === 'implant' ? result.implantId || null : null,
      resultElectricalRegionId: type === 'electrical' ? result.electricalRegionId || null : null,
      replay: {
        version: 1,
        params: structuredClone(params),
        areaMode,
        maskContext: structuredClone(maskContext),
      },
    };
    recordProcessOperation(operation);

    renderAll();
    if (await afterApply({ applyGate, branchCommit, operation, result })) return;

    if (!hasMaterial(model)) {
      return status(
        'All material has been removed. Undo, restore a History step, or recreate the Base.',
        'warning',
      );
    }

    const afterBase = baseCoverageState(model);
    if (type === 'etch' && beforeBase !== 'removed' && afterBase === 'removed') {
      return status(
        'Base fully removed. Remaining material, if any, is shown independently.',
        'warning',
      );
    }

    const growthLabel =
      type === 'etch' || type === 'implant' || type === 'electrical'
        ? ''
        : params.growth === 'conformal'
          ? ' · Conformal'
          : ' · Directional';
    status(
      `${
        type === 'etch'
          ? etchProfile === 'isotropic'
            ? `Released ${etchTargetName || 'selected material'}`
            : etchTargetName
              ? `Etched ${etchTargetName}`
              : 'Etched'
          : type === 'grow'
            ? `Extended ${layerById(model, targetLayerId)?.name || 'layer'}`
            : type === 'implant'
              ? `Marked implant ${name}`
              : type === 'electrical'
                ? `Marked electrical region ${name}`
                : `Deposited ${name}`
      }${growthLabel} on the ${activeFace}${maskRoi ? ' within Mask ROI' : ''}.`,
      'success',
    );
  }

  return {
    updateUi: updateOperationUI,
    applyOperation,
    loadOperationForEdit,
    replayOperations,
    canReplayOperation,
  };
}
