import { loadWorkstationProject, createWorkstationRuntime } from './workstation-runtime.js';
import { createMainView } from './main-view.js';
import { createMaskView } from './mask-view.js';
import { createSectionView } from './section-view.js';
import { createWorkstationThreeView } from './three-view.js';
import { createFloatingEditorManager } from './view-kit/floating-editor.js';
import { createWorkstationWorkflow } from './workstation-workflow.js';
import { createProgressiveStartup } from './progressive-startup.js';
import { createFirstFrameThreeGate } from './first-frame-three-gate.js';

const { el } = window.WaferCadV2Components;
try {
  window.WaferCadV2Icons.installSprite();
  const project = await loadWorkstationProject(),
    store = createWorkstationRuntime(project);
  const geometryBefore = store.geometrySnapshot();
  const uiState = {
    layout: 'a',
    font: 'inter',
    domain: 'project',
    mode:
      window.WaferCadV2ViewState.preferredMode(window.WaferCadV2ViewState.viewportWidth(window)) ===
      'overview'
        ? 'overview'
        : 'single',
    view: 'main',
    section: true,
    maximize: null,
    mobile: 'view',
    splitViews: ['main', 'mask'],
  };
  let message = 'Opening workspace…',
    commitVersion = 'commit local',
    commitSha = '',
    starting = true;
  const adapters = window.WaferCadV2DomainAdapters.create();
  const registry = window.WaferCadV2ShellRegistry.define({
    views: [
      { key: 'main', label: 'Main', icon: 'main' },
      { key: 'mask', label: 'Mask', icon: 'mask' },
      { key: 'three', label: '3D', icon: 'cube' },
      { key: 'section', label: 'Section', icon: 'section' },
    ],
  });
  const shell = window.createWaferCadV2Workstation({
    root: document.getElementById('app-root'),
    state: uiState,
    adapters,
    registry,
    getProjectName: () => store.state.projectName || project.data.name,
    presentation: () => ({
      selectedPanel: uiState.domain,
      selectedSubpanel: uiState.processMode || 'step',
      selectedNavigation: uiState.domain,
      visibleNestedPanels: uiState.domain === 'project' ? ['base'] : [],
      splitChoices: true,
      // Compact visibility has exactly one owner: mobile = view | edit.
      editorHidden: window.WaferCadV2ViewState.compact(window)
        ? uiState.mobile !== 'edit'
        : Boolean(uiState.editorHidden),
      message,
      save: shell.getSlot('status.save').textContent || 'Shared project · Stage C',
      version: commitVersion,
      versionCommit: commitSha,
    }),
  });
  shell.getRoot().dataset.boot = 'loading';
  const progressive = createProgressiveStartup({
    onChange: (snapshot) => {
      const root = shell.getRoot();
      root.dataset.shellReady = String(snapshot.shell === 'ready');
      root.dataset.projectReady = String(snapshot.project === 'ready');
      root.dataset.firstFrameReady = String(snapshot.firstFrame === 'ready');
      for (const [key, stage] of Object.entries(snapshot.views)) {
        const panel = store.views.get(key)?.panel;
        if (panel) panel.dataset.viewLoad = stage;
      }
    },
  });
  const workspaceBody = document.querySelector('.p-body');
  workspaceBody.inert = true;
  const render = () => {
    if (starting) return;
    shell.render();
    store.renderAll();
  };
  const status = (value) => {
    message = value;
    shell.getSlot('status.message').textContent = value;
  };
  const workstation = {
    adapters,
    shell,
    uiState,
    render,
    status,
    progressive,
    changed: store.changed,
    selectedMaskElement: store.selectedElement,
    mount: (panel) => document.querySelector('.p-canvases').append(panel),
  };
  const workflow = createWorkstationWorkflow({ store, workstation });
  workstation.task = workflow.task;
  workstation.changed = (key) => {
    store.changed(key);
    workflow.persistence.schedule();
  };
  const scope = (key) => ({
    ...workstation,
    overlays: createFloatingEditorManager(shell.overlays, { className: `v2-${key}-floating` }),
  });
  const main = await createMainView({
    renderModel: store.renderModel,
    project,
    sharedState: store.viewState('main'),
    workstation: scope('main'),
  });
  store.views.set('main', main);
  const mask = await createMaskView({
    project,
    sharedState: store.viewState('mask'),
    workstation: scope('mask'),
  });
  store.views.set('mask', mask);
  const section = createSectionView({ store, main, workstation: scope('section') });
  store.views.set('section', section);
  const three = createWorkstationThreeView({ store, workstation: scope('three') });
  store.views.set('three', three);
  // In overview, let a visible 2D scientific canvas present before expensive
  // WebGL initialization/scene work. All 3D requests, including onShow, pass
  // through the same one-time gate. 3D-only layouts release it immediately.
  const firstThreeFrame = createFirstFrameThreeGate(three.runtime.render);
  three.runtime.render = () => firstThreeFrame.request();
  const hasVisiblePlanarView = () =>
    ['main', 'mask', 'section'].some((key) => {
      const panel = store.views.get(key)?.panel;
      return panel && !panel.hidden && panel.getClientRects().length > 0;
    });
  // Non-WebGL canvases can become visible after their own completed paint.
  // Hidden Single-mode panels remain pending until their first visible render.
  for (const key of ['main', 'mask', 'section']) {
    const view = store.views.get(key);
    const originalRender = view.runtime.render;
    view.runtime.render = (...args) => {
      const result = originalRender(...args);
      if (progressive.snapshot().project === 'ready') {
        requestAnimationFrame(() => {
          if (!view.panel.hidden && view.panel.getClientRects().length) {
            progressive.viewFrame(key);
            firstThreeFrame.release();
          }
        });
      }
      return result;
    };
  }
  progressive.shellReady();
  adapters.register('view.three', {
    mount: (host) => {
      host.append(three.panel);
      return three.panel;
    },
    onShow: () => {
      if (!starting) {
        if (!hasVisiblePlanarView()) firstThreeFrame.release();
        three.runtime.render();
      }
    },
    onHide() {},
    destroy() {},
  });
  adapters.register('view.section', {
    mount: (host) => {
      host.append(section.panel);
      return section.panel;
    },
    onShow() {},
    onHide() {},
    destroy() {},
  });
  // Centralized transition. On desktop the independent inspector toggle remains.
  const selectPane = (pane) => {
    uiState.mobile = pane;
    if (!window.WaferCadV2ViewState.compact(window)) uiState.editorHidden = pane === 'view';
  };
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    if (action.startsWith('domain:')) {
      uiState.domain = action.split(':')[1];
      uiState.maximize = uiState.domain === 'mask' ? 'mask' : null;
      if (uiState.domain === 'mask') uiState.view = 'mask';
      selectPane('edit');
      render();
    } else if (action.startsWith('mode:')) {
      uiState.mode = action.split(':')[1];
      uiState.maximize = null;
      render();
    } else if (action.startsWith('view:')) {
      uiState.view = action.split(':')[1];
      uiState.mode = 'single';
      uiState.maximize = null;
      render();
    } else if (action === 'mobile-section') {
      uiState.view = 'section';
      uiState.mode = 'single';
      render();
    } else if (action === 'section') {
      uiState.section = !uiState.section;
      render();
    } else if (action.startsWith('maximize:')) {
      const key = action.split(':')[1];
      uiState.maximize = uiState.maximize === key ? null : key;
      render();
    } else if (action === 'face:main') {
      workflow.refresh();
    } else if (action === 'hide-editor' || action === 'return-results') {
      selectPane('view');
      render();
    } else if (action === 'show-editor' || action === 'expand-empty') {
      selectPane('edit');
      render();
    }
  });
  // Height-only browser chrome and keyboard resize is handled by CSS and the
  // scientific view ResizeObservers. Avoid re-running the entire workflow.
  let previousWidth = window.innerWidth;
  let previousCompact = window.WaferCadV2ViewState.compact(window);
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const compact = window.WaferCadV2ViewState.compact(window);
    if (width === previousWidth && compact === previousCompact) return;
    previousWidth = width;
    previousCompact = compact;
    render();
  });
  // Build the final navigation/grid now, while data remains protected.
  // Project restore can yield to the browser without exposing the dummy Base.
  shell.render();
  shell.getRoot().dataset.boot = 'project';
  await workflow.start();
  progressive.projectReady();
  starting = false;
  if (message === 'Opening workspace…') status('Ready');
  workflow.refresh();
  store.start();
  if (!hasVisiblePlanarView()) firstThreeFrame.release();
  workspaceBody.inert = false;
  // Pages stamps this file at publication; local servers may have no build metadata.
  // Read it without caching so the footer identifies the deployed revision.
  void fetch('./build-info.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((build) => {
      const commit = String(build?.commit || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(commit)) return;
      commitSha = commit;
      commitVersion = `commit ${commit.slice(0, 7)}`;
      shell.renderVersion();
    })
    .catch(() => {});
  window.WaferCadV2Workstation = {
    ready: true,
    startup: () => progressive.snapshot(),
    snapshot: () =>
      structuredClone({
        source: project.source,
        hash: project.hash,
        model: store.state.model,
        roi: store.state.roi,
        maskRoi: store.state.maskRoi,
        maskTransform: store.state.maskTransform,
        maskSourceMode: store.state.maskSourceMode,
        drawMask: store.state.drawMask,
        layout: store.state.layout,
        activeCell: store.state.activeCell,
        selectedLayerKeys: [...store.state.selectedLayerKeys],
        projectName: store.state.projectName,
        sectionLayersVisible: store.state.sectionLayersVisible,
        section: store.state.section,
        sectionDetailRoi: store.state.sectionDetailRoi,
        sectionViewport: store.state.sectionViewport,
        sectionCollapse: store.state.sectionCollapse,
        planViews: store.state.planViews,
        local: store.local,
        activeFace: store.state.activeFace,
        threeCamera: three.renderer.getViewState(),
        threeDisplay: {
          opacity: store.state.threeOpacity,
          borders: store.state.threeShowBorders,
          fast: store.state.threeFastMode,
        },
        workflow: workflow.snapshot(),
        counts: store.counters,
        ui: uiState,
        scientificUnchanged: geometryBefore === store.geometrySnapshot(),
        sharedIdentity:
          main.state.model === mask.state.model && main.state.model === store.state.model,
      }),
    projection: () => window.WaferCadV2Main.projection(),
  };
  shell.getRoot().dataset.boot = 'ready';
  document.body.dataset.ready = 'true';
} catch (error) {
  document.body.dataset.ready = 'error';
  document
    .getElementById('app-root')
    .replaceChildren(el('p', { role: 'alert' }, `Workstation unavailable: ${error.message}`));
  console.error(error);
}
