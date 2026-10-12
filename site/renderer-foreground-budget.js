// Cooperative CPU assembly policy. It never changes scientific geometry or pixel output.
// A fresh browser task is necessary: rAF callbacks still run before the paint.
export const FOREGROUND_ASSEMBLY_BUDGET_MS = 8;

export function shouldYieldForegroundAssembly({ enabled, elapsedMs, budgetMs = FOREGROUND_ASSEMBLY_BUDGET_MS } = {}) {
  return enabled === true && Number.isFinite(elapsedMs) && elapsedMs >= budgetMs;
}

export function yieldToForeground() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
