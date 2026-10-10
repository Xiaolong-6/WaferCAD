// Pure Recipe preflight shared by validation and execution. It must never mutate a model.
export function normalizeRecipeLayerKey(value) {
  const key = String(value ?? '').trim();
  const match = /^(\d+)\s*[|/]\s*(\d+)$/.exec(key);
  return match ? `${Number(match[1])}|${Number(match[2])}` : key;
}

// Legacy canonical rectangle-array files may predate the explicit Recipe
// Base descriptor. Infer only a complete regular grid with its exact radial
// device/background assignment; any ambiguity remains a preflight error.
export function inferRectangularGridRecipeBase(model, base) {
  if (
    model?.kernel !== 'vector-2.5d-array-v1' ||
    model.shape !== 'rect' ||
    base?.shape !== 'rect' ||
    !Array.isArray(model.array?.instances) ||
    model.array.instances.length < 1 ||
    model.array.instances.length > 10000
  )
    return null;
  const instances = model.array.instances;
  const xs = [...new Set(instances.map((x) => x.x))].sort((a, b) => a - b);
  const ys = [...new Set(instances.map((x) => x.y))].sort((a, b) => a - b);
  const columns = xs.length,
    rows = ys.length;
  if (rows * columns !== instances.length || rows < 2 || columns < 2) return null;
  const pitchX = xs[1] - xs[0],
    pitchY = ys[1] - ys[0];
  const width = columns * pitchX,
    height = rows * pitchY;
  if (
    ![pitchX, pitchY, width, height].every((x) => Number.isFinite(x) && x > 0) ||
    Math.abs(width - model.width) > 1e-6 ||
    Math.abs(height - model.height) > 1e-6 ||
    Math.abs(width - base.width) > 1e-6 ||
    Math.abs(height - base.height) > 1e-6
  )
    return null;
  const canonicalX = (column) => Number(((column + 0.5) * pitchX - width / 2).toFixed(4));
  const canonicalY = (row) => Number(((row + 0.5) * pitchY - height / 2).toFixed(4));
  const occupied = new Map();
  let activeSites = 0;
  for (const entry of instances) {
    if (!['device', 'background'].includes(entry.role)) return null;
    const col = xs.indexOf(entry.x),
      row = ys.indexOf(entry.y);
    if (
      col < 0 ||
      row < 0 ||
      entry.x !== canonicalX(col) ||
      entry.y !== canonicalY(row) ||
      entry.id !== 'site-' + (row * columns + col)
    )
      return null;
    const key = row * columns + col;
    if (occupied.has(key)) return null;
    occupied.set(key, entry.role);
    if (entry.role === 'device') activeSites++;
  }
  const ranked = [...occupied.keys()].map((index) => {
    const row = Math.floor(index / columns),
      column = index % columns;
    return { index, row, column, d: Math.hypot(canonicalX(column), canonicalY(row)) };
  });
  ranked.sort((a, b) => a.d - b.d || a.row - b.row || a.column - b.column);
  const active = new Set(ranked.slice(0, activeSites).map((entry) => entry.index));
  for (const [index, role] of occupied) {
    if ((role === 'device') !== active.has(index)) return null;
  }
  if (
    model.array.templates?.some(
      ({ model: leaf }) =>
        Math.abs(leaf.width - pitchX) > 1e-6 || Math.abs(leaf.height - pitchY) > 1e-6,
    )
  )
    return null;
  return { kind: 'rect-grid', rows, columns, pitchX, pitchY, activeSites };
}

export function validateRecipeExecution(
  steps,
  {
    model = null,
    maskState = null,
    base = null,
    limit = steps.length,
    startMode = 'continue',
  } = {},
) {
  const errors = [];
  const warnings = [];
  if (
    startMode === 'new-base' &&
    model?.kernel === 'vector-2.5d-array-v1' &&
    !base?.array &&
    !inferRectangularGridRecipeBase(model, base)
  ) {
    errors.push(
      'Rebuild Base is unavailable: canonical array Recipe has no verified reconstructible Base.',
    );
  }
  const total = Math.min(steps.length, Math.max(0, Math.trunc(Number(limit) || 0)));
  const layers = model?.layers || [];
  const startingLayers =
    startMode === 'new-base'
      ? layers.filter((layer) => layer.id === 'base' || layer.id === 'substrate')
      : layers;
  if (startMode === 'new-base' && startingLayers.length === 0 && layers.length) {
    startingLayers.push(layers[0]);
  }
  const materials = new Set(
    startMode === 'new-base' && base
      ? [base.material]
      : startMode === 'new-base'
        ? ['Base']
        : startingLayers.map((layer) => layer.name),
  );
  const layout = maskState?.layout;
  const existingKeys = layout?.elements
    ? new Set(layout.elements.map((element) => `${element.layer}|${element.datatype ?? 0}`))
    : null;

  for (const [index, step] of steps.slice(0, total).entries()) {
    const prefix = `Step ${index + 1}`;
    const params = step.params || {};
    if (step.command === 'extend' && !materials.has(params.material)) {
      errors.push(
        `${prefix}: material "${params.material}" does not exist in the starting model or preceding Steps.`,
      );
    }
    if (step.command === 'etch' && params.target && !materials.has(params.target)) {
      errors.push(
        `${prefix}: etch target "${params.target}" does not exist in the starting model or preceding Steps.`,
      );
    }
    if (step.command === 'liftoff' && !materials.has(params.sacrificial)) {
      errors.push(
        `${prefix}: lift-off sacrificial layer "${params.sacrificial}" does not exist in the starting model or preceding Steps.`,
      );
    }
    if (step.command === 'deposit') materials.add(params.material);
    if (['snapshot', 'record'].includes(step.command) || !['mask', 'invert'].includes(params.area))
      continue;

    const mask = params.mask;
    if (!mask) {
      errors.push(`${prefix}: capture a Mask context for ${params.area} area.`);
      continue;
    }
    if (mask.sourceMode === 'draw') {
      if (!mask.drawMask?.shapes?.length) {
        errors.push(`${prefix}: captured Draw Mask contains no shapes.`);
      }
      continue;
    }
    const keys = (mask.layerKeys || []).map(normalizeRecipeLayerKey);
    if (!keys.length) {
      errors.push(`${prefix}: captured file Mask has no selected layers.`);
      continue;
    }
    if (
      layout?.root &&
      mask.cell &&
      mask.cell !== layout.root &&
      !Object.hasOwn(layout.hierarchy || {}, mask.cell)
    ) {
      errors.push(`${prefix}: Mask cell "${mask.cell}" is missing from the current layout.`);
    }
    if (existingKeys) {
      for (const key of keys) {
        if (!existingKeys.has(key)) {
          errors.push(`${prefix}: Mask layer "${key}" is missing from the current layout.`);
        }
      }
    } else {
      warnings.push(`${prefix}: imported Mask layers could not be verified before execution.`);
    }
  }
  if (!total) warnings.push('Recipe has no steps to execute.');
  return { errors, warnings, total };
}
