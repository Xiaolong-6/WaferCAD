// Keep the 3D view responsive when a bounded scientific geometry build rejects.
// Failure is explicit: never present the previous full wafer as a valid ROI.
export function describeRendererBuildFailure(error, { roi = false } = {}) {
  const detail = error instanceof Error ? error.message : String(error);
  const pointBudget = /bounded geometry point budget/i.test(detail);
  return {
    code: pointBudget ? 'geometry-point-budget' : 'build-failed',
    detail,
    label:
      roi && pointBudget
        ? '3D ROI exceeds geometry limit · reduce or clear ROI'
        : '3D rendering failed · change view or clear ROI',
  };
}

export function setRendererBuildFailure(host, stats, error, options = {}) {
  const failure = describeRendererBuildFailure(error, options);
  host.dataset.renderState = 'error';
  host.dataset.renderPhase = 'failed';
  host.dataset.rendererErrorCode = failure.code;
  host.dataset.renderError = failure.detail;
  stats.textContent = failure.label;
  return failure;
}

export function clearRendererBuildFailure(host) {
  delete host.dataset.renderError;
  delete host.dataset.rendererErrorCode;
}
