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
  exportSectionSvg,
  syncMaskExportOptions = () => {},
  getThreeView,
  downloadBlob,
  getRoi,
  getSectionScaleMode,
  setSectionScaleMode,
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
  getHistory,
  getFuture,
  stateSnapshot,
  restoreSnapshot,
  setBaseRevertSnapshot,
  syncBaseControls,
  snapshotManager,
  renderSnapshots,
}) {
  const $ = (id) => root.getElementById(id);

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
      });
    }
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
    $('mainZoomOut').onclick = () =>
      zoomPlanView('main', $('mainCanvas'), 1 / 1.25, null, null, getActiveFace() === 'back');
    $('mainZoomIn').onclick = () =>
      zoomPlanView('main', $('mainCanvas'), 1.25, null, null, getActiveFace() === 'back');
    $('mainZoomFit').onclick = () => resetPlanView('main');
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
    $('applyOperationBtn').onclick = applyOperation;
    $('fit3dBtn').onclick = fit3d;
  }

  function bindExports() {
    const closeExport = (id) => {
      const details = $(id)?.closest('details');
      if (details) details.open = false;
    };

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
    $('sectionExportSvgBtn').onclick = () => {
      exportSectionSvg();
      closeExport('sectionExportSvgBtn');
    };

    $('threeExportModelBtn').onclick = async () => {
      try {
        const blob = await getThreeView()?.exportGlb();
        if (!blob) throw new Error('3D export is unavailable.');
        downloadBlob(blob, 'wafercad-model.glb');
        status(`Exported ${getRoi() ? 'ROI' : 'full'} 3D model as GLB (physical metres).`);
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
      syncBaseControls();
      renderAll();
      status('Undid operation.');
    };

    $('redoBtn').onclick = () => {
      const future = getFuture();
      if (!future.length) return;
      getHistory().push(stateSnapshot());
      restoreSnapshot(future.pop());
      setBaseRevertSnapshot(null);
      syncBaseControls();
      renderAll();
      status('Redid operation.');
    };
  }

  function bindSnapshots() {
    $('saveSnapshotBtn').onclick = () => {
      try {
        const saved = snapshotManager.create();
        renderSnapshots();
        status(`Saved snapshot "${saved.name}".`);
      } catch (error) {
        console.error(error);
        status(`Snapshot failed: ${error.message}`);
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
