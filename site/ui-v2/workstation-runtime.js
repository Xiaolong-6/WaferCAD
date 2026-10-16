// One project owner. View facades isolate gesture state while sharing actual project references.
import { readProjectFile } from '../project-io.js';
import { createProjectStateController } from '../controllers/project-state-controller.js';
import { createSelectionGeometry } from '../selection-geometry.js';
import { maskLocalToWorld } from '../mask-roi-geometry.js';
import { createSnapshotManager } from '../workspace-snapshots.js';
import { createModel } from '../model.js';
import { createEmptyLayout } from '../controllers/project-state-controller.js';
import { BUNDLED_EXAMPLES } from '../bundled-examples.js';
import { versionedExampleAssetPath, bufferBackedProjectFile } from '../example-asset.js';
import { createAssemblyBondHistorySession } from '../wafer-assembly-history-session.js';
import { createAssemblyBondEditorSession } from '../wafer-assembly-editor-session.js';
import { assemblyPreviewOriginModel } from './assembly-preview.js';

export async function loadWorkstationProject() {
  const model = createModel();
  return {
    source: 'empty',
    hash: '',
    data: {
      name: 'Untitled',
      model,
      layout: createEmptyLayout(),
      selectedLayerKeys: [],
      activeCell: null,
      maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      maskSourceMode: 'file',
      drawMask: { nextShapeId: 1, shapes: [] },
      activeFace: 'front',
      section: { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
      planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    },
  };
}

export async function loadBundledProject(
  id,
  readProject = readProjectFile,
  { preview = false } = {},
) {
  const aliases = {
    m3d: 'm3d-selfpowered-heterogeneous-ic',
    photodetector: 'photodetector-literature',
    metalens: 'tio2-metalens-four-unit',
    'metalens-array': 'tio2-metalens-four-unit',
    jlfet: 'three-tier-silicon-jlfets',
  };
  const example = BUNDLED_EXAMPLES.find((entry) => entry.id === (aliases[id] || id));
  if (!example) throw Error(`Unknown example: ${id}`);
  const asset = preview ? example.previewProject : example;
  if (!asset?.path) throw Error(`Example preview unavailable: ${id}`);
  const path = asset.path.replace(/^\.\//, '');
  let version = new URL(import.meta.url).searchParams.get('v') || 'local';
  if (version === 'local') {
    try {
      const build = await fetch('./build-info.json', { cache: 'no-store' });
      if (build.ok) version = String((await build.json()).commit || version);
    } catch {}
  }
  const response = await fetch(versionedExampleAssetPath(asset.path, version), {
    cache: 'default',
  });
  if (!response.ok) throw Error(`Project: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const data = await readProject(bufferBackedProjectFile(bytes, asset.filename));
  if (!data) throw Error('The example project was not imported.');
  return { source: path, hash, data };
}

export function createWorkstationRuntime(
  project,
  { assemblyPreview = false, firstBondDraft = false } = {},
) {
  if (assemblyPreview && !project?.data?.waferAssembly && !firstBondDraft) {
    throw new Error('Assembly preview requires verified Assembly provenance.');
  }
  if (firstBondDraft && (!assemblyPreview || project?.data?.waferAssembly)) {
    throw new Error('First-Bond draft requires an independent source and preview mode.');
  }
  let sectionLayersVisible = true;
  try {
    sectionLayersVisible = localStorage.getItem('wafercad.v2.section-layers.v1') !== 'false';
  } catch {}
  const state = {
    sectionLayersVisible,
    xyDisplayUnit: 'um',
    activeStructurePalette: 'balanced',
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    roiTool: null,
    roiDraft: null,
    roiShape: 'rect',
    maskRoiTool: null,
    maskRoiDraft: null,
    maskOpacity: 0.65,
    drawOpen: false,
  };
  const local = {
    main: { panEnabled: true, zoomEnabled: true, tool: 'none', sectionEditEnabled: false },
    mask: { panEnabled: true, zoomEnabled: true },
    section: { panEnabled: true, zoomEnabled: true },
    three: { mode: 'rotate', zoomEnabled: true },
  };
  let history = null;
  let restoreListener = () => {};
  const projectState = createProjectStateController({
    enableAssemblyWorkspace: assemblyPreview,
    getState: () => state,
    applyState: (value) => Object.assign(state, value),
    ensureHierarchy: () => {},
    getSnapshotRecords: () => history?.exportRecords() || [],
    getSnapshotBranchState: () => {
      history?.syncActiveHeadState();
      return history?.exportBranchState() || null;
    },
    setSectionEditEnabled: (value) => {
      local.main.sectionEditEnabled = value;
    },
  });
  projectState.loadProjectSnapshot(project.data);
  // Preview-only outlines make equal-material interfaces easier to inspect.
  if (assemblyPreview) state.threeShowBorders = true;
  let maskBrowser = null;
  const selectedElement = (element) =>
    maskBrowser
      ? maskBrowser.selectedElement(element)
      : state.selectedLayerKeys.has(`${element.layer}|${element.datatype}`);
  const maskPoint = (point) => maskLocalToWorld(point, state.maskTransform);
  const selection = createSelectionGeometry({ getState: () => state, selectedElement, maskPoint });
  const views = new Map();
  const dirty = new Set();
  let frame = 0,
    initialized = false;
  const dependencies = { roi: JSON.stringify(state.roi), section: JSON.stringify(state.section) };
  const counters = { main: 0, mask: 0, section: 0, three: 0 };
  let renameFocus = null,
    presentationModel = null,
    presentationSource = null,
    presentationRevision = null,
    originPresentationModel = null,
    originPresentationSource = null,
    originPresentationAssembly = null;
  function renderModel() {
    if (assemblyPreview && state.waferAssembly) {
      if (
        originPresentationModel &&
        originPresentationSource === state.model &&
        originPresentationAssembly === state.waferAssembly
      ) {
        return originPresentationModel;
      }
      originPresentationSource = state.model;
      originPresentationAssembly = state.waferAssembly;
      originPresentationModel = assemblyPreviewOriginModel(state.model, state.waferAssembly);
      return originPresentationModel;
    }
    if (!renameFocus) return state.model;
    if (
      presentationSource === state.model &&
      presentationRevision === state.model.revision &&
      presentationModel
    )
      return presentationModel;
    const fade = (item, kind) => {
      if (kind === renameFocus.kind && item.id === renameFocus.id) return item;
      const rgb = /^#[0-9a-f]{6}$/i.test(item.color || '')
        ? parseInt(item.color.slice(1), 16)
        : 0x808080;
      const color =
        '#' +
        [rgb >> 16, (rgb >> 8) & 255, rgb & 255]
          .map((channel, index) =>
            Math.round(channel * 0.18 + [245, 247, 250][index] * 0.82)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      return { ...item, color };
    };
    presentationSource = state.model;
    presentationRevision = state.model.revision;
    presentationModel = {
      ...state.model,
      layers: state.model.layers.map((item) => fade(item, 'layer')),
      implants: (state.model.implants || []).map((item) => fade(item, 'Implant')),
      electricalRegions: (state.model.electricalRegions || []).map((item) =>
        fade(item, 'Electrical'),
      ),
    };
    return presentationModel;
  }
  function invalidate(...keys) {
    keys.forEach((key) => dirty.add(key));
    if (frame || !initialized) return;
    frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    const pending = [...dirty];
    dirty.clear();
    for (const key of pending) {
      const view = views.get(key);
      if (!view) continue;
      view.runtime.render();
      counters[key]++;
    }
  }
  function changed(key) {
    if (key !== 'main') return;
    for (const [property, target] of [
      ['roi', 'three'],
      ['section', 'section'],
    ]) {
      const value = JSON.stringify(state[property]);
      if (value !== dependencies[property]) {
        dependencies[property] = value;
        invalidate(target);
      }
    }
  }
  function viewState(key) {
    return new Proxy(state, {
      get(target, property) {
        if (property in local[key]) return local[key][property];
        if (key === 'mask' && property === 'selectedLayerKeys')
          return [...target.selectedLayerKeys];
        return target[property];
      },
      set(target, property, value) {
        if (property in local[key]) local[key][property] = value;
        else target[property] = value;
        return true;
      },
    });
  }
  function restore(snapshot) {
    views.get('section')?.resetTransient();
    views.get('main')?.runtime.roi.clearDrawingMode();
    projectState.loadProjectSnapshot(snapshot);
    renameFocus = null;
    presentationModel = null;
    Object.assign(state, {
      roiTool: null,
      roiDraft: null,
      maskRoiTool: null,
      maskRoiDraft: null,
      drawUi: null,
    });
    local.main.tool = 'none';
    views.get('mask')?.runtime.draw.resetInteraction();
    views.get('section')?.detail.cancelDrawing();
    const three = views.get('three');
    if (state.threeCamera) three?.renderer.setViewState(state.threeCamera);
    else three?.renderer.fit();
    dependencies.roi = JSON.stringify(state.roi);
    dependencies.section = JSON.stringify(state.section);
    restoreListener();
    invalidate('main', 'mask', 'section', 'three');
  }
  history = createSnapshotManager({
    capture: () => projectState.buildProjectSnapshot(false),
    restore,
    validateState: projectState.isValidSnapshotState,
    validateStates: projectState.isValidSnapshotStates,
  });
  // In Assembly mode, the source-aware owner alone controls Bond navigation.
  // Ordinary snapshotManager cannot ingest an Assembly or copy donor provenance.
  history.importRecords(
    assemblyPreview ? [] : project.data.snapshots || [],
    assemblyPreview ? null : project.data.snapshotBranches,
  );
  let assemblyPreviewSession = assemblyPreview && project.data.waferAssembly
    ? createAssemblyBondHistorySession(project.data)
    : null;
  let assemblyBondEditor = null;
  function restoreAssemblyStage(index) {
    const active = assemblyBondEditor || assemblyPreviewSession;
    if (!active) throw new Error('Bond History preview is not active.');
    const projectAtStage = active.restoreIndex(index);
    if (!assemblyBondEditor) restore(projectAtStage);
    state.threeShowBorders = true;
    return projectAtStage;
  }
  function createAssemblyBondDraftSession(checkpointRecovery) {
    if ((!assemblyPreviewSession && !firstBondDraft) || assemblyBondEditor) {
      throw new Error('Bond draft editor requires one isolated Assembly preview.');
    }
    assemblyBondEditor = createAssemblyBondEditorSession(project.data, {
      checkpointRecovery,
      applyVisibleProject: (next) => {
        restore(next);
        state.threeShowBorders = true;
        return true;
      },
      getVisibleModel: () => state.model,
    });
    return assemblyBondEditor;
  }
  return {
    get assemblyPreviewSession() {
      return assemblyBondEditor || assemblyPreviewSession;
    },
    createAssemblyBondDraftSession,
    restoreAssemblyStage,
    state,
    local,
    project,
    projectState,
    history,
    restore,
    onRestore(listener) {
      restoreListener = listener;
    },
    selection,
    selectedElement,
    setMaskBrowser(value) {
      maskBrowser = value;
    },
    views,
    counters,
    viewState,
    renderModel,
    setRenameFocus(focus) {
      renameFocus = focus;
      presentationModel = null;
      invalidate('main', 'section', 'three');
    },
    changed,
    invalidate,
    start() {
      initialized = true;
      invalidate('main', 'mask', 'section', 'three');
    },
    renderAll() {
      invalidate('main', 'mask', 'section', 'three');
    },
    geometrySnapshot: () => JSON.stringify(state.model),
  };
}
