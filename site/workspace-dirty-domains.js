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

function jsonKey(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? '');
  }
}

function selectedLayerKey(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).join('\u0000') : '';
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
    selectedLayerKeys: selectedLayerKey(project?.selectedLayerKeys),
    activeCell: String(project?.activeCell || ''),
    maskTransform: jsonKey(project?.maskTransform),
    maskSourceMode: String(project?.maskSourceMode || ''),
    drawMask: jsonKey(project?.drawMask),
    maskRoi: jsonKey(project?.maskRoi),
    maskRoiAnchor: String(project?.maskRoiAnchor || ''),
    roi: jsonKey(project?.roi),
    roiAnchor: String(project?.roiAnchor || ''),
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
    left.selectedLayerKeys !== right.selectedLayerKeys ||
    left.activeCell !== right.activeCell ||
    left.maskTransform !== right.maskTransform ||
    left.maskSourceMode !== right.maskSourceMode ||
    left.drawMask !== right.drawMask ||
    left.maskRoi !== right.maskRoi ||
    left.maskRoiAnchor !== right.maskRoiAnchor ||
    left.roi !== right.roi ||
    left.roiAnchor !== right.roiAnchor ||
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
    activeFace: project?.activeFace === 'back' ? 'back' : 'front',
    section: clone(project?.section),
    planViews: clone(project?.planViews),
    display,
  };
}

export function applyWorkspaceViewState(project, viewState) {
  if (!project || !viewState || Number(viewState.version) !== 1) return false;
  if (viewState.activeFace === 'front' || viewState.activeFace === 'back') {
    project.activeFace = viewState.activeFace;
  }
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
