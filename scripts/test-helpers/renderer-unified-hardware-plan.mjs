// One hardware invocation, two exact Git revisions, isolated evidence.
import { parseRendererPhaseWindow, rendererPhaseMilestones } from './renderer-v3-phase-window.mjs';
// This manifest is testable without a Windows GPU or a browser.
export const RENDERER_HARDWARE_BRANCHES = Object.freeze({
  v3: 'perf/transparent-renderer-v3-20261009',
  v4: 'perf/renderer-v4-adaptive-tiles-20261010',
});

export const RENDERER_HARDWARE_MODES = Object.freeze(['index', 'caps', 'combined']);

export function buildRendererHardwarePlan(modes = RENDERER_HARDWARE_MODES) {
  if (
    !Array.isArray(modes) ||
    modes.length === 0 ||
    modes.some((mode) => !RENDERER_HARDWARE_MODES.includes(mode)) ||
    new Set(modes).size !== modes.length
  ) {
    throw new Error('Select unique R7 modes: index, caps, combined');
  }
  return [
    {
      id: 'v3',
      branch: 'v3',
      script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
      args: ['--hardware-gpu', '--report-only'],
      artifact: 'test-results/renderer-hardware-fresh-context-ab',
    },
    ...modes.map((mode) => ({
      id: 'v4-' + mode,
      branch: 'v4',
      script: 'scripts/renderer-v4-r7-abba-browser.mjs',
      args: [
        '--hardware-gpu',
        ...(mode === 'index' ? ['--isolate-index'] : mode === 'caps' ? ['--isolate-caps'] : []),
      ],
      artifact:
        'test-results/renderer-v4-r7-hardware-abba' +
        (mode === 'combined' ? '' : '-' + mode + '-only'),
    })),
  ];
}

// Raster isolation produces diagnostic-only evidence; it must never satisfy
// the unchanged production-renderer zero-pixel acceptance gate.
export function buildRendererV3DitherDiagnosticPlan() {
  return [
    {
      id: 'v3-dither-off',
      branch: 'v3',
      script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
      args: ['--hardware-gpu', '--report-only', '--diagnose-no-dither'],
      artifact: 'test-results/renderer-hardware-fresh-context-ab-no-dither',
    },
  ];
}

// Isolate MSAA at context creation; record actual antialias/sample counts.
export function buildRendererV3MsaaDiagnosticPlan() {
  return [
    {
      id: 'v3-msaa-off',
      branch: 'v3',
      script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
      args: ['--hardware-gpu', '--report-only', '--diagnose-no-msaa'],
      artifact: 'test-results/renderer-hardware-fresh-context-ab-no-msaa',
    },
  ];
}

// Resample a previously observed same-policy first-drift interval without
// mutating the product or claiming strict acceptance from diagnostic captures.
export function buildRendererV3PhaseWindowDiagnosticPlan(value) {
  const window = parseRendererPhaseWindow(value);
  if (!window) throw new Error('A phase window is required');
  return [{
    id: 'v3-phase-window',
    branch: 'v3',
    script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
    args: ['--hardware-gpu', '--report-only', `--diagnose-phase-window=${window.low}:${window.high}`],
    artifact: `test-results/renderer-hardware-fresh-context-ab-phase-window-${window.low}-${window.high}`,
    phaseWindow: window,
  }];
}

export function classifyRendererHardwareStep(step, report) {
  if (!report) return step.exitCode === 0 ? 'incomplete' : 'error';
  if (step.id === 'v3-phase-window') {
    if (
      step.exitCode !== 0 ||
      report.error ||
      report.failure ||
      report.phaseWindowDiagnostic !== true ||
      report.acceptanceEligible !== false ||
      report.passed !== false ||
      JSON.stringify(report.phaseWindow) !== JSON.stringify(step.phaseWindow)
    )
      return 'error';
    if (report.stage !== 'completed' || report.trials?.length !== 4) return 'incomplete';
    const expected = rendererPhaseMilestones(step.phaseWindow);
    if (report.trials.some((trial) =>
      trial.phaseCoverage?.mode !== 'draw-milestones' ||
      !Array.isArray(trial.phaseCheckpoints) ||
      trial.phaseCheckpoints.length !== expected.length + 1 ||
      trial.phaseCheckpoints.slice(0, -1).some((checkpoint, i) =>
        checkpoint.afterDraw !== expected[i] ||
        checkpoint.status !== 'valid' ||
        !checkpoint.hash,
      ) ||
      trial.phaseCoverage?.finalFrameCaptured !== true ||
      trial.phaseCheckpoints.at(-1)?.afterDraw !== trial.native?.calls
    ))
      return 'error';
    return 'diagnostic-complete';
  }
  if (step.id === 'v3-msaa-off') {
    if (
      step.exitCode !== 0 ||
      report.error ||
      report.failure ||
      report.diagnosticNoMsaa !== true ||
      report.diagnosticNoDither !== false ||
      report.acceptanceEligible !== false
    )
      return 'error';
    if (report.stage !== 'completed' || report.trials?.length !== 4) return 'incomplete';
    if (
      report.trials.some(
        (trial) =>
          trial.native?.contextAntialias !== false ||
          trial.native?.defaultFramebufferSamples !== 0 ||
          trial.native?.glState?.framebuffer !== 'default',
      )
    ) {
      return 'error';
    }
    return 'diagnostic-complete';
  }
  if (step.id === 'v3-dither-off') {
    if (
      step.exitCode !== 0 ||
      report.error ||
      report.failure ||
      report.diagnosticNoDither !== true ||
      report.acceptanceEligible !== false
    )
      return 'error';
    if (report.stage !== 'completed' || report.trials?.length !== 4) return 'incomplete';
    if (report.trials.some((trial) => !(trial.native?.forcedDitherDisabledDraws > 0))) {
      return 'error';
    }
    return 'diagnostic-complete';
  }
  // A browser/HTTP/fixture exception is an infrastructure failure, not a
  // strict-pixel failure. V3 report-only mode may exit 0 even on an exception.
  if (report.error) return 'error';
  if (report.failure) {
    const failure = String(report.failure);
    const candidateError =
      step.id.startsWith('v4-') &&
      /candidate optimization|Index\/Caps activity|instrumentation counters/.test(failure);
    if (candidateError) return 'candidate-not-exercised';
    // R7 throws *after* writing a complete six-pair report if the strict
    // parity assertion fails. Do not relabel this expected gate as a crash.
    const strictParityFailure =
      step.id.startsWith('v4-') &&
      report.stage === 'complete' &&
      report.passed === false &&
      report.parity?.strictPixelParity === false &&
      report.trials?.length === 4 &&
      report.comparisons?.length === 6 &&
      /^AssertionError \[ERR_ASSERTION\]: R7 strict parity blocked: /.test(failure);
    if (!strictParityFailure) return 'error';
  }
  if (step.exitCode !== 0 && report.passed === true) return 'error';
  if (report.stage === 'initialization') return 'incomplete';
  if (step.id === 'v3') {
    if (report.stage !== 'completed' || report.trials?.length !== 4) return 'incomplete';
    return report.passed === true && report.strictParity === true ? 'passed' : 'blocked';
  }
  if (report.candidateMode !== step.id.slice(3)) return 'error';
  if (
    report.trials
      ?.filter((trial) => trial.policy === 'A' || trial.policy === 'B')
      .some((trial) => trial.candidateActivation?.candidateExercised !== true)
  ) {
    return 'candidate-not-exercised';
  }
  if (report.stage !== 'complete' || report.trials?.length !== 4 || !report.parity) {
    return 'incomplete';
  }
  return report.passed === true && report.parity.strictPixelParity === true ? 'passed' : 'blocked';
}
