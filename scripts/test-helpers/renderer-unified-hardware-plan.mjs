// One hardware invocation, two exact Git revisions, isolated evidence.
import {
  checkRendererPhaseCapture,
  parseRendererPhaseWindow,
  rendererPhaseMilestones,
} from './renderer-v3-phase-window.mjs';
// This manifest is testable without a Windows GPU or a browser.
export const RENDERER_HARDWARE_BRANCHES = Object.freeze({
  v3: 'perf/transparent-renderer-v3-20261009',
  v4: 'perf/renderer-v4-adaptive-tiles-20261010',
});

// PR #166 closed and its source branch was deleted. This exact final PR
// revision is an ancestor of the V4 branch and remains retrievable through
// that history. Never silently replace it with the current V4 HEAD.
export const RENDERER_HARDWARE_V3_PINNED_SHA = '4e7128042fb5ef86908e4ee7e3df7084ae7ce52f';

// Fetch only the still-existing V4 branch; V3 is checked out by immutable SHA.
// Keep this command pure so a regression test catches deleted-ref fetches.
export function buildRendererHardwareFetchArgs() {
  const branch = RENDERER_HARDWARE_BRANCHES.v4;
  return ['fetch', '--no-tags', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`];
}

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

// One operator-assisted GPU session: baseline integrity, one isolated
// raster hypothesis, then independently attributable V4 candidates.
// This reuses a single dependency installation and preserves a single ZIP.
// Never accept the diagnostic arm as a production-renderer pass.
// Candidate-only no-MSAA isolation: never a production acceptance run, and
// never repeats the expensive full-wafer V3 baseline in the same campaign.
export function buildRendererR9V4NoMsaaDiagnosticPlan(modes = RENDERER_HARDWARE_MODES) {
  return buildRendererHardwarePlan(modes)
    .slice(1)
    .map((original) => ({
      ...original,
      id: original.id + '-msaa-off',
      args: [...original.args, '--diagnose-no-msaa'],
      artifact: original.artifact + '-no-msaa',
    }));
}

// One 4x-MSAA hypothesis: preserve the default framebuffer through browser
// presentation. Run V3's OFF/OFF/ON/ON evidence collector on current V4 source;
// archived V3 git objects and all product rendering settings remain untouched.
export function buildRendererR9PreservedMsaaPlan() {
  return [
    {
      id: 'v4-preserved-msaa',
      branch: 'v4',
      script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
      args: ['--hardware-gpu', '--report-only', '--diagnose-preserved-msaa'],
      artifact: 'test-results/renderer-hardware-fresh-context-ab-preserved-msaa',
    },
  ];
}

export function buildRendererR9HardwareCampaignPlan() {
  const regular = buildRendererHardwarePlan();
  return [regular[0], ...buildRendererV3MsaaDiagnosticPlan(), ...regular.slice(1)];
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
  return [
    {
      id: 'v3-phase-window',
      branch: 'v3',
      script: 'scripts/renderer-electrical-fresh-context-ab.mjs',
      args: [
        '--hardware-gpu',
        '--report-only',
        `--diagnose-phase-window=${window.low}:${window.high}`,
      ],
      artifact: `test-results/renderer-hardware-fresh-context-ab-phase-window-${window.low}-${window.high}`,
      phaseWindow: window,
    },
  ];
}

export function classifyRendererHardwareStep(step, report) {
  if (step.id === 'v4-preserved-msaa') {
    if (
      step.exitCode !== 0 ||
      report?.error ||
      report?.failure ||
      report?.diagnosticPreservedMsaa !== true ||
      report?.diagnosticNoMsaa !== false ||
      report?.acceptanceEligible !== false ||
      report?.passed !== false ||
      report?.stage !== 'completed' ||
      report?.trials?.length !== 4 ||
      report?.comparisons?.length !== 3 ||
      typeof report?.strictParity !== 'boolean'
    )
      return 'error';
    const expectedLabels = ['1-OFF', '2-OFF', '3-ON', '4-ON'];
    const expectedPairs = [
      ['1-OFF', '2-OFF', true],
      ['3-ON', '4-ON', true],
      ['1-OFF', '3-ON', false],
    ];
    if (
      report.trials.some((trial, i) => trial.label !== expectedLabels[i]) ||
      report.comparisons.some(
        (comparison, i) =>
          comparison.first !== expectedPairs[i][0] ||
          comparison.second !== expectedPairs[i][1] ||
          comparison.samePolicy !== expectedPairs[i][2] ||
          typeof comparison.pixelDifference?.pixelIdentical !== 'boolean' ||
          typeof comparison.framebufferIdentical !== 'boolean',
      )
    )
      return 'error';
    const adapter = report.trials[0].backend?.adapter;
    if (
      !adapter ||
      report.trials.some(
        (trial) =>
          trial.backend?.hardwareVerified !== true ||
          trial.backend.adapter !== adapter ||
          trial.native?.contextAntialias !== true ||
          trial.native?.contextPreserveDrawingBuffer !== true ||
          trial.native?.defaultFramebufferSamples !== 4 ||
          trial.native?.glState?.framebuffer !== 'default' ||
          !checkRendererPhaseCapture({
            checkpoints: trial.phaseCheckpoints,
            coverage: trial.phaseCoverage,
            milestones: rendererPhaseMilestones(null),
            drawCalls: trial.native?.calls,
            framebuffer: trial.native?.framebuffer,
            requireRasterState: true,
          }).valid,
      )
    )
      return 'error';
    return 'diagnostic-complete';
  }
  if (!report) return step.exitCode === 0 ? 'incomplete' : 'error';
  if (step.id.startsWith('v4-') && step.id.endsWith('-msaa-off')) {
    const candidate = step.id.slice(3, -'-msaa-off'.length);
    if (report.error || report.failure) return 'error';
    if (
      step.exitCode !== 0 ||
      report.diagnosticNoMsaa !== true ||
      report.acceptanceEligible !== false ||
      report.passed !== false ||
      report.diagnosticComplete !== true ||
      report.candidateMode !== candidate ||
      report.stage !== 'complete' ||
      report.trials?.length !== 4 ||
      report.comparisons?.length !== 6 ||
      !report.parity
    )
      return 'error';
    if (
      report.trials.some(
        (trial) =>
          trial.rasterIsolation?.contextAntialias !== false ||
          trial.rasterIsolation?.defaultFramebufferSamples !== 0 ||
          trial.rasterIsolation?.defaultFramebuffer !== true,
      )
    )
      return 'error';
    if (report.trials.some((trial) => !trial.backend?.hardwareVerified)) return 'error';
    if (report.trials.some((trial) => trial.candidateActivation?.candidateExercised !== true)) {
      return 'candidate-not-exercised';
    }
    return 'diagnostic-complete';
  }
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
    if (
      report.trials.some(
        (trial) =>
          !checkRendererPhaseCapture({
            checkpoints: trial.phaseCheckpoints,
            coverage: trial.phaseCoverage,
            milestones: expected,
            drawCalls: trial.native?.calls,
            framebuffer: trial.native?.framebuffer,
            requireRasterState: true,
          }).valid,
      )
    )
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
    if (report.acceptanceEligible !== true) return 'error';
    if (
      report.trials.some(
        (trial) =>
          !checkRendererPhaseCapture({
            checkpoints: trial.phaseCheckpoints,
            coverage: trial.phaseCoverage,
            milestones: rendererPhaseMilestones(null),
            drawCalls: trial.native?.calls,
            framebuffer: trial.native?.framebuffer,
            requireRasterState: true,
          }).valid,
      )
    )
      return 'error';
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
