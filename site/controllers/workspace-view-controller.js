import { baseCoverageState } from '../model.js';

export function createWorkspaceViewController({
  root = document,
  getModel,
  getActiveFace,
  getMaskState,
  getXyDisplayUnit,
  xyUnitLabel,
  formatXY,
  formatLengthField,
  renderCellTree,
  renderMaskList,
  renderLayerLegend,
  renderMask,
  renderMain,
  renderSection,
  renderThree,
  syncRoiEditor,
  syncMaskCellLabel,
  syncProjectNameInput,
  getDrawMaskController,
  getMaskRoiController,
  updateOperationUI,
  syncUndo,
}) {
  const $ = (id) => root.getElementById(id);

  function baseSummaryText() {
    const model = getModel(),
      coverage = baseCoverageState(model),
      unitLabel = xyUnitLabel(),
      shape =
        model.shape === 'circle'
          ? `Circle · Ø${formatXY(model.width)} ${unitLabel}`
          : `Rectangle · ${formatXY(model.width)} × ${formatXY(model.height)} ${unitLabel}`,
      state =
        coverage === 'removed'
          ? 'Base removed'
          : coverage === 'partial'
            ? 'Base partially removed'
            : 'Base present';
    return `${shape} · ${state}`;
  }

  function syncMaskSourceSummary() {
    const { maskSourceMode, drawMask, layout } = getMaskState();
    if (maskSourceMode === 'draw') {
      $('maskSummary').textContent = `Draw · ${drawMask.shapes.length} shapes`;
      $('maskCellLabel').textContent = `${drawMask.shapes.length} drawn`;
    } else {
      $('maskSummary').textContent = layout.name || 'No mask';
      syncMaskCellLabel();
    }
  }

  function renderAll() {
    renderCellTree();
    renderMaskList();
    renderLayerLegend();
    renderMask();
    renderMain();
    renderSection();
    renderThree();
    syncRoiEditor();

    const activeFace = getActiveFace(),
      faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
    $('mainFaceLabel').textContent = `${activeFace} surface`;
    // Both faces are explicit values in the Process Surface select.
    $('faceToggleBtn').value = activeFace;
    $('faceToggleBtn').setAttribute('aria-label', `Process surface; currently ${faceLabel}`);

    syncMaskSourceSummary();
    syncProjectNameInput();
    getDrawMaskController()?.syncUi();
    getMaskRoiController()?.syncEditor();
    $('baseSummary').textContent = baseSummaryText();
    updateOperationUI();
    syncUndo();
  }

  function resetRoughDraftControls() {
    $('roughPolarity').value = 'inverted';
    $('roughFeatureSize').value = formatLengthField(0.5);
    $('roughAmplitude').value = formatLengthField(1);
    $('roughFeatureCv').value = '25';
    $('roughHeightCv').value = '25';
  }

  function syncBaseControls() {
    const model = getModel(),
      unitLabel = xyUnitLabel();
    $('baseWidth').value = formatLengthField(model.width);
    $('baseHeight').value = formatLengthField(model.height);
    $('baseThickness').value = formatLengthField(model.thickness);
    $('baseHeight').disabled = model.shape === 'circle';
    $('baseWidthUnit').textContent = unitLabel;
    $('baseHeightUnit').textContent = unitLabel;
    $('baseThicknessUnit').textContent = unitLabel;
    $('operationThicknessUnit').textContent = unitLabel;
    $('roughFeatureUnit').textContent = unitLabel;
    $('roughHeightUnit').textContent = unitLabel;
    $('xyUnitSelect').value = getXyDisplayUnit();
    $('applyBaseBtn').textContent =
      baseCoverageState(model) === 'removed' ? 'Recreate base' : 'Apply base';
    root
      .querySelectorAll('#substrateShape button')
      .forEach((button) => button.classList.toggle('active', button.dataset.shape === model.shape));
  }

  return {
    renderAll,
    resetRoughDraftControls,
    syncBaseControls,
    syncMaskSourceSummary,
  };
}
