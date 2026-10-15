import {
  loadBundledProject,
  loadWorkstationProject,
  createWorkstationRuntime,
} from './workstation-runtime.js';
import { createMainView } from './main-view.js';
import { createMaskView } from './mask-view.js';
import { createSectionView } from './section-view.js';
import { createWorkstationThreeView } from './three-view.js';
import { createFloatingEditorManager } from './view-kit/floating-editor.js';
import { createWorkstationWorkflow } from './workstation-workflow.js';
import {
  desktopDockingEnabled,
  projectDesktopLayout,
  reduceDesktopLayout,
} from './view-layout-model.js';
import { loadDesktopLayout, saveDesktopLayout } from './view-layout-storage.js';

const { el } = window.WaferCadV2Components;
try {
  window.WaferCadV2Icons.installSprite();
  const params = new URLSearchParams(window.location.search);
  const readOnlyPreview = params.get('preview') === '1';
  const allowedViews = ['main', 'mask', 'three', 'section'];
  const initialView = allowedViews.includes(params.get('view')) ? params.get('view') : 'three';
  if (readOnlyPreview) document.body.dataset.previewMode = 'true';
  const desktopPreferences = (() => {
    if (readOnlyPreview) return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const project = readOnlyPreview
      ? await loadBundledProject(params.get('example'), undefined, { preview: true })
      : await loadWorkstationProject(),
    store = createWorkstationRuntime(project);
  if (readOnlyPreview) {
    // Navigation is enabled from the first frame without activating editing tools.
    store.local.main.panEnabled = true;
    store.local.main.zoomEnabled = true;
    store.local.mask.panEnabled = true;
    store.local.mask.zoomEnabled = true;
    store.local.section.panEnabled = true;
    store.local.section.zoomEnabled = true;
    store.local.three.mode = 'rotate';
    store.local.three.zoomEnabled = true;
    // Reset view-only saved offsets so each example begins with a meaningful fit.
    for (const view of ['main', 'mask']) {
      store.state.planViews[view] = { zoom: 1, panX: 0, panY: 0 };
    }
    store.state.sectionViewport = { zoom: 1, panX: 0, panY: 0 };
  }
  const geometryBefore = store.geometrySnapshot();
  const uiState = {
    layout: 'a',
    font: 'inter',
    domain: 'project',
    mode: readOnlyPreview
      ? 'single'
      : window.WaferCadV2ViewState.preferredMode(
            window.WaferCadV2ViewState.viewportWidth(window),
          ) === 'overview'
        ? 'overview'
        : 'single',
    view: readOnlyPreview ? initialView : 'main',
    section: !readOnlyPreview,
    maximize: null,
    mobile: 'view',
    splitViews: ['main', 'mask'],
    desktopLayout: readOnlyPreview ? null : loadDesktopLayout(desktopPreferences),
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
      desktopLayout: readOnlyPreview ? null : projectDesktopLayout(uiState.desktopLayout),
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
  const workspaceBody = document.querySelector('.p-body');
  workspaceBody.inert = true;
  const render = () => {
    if (starting) return;
    shell.render();
    store.renderAll();
  };
  // Layout changes repaint only Shell/element sizing. Scientific invalidation
  // remains owned by the existing model scheduler and canvas ResizeObservers.
  const desktopDockingActive = () => !readOnlyPreview && desktopDockingEnabled(window.innerWidth);
  const changeDesktopLayout = (action) => {
    if (!desktopDockingActive()) return;
    const next = reduceDesktopLayout(uiState.desktopLayout, action);
    if (next === uiState.desktopLayout) return;
    uiState.desktopLayout = next;
    saveDesktopLayout(desktopPreferences, next);
    if (!starting) shell.render();
  };
  const status = (value) => {
    message = value;
    shell.getSlot('status.message').textContent = value;
  };
  const workstation = {
    readOnlyPreview,
    adapters,
    shell,
    uiState,
    render,
    status,
    changed: store.changed,
    selectedMaskElement: store.selectedElement,
    mount: (panel) => document.querySelector('.p-canvases').append(panel),
  };
  const workflow = createWorkstationWorkflow({ store, workstation, readOnly: readOnlyPreview });
  workstation.task = workflow.task;
  workstation.changed = (key) => {
    store.changed(key);
    if (!readOnlyPreview) workflow.persistence.schedule();
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
  // Mobile Edit has one document scroller. Remember its offset per domain
  // instead of saving scrollTop on the desktop-only inspector subtree.
  // Pane transitions keep all scientific hosts and unsaved form drafts mounted.
  const mobileDocumentScroll = new Map();
  let mobileTransitionSerial = 0;
  const selectPane = (pane, domain = uiState.domain) => {
    const compact = window.WaferCadV2ViewState.compact(window);
    if (compact && uiState.mobile === 'edit') {
      mobileDocumentScroll.set(uiState.domain, document.scrollingElement?.scrollTop || 0);
    }
    uiState.domain = domain;
    uiState.mobile = pane;
    if (!compact) {
      uiState.editorHidden = pane === 'view';
      return;
    }
    const destination = pane === 'edit' ? mobileDocumentScroll.get(domain) || 0 : 0;
    const serial = ++mobileTransitionSerial;
    requestAnimationFrame(() => {
      if (serial !== mobileTransitionSerial) return;
      // Reapply after the new pane's adapters complete layout. One frame can
      // clamp the offset against the previous (shorter) View document.
      requestAnimationFrame(() => {
        if (serial === mobileTransitionSerial) window.scrollTo(0, destination);
      });
    });
  };
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    if (action.startsWith('domain:')) {
      const domain = action.split(':')[1];
      uiState.maximize = domain === 'mask' ? 'mask' : null;
      if (domain === 'mask') uiState.view = 'mask';
      selectPane('edit', domain);
      render();
    } else if (action === 'dock:overview') {
      changeDesktopLayout({ type: 'RESET_OVERVIEW' });
    } else if (action.startsWith('dock:view:')) {
      changeDesktopLayout({ type: 'TOGGLE_VIEW', view: action.split(':')[2] });
    } else if (action.startsWith('dock:close:')) {
      changeDesktopLayout({ type: 'CLOSE_VIEW', view: action.split(':')[2] });
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
      if (desktopDockingActive()) changeDesktopLayout({ type: 'MAXIMIZE', view: key });
      else {
        uiState.maximize = uiState.maximize === key ? null : key;
        render();
      }
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
  // Keep the incomplete Shell covered until the restored project is ready.
  // The initial workflow.refresh() applies panel ownership and view order.
  await workflow.start();
  starting = false;
  if (message === 'Opening workspace…') status('Ready');
  workflow.refresh();
  store.start();
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
  if (readOnlyPreview && window.parent !== window) {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (event.data?.type !== 'wafercad-preview-view') return;
      if (!allowedViews.includes(event.data.view)) return;
      uiState.view = event.data.view;
      uiState.mode = 'single';
      uiState.section = false;
      uiState.maximize = null;
      render();
    });
    window.parent.postMessage({ type: 'wafercad-preview-ready' }, window.location.origin);
  }
} catch (error) {
  document.body.dataset.ready = 'error';
  document
    .getElementById('app-root')
    .replaceChildren(el('p', { role: 'alert' }, `Workstation unavailable: ${error.message}`));
  console.error(error);
  if (document.body.dataset.previewMode === 'true' && window.parent !== window)
    window.parent.postMessage(
      { type: 'wafercad-preview-error', message: error.message },
      window.location.origin,
    );
}
