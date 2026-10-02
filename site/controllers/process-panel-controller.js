import { exposedLayerIds, hasMaterial } from '../model.js';

export function createProcessPanelController({
  root = document,
  getModel,
  getActiveFace,
  operationAreaGeometry,
  processTaskController,
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
  
  function updateOperationUI() {
    const t = $('operationType').value;
    root.querySelectorAll('[data-process-mode]').forEach((button) => {
      const active = button.dataset.processMode === t;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  
    $('layerNameRow').classList.toggle('hidden', t !== 'add');
    $('implantNameRow').classList.toggle('hidden', t !== 'implant');
    $('implantTiltRow').classList.toggle('hidden', t !== 'implant');
    $('targetLayerRow').classList.toggle('hidden', t !== 'grow');
    $('growthModeRow').classList.toggle('hidden', t === 'etch' || t === 'implant');
    $('etchSurfaceRow').classList.toggle('hidden', t !== 'etch');
    const surfaceMode = $('etchSurfaceMode').value,
      texturedEtch = t === 'etch' && surfaceMode !== 'smooth',
      stochasticEtch = texturedEtch && surfaceMode === 'rough',
      pyramidEtch = texturedEtch && surfaceMode === 'pyramid';
    $('roughPolarityRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureRow').classList.toggle('hidden', !texturedEtch);
    $('roughFeatureCvRow').classList.toggle('hidden', !stochasticEtch);
    $('roughHeightRow').classList.toggle('hidden', !texturedEtch);
    $('roughHeightCvRow').classList.toggle('hidden', !stochasticEtch);
    $('roughFeatureLabel').textContent = pyramidEtch ? 'Pyramid XY' : 'Feature XY';
    $('roughHeightLabel').textContent = pyramidEtch ? 'Height' : 'Height mean';
    $('processThicknessLabel').textContent = t === 'etch' || t === 'implant' ? 'Depth' : 'Z';
  
    if (t === 'grow') updateGrowTargets();
  
    const model = getModel(),
      activeFace = getActiveFace(),
      materialExists = hasMaterial(model);
    $('applyOperationBtn').disabled = !materialExists || Boolean(processTaskController?.isBusy());
    const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
    $('processSummary').textContent =
      `${faceLabel} · ${
        t === 'add'
          ? 'Deposit layer'
          : t === 'grow'
            ? 'Extend layer'
            : t === 'implant'
              ? 'Implant · EXP'
              : 'Etch'
      }`;
  
    $('operationNote').hidden = !materialExists;
    if (!materialExists) return;
  
    $('operationNote').textContent =
      t === 'implant'
        ? 'Experimental structural marker: starts at the outermost selected surface, ignores material boundaries, and renders a user-defined depth with optional geometric tilt.'
        : t === 'etch'
          ? stochasticEtch
            ? `Depth is the maximum etch depth; Height and Feature XY are means, with CV controlling their spread. ${$('roughPolarity').value === 'normal' ? 'Normal points features outward (peaks).' : 'Inverted keeps the existing inward pit/valley orientation.'}`
            : pyramidEtch
              ? `Pyramid XY is the square pitch/base width and Height is apex-to-base relief within the Etch Depth envelope. ${$('roughPolarity').value === 'normal' ? 'Normal gives outward pyramids.' : 'Inverted gives inward pyramid pits.'}`
              : 'Etch removes material vertically and may create through-holes.'
          : $('growthMode').value === 'conformal'
            ? t === 'grow'
              ? 'Conformal Extend continues the target material over every exposed surface in the selected area, then follows steps and sidewalls.'
              : 'Conformal coverage follows exposed surfaces, steps, and sidewalls.'
            : 'Directional coverage follows the selected footprint.';
  }

  return { updateUi: updateOperationUI };
}
