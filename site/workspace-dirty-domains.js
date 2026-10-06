const VIEW_DISPLAY_KEYS = [
  'xyUnit',
  'structurePalette',
  'customStructurePalette',
  'maskOpacity',
  'threeOpacity',
  'threeShowBorders',
  'threeCamera',
  'sectionScaleMode',
  'sectionShowBorders',
  'sectionCollapse',
  'sectionDetailRoi',
];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function layoutIdentity(layout) {
  return {
    name: String(layout?.name || ''),
    root: String(layout?.root || ''),
    elements: layout?.elements || null,
    linework: layout?.linework || null,
    bounds: layout?.bounds || null,
    combos: layout?.combos || null,
    hierarchy: layout?.hierarchy || null,
    units: layout?.units || null,
  };
}

export function captureWorkspaceStructuralIdentity(
  project,
  { projectName = '', historyToken = '' } = {},
) {
  const model = project?.model || null,
    layout = layoutIdentity(project?.layout);
  return {
    model,
    modelRevision: Number(model?.revision) || 0,
    processRevision: Number(model?.processRevision) || 0,
    layout,
    drawMask: project?.drawMask || null,
    projectName: String(projectName || ''),
    historyToken: String(historyToken || ''),
  };
}

export function workspaceStructuralIdentityEqual(left, right) {
  if (!left || !right) return false;
  if (
    left.model !== right.model ||
    left.modelRevision !== right.modelRevision ||
    left.processRevision !== right.processRevision ||
    left.drawMask !== right.drawMask ||
    left.projectName !== right.projectName ||
    left.historyToken !== right.historyToken
  ) {
    return false;
  }

  const a = left.layout,
    b = right.layout;
  return Boolean(
    a &&
      b &&
      a.name === b.name &&
      a.root === b.root &&
      a.elements === b.elements &&
      a.linework === b.linework &&
      a.bounds === b.bounds &&
      a.combos === b.combos &&
      a.hierarchy === b.hierarchy &&
      a.units === b.units,
  );
}

export function extractWorkspaceViewState(project) {
  const display = {};
  for (const key of VIEW_DISPLAY_KEYS) {
    if (Object.hasOwn(project?.display || {}, key)) display[key] = clone(project.display[key]);
  }
  return {
    version: 1,
    selectedLayerKeys: clone(project?.selectedLayerKeys),
    activeCell: project?.activeCell ?? null,
    maskTransform: clone(project?.maskTransform),
    maskSourceMode: project?.maskSourceMode === 'draw' ? 'draw' : 'file',
    maskRoi: clone(project?.maskRoi),
    maskRoiAnchor: project?.maskRoiAnchor || 'center',
    activeFace: project?.activeFace === 'back' ? 'back' : 'front',
    roi: clone(project?.roi),
    roiAnchor: project?.roiAnchor || 'center',
    section: clone(project?.section),
    planViews: clone(project?.planViews),
    display,
  };
}

export function applyWorkspaceViewState(project, viewState) {
  if (!project || !viewState || Number(viewState.version) !== 1) return false;
  if (Array.isArray(viewState.selectedLayerKeys)) {
    project.selectedLayerKeys = clone(viewState.selectedLayerKeys);
  }
  if (typeof viewState.activeCell === 'string' || viewState.activeCell === null) {
    project.activeCell = viewState.activeCell;
  }
  if (viewState.maskTransform && typeof viewState.maskTransform === 'object') {
    project.maskTransform = clone(viewState.maskTransform);
  }
  if (viewState.maskSourceMode === 'file' || viewState.maskSourceMode === 'draw') {
    project.maskSourceMode = viewState.maskSourceMode;
  }
  if (Object.hasOwn(viewState, 'maskRoi')) project.maskRoi = clone(viewState.maskRoi);
  if (typeof viewState.maskRoiAnchor === 'string') project.maskRoiAnchor = viewState.maskRoiAnchor;
  if (viewState.activeFace === 'front' || viewState.activeFace === 'back') {
    project.activeFace = viewState.activeFace;
  }
  if (Object.hasOwn(viewState, 'roi')) project.roi = clone(viewState.roi);
  if (typeof viewState.roiAnchor === 'string') project.roiAnchor = viewState.roiAnchor;
  if (viewState.section && typeof viewState.section === 'object') {
    project.section = clone(viewState.section);
  }
  if (viewState.planViews && typeof viewState.planViews === 'object') {
    project.planViews = clone(viewState.planViews);
  }
  if (viewState.display && typeof viewState.display === 'object') {
    project.display = project.display && typeof project.display === 'object' ? project.display : {};
    for (const key of VIEW_DISPLAY_KEYS) {
      if (Object.hasOwn(viewState.display, key)) project.display[key] = clone(viewState.display[key]);
    }
  }
  return true;
}
