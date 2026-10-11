// One hardware invocation, two exact Git revisions, isolated evidence.
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
      args: ['--hardware-rtx3060', '--report-only'],
      artifact: 'test-results/renderer-hardware-fresh-context-ab',
    },
    ...modes.map((mode) => ({
      id: 'v4-' + mode,
      branch: 'v4',
      script: 'scripts/renderer-v4-r7-abba-browser.mjs',
      args: [
        '--hardware-rtx3060',
        ...(mode === 'index' ? ['--isolate-index'] : mode === 'caps' ? ['--isolate-caps'] : []),
      ],
      artifact:
        'test-results/renderer-v4-r7-hardware-abba' +
        (mode === 'combined' ? '' : '-' + mode + '-only'),
    })),
  ];
}

export function classifyRendererHardwareStep(step, report) {
  if (!report) return step.exitCode === 0 ? 'incomplete' : 'error';
  // A browser/HTTP/fixture exception is an infrastructure failure, not a
  // strict-pixel failure. V3 report-only mode may exit 0 even on an exception.
  if (report.error || report.failure) {
    const candidateError =
      step.id.startsWith('v4-') &&
      /candidate optimization|Index\/Caps activity|instrumentation counters/.test(
        String(report.failure || report.error),
      );
    return candidateError ? 'candidate-not-exercised' : 'error';
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
  if (report.trials?.length !== 4 || !report.parity) return 'incomplete';
  return report.passed === true && report.parity.strictPixelParity === true ? 'passed' : 'blocked';
}
