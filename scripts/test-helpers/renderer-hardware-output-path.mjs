// Shared output-path contract for the fresh-context browser runner and
// the unified hardware evidence collector. This runs without WebGL.
const BASE = 'test-results/renderer-hardware-fresh-context-ab';

export function rendererFreshContextEvidencePath({
  diagnosticNoDither = false,
  diagnosticNoMsaa = false,
  diagnosticPreservedMsaa = false,
  phaseWindow = null,
  focusWindowDiagnostic = false,
} = {}) {
  const rasterModes = [diagnosticNoDither, diagnosticNoMsaa, diagnosticPreservedMsaa];
  if (rasterModes.filter(Boolean).length > 1) {
    throw new Error('Conflicting hardware raster diagnostics');
  }
  if (phaseWindow && rasterModes.some(Boolean)) {
    throw new Error('Phase-window evidence cannot mix raster diagnostics');
  }
  if (focusWindowDiagnostic && (phaseWindow?.low !== 128 || phaseWindow?.high !== 384)) {
    throw new Error('R9 focus evidence requires the 128:384 phase window');
  }
  if (diagnosticNoDither) return BASE + '-no-dither';
  if (diagnosticNoMsaa) return BASE + '-no-msaa';
  if (diagnosticPreservedMsaa) return BASE + '-preserved-msaa';
  if (!phaseWindow) return BASE;
  const phase = BASE + '-phase-window-' + phaseWindow.low + '-' + phaseWindow.high;
  return focusWindowDiagnostic ? phase + '-focused-129-154' : phase;
}
