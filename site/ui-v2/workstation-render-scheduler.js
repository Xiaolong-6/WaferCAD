// Workstation presentation render policy.
// Model/scientific invalidation must remain explicit for domain mutations;
// mobile navigation updates stable adapter hosts and their onShow hooks only.
export function createWorkstationRenderScheduler({
  isStarting,
  renderShell,
  invalidateScientific,
  scheduleLayout,
}) {
  return function render({ scientific = true } = {}) {
    if (isStarting()) return;
    renderShell();
    if (scientific) invalidateScientific();
    scheduleLayout();
  };
}
