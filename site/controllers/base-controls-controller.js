import { createModel, hasMaterial } from '../model.js';

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

  async function applyBase() {
    const shape = root.querySelector('#substrateShape button.active').dataset.shape,
      width = manualMicron($('baseWidth').value),
      height = shape === 'circle' ? width : manualMicron($('baseHeight').value),
      thickness = manualMicron($('baseThickness').value);

    if (width <= 0 || height <= 0 || thickness <= 0) {
      status('Base dimensions must be positive.');
      return;
    }

    if (
      hasMaterial(getModel()) &&
      hasProcessEdits() &&
      !(await confirmAction({
        title: 'Rebuild base?',
        message: 'Rebuilding the base removes the current structure and all applied operations.',
        detail: 'The change remains available through Undo and Revert.',
        confirmLabel: 'Rebuild base',
        danger: true,
      }))
    ) {
      syncBaseControls();
      return;
    }

    setBaseRevertSnapshot(stateSnapshot());
    saveHistory();
    setModel(createModel({ shape, width, height, thickness }));
    setSection({ a: [-width * 0.42, 0], b: [width * 0.42, 0] });
    syncBaseControls();
    renderAll();
    fit3d();
    status(
      hasMaterial(getBaseRevertSnapshot()?.model)
        ? 'Base applied. Use Revert or Undo to restore the previous structure.'
        : 'Base recreated. Use Undo to restore the previous empty state.',
    );
  }

  function revertBase() {
    const snapshot = getBaseRevertSnapshot();
    if (!snapshot) return;

    setBaseRevertSnapshot(null);
    getFuture().push(stateSnapshot());
    if (getHistory().length) getHistory().pop();
    restoreSnapshot(snapshot);
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
