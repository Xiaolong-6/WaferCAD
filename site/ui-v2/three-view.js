// M2 presentation over the original renderer, camera policy and physical exporters.
import { createThreeView } from '../three-view.js';
import { mountToolPopover } from './view-kit/tool-popover.js';

export function createWorkstationThreeView({ store, workstation }) {
  const { el, button, toolbar } = window.WaferCadV2Components;
  const state = store.state;
  const local = store.local.three;
  const icon = (label, action, glyph) =>
    button('', action, glyph, {
      title: label,
      'aria-label': label,
      'data-help': {
        'fit:three': 'view.fit',
        'tool:rotate:three': 'three.rotate',
        'tool:pan:three': 'three.pan',
        'tool:zoom:three': 'three.zoom',
        'quality:three': 'three.quality',
        'opacity:three': 'three.opacity',
        'borders:three': 'three.borders',
        'maximize:three': 'shell.maximize',
      }[action],
    });
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
      [
        icon('Render mode', 'quality:three', 'quality'),
        icon('Opacity', 'opacity:three', 'eye'),
        icon('Borders', 'borders:three', 'rectangle'),
      ],
    ],
    [button('Export', 'three-export-menu', 'export', { 'data-help': 'view.export' })],
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
    getModel: store.renderModel,
    getClipGeometry: store.selection.roiGeometry,
    getInspection: () => ({
      opacity: state.threeOpacity,
      borders: state.threeShowBorders,
      fast: state.threeFastMode,
    }),
    getZCollapse: () => state.sectionCollapse,
    onViewChanged: (camera) => {
      state.threeCamera = camera;
      workstation.changed('three');
    },
  });
  renderer.setGestureMode(local.mode, { wheelZoom: local.zoomEnabled });
  if (state.threeCamera) renderer.setViewState(state.threeCamera);
  let initializing = null;
  const render = async () => {
    if (!host.checkVisibility()) return;
    // A staged Example/Recovery load can replace display settings after this
    // toolbar is constructed. Keep selected controls in sync with real state.
    sync();
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
  const opacityValue = el('output', {}, `${Math.round(state.threeOpacity * 100)}%`);
  const form = el(
    'div',
    { class: 'p-form' },
    el(
      'label',
      { class: 'wc-field' },
      el('span', { class: 'wc-label' }, 'Opacity ', opacityValue),
      opacity,
    ),
  );
  opacity.oninput = () => {
    state.threeOpacity = Math.max(0.1, Math.min(1, Number(opacity.value)));
    opacityValue.textContent = `${Math.round(state.threeOpacity * 100)}%`;
    requestRender();
  };
  const task = workstation.task;
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
        .setAttribute(
          'aria-pressed',
          String(mode === 'zoom' ? local.zoomEnabled : local.mode === mode),
        );
    const quality = panel.querySelector('[data-action="quality:three"]');
    quality.setAttribute('aria-label', state.threeFastMode ? 'Fast' : 'Quality');
    // The catalog resolves the current mode from aria-label, without a native title.
    quality
      .querySelector('use')
      .setAttribute('href', `#p-icon-${state.threeFastMode ? 'fast' : 'quality'}`);
    quality.setAttribute('aria-pressed', String(state.threeFastMode === false));
    host.dataset.v2Gesture = local.mode;
    host.dataset.wheelZoom = String(local.zoomEnabled);
    panel
      .querySelector('[data-action="borders:three"]')
      .setAttribute('aria-pressed', String(state.threeShowBorders));
  }
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !trigger.closest('#threePanel,.v2-three-floating')) return;
    const action = trigger.dataset.action;
    if (action.startsWith('tool:') && action.endsWith(':three')) {
      const mode = action.split(':')[1];
      if (mode === 'zoom') local.zoomEnabled = !local.zoomEnabled;
      else local.mode = local.mode === mode ? 'none' : mode;
      renderer.setGestureMode(local.mode, { wheelZoom: local.zoomEnabled });
      sync();
    } else if (action === 'fit:three') renderer.fit();
    else if (action === 'quality:three') {
      state.threeFastMode = !state.threeFastMode;
      sync();
      requestRender();
    } else if (action === 'opacity:three') {
      opacity.value = state.threeOpacity;
      opacityValue.textContent = `${Math.round(state.threeOpacity * 100)}%`;
      mountToolPopover(workstation.overlays, {
        label: '3D opacity',
        content: form,
        trigger,
      });
    } else if (action === 'borders:three') {
      state.threeShowBorders = !state.threeShowBorders;
      sync();
      requestRender();
    } else if (action === 'three-export-menu') {
      mountToolPopover(workstation.overlays, {
        trigger,
        label: 'Export 3D',
        content: el(
          'div',
          { class: 'p-form v2-three-floating' },
          button('PNG · 3×', 'export:three:png', 'export', { 'data-help': 'three.export.png' }),
          button('GLB · physical units', 'export:three:glb', 'export', {
            'data-help': 'three.export.glb',
          }),
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
