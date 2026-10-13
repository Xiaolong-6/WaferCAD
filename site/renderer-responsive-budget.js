// Cooperative *main-thread* scene assembly, not preemptible WebGL submission.
// Every individual geometry unit may exceed budget; the scheduler yields only
// between complete units, after an animation frame and another task boundary.
export async function runRendererUnitsInSlices(
  units,
  applyUnit,
  {
    now,
    yieldControl,
    isCurrent = () => true,
    foregroundBusy = () => false,
    budgetMs = 8,
    maxUnitsPerSlice = 8,
  } = {},
) {
  if (
    typeof applyUnit !== 'function' ||
    typeof now !== 'function' ||
    typeof yieldControl !== 'function' ||
    !(Number.isFinite(budgetMs) && budgetMs > 0) ||
    !(Number.isSafeInteger(maxUnitsPerSlice) && maxUnitsPerSlice >= 1)
  ) {
    throw new TypeError('Renderer slice scheduler requires callbacks and positive bounds');
  }

  let processed = 0;
  let yields = 0;
  let maxUnitMs = 0;
  let sliceStartedAt = now();
  let sliceUnits = 0;
  const interrupted = () => ({ completed: false, processed, yields, maxUnitMs });

  for (const unit of units) {
    if (!isCurrent()) return interrupted();
    while (foregroundBusy()) {
      yields++;
      await yieldControl();
      if (!isCurrent()) return interrupted();
      sliceStartedAt = now();
      sliceUnits = 0;
    }
    if (sliceUnits >= maxUnitsPerSlice || now() - sliceStartedAt >= budgetMs) {
      yields++;
      await yieldControl();
      if (!isCurrent()) return interrupted();
      sliceStartedAt = now();
      sliceUnits = 0;
    }
    const unitStart = now();
    applyUnit(unit);
    maxUnitMs = Math.max(maxUnitMs, now() - unitStart);
    processed++;
    sliceUnits++;
  }
  return { completed: true, processed, yields, maxUnitMs };
}
