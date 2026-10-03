import { XY_UNITS } from '../units.js';

export function createWorkspaceActionsController({
  root = document,
  getXyUnit,
  setXyDisplayUnit,
  formatLengthField,
  manualMicron,
  syncTransformInputs,
  renderAll,
  status,
  getActiveFace,
  setActiveFace,
  updateOperationUI,
  applyOperation,
  fit3d,
  exportMainSvg,
  exportMaskSvg,
  exportMaskGds,
  exportMaskOas,
  exportSectionSvg,
  syncMaskExportOptions = () => {},
  getThreeView,
  downloadBlob,
  getRoi,
  getSectionScaleMode,
  setSectionScaleMode,
  getSectionShowBorders,
  setSectionShowBorders,
  renderSection,
  getMaskOpacity,
  setMaskOpacity,
  renderMask,
  getThreeOpacity,
  setThreeOpacity,
  getThreeShowBorders,
  setThreeShowBorders,
  renderThree,
  zoomPlanView,
  resetPlanView,
  updateSectionEditor = () => {},
  getHistory,
  getFuture,
  stateSnapshot,
  restoreSnapshot,
  setBaseRevertSnapshot,
  syncBaseControls,
  snapshotManager,
  renderSnapshots,
  onProjectChanged = () => {},
  getModel = () => null,
}) {
  const $ = (id) => root.getElementById(id);

  function syncRoughHeightLimit() {
    const depth = Number($('operationThickness')?.value);
    if (Number.isFinite(depth) && depth > 0) $('roughAmplitude').max = String(depth);
    else $('roughAmplitude').removeAttribute('max');
  }

  function bindUnitControls() {
    $('xyUnitSelect').onchange = () => {
      const oldUnit = getXyUnit(),
        draftWidth = (Number($('baseWidth').value) || 0) * oldUnit.toMicron,
        draftHeight = (Number($('baseHeight').value) || 0) * oldUnit.toMicron,
        draftThickness = (Number($('baseThickness').value) || 0) * oldUnit.toMicron,
        draftOperation = (Number($('operationThickness').value) || 0) * oldUnit.toMicron,
        draftRoughFeature = (Number($('roughFeatureSize').value) || 0) * oldUnit.toMicron,
        draftRoughAmplitude = (Number($('roughAmplitude').value) || 0) * oldUnit.toMicron,
        requested = $('xyUnitSelect').value;
      setXyDisplayUnit(requested in XY_UNITS ? requested : 'um');

      $('baseWidth').value = formatLengthField(draftWidth);
      $('baseHeight').value = formatLengthField(draftHeight);
      $('baseThickness').value = formatLengthField(draftThickness);
      $('operationThickness').value = formatLengthField(draftOperation);
      $('roughFeatureSize').value = formatLengthField(draftRoughFeature);
      $('roughAmplitude').value = formatLengthField(draftRoughAmplitude);
      syncRoughHeightLimit();
      $('baseWidthUnit').textContent = getXyUnit().label;
      $('baseHeightUnit').textContent = getXyUnit().label;
      $('baseThicknessUnit').textContent = getXyUnit().label;
      $('operationThicknessUnit').textContent = getXyUnit().label;
      $('roughFeatureUnit').textContent = getXyUnit().label;
      $('roughHeightUnit').textContent = getXyUnit().label;
      syncTransformInputs();
      renderAll();
      status(`XYZ display/input unit: ${getXyUnit().label}. Geometry is unchanged.`);
    };

    for (const id of ['operationThickness', 'roughFeatureSize', 'roughAmplitude']) {
      $(id).addEventListener('change', () => {
        const value = manualMicron($(id).value);
        if (Number.isFinite(value)) $(id).value = formatLengthField(value);
        if (id === 'operationThickness') syncRoughHeightLimit();
      });
    }
    $('operationThickness').addEventListener('input', syncRoughHeightLimit);
    syncRoughHeightLimit();
  }

  function bindViewControls() {
    $('faceToggleBtn').onclick = () => {
      setActiveFace(getActiveFace() === 'front' ? 'back' : 'front');
      renderAll();
    };

    $('sectionScaleModeBtn').onclick = () => {
      setSectionScaleMode(getSectionScaleMode() === 'auto' ? 'physical' : 'auto');
      renderSection();
      status(
        getSectionScaleMode() === 'auto'
          ? 'Section scale: Auto fit (X and Z independently).'
          : 'Section scale: physical 1:1 X:Z.',
      );
    };

    $('sectionBordersBtn').onclick = () => {
      setSectionShowBorders(!getSectionShowBorders());
      renderSection();
      status(getSectionShowBorders() ? 'Section borders shown.' : 'Section borders hidden.');
    };

    $('maskOpacityRange').oninput = () => {
      setMaskOpacity(Math.max(0, Math.min(1, Number($('maskOpacityRange').value) || 0)));
      $('maskOpacityValue').value = `${Math.round(getMaskOpacity() * 100)}%`;
      renderMask();
    };

    $('threeOpacityRange').oninput = () => {
      setThreeOpacity(Math.max(0.1, Math.min(1, Number($('threeOpacityRange').value) || 1)));
      $('threeOpacityValue').value = `${Math.round(getThreeOpacity() * 100)}%`;
      renderThree();
    };

    $('threeBorders').onchange = () => {
      setThreeShowBorders($('threeBorders').checked);
      renderThree();
    };

    $('maskZoomOut').onclick = () => zoomPlanView('mask', $('maskCanvas'), 1 / 1.25);
    $('maskZoomIn').onclick = () => zoomPlanView('mask', $('maskCanvas'), 1.25);
    $('maskZoomFit').onclick = () => resetPlanView('mask');
    $('mainZoomOut').onclick = () => {
      zoomPlanView('main', $('mainCanvas'), 1 / 1.25, null, null, getActiveFace() === 'back');
      updateSectionEditor();
    };
    $('mainZoomIn').onclick = () => {
      zoomPlanView('main', $('mainCanvas'), 1.25, null, null, getActiveFace() === 'back');
      updateSectionEditor();
    };
    $('mainZoomFit').onclick = () => {
      resetPlanView('main');
      updateSectionEditor();
    };
  }

  function bindOperationControls() {
    const setMode = (mode) => {
      $('operationType').value = mode;
      updateOperationUI();
    };
    root.querySelectorAll('[data-process-mode]').forEach((button) => {
      button.onclick = () => setMode(button.dataset.processMode);
    });
    $('operationType').onchange = updateOperationUI;
    $('operationArea').onchange = updateOperationUI;
    $('growthMode').onchange = updateOperationUI;
    $('etchSurfaceMode').onchange = updateOperationUI;
    $('roughPolarity').onchange = updateOperationUI;
    $('applyOperationBtn').onclick = applyOperation;
    $('fit3dBtn').onclick = fit3d;
  }

  function modelHasDisplayMorphology() {
    for (const region of getModel()?.regions || []) {
      for (const segment of region.stack || []) {
        if (segment.frontSurface?.kind === 'rough' || segment.backSurface?.kind === 'rough') {
          return true;
        }
      }
    }
    return false;
  }

  function bindExports() {
    const closeExport = (id) => {
      const details = $(id)?.closest('details');
      if (details) details.open = false;
    };

    $('maskExportControl')
      ?.querySelector(':scope > summary')
      ?.addEventListener('click', syncMaskExportOptions);

    root.querySelectorAll('.export-control').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (!details.open) return;
        for (const sibling of details.closest('.view-head')?.querySelectorAll('details') || []) {
          if (sibling !== details) sibling.open = false;
        }
        if (details.id === 'maskExportControl') syncMaskExportOptions();
      });
    });

    $('mainExportSvgBtn').onclick = () => {
      exportMainSvg();
      closeExport('mainExportSvgBtn');
    };
    $('maskExportSvgBtn').onclick = () => {
      exportMaskSvg();
      closeExport('maskExportSvgBtn');
    };
    $('maskExportGdsBtn').onclick = async () => {
      await exportMaskGds();
      closeExport('maskExportGdsBtn');
    };
    $('maskExportOasBtn').onclick = async () => {
      await exportMaskOas();
      closeExport('maskExportOasBtn');
    };
    $('sectionExportSvgBtn').onclick = () => {
      exportSectionSvg();
      closeExport('sectionExportSvgBtn');
    };

    $('threeExportModelBtn').onclick = async () => {
      try {
        const blob = await getThreeView()?.exportGlb();
        if (!blob) throw new Error('3D export is unavailable.');
        downloadBlob(blob, 'wafercad-model.glb');
        status(
          modelHasDisplayMorphology()
            ? `Exported ${getRoi() ? 'ROI' : 'full'} GLB using canonical ideal process geometry; displayed Rough/Pyramid morphology is not embedded.`
            : `Exported ${getRoi() ? 'ROI' : 'full'} 3D model as GLB (physical metres).`,
          'success',
        );
      } catch (error) {
        console.error(error);
        status(`3D model export failed: ${error.message}`, 'error');
      } finally {
        closeExport('threeExportModelBtn');
      }
    };

    $('threeExportPngBtn').onclick = async () => {
      try {
        const blob = await getThreeView()?.capturePng(3);
        if (!blob) throw new Error('3D screenshot is unavailable.');
        downloadBlob(blob, 'wafercad-3d-3x.png');
        status('Exported 3× high-resolution 3D PNG.');
      } catch (error) {
        console.error(error);
        status(`3D screenshot failed: ${error.message}`, 'error');
      } finally {
        closeExport('threeExportPngBtn');
      }
    };
  }

  function bindHistory() {
    $('undoBtn').onclick = () => {
      const history = getHistory();
      if (!history.length) return;
      getFuture().push(stateSnapshot());
      restoreSnapshot(history.pop());
      setBaseRevertSnapshot(null);
      snapshotManager.syncCursorToProcessRevision(getModel()?.processRevision || 0);
      syncBaseControls();
      renderAll();
      renderSnapshots();
      status('Undid operation.');
    };

    $('redoBtn').onclick = () => {
      const future = getFuture();
      if (!future.length) return;
      getHistory().push(stateSnapshot());
      restoreSnapshot(future.pop());
      setBaseRevertSnapshot(null);
      snapshotManager.syncCursorToProcessRevision(getModel()?.processRevision || 0);
      syncBaseControls();
      renderAll();
      renderSnapshots();
      status('Redid operation.');
    };
  }

  function bindSnapshots() {
    $('saveSnapshotBtn').onclick = () => {
      try {
        const bookmark = snapshotManager.bookmarkCurrentStep();
        onProjectChanged();
        renderSnapshots();
        status(`Bookmarked current Step as "${bookmark.name}".`);
      } catch (error) {
        console.error(error);
        status(`Bookmark failed: ${error.message}`, 'warning');
      }
    };
  }

  function bind() {
    bindUnitControls();
    bindViewControls();
    bindOperationControls();
    bindExports();
    bindHistory();
    bindSnapshots();
  }

  return { bind };
}
