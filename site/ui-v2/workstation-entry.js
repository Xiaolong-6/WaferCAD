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
import { createAssemblyBondDraftRecovery } from '../wafer-assembly-draft-recovery.js';
import { mountAssemblyBondDraftControls } from './assembly-bond-draft.js';
import {
  assemblyPreviewZExtent,
  chooseAssemblyPreviewFile,
  mountAssemblyPreviewControls,
} from './assembly-preview.js';
import {
  desktopDockingEnabled,
  projectDesktopLayout,
  reduceDesktopLayout,
} from './view-layout-model.js';
import { loadDesktopLayout, saveDesktopLayout } from './view-layout-storage.js';
import { createDesktopDockingController } from './view-docking-controller.js';
import { createDesktopLayoutResizer } from './view-layout-resizer.js';
import { createProgressiveStartup } from './progressive-startup.js';
import { createFirstFrameThreeGate } from './first-frame-three-gate.js';
import { createMobileWorkspaceController } from './mobile-workspace-controller.js';
import { createMobileViewportController } from './mobile-viewport-controller.js';
import { createWorkstationRenderScheduler } from './workstation-render-scheduler.js';

const { el } = window.WaferCadV2Components;
try {
  window.WaferCadV2Icons.installSprite();
  const params = new URLSearchParams(window.location.search);
  const assemblyPreview = params.get('assemblyPreview') === '1';
  const assemblyEdit = assemblyPreview && params.get('bondEdit') === '1';
  const readOnlyPreview = params.get('preview') === '1' || assemblyPreview;
  const allowedViews = ['main', 'mask', 'three', 'section'];
  const initialView = allowedViews.includes(params.get('view')) ? params.get('view') : 'three';
  const assemblyDraftRecovery = assemblyEdit ? createAssemblyBondDraftRecovery() : null;
  if (readOnlyPreview) document.body.dataset.previewMode = 'true';
  const desktopPreferences = (() => {
    if (readOnlyPreview) return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  if (assemblyPreview) document.body.dataset.assemblyPreview = 'true';
  const project = assemblyPreview
      ? await chooseAssemblyPreviewFile(document.getElementById('app-root'), {
          recovery: assemblyDraftRecovery,
          allowStandalone: assemblyEdit,
        })
      : readOnlyPreview
        ? await loadBundledProject(params.get('example'), undefined, { preview: true })
        : await loadWorkstationProject(),
    store = createWorkstationRuntime(project, {
      assemblyPreview,
      firstBondDraft: assemblyEdit && !project.data.waferAssembly,
    });
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
    temporaryFocus: null,
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
      desktopLayout: readOnlyPreview
        ? null
        : projectDesktopLayout(uiState.desktopLayout, uiState.temporaryFocus),
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
  let mobileViewport = null;
  if (!readOnlyPreview) {
    mobileViewport = createMobileViewportController({
      root: shell.getRoot(),
      state: uiState,
      compact: () => window.WaferCadV2ViewState.compact(window),
    });
  }
  window.addEventListener('pagehide', () => mobileViewport?.destroy(), { once: true });
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
  let desktopResizer = null;
  const render = createWorkstationRenderScheduler({
    isStarting: () => starting,
    renderShell: () => {
      shell.render();
      mobileViewport?.update();
    },
    invalidateScientific: () => store.renderAll(),
    invalidateVisibleView: (key) => store.invalidate(key),
    scheduleLayout: () => requestAnimationFrame(() => desktopResizer?.refresh()),
  });
  // View-specific, nonmodal floating editors are transient UI, not model state.
  // Dismissing them when their view is hidden prevents stale Mask/Section
  // dialogs from intercepting the desktop workflow navigation.
  const floatingManagers = new Map();
  // Layout changes repaint only Shell/element sizing. Scientific invalidation
  // remains owned by the existing model scheduler and canvas ResizeObservers.
  const desktopDockingActive = () => !readOnlyPreview && desktopDockingEnabled(window.innerWidth);
  const setTemporaryFocus = (view) => {
    const next = desktopDockingActive() && view === 'mask' ? 'mask' : null;
    if (next === uiState.temporaryFocus) return false;
    if (uiState.temporaryFocus) floatingManagers.get(uiState.temporaryFocus)?.closeFloatings();
    uiState.temporaryFocus = next;
    return true;
  };
  const changeDesktopLayout = (action) => {
    if (!desktopDockingActive()) return;
    // Direct docking actions are user intent. Drop any workflow-only focus
    // before applying them to the persisted user layout.
    const clearedFocus = setTemporaryFocus(null);
    const previous = uiState.desktopLayout;
    const next = reduceDesktopLayout(previous, action);
    if (next === previous) {
      if (clearedFocus && !starting) {
        shell.render();
        requestAnimationFrame(() => desktopResizer?.refresh());
      }
      return;
    }
    if (previous.maximized && previous.maximized !== next.maximized)
      floatingManagers.get(previous.maximized)?.closeFloatings();
    for (const view of previous.visible) {
      if (!next.visible.includes(view)) floatingManagers.get(view)?.closeFloatings();
    }
    uiState.desktopLayout = next;
    saveDesktopLayout(desktopPreferences, next);
    if (!starting) {
      shell.render();
      requestAnimationFrame(() => desktopResizer?.refresh());
    }
  };
  const desktopDocking = readOnlyPreview
    ? null
    : createDesktopDockingController({
        root: shell.getRoot(),
        getState: () => uiState.desktopLayout,
        dispatch: changeDesktopLayout,
        enabled: desktopDockingActive,
      });
  desktopResizer = readOnlyPreview
    ? null
    : createDesktopLayoutResizer({
        root: shell.getRoot(),
        getState: () => uiState.desktopLayout,
        dispatch: changeDesktopLayout,
        // Focus is a single-view projection; never show splitters from the
        // underlying multi-view user layout while it is active.
        enabled: () => desktopDockingActive() && !uiState.temporaryFocus,
      });
  window.addEventListener(
    'pagehide',
    () => {
      desktopDocking?.destroy();
      desktopResizer?.destroy();
    },
    { once: true },
  );
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
    progressive,
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
  const scope = (key) => {
    const overlays = createFloatingEditorManager(shell.overlays, {
      className: `v2-${key}-floating`,
    });
    floatingManagers.set(key, overlays);
    return { ...workstation, overlays };
  };
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
  const mobileWorkspace = createMobileWorkspaceController({
    state: uiState,
    compact: () => window.WaferCadV2ViewState.compact(window),
  });
  const selectPane = (pane, domain = uiState.domain) => {
    if (mobileWorkspace.selectPane(pane, domain)) return;
    uiState.domain = domain;
    uiState.mobile = pane;
    uiState.editorHidden = pane === 'view';
  };
  window.addEventListener('pagehide', mobileWorkspace.destroy, { once: true });
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action;
    const previousMobile = uiState.mobile;
    const previousView = uiState.view;
    if (mobileWorkspace.handleAction(action)) {
      // Main/Mask adapters do not repaint in onShow; refresh only the view
      // that becomes visible, never all four scientific views.
      if (uiState.mobile !== 'view') {
        render({ scientific: false });
      } else if (previousMobile !== 'view' || previousView !== uiState.view) {
        render({ scientificView: uiState.view });
      } else {
        render({ scientific: false });
      }
      return;
    }
    if (action.startsWith('domain:')) {
      const domain = action.split(':')[1];
      // Workflow Mask temporarily presents a full-size Mask, leaving the
      // user's dock visibility, ordering, track ratios and maximize untouched.
      uiState.maximize = !desktopDockingActive() && domain === 'mask' ? 'mask' : null;
      if (domain === 'mask') uiState.view = 'mask';
      setTemporaryFocus(domain === 'mask' ? 'mask' : null);
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
      if (desktopDockingActive() && uiState.temporaryFocus === key) {
        // Restore the exact pre-focus composition, even when Mask was closed
        // or another view had previously been maximized.
        setTemporaryFocus(null);
        render({ scientific: false });
      } else if (desktopDockingActive()) changeDesktopLayout({ type: 'MAXIMIZE', view: key });
      else {
        uiState.maximize = uiState.maximize === key ? null : key;
        render();
      }
    } else if (action === 'face:main') {
      workflow.refresh();
    } else if (action === 'hide-editor' || action === 'return-results') {
      setTemporaryFocus(null);
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
    if (compact !== previousCompact) mobileWorkspace.cancelPendingScroll();
    if (compact) setTemporaryFocus(null);
    previousWidth = width;
    previousCompact = compact;
    render();
  });
  // Build the final navigation/grid while restored project data is protected.
  shell.render();
  shell.getRoot().dataset.boot = 'project';
  await workflow.start();
  progressive.projectReady();
  starting = false;
  if (message === 'Opening workspace…') status('Ready');
  workflow.refresh();
  store.start();
  requestAnimationFrame(() => desktopResizer?.refresh());
  if (!hasVisiblePlanarView()) firstThreeFrame.release();
  setTimeout(() => firstThreeFrame.release(), 2500);
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
        ...(assemblyPreview
          ? {
              assemblyPreview: {
                index: store.assemblyPreviewSession.currentIndex(),
                bonds: store.assemblyPreviewSession.maxIndex(),
                sources:
                  store.assemblyPreviewSession.fullProduct().waferAssembly?.sources.length ?? 1,
                readOnly: !assemblyEdit,
                originDisplayColors: [
                  ...new Set(store.renderModel().layers.map((layer) => layer.color)),
                ],
              },
            }
          : {}),
        sharedIdentity:
          main.state.model === mask.state.model && main.state.model === store.state.model,
      }),
    projection: () => window.WaferCadV2Main.projection(),
  };
  shell.getRoot().dataset.boot = 'ready';
  document.body.dataset.ready = 'true';
  if (assemblyPreview) {
    const draftWorkspaceId = project.workspaceId || crypto.randomUUID();
    const draftEditor = assemblyEdit
      ? store.createAssemblyBondDraftSession(
          async (value, reason) => {
            await assemblyDraftRecovery.checkpoint(value, reason);
            return true;
          },
          {
            persistedRevision: project.workspaceRevision ?? 0,
            persistVariantGraph: (graph, expectedRevision) =>
              assemblyDraftRecovery.saveWorkspaceGraph(draftWorkspaceId, graph, expectedRevision),
          },
        )
      : null;
    const session = store.assemblyPreviewSession;
    let draftUi = null;
    const nav = mountAssemblyPreviewControls({
      currentIndex: () => session.currentIndex(),
      maxIndex: () => session.maxIndex(),
      stageDetail: () => ` · Z ${assemblyPreviewZExtent(store.renderModel()).thicknessUm} µm`,
      restoreIndex: async (index) => {
        if (draftEditor) {
          await store.restoreAssemblyStageDurable(index);
        } else {
          store.restoreAssemblyStage(index);
        }
        if (draftEditor) {
          store.setPostBondPresentationModel(draftEditor.postBondPreviewModel());
        }
        draftUi?.sync();
        workflow.refresh();
      },
      selectView: (view) => {
        uiState.view = view;
        uiState.mode = 'single';
        uiState.section = false;
        uiState.maximize = null;
        render();
      },
      initialView,
      editableBondDraft: assemblyEdit,
    });
    if (draftEditor) {
      const refreshPostBondProcess = () => {
        store.setPostBondPresentationModel(draftEditor.postBondPreviewModel());
        nav.sync();
        workflow.refresh();
      };
      draftUi = mountAssemblyBondDraftControls({
        editor: draftEditor,
        onChanged: refreshPostBondProcess,
      });
      refreshPostBondProcess();
      status(
        'Assembly Bond draft · source-bound Process preview; export all Variants to keep edits.',
      );
    } else {
      status('Bonded Assembly · origin colors are display-only; no editor or autosave.');
    }
  }
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
