// Presentation-only empty-state helpers. The model and canvas remain untouched.
export function isBaseOnlyModel(model) {
  if (
    !model ||
    model.array ||
    model.layers?.length !== 1 ||
    model.layers[0]?.id !== 'base' ||
    model.regions?.length !== 1 ||
    (model.processRevision ?? 0) !== 0 ||
    (model.implants?.length ?? 0) > 0 ||
    (model.electricalRegions?.length ?? 0) > 0
  )
    return false;
  const stack = model.regions[0]?.stack;
  return stack?.length === 1 && stack[0]?.layerId === 'base';
}

export function isEmptyActiveMask(state) {
  if (!state) return false;
  return state.maskSourceMode === 'draw'
    ? (state.drawMask?.shapes?.length ?? 0) === 0
    : (state.layout?.elements?.length ?? 0) === 0;
}

export function createEmptyHint({ label, parts }) {
  const node = document.createElement('div');
  node.className = 'v2-empty-hint';
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', label);
  node.hidden = true;
  const line = document.createElement('p');
  for (const part of parts) {
    if (typeof part === 'string') {
      line.append(document.createTextNode(part));
      continue;
    }
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'v2-empty-action';
    control.textContent = part.text;
    control.addEventListener('click', part.onClick);
    line.append(control);
  }
  node.append(line);
  return {
    node,
    update(empty) {
      node.hidden = !empty;
    },
  };
}
