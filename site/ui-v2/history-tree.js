// Pure Step-first History graph projection. Owns no selection, model or transactions.
(() => {
  function build(history, branches) {
    const nodes = new Map(history.map((node) => [node.id, node]));
    const byId = new Map(branches.map((branch) => [branch.id, branch]));

    function branchNode(id, rootNodeId, ancestors = new Set()) {
      if (ancestors.has(id)) return null;
      const branch = byId.get(id);
      if (!branch) return null;
      const nextAncestors = new Set(ancestors).add(id);
      let step = history.find(
        (node) => node.branchId === id && node.parentId === (rootNodeId ?? null),
      );
      const steps = [];
      while (step && !steps.some((item) => item.node.id === step.id)) {
        const childBranches = branches
          .filter((child) => child.parentBranchId === id && child.rootNodeId === step.id)
          .map((child) => branchNode(child.id, child.rootNodeId, nextAncestors))
          .filter(Boolean);
        steps.push({ node: step, variants: childBranches });
        step = history.find((node) => node.branchId === id && node.parentId === step.id);
      }
      return { branch, origin: nodes.get(rootNodeId) || null, steps };
    }

    const roots = branches.filter((branch) => !branch.parentBranchId);
    return roots.map((branch) => branchNode(branch.id, null)).filter(Boolean);
  }

  globalThis.WaferCadV2HistoryTree = Object.freeze({ build });
})();
