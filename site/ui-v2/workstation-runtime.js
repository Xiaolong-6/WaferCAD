// One project owner. View facades isolate gesture state while sharing actual project references.
import { readProjectFile, serializeProject } from '../project-io.js';
import { CURRENT_PROJECT_VERSION } from '../project-schema.js';
import { attachExperimentalPhysicalFacetOwner } from '../experimental/physical-facets/physical-facet-model.js';
import { createProjectStateController } from '../controllers/project-state-controller.js';
import { createSelectionGeometry } from '../selection-geometry.js';
import { maskLocalToWorld } from '../mask-roi-geometry.js';
import { createSnapshotManager } from '../workspace-snapshots.js';
import { applyOperation, createModel } from '../model.js';
import { createEmptyLayout } from '../controllers/project-state-controller.js';
import { BUNDLED_EXAMPLES } from '../bundled-examples.js';
import { versionedExampleAssetPath, bufferBackedProjectFile } from '../example-asset.js';

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

// Internal laboratory route only: serializes and reopens a fixed physical
// model through the actual project reader. Never accepts URLs or user files.
// The calling Workstation must use read-only preview to avoid unsupported
// Process, partial planar views and persistent lease/cache writes.
export async function loadExperimentalPhysicalFacetPreview({ coated = false } = {}) {
  const initial = await loadWorkstationProject();
  const silicon = attachExperimentalPhysicalFacetOwner(
    createModel({ shape: 'rect', width: 12.8, height: 12.8, thickness: 251 }),
    {
      layerId: 'base',
      pitch: 6.4,
      height: 4.5,
      bottomPlaneZ: -125.5,
      topPlaneZ: 125.5,
      domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
    },
  );
  // Execute the same opt-in atomic Conformal Process operation used by
  // persisted physical projects. This preview never hand-builds a fake shell.
  const model = structuredClone(silicon);
  if (coated) {
    const result = applyOperation(model, {
      type: 'add',
      growth: 'conformal',
      face: 'both',
      name: 'SiO2',
      thickness: 0.05,
      color: '#d88b37',
      area: structuredClone(model.boundary),
    });
    if (!result.changed) throw new RangeError(result.error || 'Physical SiO2 process failed');
  }
  const data = {
    ...initial.data,
    format: 'WaferCAD-vector',
    version: CURRENT_PROJECT_VERSION,
    name: coated ? 'Physical Si + SiO2 (read-only lab)' : 'Physical Si facet (read-only lab)',
    model,
    layout: {
      ...initial.data.layout,
      root: 'TOP',
      hierarchy: { TOP: [] },
      bounds: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4, width: 12.8, height: 12.8 },
    },
    activeCell: 'TOP',
    section: { a: [-6.4, 0], b: [6.4, 0] },
    display: {
      xyUnit: 'um',
      sectionCollapse: { top: 118, bottom: -118, enabled: true },
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      threeOpacity: 1,
      threeShowBorders: false,
    },
  };
  const text = serializeProject(data);
  const bytes = new TextEncoder().encode(text);
  const project = await readProjectFile(
    bufferBackedProjectFile(bytes.buffer, 'physical-facet-readonly.wafercad'),
    { experimentalPhysicalFacetReadOnly: true },
  );
  return { source: 'internal-physical-facet-readonly', hash: '', data: project };
}

export async function loadBundledProject(
  id,
  readProject = readProjectFile,
  { preview = false, strict = false } = {},
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
  // A release receipt exists only for strictly validated, immutable bundled
  // files; missing receipts preserve the normal strict import path.
  let integrity = null;
  if (!strict) {
    try {
      const proof = await fetch(versionedExampleAssetPath('./examples/bundled-integrity.json', version));
      if (proof.ok) {
        const receipt = await proof.json();
        if (receipt?.format === 'wafercad-validated-bundled-v1')
          integrity = receipt.entries?.[example.id]?.[preview ? 'preview' : 'full'];
      }
    } catch {
      // A source checkout need not carry a publication receipt.
    }
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (integrity && (
    integrity.path !== asset.path ||
    integrity.bytes !== bytes.byteLength ||
    integrity.sha256 !== hash
  )) throw Error(`Bundled example integrity mismatch: ${example.id}`);
  const data = await readProject(
    bufferBackedProjectFile(bytes, asset.filename),
    integrity ? { trustedBundledExample: { sha256: integrity.sha256 } } : {},
  );
  if (!data) throw Error('The example project was not imported.');
  return { source: path, hash, data };
}

export function createWorkstationRuntime(project) {
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
    getState: () => state,
    applyState: (value) => Object.assign(state, value),
    ensureHierarchy: () => {},
    getSnapshotRecords: () => history?.exportRecords() || [],
    getWorkerSnapshotHistory: () => history?.exportForWorkerStorage() || null,
    getSnapshotBranchState: ({ skipSync = false } = {}) => {
      if (!skipSync) history?.syncActiveHeadState();
      return history?.exportBranchState() || null;
    },
    setSectionEditEnabled: (value) => {
      local.main.sectionEditEnabled = value;
    },
  });
  projectState.loadProjectSnapshot(project.data);
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
    presentationRevision = null;
  function renderModel() {
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
    cooperativeValidateStates: true,
  });
  history.importRecords(project.data.snapshots || [], project.data.snapshotBranches);
  return {
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
