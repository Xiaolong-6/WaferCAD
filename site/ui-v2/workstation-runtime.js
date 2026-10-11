// One project owner. View facades isolate gesture state while sharing actual project references.
import { readProjectFile } from '../project-io.js';
import { createProjectStateController } from '../controllers/project-state-controller.js';
import { createSelectionGeometry } from '../selection-geometry.js';
import { maskLocalToWorld } from '../mask-roi-geometry.js';

export async function loadWorkstationProject() {
  const examples = {
    m3d: 'examples/m3d-selfpowered-full-replay.wafercad',
    photodetector: 'examples/previews/photodetector-literature.wafercad',
    metalens: 'examples/previews/tio2-metalens-four-unit.wafercad',
    jlfet: 'examples/previews/three-tier-silicon-jlfets.wafercad',
  };
  const example = new URLSearchParams(location.search).get('example') || 'm3d';
  if (!Object.hasOwn(examples, example)) throw Error(`Unknown example: ${example}`);
  const path = examples[example];
  const source = `site/${path}`;
  const response = await fetch(path);
  if (!response.ok) throw Error(`Project: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return { source, hash, data: await readProjectFile(new Blob([bytes])) };
}

export function createWorkstationRuntime(project) {
  const state = {
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
    main: { panEnabled: true, zoomEnabled: false, tool: 'none', sectionEditEnabled: false },
    mask: { panEnabled: true, zoomEnabled: false },
    section: { panEnabled: false, zoomEnabled: false },
    three: { mode: 'rotate', zoomEnabled: false },
  };
  const projectState = createProjectStateController({
    getState: () => state,
    applyState: (value) => Object.assign(state, value),
    ensureHierarchy: () => {},
    setSectionEditEnabled: (value) => {
      local.main.sectionEditEnabled = value;
    },
  });
  projectState.loadProjectSnapshot(project.data);
  const selectedElement = (element) =>
    state.selectedLayerKeys.has(`${element.layer}|${element.datatype}`);
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
  return {
    state,
    local,
    project,
    projectState,
    selection,
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
