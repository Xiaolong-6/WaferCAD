// Model arrays own physical regions in shared templates instead of root regions.
// Presentation counts must not imply that a valid array is empty.
export function modelInventoryCount(model) {
  if (Array.isArray(model?.array?.instances))
    return `${model.array.instances.length.toLocaleString('en-US')} instances`;
  return `${model?.regions?.length ?? 0} regions`;
}
