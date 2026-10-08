// Pure Recipe preflight shared by validation and execution. It must never mutate a model.
export function normalizeRecipeLayerKey(value) {
  const key = String(value ?? '').trim();
  const match = /^(\d+)\s*[|/]\s*(\d+)$/.exec(key);
  return match ? `${Number(match[1])}|${Number(match[2])}` : key;
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
