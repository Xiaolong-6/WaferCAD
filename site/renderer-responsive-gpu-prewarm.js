// Experimental, foreground-aware WebGL upload warm-up. Draw to a tiny
// offscreen target with the existing renderer; no second WebGL context,
// scientific mesh mutation, or approximation of the committed scene.
// This can slice BETWEEN renderer.render calls, never inside a GL upload.
export function collectRendererGpuUploadUnits(objects) {
  const geometries = new Set();
  const units = [];
  for (const object of objects || []) {
    if (!(object?.isMesh || object?.isLine || object?.isPoints)) continue;
    const geometry = object.geometry;
    if (!geometry?.getAttribute?.('position')?.count || geometries.has(geometry)) continue;
    geometries.add(geometry);
    units.push(object);
  }
  return units;
}

export async function prewarmRendererGpuUploads(
  units,
  warmBatch,
  {
    now,
    yieldControl,
    isCurrent = () => true,
    foregroundBusy = () => false,
    maxUnitsPerBatch = 4,
  } = {},
) {
  if (
    !Array.isArray(units) ||
    typeof warmBatch !== 'function' ||
    typeof now !== 'function' ||
    typeof yieldControl !== 'function' ||
    !Number.isSafeInteger(maxUnitsPerBatch) ||
    maxUnitsPerBatch < 1
  ) {
    throw new TypeError('GPU prewarm requires units, callbacks, and a positive batch bound');
  }
  let uploadedUnits = 0;
  let batches = 0;
  let yields = 0;
  let maxBatchMs = 0;
  const snapshot = (completed) => ({
    completed,
    uploadedUnits,
    batches,
    yields,
    maxBatchMs,
  });

  while (uploadedUnits < units.length) {
    if (!isCurrent()) return snapshot(false);
    while (foregroundBusy()) {
      yields++;
      await yieldControl();
      if (!isCurrent()) return snapshot(false);
    }
    const batch = units.slice(uploadedUnits, uploadedUnits + maxUnitsPerBatch);
    const start = now();
    await warmBatch(batch);
    maxBatchMs = Math.max(maxBatchMs, now() - start);
    uploadedUnits += batch.length;
    batches++;
    if (!isCurrent()) return snapshot(false);
    if (uploadedUnits < units.length) {
      // Allow an input task and a paint opportunity before the next GPU batch.
      yields++;
      await yieldControl();
    }
  }
  return snapshot(true);
}
