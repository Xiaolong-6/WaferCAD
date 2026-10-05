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
  taskController = null,
}) {
  const $ = (id) => root.getElementById(id);

  async function runVisibleTask(executor, options) {
    if (taskController?.runTask) return taskController.runTask(executor, options);
    try {
      const abortController = new AbortController();
      return await executor({
        signal: abortController.signal,
        updateStage() {},
      });
    } catch (error) {
      const message = error?.message || String(error || 'Task failed.');
      status(`${options?.failurePrefix || 'Task failed'}: ${message}`, 'error');
      return { error: message };
    }
  }

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
    $('etchProfile').onchange = updateOperationUI;
    $('etchSurfaceMode').onchange = updateOperationUI;
    $('roughPolarity').onchange = updateOperationUI;
    $('etchTargetLayer').onchange = updateOperationUI;
    $('electricalRegionType').onchange = updateOperationUI;
    $('electricalRegionSource').onchange = updateOperationUI;
    $('recordProcessType').onchange = () => {
      $('recordProcessLabel').value =
        $('recordProcessType').selectedOptions?.[0]?.textContent || '';
      updateOperationUI();
    };
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

    const glbButton = $('threeExportModelBtn'),
      glbCancelButton = $('threeExportCancelBtn'),
      pngButton = $('threeExportPngBtn'),
      setThreeExportBusy = (busy) => {
        glbButton.disabled = busy;
        pngButton.disabled = busy;
        glbButton.setAttribute('aria-busy', String(busy));
        if (glbCancelButton) {
          glbCancelButton.hidden = true;
          glbCancelButton.disabled = true;
        }
      };

    setThreeExportBusy(false);

    glbButton.onclick = async () => {
      setThreeExportBusy(true);
      const result = await runVisibleTask(
        async ({ signal, updateStage }) => {
          const blob = await getThreeView()?.exportGlb({
            signal,
            onProgress: (progress, label) => {
              const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
              updateStage(`${percent}%${label ? ` · ${label}` : ''}`);
            },
          });
          if (!blob) throw new Error('3D export is unavailable.');
          return { ok: true, blob };
        },
        {
          label: `Exporting ${getRoi() ? 'ROI' : 'full'} 3D GLB…`,
          abortMessage: '3D GLB export cancelled. No file was written.',
          failurePrefix: '3D model export failed',
        },
      );
      setThreeExportBusy(false);
      closeExport('threeExportModelBtn');

      if (result?.busy) {
        status('Another background task is already running.', 'warning');
        return;
      }
      if (result?.aborted || result?.error || !result?.blob) return;

      downloadBlob(result.blob, 'wafercad-model.glb');
      status(
        modelHasDisplayMorphology()
          ? `Exported ${getRoi() ? 'ROI' : 'full'} GLB in physical metres with Rough/Pyramid morphology embedded.`
          : `Exported ${getRoi() ? 'ROI' : 'full'} 3D model as GLB (physical metres).`,
        'success',
      );
    };

    pngButton.onclick = async () => {
      setThreeExportBusy(true);
      const result = await runVisibleTask(
        async ({ updateStage }) => {
          updateStage('Rendering 3× frame…');
          const blob = await getThreeView()?.capturePng(3);
          if (!blob) throw new Error('3D screenshot is unavailable.');
          return { ok: true, blob };
        },
        {
          label: 'Capturing 3D PNG…',
          failurePrefix: '3D screenshot failed',
          abortable: false,
        },
      );
      setThreeExportBusy(false);
      closeExport('threeExportPngBtn');

      if (result?.busy) {
        status('Another background task is already running.', 'warning');
        return;
      }
      if (result?.error || !result?.blob) return;

      downloadBlob(result.blob, 'wafercad-3d-3x.png');
      status('Exported 3× high-resolution 3D PNG.');
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
    const legacyBookmarkButton = $('saveSnapshotBtn');
    if (!legacyBookmarkButton) return;
    legacyBookmarkButton.onclick = () => {
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
