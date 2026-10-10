import { createModel, hasMaterial } from '../model.js';
import {
  createWaferArrayModel,
  createWaferArrayTiling,
  createRectangularGridArrayModel,
} from '../model-array-construction.js';

export function createBaseControlsController({
  root = document,
  getModel,
  setModel,
  setSection,
  getBaseRevertSnapshot,
  setBaseRevertSnapshot,
  getHistory,
  getFuture,
  stateSnapshot,
  restoreSnapshot,
  saveHistory,
  hasProcessEdits,
  manualMicron,
  formatLengthField,
  syncBaseControls,
  renderAll,
  fit3d,
  status,
  confirmAction = async () => false,
  chooseHistoryAction = async () => 'cancel',
  getHistoryDetails = () => ({ hasHistory: false }),
  rebuildMainHistory = () => {},
  captureBaseSnapshot = stateSnapshot,
  refreshHistory = () => {},
}) {
  const $ = (id) => root.getElementById(id);

  function bindShapeControls() {
    root.querySelectorAll('#substrateShape button').forEach((button) => {
      button.onclick = () => {
        root
          .querySelectorAll('#substrateShape button')
          .forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        const circle = button.dataset.shape === 'circle';
        $('baseHeight').disabled = circle;
        if (circle) $('baseHeight').value = $('baseWidth').value;
      };
    });

    $('baseWidth').oninput = () => {
      if (root.querySelector('#substrateShape button.active')?.dataset.shape === 'circle') {
        $('baseHeight').value = $('baseWidth').value;
      }
    };

    for (const id of ['baseWidth', 'baseHeight', 'baseThickness']) {
      $(id).addEventListener('change', () => {
        const value = manualMicron($(id).value);
        if (Number.isFinite(value)) $(id).value = formatLengthField(value);
        if (
          id === 'baseWidth' &&
          root.querySelector('#substrateShape button.active')?.dataset.shape === 'circle'
        ) {
          $('baseHeight').value = $('baseWidth').value;
        }
      });
    }
  }

  async function applyBase({ recipeBase = null } = {}) {
    const shape =
        recipeBase?.shape || root.querySelector('#substrateShape button.active').dataset.shape,
      width = recipeBase ? Number(recipeBase.width) : manualMicron($('baseWidth').value),
      height = recipeBase
        ? Number(recipeBase.height)
        : shape === 'circle'
          ? width
          : manualMicron($('baseHeight').value),
      thickness = recipeBase
        ? Number(recipeBase.thickness)
        : manualMicron($('baseThickness').value);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(thickness) ||
      width <= 0 ||
      height <= 0 ||
      thickness <= 0
    ) {
      status('Base dimensions must be positive and finite.', 'error');
      return false;
    }

    const details = getHistoryDetails();
    const currentHasProcess = hasMaterial(getModel()) && hasProcessEdits();
    const needsDecision = currentHasProcess || details.hasHistory;
    let action = 'clear';
    if (needsDecision) {
      action = await chooseHistoryAction();
      if (action === 'cancel' || !['keep', 'clear'].includes(action)) {
        syncBaseControls();
        return false;
      }
    }

    // Preserve the graph alongside Base Undo/Revert. A model-only snapshot
    // cannot restore the previous process lineage.
    const before = captureBaseSnapshot();
    try {
      const seed = recipeBase?.array
        ? createModel({
            shape: 'rect',
            width: recipeBase.array.pitchX,
            height: recipeBase.array.pitchY,
            thickness,
          })
        : createModel({ shape, width, height, thickness });
      if (recipeBase) {
        seed.layers[0].name = recipeBase.material;
        if (recipeBase.color) seed.layers[0].color = recipeBase.color;
      }
      const newModel = recipeBase?.array?.kind === 'rect-grid'
        ? createRectangularGridArrayModel(seed, recipeBase.array)
        : recipeBase?.array
          ? createWaferArrayModel(seed, createWaferArrayTiling(recipeBase.array))
          : seed;
      setBaseRevertSnapshot(before);
      saveHistory(before);
      setModel(newModel);
      setSection({ a: [-width * 0.42, 0], b: [width * 0.42, 0] });
      const result = rebuildMainHistory({
        preservePrevious: action === 'keep',
        previousState: before.workspaceState,
      });
      syncBaseControls();
      refreshHistory();
      renderAll();
      fit3d();
      status(
        result?.archivedBranchId
          ? 'Base rebuilt. Previous history archived as a restorable Variant; new Main is ready.'
          : 'Base rebuilt with a clean Main history. Use Undo or Revert to restore the previous state.',
        'success',
      );
      return true;
    } catch (error) {
      restoreSnapshot(before);
      if (getHistory().length) getHistory().pop();
      setBaseRevertSnapshot(null);
      syncBaseControls();
      refreshHistory();
      renderAll();
      status(`Base rebuild failed: ${error.message}`, 'error');
      return false;
    }
  }

  function revertBase() {
    const snapshot = getBaseRevertSnapshot();
    if (!snapshot) return;

    setBaseRevertSnapshot(null);
    getFuture().push(captureBaseSnapshot());
    if (getHistory().length) getHistory().pop();
    restoreSnapshot(snapshot);
    refreshHistory();
    syncBaseControls();
    renderAll();
    fit3d();
    status('Reverted the last base change.');
  }

  function bind() {
    bindShapeControls();
    $('applyBaseBtn').onclick = () => void applyBase();
    $('revertBaseBtn').onclick = revertBase;
  }

  return { bind, applyBase, revertBase };
}
