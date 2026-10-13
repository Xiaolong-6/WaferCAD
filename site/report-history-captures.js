import { planHistoryKeyframes } from './report-keyframe-plan.js';

export const MAX_HISTORY_SVG_BYTES = 2 * 1024 * 1024;
export const MAX_HISTORY_SVG_TOTAL_BYTES = 24 * 1024 * 1024;
const encoder = new TextEncoder();

function samePair(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 2 &&
    b.length === 2 &&
    a.every((value, index) => Number.isFinite(value) && value === b[index])
  );
}

export function historicalSectionPath(number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new RangeError('Invalid Step number.');
  return `history/figures/section-step-${String(number).padStart(4, '0')}.svg`;
}

// The renderer cannot authenticate its own input. Only this orchestrator may
// mark a figure verified, after reading the exact ID from the live Snapshot
// Manager's read-only API and checking the saved model/Section source.
export async function captureHistorySections({
  data,
  readNodeState,
  render,
  signal = null,
  onProgress = () => {},
  maxImages = 24,
} = {}) {
  if (!data || typeof readNodeState !== 'function' || typeof render !== 'function') {
    throw new TypeError('History data, a read-only state source and renderer are required.');
  }
  const plan = planHistoryKeyframes({
    history: data.steps,
    branches: data.branches,
    bookmarks: data.bookmarks,
    mode: 'compact',
    maxImages,
    views: ['section'],
  });
  const byId = new Map(data.steps.map((step) => [step.id, step]));
  const figures = [];
  const failures = [];
  let totalBytes = 0;
  for (let index = 0; index < plan.keyframes.length; index++) {
    if (signal?.aborted) return { aborted: true, figures: [], failures: [] };
    const frame = plan.keyframes[index];
    const descriptor = byId.get(frame.nodeId);
    onProgress(index + 1, plan.keyframes.length, frame);
    try {
      const state = await readNodeState(frame.nodeId);
      if (!state?.model || !state?.section) throw new Error('saved-state-unavailable');
      if (
        !Number.isInteger(descriptor?.processRevision) ||
        state.model.processRevision !== descriptor.processRevision
      ) {
        throw new Error('process-revision-mismatch');
      }
      const response = await render({ state, nodeId: frame.nodeId, signal });
      if (signal?.aborted || response?.aborted) return { aborted: true, figures: [], failures: [] };
      if (response?.error) throw new Error(response.error);
      const evidence = response?.evidence;
      if (
        evidence?.nodeId !== frame.nodeId ||
        evidence?.view !== 'section' ||
        evidence?.provenanceVerified !== false ||
        !samePair(evidence.lineAUm, state.section.a) ||
        !samePair(evidence.lineBUm, state.section.b) ||
        !Number.isFinite(evidence.pixelsPerUm) ||
        evidence.pixelsPerUm <= 0 ||
        !Number.isInteger(evidence.physicalSliceCount) ||
        evidence.physicalSliceCount < 1 ||
        evidence.geometrySynthesized !== false ||
        evidence.zBreak !== false ||
        !Array.isArray(evidence.layerIds) ||
        !evidence.layerIds.every((id) => state.model.layers?.some((layer) => layer.id === id))
      ) {
        throw new Error('section-evidence-mismatch');
      }
      const svg = response?.svg;
      if (
        typeof svg !== 'string' ||
        !svg.startsWith('<svg ') ||
        !svg.trimEnd().endsWith('</svg>') ||
        /<script\b|<foreignObject\b|\bon[a-z]+\s*=/i.test(svg)
      ) {
        throw new Error('invalid-section-svg');
      }
      const byteCount = encoder.encode(svg).byteLength;
      if (byteCount > MAX_HISTORY_SVG_BYTES) throw new Error('svg-size-limit');
      if (byteCount + totalBytes > MAX_HISTORY_SVG_TOTAL_BYTES) {
        failures.push({
          nodeId: frame.nodeId,
          number: frame.number,
          reason: 'total-svg-budget-exceeded',
        });
        break;
      }
      totalBytes += byteCount;
      figures.push({
        nodeId: frame.nodeId,
        number: frame.number,
        branchId: frame.branchId,
        processRevision: descriptor.processRevision,
        path: historicalSectionPath(frame.number),
        svg,
        evidence: {
          ...evidence,
          sourceNodeId: frame.nodeId,
          sourceProcessRevision: descriptor.processRevision,
          provenanceVerified: true,
        },
      });
    } catch (error) {
      if (signal?.aborted) return { aborted: true, figures: [], failures: [] };
      failures.push({
        nodeId: frame.nodeId,
        number: frame.number,
        reason: String(error?.message || 'historical-render-failed').slice(0, 160),
      });
    }
  }
  return { aborted: false, figures, failures };
}
