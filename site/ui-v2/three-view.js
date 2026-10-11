// M2 presentation over the original renderer, camera policy and physical exporters.
import { createThreeView } from '../three-view.js';
import { createProcessTaskController } from '../controllers/process-task-controller.js';

export function createWorkstationThreeView({ store, workstation }) {
  const { el, button, toolbar } = window.WaferCadV2Components;
  const state = store.state;
  const local = store.local.three;
  const icon = (label, action, glyph) =>
    button('', action, glyph, { title: label, 'aria-label': label });
  const host = el('div', {
    id: 'threeHost',
    class: 'p-science v2-three-host',
    'data-v2-stage-host': '',
    'aria-label': 'Physical 3D model',
  });
  const tools = toolbar(
    '3D',
    [
      [
        icon('Fit', 'fit:three', 'fit'),
        icon('Rotate', 'tool:rotate:three', 'history'),
        icon('Pan', 'tool:pan:three', 'pan'),
        icon('Zoom', 'tool:zoom:three', 'zoom'),
      ],
    ],
    [
      button('Fast', 'quality:three', 'cube'),
      button('Export', 'three-export-menu', 'export'),
      icon('3D display settings', 'settings:three', 'settings'),
    ],
  );
  tools.append(icon('Maximize', 'maximize:three', 'maximize'));
  const panel = window.createWaferCadV2ViewPanels().update(
    'three',
    {
      id: 'threePanel',
      class: 'p-view',
      'data-view': 'three',
      'aria-label': '3D view',
    },
    el('header', {}, el('strong', {}, '3D'), tools),
    host,
    el('div'),
  );
  workstation.mount(panel);
  const stats = panel.querySelector('[data-slot="view.three.readout"]');
  stats.id = 'threeStats';
  const renderer = createThreeView({
    host,
    stats,
    getModel: () => state.model,
    getClipGeometry: store.selection.roiGeometry,
    getInspection: () => ({
      opacity: state.threeOpacity,
      borders: state.threeShowBorders,
      fast: state.threeFastMode,
    }),
    getZCollapse: () => state.sectionCollapse,
    onViewChanged: (camera) => {
      state.threeCamera = camera;
    },
  });
  renderer.setGestureMode(local.mode);
  if (state.threeCamera) renderer.setViewState(state.threeCamera);
  let initializing = null;
  const render = async () => {
    if (!host.checkVisibility()) return;
    if (!renderer.ready) {
      initializing ||= renderer.init();
      if (!(await initializing)) return;
    }
    await renderer.render();
  };
  const requestRender = () => {
    void render().catch((error) => {
      host.dataset.renderError = error.message;
      workstation.status(`3D render failed: ${error.message}`);
      console.error(error);
    });
  };
  const opacity = el('input', {
    id: 'threeOpacityRange',
    type: 'range',
    min: 0.1,
    max: 1,
    step: 0.05,
    value: state.threeOpacity,
  });
  const borders = el('input', {
    id: 'threeBorders',
    type: 'checkbox',
    checked: state.threeShowBorders,
  });
  const form = el(
    'div',
    { class: 'p-form' },
    el('label', { class: 'wc-field' }, 'Opacity', opacity),
    el('label', { class: 'wc-field' }, 'Structural borders', borders),
  );
  opacity.oninput = () => {
    state.threeOpacity = Math.max(0.1, Math.min(1, Number(opacity.value)));
    requestRender();
  };
  borders.onchange = () => {
    state.threeShowBorders = borders.checked;
    requestRender();
  };
  const taskPanel = el(
    'section',
    {
      id: 'processTaskDialog',
      class: 'v2-three-task',
      hidden: true,
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Background task',
    },
    el('strong', { id: 'processTaskTitle' }),
    el('span', { id: 'processTaskStage' }),
    el('span', { id: 'processTaskElapsed' }),
    button('Abort', null, 'stop', { id: 'processTaskAbortBtn' }),
  );
  document.body.append(taskPanel);
  const task = createProcessTaskController({
    status: workstation.status,
    setApplyDisabled: (busy) => {
      panel.querySelector('[data-action="three-export-menu"]').disabled = busy;
    },
  });
  task.bind();
  const download = (blob, name) => {
    const url = URL.createObjectURL(blob),
      link = el('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function exportFile(format) {
    workstation.overlays.close('popover');
    const result = await task.runTask(
      async ({ signal, updateStage }) => {
        if (!renderer.ready) throw Error('3D view is unavailable.');
        const blob =
          format === 'glb'
            ? await renderer.exportGlb({
                signal,
                onProgress: (progress, label) =>
                  updateStage(`${Math.round(progress * 100)}% · ${label || 'Working…'}`),
              })
            : await renderer.capturePng(3);
        return { blob };
      },
      {
        label:
          format === 'glb'
            ? `Exporting ${state.roi ? 'ROI' : 'full'} 3D GLB…`
            : 'Capturing 3D PNG…',
        abortable: format === 'glb',
        initialStage: format === 'glb' ? 'Preparing…' : 'Rendering 3× frame…',
        abortMessage: '3D GLB export cancelled. No file was written.',
        failurePrefix: '3D export failed',
      },
    );
    if (result?.busy) workstation.status('Another background task is already running.');
    if (!result?.aborted && !result?.error && result?.blob) {
      download(result.blob, format === 'glb' ? 'wafercad-model.glb' : 'wafercad-3d-3x.png');
      workstation.status(
        format === 'glb' ? 'Exported GLB in physical metres.' : 'Exported 3× 3D PNG.',
      );
    }
  }
  function sync() {
    for (const mode of ['rotate', 'pan', 'zoom'])
      panel
        .querySelector(`[data-action="tool:${mode}:three"]`)
        .setAttribute('aria-pressed', String(local.mode === mode));
    const quality = panel.querySelector('[data-action="quality:three"]');
    quality.setAttribute('aria-label', state.threeFastMode ? 'Fast' : 'Quality');
    quality.title = state.threeFastMode ? 'Render mode: Fast' : 'Render mode: Quality';
    quality.setAttribute('aria-pressed', String(state.threeFastMode === false));
    host.dataset.v2Gesture = local.mode;
  }
  // OrbitControls still tracks every touch, including the first pointer before pinch.
  // Its one-finger Zoom action is disabled; only this mode uses the existing D1 camera mapping.
  const touches = new Set();
  let drag = null;
  host.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') return;
      touches.add(event.pointerId);
      drag =
        touches.size === 1 && local.mode === 'zoom'
          ? { id: event.pointerId, y: event.clientY, camera: renderer.getViewState() }
          : null;
    },
    true,
  );
  host.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId || touches.size !== 1) return;
    const next = window.WaferCadV2RealThreeControls.zoomCamera(drag.camera, event.clientY - drag.y);
    if (next) {
      renderer.setViewState(next);
      state.threeCamera = renderer.getViewState();
    }
  });
  const end = (event) => {
    touches.delete(event.pointerId);
    drag = null;
  };
  host.addEventListener('pointerup', end, true);
  host.addEventListener('pointercancel', end, true);
  host.addEventListener('lostpointercapture', end, true);
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !trigger.closest('#threePanel,.v2-three-floating')) return;
    const action = trigger.dataset.action;
    if (action.startsWith('tool:') && action.endsWith(':three')) {
      const mode = action.split(':')[1];
      local.mode = local.mode === mode ? 'none' : mode;
      drag = null;
      renderer.setGestureMode(local.mode);
      sync();
    } else if (action === 'fit:three') renderer.fit();
    else if (action === 'quality:three') {
      state.threeFastMode = !state.threeFastMode;
      sync();
      requestRender();
    } else if (action === 'settings:three') {
      workstation.overlays.mountFloating({
        id: 'threeSettings',
        title: '3D display settings',
        content: form,
        trigger,
      });
    } else if (action === 'three-export-menu') {
      workstation.overlays.mount('popover', {
        trigger,
        label: 'Export 3D',
        content: el(
          'div',
          { class: 'p-form v2-three-floating' },
          button('PNG · 3×', 'export:three:png', 'export'),
          button('GLB · physical units', 'export:three:glb', 'export'),
        ),
      });
    } else if (action === 'export:three:png' || action === 'export:three:glb') {
      void exportFile(action.split(':')[2]);
    }
  });
  sync();
  return {
    panel,
    renderer,
    task,
    runtime: { render: requestRender, updateZCollapse: renderer.updateZCollapse },
  };
}
