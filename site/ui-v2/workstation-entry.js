import { loadWorkstationProject, createWorkstationRuntime } from './workstation-runtime.js';
import { createMainView } from './main-view.js';
import { createMaskView } from './mask-view.js';
import { createSectionView } from './section-view.js';
import { createWorkstationThreeView } from './three-view.js';
import { createFloatingEditorManager } from './view-kit/floating-editor.js';
import { createWorkstationWorkflow } from './workstation-workflow.js';

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
      editorHidden: uiState.editorHidden,
      message,
      save: shell.getSlot('status.save').textContent || 'Shared project · Stage C',
    }),
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
  adapters.register('view.three', {
    mount: (host) => {
      host.append(three.panel);
      return three.panel;
    },
    onShow: three.runtime.render,
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
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    if (action.startsWith('domain:')) {
      uiState.domain = action.split(':')[1];
      uiState.editorHidden = false;
      uiState.mobile = 'edit';
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
      uiState.editorHidden = true;
      uiState.mobile = 'view';
      render();
    } else if (action === 'show-editor' || action === 'expand-empty') {
      uiState.editorHidden = false;
      uiState.mobile = 'edit';
      render();
    }
  });
  window.addEventListener('resize', render);
  await workflow.start();
  starting = false;
  if (message === 'Opening workspace…') status('Ready');
  workflow.refresh();
  store.start();
  workspaceBody.inert = false;
  const legacyLink = el(
    'a',
    {
      class: 'v2-legacy-link',
      href: './app-legacy.html',
      'aria-label': 'Save workspace and use legacy interface',
    },
    'Use legacy interface',
  );
  let switchingInterface = false;
  legacyLink.addEventListener('click', async (event) => {
    event.preventDefault();
    // Navigation itself must not enqueue another autosave after this flush.
    event.stopPropagation();
    if (switchingInterface) return;
    if (workflow.task.isBusy()) {
      status('Finish or abort the current task before switching interfaces.');
      return;
    }
    switchingInterface = true;
    legacyLink.setAttribute('aria-disabled', 'true');
    try {
      const persistence = workflow.persistence;
      const saved = workflow.snapshot().writable
        ? await persistence.persistNow({ force: true })
        : !persistence.isDirty() && !persistence.isViewDirty();
      if (!saved || persistence.isDirty() || persistence.isViewDirty()) {
        status(
          'Could not save the workspace. Resolve the save or ownership issue before switching interfaces.',
        );
        return;
      }
      window.location.href = legacyLink.href;
    } catch (error) {
      status(`Could not save before switching interfaces: ${error.message}`);
    } finally {
      switchingInterface = false;
      legacyLink.removeAttribute('aria-disabled');
    }
  });
  shell.getSlot('status.save').parentElement.append(legacyLink);
  window.WaferCadV2Workstation = {
    ready: true,
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
  document.body.dataset.ready = 'true';
} catch (error) {
  document.body.dataset.ready = 'error';
  document
    .getElementById('app-root')
    .replaceChildren(el('p', { role: 'alert' }, `Workstation unavailable: ${error.message}`));
  console.error(error);
}
