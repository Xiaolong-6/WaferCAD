// Workstation presentation render policy.
// Model/scientific invalidation must remain explicit for domain mutations;
// mobile navigation updates stable adapter hosts and their onShow hooks only.
export function createWorkstationRenderScheduler({
  isStarting,
  renderShell,
  invalidateScientific,
  invalidateVisibleView,
  scheduleLayout,
}) {
  return function render(options) {
    if (isStarting()) return;
    renderShell();
    // A few legacy callback sites pass opaque or null arguments.
    // Only the explicit navigation policy skips scientific invalidation.
    if (options?.scientificView) invalidateVisibleView(options.scientificView);
    else if (options?.scientific !== false) invalidateScientific();
    scheduleLayout();
  };
}
