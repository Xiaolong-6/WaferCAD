// CPU profiler '(program)' samples with no JavaScript ancestor do not prove
// GPU submission. Report them separately from observed WebGL JS call stacks.
export function classifyLongTaskCpuStacks(profileNodes = [], sampleCounts = new Map()) {
  const nodes = new Map(profileNodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profileNodes) {
    for (const child of node.children || []) parents.set(child, node.id);
  }
  const cache = new Map();
  const ancestry = (id) => {
    if (cache.has(id)) return cache.get(id);
    const path = [];
    let next = id;
    const seen = new Set();
    while (nodes.has(next) && !seen.has(next)) {
      seen.add(next);
      path.push(nodes.get(next)?.callFrame?.functionName || '');
      next = parents.get(next);
    }
    cache.set(id, path);
    return path;
  };
  let totalSamples = 0;
  let rootProgramSamples = 0;
  let webglCallStackSamples = 0;
  for (const [id, count] of sampleCounts) {
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    totalSamples += count;
    const path = ancestry(id);
    if (path[0] === '(program)' && path[1] === '(root)') rootProgramSamples += count;
    if (path.some((name) => name === 'WebGLRenderer.render')) webglCallStackSamples += count;
  }
  return {
    totalSamples,
    rootProgramSamples,
    rootProgramFraction: totalSamples
      ? Math.round((rootProgramSamples / totalSamples) * 1000) / 1000
      : 0,
    webglCallStackSamples,
    webglCallStackFraction: totalSamples
      ? Math.round((webglCallStackSamples / totalSamples) * 1000) / 1000
      : 0,
  };
}
