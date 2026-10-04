import { baseCoverageState, exposedLayerIds, hasMaterial, layerById } from '../model.js';

export function createProcessPanelController({
  root = document,
  getModel,
  getActiveFace,
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
  clearBaseRevertSnapshot,
  colorNewLayer,
  colorNewImplant,
  renderAll,
  status,
}) {
  const $ = (id) => root.getElementById(id);

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
  
    const recordOnly = t === 'record';
    $('layerNameRow').classList.toggle('hidden', t !== 'add');
    $('implantNameRow').classList.toggle('hidden', t !== 'implant');
    $('implantTiltRow').classList.toggle('hidden', t !== 'implant');
    $('targetLayerRow').classList.toggle('hidden', t !== 'grow');
    $('etchTargetLayerRow').classList.toggle('hidden', t !== 'etch');
    $('growthModeRow').classList.toggle('hidden', t === 'etch' || t === 'implant' || recordOnly);
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
    $('roughFeatureRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureCvRow').classList.toggle('hidden', !stochasticEtch);
    $('roughHeightRow').classList.toggle('hidden', !texturedEtch);
    $('roughHeightCvRow').classList.toggle('hidden', !stochasticEtch);
    $('roughFeatureLabel').textContent = pyramidEtch ? 'Pyramid XY' : 'Feature XY';
    $('roughHeightLabel').textContent = pyramidEtch ? 'Height' : 'Height mean';
    $('processThicknessLabel').textContent =
      t === 'etch' ? (isotropicEtch ? 'Radius' : 'Depth') : t === 'implant' ? 'Depth' : 'Z';
  
    if (t === 'grow') updateGrowTargets();
    if (t === 'etch') updateEtchTargets();
  
    const model = getModel(),
      activeFace = getActiveFace(),
      materialExists = hasMaterial(model);
    $('applyOperationBtn').disabled =
      (!materialExists && !recordOnly) || Boolean(processTaskController?.isBusy());
    $('applyOperationBtn').textContent = recordOnly ? 'Record' : 'Apply';
    const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
    $('processSummary').textContent = recordOnly
      ? 'Process · Record step'
      : `${faceLabel} · ${
        t === 'add'
          ? 'Deposit layer'
          : t === 'grow'
            ? 'Extend layer'
            : t === 'implant'
              ? 'Implant · EXP'
              : 'Etch'
      }`;
  
    $('operationNote').hidden = !materialExists && !recordOnly;
    if (!materialExists && !recordOnly) return;
  
    $('operationNote').textContent =
      recordOnly
        ? 'Records fabrication metadata in History without changing material geometry.'
        : t === 'implant'
        ? 'Experimental structural marker: starts at the outermost selected surface, ignores material boundaries, and renders a user-defined depth with optional geometric tilt.'
        : t === 'etch'
          ? isotropicEtch
            ? $('etchTargetLayer').value
              ? 'Isotropic release propagates from the selected exposed material into the solid with the chosen radius, including lateral undercut beneath other materials. The selected etch material is removed; masks and stop materials remain.'
              : 'Choose one exposed material for Isotropic release. This mode creates physical undercut/cavity geometry and does not combine with Rough/Pyramid display morphology.'
            : stochasticEtch
              ? `Depth is the maximum etch depth; Height and Feature XY are means, with CV controlling their spread. ${$('roughPolarity').value === 'normal' ? 'Normal points features outward (peaks).' : 'Inverted keeps the existing inward pit/valley orientation.'} Display morphology only: canonical process geometry and GLB export remain ideal.`
              : pyramidEtch
                ? `Pyramid XY is the square pitch/base width and Height is apex-to-base relief within the Etch Depth envelope. ${$('roughPolarity').value === 'normal' ? 'Normal gives outward pyramids.' : 'Inverted gives inward pyramid pits.'} Display morphology only: canonical process geometry and GLB export remain ideal.`
                : $('etchTargetLayer').value
                  ? 'Material-selective Etch removes only the selected material while it is exposed, then stops on the next material.'
                  : 'Etch removes exposed material vertically in stack order and may create through-holes.'
          : $('growthMode').value === 'conformal'
            ? t === 'grow'
              ? 'Conformal Extend continues the target material over every exposed surface in the selected area, then follows steps and sidewalls. On Rough/Pyramid surfaces, the displayed conformal topography is a visual approximation.'
              : 'Conformal coverage follows exposed surfaces, steps, and sidewalls. On Rough/Pyramid surfaces, the displayed conformal topography is a visual approximation.'
            : 'Directional coverage follows the selected footprint.';
  }

  function optionalNumber(id, label) {
    const raw = String($(id)?.value ?? '').trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a number or left blank.`);
    return value;
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

    try {
      await commitApplyBranch(applyGate);
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

    recordProcessOperation({
      kind: 'record',
      label,
      processType,
      geometryChanged: false,
      temperatureC,
      durationMin,
      ambient: ambient || null,
      note: note || null,
    });
    renderAll();
    status(`Recorded process Step “${label}” without changing geometry.`, 'success');
  }

  async function applyOperation() {
    let model = getModel();
    const activeFace = getActiveFace(),
      { maskSourceMode, maskRoi, drawMask, maskTransform, layout } = getMaskState();
    if (processTaskController?.isBusy()) {
      status('An operation is already running. Abort it before starting another.', 'warning');
      return;
    }
  
    const type = $('operationType').value;
    if (type === 'record') return recordProcessStep();

    const thickness = manualMicron($('operationThickness').value);
    $('operationThickness').value = formatLengthField(thickness);
    if (!(thickness > 0)) return status('Thickness must be greater than zero.', 'error');
  
    const areaMode = $('operationArea').value;
  
    const name =
        type === 'implant'
          ? $('implantName').value.trim() || `Implant ${model.nextImplantId || 1}`
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
        featureCvPercent = pyramid ? 0 : Number($('roughFeatureCv').value),
        heightCvPercent = pyramid ? 0 : Number($('roughHeightCv').value),
        featureCv = featureCvPercent / 100,
        heightCv = heightCvPercent / 100;
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
      roughSurface = {
        kind: 'rough',
        morphology: pyramid ? 'pyramid' : 'stochastic',
        polarity: $('roughPolarity').value === 'normal' ? 'normal' : 'inverted',
        featureSize,
        meanHeight,
        featureCv,
        heightCv,
        geometryMode: 'ideal',
      };
    }
  
    const beforeBase = baseCoverageState(model),
      params = { type, name, targetLayerId, thickness, face: activeFace };
    if (type === 'etch') {
      params.surface = roughSurface;
      params.etchProfile = etchProfile;
      params.etchTargetLayerIds = etchTargetLayerId ? [etchTargetLayerId] : [];
    }
    else if (type === 'implant') {
      const tilt = Number($('implantTilt').value);
      if (!Number.isFinite(tilt) || tilt < -80 || tilt > 80) {
        return status('Implant Tilt X must be between -80° and 80°.', 'error');
      }
      params.tilt = tilt;
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
            elements: (layout.elements || [])
              .filter(selectedElement)
              .map((element) => ({
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

    try {
      await commitApplyBranch(applyGate);
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
      $('implantName').value = `Implant ${model.nextImplantId || (model.implants?.length || 0) + 1}`;
    }

    const areaLabel =
        areaMode === 'full' ? 'Whole face' : areaMode === 'invert' ? 'Invert mask' : 'Selected mask',
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
              : `Deposit ${name} · ${params.growth === 'conformal' ? 'Conformal' : 'Directional'} · ${thicknessLabel}`;

    recordProcessOperation({
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
      growth: type === 'etch' || type === 'implant' ? null : params.growth,
      surface:
        type === 'etch' && roughSurface
          ? {
              morphology: roughSurface.morphology,
              polarity: roughSurface.polarity,
              featureSize: roughSurface.featureSize,
              meanHeight: roughSurface.meanHeight,
            }
          : null,
      implantTilt: type === 'implant' ? params.tilt : null,
      maskSourceMode,
      maskRoi: Boolean(maskRoi),
    });
  
    renderAll();
  
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
      type === 'etch' || type === 'implant'
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
              ? `Marked implant ${name} (experimental)`
              : `Deposited ${name}`
      }${growthLabel} on the ${activeFace}${maskRoi ? ' within Mask ROI' : ''}.`,
      'success',
    );
  }

  return {
    updateUi: updateOperationUI,
    applyOperation,
  };
}
