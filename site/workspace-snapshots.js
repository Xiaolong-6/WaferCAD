function clone(value) {
  return structuredClone(value);
}

function createStateCloner() {
  const layoutAssets = new WeakMap();
  const modelAssets = new WeakMap();

  function cloneLayout(layout) {
    if (!layout || typeof layout !== 'object') return clone(layout);
    const key = Array.isArray(layout.elements) ? layout.elements : layout;
    const cached = layoutAssets.get(key);
    if (
      cached &&
      cached.linework === layout.linework &&
      cached.combos === layout.combos &&
      cached.hierarchy === layout.hierarchy &&
      cached.units === layout.units &&
      cached.name === layout.name &&
      cached.root === layout.root
    ) {
      return cached.clone;
    }
    const stored = clone(layout);
    layoutAssets.set(key, {
      clone: stored,
      linework: layout.linework,
      combos: layout.combos,
      hierarchy: layout.hierarchy,
      units: layout.units,
      name: layout.name,
      root: layout.root,
    });
    return stored;
  }

  function cloneModel(model) {
    if (!model || typeof model !== 'object') return clone(model);
    const cached = modelAssets.get(model);
    if (
      cached &&
      cached.revision === model.revision &&
      cached.processRevision === model.processRevision
    ) {
      return cached.clone;
    }
    const stored = clone(model);
    modelAssets.set(model, {
      clone: stored,
      revision: model.revision,
      processRevision: model.processRevision,
    });
    return stored;
  }

  return function cloneState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clone(value);
    const state = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'layout') state.layout = cloneLayout(item);
      else if (key === 'model') state.model = cloneModel(item);
      else state[key] = clone(item);
    }
    return state;
  };
}

function cleanName(value) {
  return String(value ?? '').trim();
}

export function defaultSnapshotName(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export const MAX_SNAPSHOTS = 100;
export const MAX_SNAPSHOT_BRANCHES = 32;
export const MAX_PROCESS_HISTORY_NODES = 1000;
export const MAIN_SNAPSHOT_BRANCH_ID = 'main';

function defaultMainBranch() {
  return {
    id: MAIN_SNAPSHOT_BRANCH_ID,
    name: 'Main',
    rootSnapshotId: null,
    headSnapshotId: null,
    rootNodeId: null,
    headNodeId: null,
    headState: null,
    createdAt: new Date(0).toISOString(),
  };
}

function branchView(branch, activeBranchId, records, historyNodes) {
  const ownSnapshotCount = records.reduce(
      (count, record) => count + (record.branchId === branch.id ? 1 : 0),
      0,
    ),
    processStepCount = historyNodes.reduce(
      (count, node) => count + (node.branchId === branch.id ? 1 : 0),
      0,
    );
  return {
    id: branch.id,
    name: branch.name,
    rootSnapshotId: branch.rootSnapshotId,
    headSnapshotId: branch.headSnapshotId,
    rootNodeId: branch.rootNodeId,
    headNodeId: branch.headNodeId,
    createdAt: branch.createdAt,
    ownSnapshotCount,
    processStepCount,
    active: branch.id === activeBranchId,
  };
}

export function createSnapshotManager({
  capture,
  restore,
  validateState = () => true,
  now = () => new Date(),
  idFactory = () => `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  branchIdFactory = () =>
    `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  nodeIdFactory = () =>
    `process-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  maxRecords = MAX_SNAPSHOTS,
  maxBranches = MAX_SNAPSHOT_BRANCHES,
  maxHistoryNodes = MAX_PROCESS_HISTORY_NODES,
} = {}) {
  if (typeof capture !== 'function') throw new TypeError('capture must be a function');
  if (typeof restore !== 'function') throw new TypeError('restore must be a function');

  let records = [];
  let branches = [defaultMainBranch()];
  let historyNodes = [];
  let activeBranchId = MAIN_SNAPSHOT_BRANCH_ID;
  let cursorNodeId = null;
  let cursorSnapshotId = null;
  const cloneState = createStateCloner();

  function branchById(id) {
    return branches.find((branch) => branch.id === id) || null;
  }

  function recordById(id) {
    return records.find((record) => record.id === id) || null;
  }

  function nodeById(id) {
    return historyNodes.find((node) => node.id === id) || null;
  }

  function list() {
    return records.map(({ id, name, createdAt, branchId, parentId, historyNodeId }) => ({
      id,
      name,
      createdAt,
      branchId,
      parentId,
      historyNodeId,
    }));
  }

  function listHistory() {
    return historyNodes.map(({ id, branchId, parentId, createdAt, processRevision, operation }) => ({
      id,
      branchId,
      parentId,
      createdAt,
      processRevision,
      operation: clone(operation),
    }));
  }

  function listBranches() {
    return branches.map((branch) => branchView(branch, activeBranchId, records, historyNodes));
  }

  function activeBranch() {
    const branch = branchById(activeBranchId) || branches[0] || defaultMainBranch();
    return branchView(branch, activeBranchId, records, historyNodes);
  }

  function isCursorAtBranchHead() {
    const branch = branchById(activeBranchId);
    if (!branch) return true;
    if (branch.headNodeId) return cursorNodeId === branch.headNodeId;
    if (cursorSnapshotId) return cursorSnapshotId === branch.headSnapshotId;
    return true;
  }

  function create(name = '') {
    if (records.length >= maxRecords) {
      throw new Error(`Snapshot limit of ${maxRecords} reached.`);
    }
    const branch = branchById(activeBranchId) || branches[0];
    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    const state = cloneState(capture());
    if (!validateState(state)) throw new Error('Cannot save an invalid workspace state.');

    const record = {
      id: idFactory(),
      name: cleanName(name) || defaultSnapshotName(date),
      createdAt: date.toISOString(),
      branchId: branch.id,
      parentId: branch.headSnapshotId || null,
      historyNodeId: cursorNodeId,
      state,
    };
    records.unshift(record);

    if (isCursorAtBranchHead()) {
      branch.headSnapshotId = record.id;
      branch.headState = cloneState(state);
      cursorSnapshotId = record.id;
    }

    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      branchId: record.branchId,
      parentId: record.parentId,
      historyNodeId: record.historyNodeId,
    };
  }

  function rename(id, name) {
    const record = recordById(id);
    const next = cleanName(name);
    if (!record || !next) return false;
    record.name = next;
    return true;
  }

  function remove(id) {
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const record = records[index];

    for (const item of records) {
      if (item.parentId === id) item.parentId = record.parentId || null;
    }
    for (const branch of branches) {
      if (branch.headSnapshotId === id) branch.headSnapshotId = record.parentId || null;
      if (branch.rootSnapshotId === id) branch.rootSnapshotId = record.parentId || null;
    }
    if (cursorSnapshotId === id) cursorSnapshotId = record.parentId || null;

    records.splice(index, 1);
    return true;
  }

  function restoreById(id) {
    const record = recordById(id);
    if (!record || !validateState(record.state)) return false;
    restore(cloneState(record.state));
    cursorNodeId = record.historyNodeId || null;
    cursorSnapshotId = record.id;
    return true;
  }

  function uniqueBranchName(name, excludeId = null) {
    const base = cleanName(name) || `Branch ${branches.length + 1}`;
    const used = (candidate) =>
      branches.some((branch) => branch.id !== excludeId && branch.name === candidate);
    if (!used(base)) return base;
    let suffix = 2;
    while (used(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
  }

  function createBranch(snapshotId, name = '') {
    if (branches.length >= maxBranches) {
      throw new Error(`Branch limit of ${maxBranches} reached.`);
    }
    const source = recordById(snapshotId);
    if (!source) throw new Error('Branch source snapshot was not found.');

    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    let id = branchIdFactory();
    while (!id || branchById(id)) id = branchIdFactory();

    const branch = {
      id,
      name: uniqueBranchName(name || `${source.name} branch`),
      rootSnapshotId: source.id,
      headSnapshotId: source.id,
      rootNodeId: source.historyNodeId || null,
      headNodeId: source.historyNodeId || null,
      headState: cloneState(source.state),
      createdAt: date.toISOString(),
    };
    branches.push(branch);
    activeBranchId = branch.id;
    cursorNodeId = branch.headNodeId;
    cursorSnapshotId = source.id;
    return branchView(branch, activeBranchId, records, historyNodes);
  }

  function switchBranch(id) {
    const branch = branchById(id);
    if (!branch) return false;
    const previousBranchId = activeBranchId;
    const previousCursorNodeId = cursorNodeId;
    const previousCursorSnapshotId = cursorSnapshotId;
    activeBranchId = branch.id;

    let restored = false;
    if (branch.headState && validateState(branch.headState)) {
      restore(cloneState(branch.headState));
      restored = true;
    } else if (branch.headSnapshotId) {
      const record = recordById(branch.headSnapshotId);
      if (record && validateState(record.state)) {
        restore(cloneState(record.state));
        restored = true;
      }
    } else {
      restored = true;
    }

    if (!restored) {
      activeBranchId = previousBranchId;
      cursorNodeId = previousCursorNodeId;
      cursorSnapshotId = previousCursorSnapshotId;
      return false;
    }

    cursorNodeId = branch.headNodeId || null;
    cursorSnapshotId = branch.headSnapshotId || null;
    return true;
  }

  function renameBranch(id, name) {
    const branch = branchById(id);
    const next = cleanName(name);
    if (!branch || !next) return false;
    branch.name = uniqueBranchName(next, branch.id);
    return true;
  }

  function continuationContext() {
    const branch = branchById(activeBranchId);
    if (!branch || isCursorAtBranchHead()) return null;
    const snapshot = cursorSnapshotId ? recordById(cursorSnapshotId) : null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      snapshotId: snapshot?.id || null,
      snapshotName: snapshot?.name || null,
      cursorNodeId,
      headNodeId: branch.headNodeId,
    };
  }

  function createBranchFromCursor(name = '') {
    const context = continuationContext();
    if (!context) throw new Error('The current process state is already at the branch HEAD.');

    let snapshotId = context.snapshotId;
    let snapshotName = context.snapshotName;
    if (!snapshotId) {
      const branchPoint = create(
        context.snapshotName || `${context.branchName || 'Process'} branch point`,
      );
      snapshotId = branchPoint.id;
      snapshotName = branchPoint.name;
    }

    return createBranch(
      snapshotId,
      name || `${snapshotName || 'Process'} continuation`,
    );
  }

  function recordOperation(operation = {}) {
    if (historyNodes.length >= maxHistoryNodes) {
      throw new Error(`Process history limit of ${maxHistoryNodes} reached.`);
    }
    if (continuationContext()) {
      throw new Error('A new branch is required before continuing from a historical checkpoint.');
    }

    const branch = branchById(activeBranchId) || branches[0];
    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    let id = nodeIdFactory();
    while (!id || nodeById(id)) id = nodeIdFactory();

    const state = cloneState(capture());
    if (!validateState(state)) throw new Error('Cannot record an invalid process state.');

    const processRevision = Number(state?.model?.processRevision);
    const node = {
      id,
      branchId: branch.id,
      parentId: branch.headNodeId || null,
      createdAt: date.toISOString(),
      processRevision: Number.isInteger(processRevision) ? processRevision : 0,
      operation: clone(operation),
    };
    historyNodes.push(node);
    if (!branch.rootNodeId) branch.rootNodeId = node.id;
    branch.headNodeId = node.id;
    branch.headState = state;
    cursorNodeId = node.id;
    cursorSnapshotId = null;
    return clone(node);
  }

  function syncCursorToProcessRevision(processRevision) {
    const branch = branchById(activeBranchId);
    if (!branch) return false;
    const target = Number(processRevision);
    let nodeId = branch.headNodeId;
    while (nodeId) {
      const node = nodeById(nodeId);
      if (!node) break;
      if (node.processRevision === target) {
        cursorNodeId = node.id;
        cursorSnapshotId = null;
        return true;
      }
      nodeId = node.parentId;
    }

    if (target === 0) {
      cursorNodeId = branch.rootNodeId && nodeById(branch.rootNodeId)?.processRevision === 0
        ? branch.rootNodeId
        : null;
      cursorSnapshotId = branch.rootSnapshotId || null;
      return true;
    }
    return false;
  }

  function clear() {
    records = [];
    branches = [defaultMainBranch()];
    historyNodes = [];
    activeBranchId = MAIN_SNAPSHOT_BRANCH_ID;
    cursorNodeId = null;
    cursorSnapshotId = null;
  }

  function exportRecords() {
    return clone(records);
  }

  function exportBranchState() {
    return clone({
      version: 2,
      activeBranchId,
      cursorNodeId,
      cursorSnapshotId,
      branches,
      nodes: historyNodes,
    });
  }

  function importRecords(value, branchState = null) {
    if (!Array.isArray(value)) {
      clear();
      return 0;
    }

    const seen = new Set();
    const next = [];
    for (const raw of value) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        typeof raw.id !== 'string' ||
        !raw.id ||
        seen.has(raw.id) ||
        !validateState(raw.state)
      ) {
        continue;
      }

      const createdAt = Number.isFinite(Date.parse(raw.createdAt))
        ? new Date(raw.createdAt).toISOString()
        : new Date(0).toISOString();
      if (next.length >= maxRecords) break;
      next.push({
        id: raw.id,
        name: cleanName(raw.name) || defaultSnapshotName(createdAt),
        createdAt,
        branchId:
          typeof raw.branchId === 'string' && raw.branchId ? raw.branchId : MAIN_SNAPSHOT_BRANCH_ID,
        parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null,
        historyNodeId:
          typeof raw.historyNodeId === 'string' && raw.historyNodeId ? raw.historyNodeId : null,
        state: cloneState(raw.state),
      });
      seen.add(raw.id);
    }

    const importedNodes = [];
    const nodeIds = new Set();
    if (Array.isArray(branchState?.nodes)) {
      for (const raw of branchState.nodes) {
        if (
          importedNodes.length >= maxHistoryNodes ||
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.id !== 'string' ||
          !raw.id ||
          nodeIds.has(raw.id)
        ) {
          continue;
        }
        const createdAt = Number.isFinite(Date.parse(raw.createdAt))
          ? new Date(raw.createdAt).toISOString()
          : new Date(0).toISOString();
        importedNodes.push({
          id: raw.id,
          branchId:
            typeof raw.branchId === 'string' && raw.branchId
              ? raw.branchId
              : MAIN_SNAPSHOT_BRANCH_ID,
          parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null,
          createdAt,
          processRevision: Number.isInteger(raw.processRevision) ? raw.processRevision : 0,
          operation: raw.operation && typeof raw.operation === 'object' ? clone(raw.operation) : {},
        });
        nodeIds.add(raw.id);
      }
    }

    for (const node of importedNodes) {
      if (node.parentId && !nodeIds.has(node.parentId)) node.parentId = null;
    }
    for (const record of next) {
      if (record.historyNodeId && !nodeIds.has(record.historyNodeId)) record.historyNodeId = null;
    }

    const importedBranches = [];
    const branchIds = new Set();
    if (Array.isArray(branchState?.branches)) {
      for (const raw of branchState.branches) {
        if (
          importedBranches.length >= maxBranches ||
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.id !== 'string' ||
          !raw.id ||
          branchIds.has(raw.id)
        ) {
          continue;
        }
        const createdAt = Number.isFinite(Date.parse(raw.createdAt))
          ? new Date(raw.createdAt).toISOString()
          : new Date(0).toISOString();
        const headState =
          raw.headState && validateState(raw.headState) ? cloneState(raw.headState) : null;
        importedBranches.push({
          id: raw.id,
          name: cleanName(raw.name) || (raw.id === MAIN_SNAPSHOT_BRANCH_ID ? 'Main' : raw.id),
          rootSnapshotId:
            typeof raw.rootSnapshotId === 'string' && seen.has(raw.rootSnapshotId)
              ? raw.rootSnapshotId
              : null,
          headSnapshotId:
            typeof raw.headSnapshotId === 'string' && seen.has(raw.headSnapshotId)
              ? raw.headSnapshotId
              : null,
          rootNodeId:
            typeof raw.rootNodeId === 'string' && nodeIds.has(raw.rootNodeId)
              ? raw.rootNodeId
              : null,
          headNodeId:
            typeof raw.headNodeId === 'string' && nodeIds.has(raw.headNodeId)
              ? raw.headNodeId
              : null,
          headState,
          createdAt,
        });
        branchIds.add(raw.id);
      }
    }

    if (!branchIds.has(MAIN_SNAPSHOT_BRANCH_ID)) {
      importedBranches.unshift(defaultMainBranch());
      branchIds.add(MAIN_SNAPSHOT_BRANCH_ID);
    }

    for (const record of next) {
      if (!branchIds.has(record.branchId)) {
        if (importedBranches.length < maxBranches) {
          importedBranches.push({
            ...defaultMainBranch(),
            id: record.branchId,
            name: record.branchId,
          });
          branchIds.add(record.branchId);
        } else {
          record.branchId = MAIN_SNAPSHOT_BRANCH_ID;
        }
      }
      if (record.parentId && !seen.has(record.parentId)) record.parentId = null;
    }
    for (const node of importedNodes) {
      if (!branchIds.has(node.branchId)) node.branchId = MAIN_SNAPSHOT_BRANCH_ID;
    }

    const hasExplicitParents = next.some((record) => record.parentId);
    const legacySingleBranch =
      !branchState &&
      !hasExplicitParents &&
      next.every((record) => record.branchId === MAIN_SNAPSHOT_BRANCH_ID);
    if (legacySingleBranch) {
      let parentId = null;
      for (const record of [...next].reverse()) {
        record.parentId = parentId;
        parentId = record.id;
      }
      const main = importedBranches.find((branch) => branch.id === MAIN_SNAPSHOT_BRANCH_ID);
      if (main) main.headSnapshotId = next[0]?.id || null;
    } else {
      for (const branch of importedBranches) {
        if (!branch.headSnapshotId) {
          branch.headSnapshotId =
            next.find((record) => record.branchId === branch.id)?.id || branch.rootSnapshotId || null;
        }
      }
    }

    records = next;
    historyNodes = importedNodes;
    branches = importedBranches.slice(0, maxBranches);
    activeBranchId =
      typeof branchState?.activeBranchId === 'string' && branchById(branchState.activeBranchId)
        ? branchState.activeBranchId
        : MAIN_SNAPSHOT_BRANCH_ID;

    const active = branchById(activeBranchId) || branches[0];
    cursorNodeId =
      typeof branchState?.cursorNodeId === 'string' && nodeById(branchState.cursorNodeId)
        ? branchState.cursorNodeId
        : active?.headNodeId || null;
    cursorSnapshotId =
      typeof branchState?.cursorSnapshotId === 'string' && recordById(branchState.cursorSnapshotId)
        ? branchState.cursorSnapshotId
        : active?.headSnapshotId || null;
    return records.length;
  }

  return {
    list,
    listHistory,
    listBranches,
    activeBranch,
    create,
    createBranch,
    createBranchFromCursor,
    continuationContext,
    recordOperation,
    syncCursorToProcessRevision,
    switchBranch,
    rename,
    renameBranch,
    remove,
    restore: restoreById,
    clear,
    exportRecords,
    exportBranchState,
    importRecords,
  };
}
