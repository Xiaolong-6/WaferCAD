// Keyframe selection policy for a future independent historical image renderer.
// A plan is evidence metadata, not a generated figure or a rendered geometry proof.
const DEFAULT_CONFIG = Object.freeze({
  compact: Object.freeze({ maxImages: 24, views: ['section'] }),
  standard: Object.freeze({ maxImages: 96, views: ['main', 'section'] }),
});

const STRUCTURAL_KINDS = new Set(['add', 'grow', 'etch', 'liftoff', 'implant', 'electrical']);

function clampBudget(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new RangeError('The image budget must be an integer from 0 to 10000.');
  }
  return value;
}

function uniqueViews(views) {
  if (!Array.isArray(views) || !views.length) {
    throw new TypeError('At least one inspection view is required.');
  }
  const supported = new Set(['main', 'mask', 'section', 'three']);
  const result = [];
  for (const view of views) {
    if (!supported.has(view)) throw new Error('Unknown keyframe view.');
    if (!result.includes(view)) result.push(view);
  }
  return result;
}

function validNode(node) {
  return node && typeof node.id === 'string' && node.id.length > 0;
}

function kind(node) {
  return String(node?.operation?.kind || node?.operation?.replay?.params?.type || 'unknown');
}

function quality(node) {
  const value = kind(node);
  return value === 'record' ? 0 : STRUCTURAL_KINDS.has(value) ? 2 : 1;
}

function compare(a, b) {
  return a.number - b.number || String(a.id).localeCompare(String(b.id));
}

export function planHistoryKeyframes({
  history,
  branches = [],
  bookmarks = [],
  mode = 'compact',
  maxImages = null,
  views = null,
} = {}) {
  if (!Array.isArray(history) || !Array.isArray(branches) || !Array.isArray(bookmarks)) {
    throw new TypeError('History, Variants, and Bookmarks must be arrays.');
  }
  if (!Object.hasOwn(DEFAULT_CONFIG, mode)) throw new Error('Unknown keyframe mode.');
  const preset = DEFAULT_CONFIG[mode];
  const chosenViews = uniqueViews(views || preset.views);
  const imageBudget = clampBudget(maxImages == null ? preset.maxImages : maxImages);
  const keyframeBudget = Math.floor(imageBudget / chosenViews.length);
  const indexed = history.filter(validNode).map((node, index) => ({
    ...node,
    number: Number.isInteger(node.number) ? node.number : index + 1,
  }));
  if (new Set(indexed.map((node) => node.id)).size !== indexed.length) {
    throw new Error('Duplicate History node ID in keyframe planner.');
  }
  const byId = new Map(indexed.map((node) => [node.id, node]));
  const byBranch = new Map();
  for (const node of indexed) {
    const group = byBranch.get(node.branchId) || [];
    group.push(node);
    byBranch.set(node.branchId, group);
  }
  for (const group of byBranch.values()) group.sort(compare);
  const reasons = new Map();
  const missingReferences = new Map();
  const register = (id, reason) => {
    if (!id) return;
    if (!byId.has(id)) {
      if (!missingReferences.has(id)) missingReferences.set(id, new Set());
      missingReferences.get(id).add(reason);
      return;
    }
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id).add(reason);
  };
  if (indexed.length) {
    register(indexed[0].id, 'history-first');
    register(indexed.at(-1).id, 'history-last');
  }
  const variants = [...branches].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const branch of variants) {
    register(branch.rootNodeId, 'variant-origin');
    register(branch.headNodeId, 'variant-head');
  }
  for (const group of byBranch.values()) {
    if (group.length) register(group[0].id, 'variant-first-step');
  }
  for (const bookmark of bookmarks) register(bookmark.historyNodeId, 'bookmark');

  const eligible = indexed.filter((node) => node.restorable === true).sort(compare);
  const available = new Set(eligible.map((node) => node.id));
  const reserved = [...reasons]
    .map(([id, values]) => ({
      node: byId.get(id),
      reasons: [...values].sort(),
      priority: values.has('variant-head')
        ? 0
        : values.has('history-first') || values.has('history-last')
          ? 1
          : values.has('bookmark')
            ? 2
            : 3,
    }))
    .sort((a, b) => a.priority - b.priority || compare(a.node, b.node));
  const unavailableAnchors = reserved
    .filter(({ node }) => !available.has(node.id))
    .map(({ node, reasons: names }) => ({
      nodeId: node.id,
      number: node.number,
      reasons: names,
      reason: 'no-restorable-state',
    }));
  const selected = new Map();
  const omitted = [];
  function add(node, reasonNames) {
    if (selected.has(node.id)) {
      for (const reason of reasonNames) selected.get(node.id).reasons.add(reason);
      return true;
    }
    if (selected.size >= keyframeBudget) return false;
    selected.set(node.id, {
      nodeId: node.id,
      number: node.number,
      branchId: node.branchId,
      operationKind: kind(node),
      reasons: new Set(reasonNames),
      source: 'saved-history-state',
      status: 'planned',
    });
    return true;
  }
  // Protect final Variant states, then endpoints, then distribute Bookmarks
  // across the timeline. Overflow remains explicit; no mandatory image is
  // silently added beyond the hard budget.
  for (let priority = 0; priority <= 3; priority++) {
    const tier = reserved.filter(
      (item) => item.priority === priority && available.has(item.node.id),
    );
    const remaining = Math.max(0, keyframeBudget - selected.size);
    const positions = new Set();
    if (remaining >= tier.length) {
      for (let index = 0; index < tier.length; index++) positions.add(index);
    } else if (remaining > 0) {
      for (let index = 0; index < remaining; index++) {
        positions.add(Math.floor(((index + 0.5) * tier.length) / remaining));
      }
    }
    tier.forEach((item, index) => {
      if (positions.has(index)) add(item.node, item.reasons);
      else {
        omitted.push({
          nodeId: item.node.id,
          number: item.node.number,
          reasons: item.reasons,
          reason: 'image-budget-exceeded',
        });
      }
    });
  }
  // Choose far-apart structural steps first. Markers without a known
  // structural effect (e.g. Record) receive images only if explicitly anchored.
  // Kind determines eligibility, not the magnitude of a geometry change.
  const fillers = eligible.filter((node) => quality(node) > 0 && !selected.has(node.id));
  const distances = new Map();
  for (const node of fillers) {
    const anchors = [...selected.values()].filter((entry) => entry.branchId === node.branchId);
    distances.set(
      node.id,
      anchors.length
        ? Math.min(...anchors.map((entry) => Math.abs(node.number - entry.number)))
        : indexed.length,
    );
  }
  while (selected.size < keyframeBudget && fillers.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < fillers.length; index++) {
      const node = fillers[index];
      const score = distances.get(node.id) * 4 + quality(node);
      if (
        score > bestScore ||
        (score === bestScore && bestIndex >= 0 && compare(node, fillers[bestIndex]) < 0)
      ) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex < 0) break;
    const [best] = fillers.splice(bestIndex, 1);
    add(best, ['coverage-sample']);
    for (const node of fillers) {
      if (node.branchId !== best.branchId) continue;
      distances.set(node.id, Math.min(distances.get(node.id), Math.abs(node.number - best.number)));
    }
  }
  const keyframes = [...selected.values()]
    .sort((a, b) => a.number - b.number)
    .map((entry) => ({ ...entry, reasons: [...entry.reasons].sort() }));
  return {
    format: 'wafercad-keyframe-plan',
    schema: 1,
    mode,
    imageBudget,
    keyframeBudget,
    views: chosenViews,
    plannedImages: keyframes.length * chosenViews.length,
    keyframes,
    unavailableAnchors,
    omittedAnchors: omitted,
    unresolvedReferences: [...missingReferences]
      .map(([nodeId, values]) => ({
        nodeId,
        reasons: [...values].sort(),
        reason: 'unknown-history-node',
      }))
      .sort((a, b) => String(a.nodeId).localeCompare(String(b.nodeId))),
    eligibleHistoryNodes: eligible.length,
    historyNodeCount: indexed.length,
    generatedImages: 0,
  };
}
