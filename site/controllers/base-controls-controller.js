import { createModel, hasMaterial } from '../model.js';
import { inferRectangularGridRecipeBase } from '../process-recipe-preflight.js';
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
  prepareBaseReplay = () => ({ steps: [] }),
  checkpointBeforeBaseReplay = async () => false,
  replayBaseOperations = async () => ({ ok: false, error: 'Replay unavailable.' }),
  collapseBaseReplayUndo = () => {},
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
      if (action === 'cancel' || !['keep', 'clear', 'replay'].includes(action)) {
        syncBaseControls();
        return false;
      }
    }

    // Resolve the replay input before changing the model, History graph or Undo stack.
    // The old Main will be archived as an independent Variant on success.
    let replayPlan = null;
    if (action === 'replay') {
      try {
        replayPlan = prepareBaseReplay();
        if (!replayPlan?.steps?.length) {
          status('No replayable Process Steps exist on the active Main HEAD.', 'warning');
          return false;
        }
        if ((await checkpointBeforeBaseReplay()) !== true) {
          status('Base replacement cancelled: Recovery checkpoint was not created.', 'error');
          return false;
        }
      } catch (error) {
        status(`Base replay cannot begin: ${error.message}`, 'warning');
        return false;
      }
    }

    // Keep the complete History graph and both Undo/Redo stacks rollback-safe.
    const before = captureBaseSnapshot(),
      undoLength = getHistory().length,
      priorFuture = getFuture().slice();
    try {
      const arraySpec =
        recipeBase?.array ||
        (recipeBase ? inferRectangularGridRecipeBase(getModel(), recipeBase) : null);
      const seed = arraySpec
        ? createModel({
            shape: 'rect',
            width: arraySpec.pitchX,
            height: arraySpec.pitchY,
            thickness,
          })
        : createModel({ shape, width, height, thickness });
      const originalBase = getModel()?.layers?.find((item) => item.id === 'base');
      seed.layers[0].name = recipeBase?.material || originalBase?.name || seed.layers[0].name;
      seed.layers[0].color = recipeBase?.color || originalBase?.color || seed.layers[0].color;
      const newModel =
        arraySpec?.kind === 'rect-grid'
          ? createRectangularGridArrayModel(seed, arraySpec)
          : arraySpec
            ? createWaferArrayModel(seed, createWaferArrayTiling(arraySpec))
            : seed;
      setBaseRevertSnapshot(before);
      saveHistory(before);
      setModel(newModel);
      if (action !== 'replay') {
        setSection({ a: [-width * 0.42, 0], b: [width * 0.42, 0] });
      }
      const result = rebuildMainHistory({
        preservePrevious: action === 'keep' || action === 'replay',
        previousState: before.workspaceState,
      });
      if (action === 'replay') {
        const replayed = await replayBaseOperations(replayPlan.steps);
        if (!replayed?.ok || replayed.completed !== replayPlan.steps.length) {
          throw new Error(
            `Replay stopped after ${replayed?.completed || 0}/${replayPlan.steps.length} steps: ${replayed?.error || 'Incomplete replay.'}`,
          );
        }
        // Replay internally creates one Undo entry per Step; Base replacement is
        // one user action and must undo/redo as a single atomic transaction.
        collapseBaseReplayUndo(undoLength, before);
      }
      syncBaseControls();
      refreshHistory();
      renderAll();
      status(
        action === 'replay'
          ? `Starting Wafer replaced. Replayed ${replayPlan.steps.length} Process Steps; previous Main archived as a Variant.`
          : result?.archivedBranchId
            ? 'Base rebuilt. Previous history archived as a restorable Variant; new Main is ready.'
            : 'Base rebuilt with a clean Main history. Use Undo or Revert to restore the previous state.',
        'success',
      );
      return true;
    } catch (error) {
      restoreSnapshot(before);
      getHistory().splice(undoLength);
      getFuture().splice(0, getFuture().length, ...priorFuture);
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
