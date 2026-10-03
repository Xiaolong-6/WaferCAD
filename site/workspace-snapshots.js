function clone(value) {
  return structuredClone(value);
}

function deepEqual(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (Object.is(a, b)) continue;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (typeof a !== 'object') return false;

    const aArray = Array.isArray(a);
    if (aArray !== Array.isArray(b)) return false;
    if (aArray) {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index++) pending.push([a[index], b[index]]);
      continue;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
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
    parentBranchId: null,
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
    parentBranchId: branch.parentBranchId || null,
    rootSnapshotId: branch.rootSnapshotId,
    headSnapshotId: branch.headSnapshotId,
    rootNodeId: branch.rootNodeId,
    headNodeId: branch.headNodeId,
    createdAt: branch.createdAt,
    ownSnapshotCount,
    bookmarkCount: ownSnapshotCount,
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
  let cursorBaselineState = null;
  let cursorDetachedFromHead = false;
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

  function milestoneAtProcessNode(nodeId, branchId = null) {
    if (!nodeId) return null;
    return records
      .filter(
        (record) =>
          record.historyNodeId === nodeId && (!branchId || record.branchId === branchId),
      )
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  }

  function stateForProcessNode(node) {
    if (!node) return null;
    if (node.state) return node.state;

    const milestone = milestoneAtProcessNode(node.id, node.branchId);
    if (milestone?.state) return milestone.state;

    const branch = branchById(node.branchId);
    if (branch?.headNodeId === node.id && branch.headState) return branch.headState;
    return null;
  }

  function listHistory() {
    return historyNodes.map(({ id, branchId, parentId, createdAt, processRevision, operation }) => {
      const node = nodeById(id);
      return {
        id,
        branchId,
        parentId,
        createdAt,
        processRevision,
        operation: clone(operation),
        restorable: Boolean(stateForProcessNode(node)),
      };
    });
  }

  function listBranches() {
    return branches.map((branch) => branchView(branch, activeBranchId, records, historyNodes));
  }

  function activeBranch() {
    const branch = branchById(activeBranchId) || branches[0] || defaultMainBranch();
    return branchView(branch, activeBranchId, records, historyNodes);
  }

  function isCursorAtBranchHead() {
    if (cursorDetachedFromHead) return false;
    const branch = branchById(activeBranchId);
    if (!branch) return true;
    if (branch.headNodeId) return cursorNodeId === branch.headNodeId;
    if (cursorSnapshotId) return cursorSnapshotId === branch.headSnapshotId;
    return true;
  }

  function stateMatchesBranchHead(branch, state, nodeId = cursorNodeId) {
    if (!branch) return true;
    if (branch.headNodeId && nodeId !== branch.headNodeId) return false;
    if (branch.headState) {
      try {
        return deepEqual(state, branch.headState);
      } catch {
        return false;
      }
    }
    return !branch.headSnapshotId || cursorSnapshotId === branch.headSnapshotId;
  }

  function historicalParentSnapshotId(branch) {
    if (cursorSnapshotId && recordById(cursorSnapshotId)?.branchId === branch.id) {
      return cursorSnapshotId;
    }

    let nodeId = cursorNodeId;
    while (nodeId) {
      const candidates = records
        .filter((record) => record.branchId === branch.id && record.historyNodeId === nodeId)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      if (candidates.length) return candidates[0].id;
      nodeId = nodeById(nodeId)?.parentId || null;
    }
    return branch.rootSnapshotId || null;
  }

  function create(name = '') {
    if (records.length >= maxRecords) {
      throw new Error(`Milestone limit of ${maxRecords} reached.`);
    }
    const branch = branchById(activeBranchId) || branches[0];
    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    const state = cloneState(capture());
    if (!validateState(state)) throw new Error('Cannot save an invalid workspace state.');

    const atHead = isCursorAtBranchHead();
    const record = {
      id: idFactory(),
      name: cleanName(name) || defaultSnapshotName(date),
      createdAt: date.toISOString(),
      branchId: branch.id,
      parentId: atHead ? branch.headSnapshotId || null : historicalParentSnapshotId(branch),
      historyNodeId: cursorNodeId,
      state,
    };
    records.unshift(record);
    cursorSnapshotId = record.id;
    cursorBaselineState = cloneState(record.state);

    if (atHead) {
      branch.headSnapshotId = record.id;
      branch.headState = cloneState(state);
      cursorDetachedFromHead = false;
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

  function bookmarkCurrentStep(name = '') {
    if (records.length >= maxRecords) {
      throw new Error(`Bookmark limit of ${maxRecords} reached.`);
    }
    const node = cursorNodeId ? nodeById(cursorNodeId) : null;
    const state = stateForProcessNode(node);
    if (!node || !state || !validateState(state)) {
      throw new Error('Select a restorable process Step before adding a bookmark.');
    }

    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    const record = {
      id: idFactory(),
      name: cleanName(name) || defaultSnapshotName(date),
      createdAt: date.toISOString(),
      branchId: node.branchId,
      parentId: null,
      historyNodeId: node.id,
      state: cloneState(state),
    };
    records.unshift(record);
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

  function branchesUsingSnapshot(id) {
    return branches
      .filter((branch) => branch.rootSnapshotId === id)
      .map((branch) => branchView(branch, activeBranchId, records, historyNodes));
  }

  function remove(id) {
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) return false;
    if (branchesUsingSnapshot(id).length) return false;

    const record = records[index];
    if (record.historyNodeId) {
      const node = nodeById(record.historyNodeId);
      const alternateMilestone = records.find(
        (item) => item.id !== id && item.historyNodeId === record.historyNodeId,
      );
      if (node && !node.state && !alternateMilestone && validateState(record.state)) {
        node.state = cloneState(record.state);
      }
    }

    for (const item of records) {
      if (item.parentId === id) item.parentId = record.parentId || null;
    }
    for (const branch of branches) {
      if (branch.headSnapshotId === id) branch.headSnapshotId = record.parentId || null;
    }
    if (cursorSnapshotId === id) cursorSnapshotId = record.parentId || null;

    records.splice(index, 1);
    return true;
  }

  function restoreById(id) {
    const record = recordById(id);
    if (!record || !validateState(record.state)) return false;
    const restoredState = cloneState(record.state);
    restore(restoredState);
    cursorNodeId = record.historyNodeId || null;
    cursorSnapshotId = record.id;
    cursorBaselineState = cloneState(restoredState);
    const branch = branchById(activeBranchId);
    cursorDetachedFromHead = !stateMatchesBranchHead(branch, record.state, cursorNodeId);
    return true;
  }

  function restoreProcessNode(id) {
    const node = nodeById(id);
    const state = stateForProcessNode(node);
    if (!node || !state || !validateState(state)) return false;

    const branch = branchById(node.branchId);
    if (!branch) return false;

    activeBranchId = branch.id;
    const restoredState = cloneState(state);
    restore(restoredState);
    cursorNodeId = node.id;
    cursorSnapshotId = null;
    cursorBaselineState = cloneState(restoredState);
    cursorDetachedFromHead = !stateMatchesBranchHead(branch, state, node.id);
    return true;
  }

  function uniqueBranchName(name, excludeId = null) {
    const base = cleanName(name) || 'Variant';
    const used = (candidate) =>
      branches.some((branch) => branch.id !== excludeId && branch.name === candidate);
    if (!used(base)) return base;
    let suffix = 2;
    while (used(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
  }

  function nextVariantName() {
    let index = 1;
    while (branches.some((branch) => branch.name === `Variant ${index}`)) index += 1;
    return `Variant ${index}`;
  }

  function createVariant({
    originNodeId = null,
    parentVariantId = activeBranchId,
    legacySnapshotId = null,
    name = '',
    headState = null,
  } = {}) {
    if (branches.length >= maxBranches) {
      throw new Error(`Variant limit of ${maxBranches} reached.`);
    }

    const originNode = originNodeId ? nodeById(originNodeId) : null;
    const parent =
      branchById(parentVariantId) ||
      branchById(originNode?.branchId) ||
      branchById(activeBranchId) ||
      branches[0];
    const sourceState =
      headState ||
      stateForProcessNode(originNode) ||
      (legacySnapshotId ? recordById(legacySnapshotId)?.state : null) ||
      capture();
    if (!validateState(sourceState)) {
      throw new Error('Cannot seed a variant from an invalid workspace state.');
    }

    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    let id = branchIdFactory();
    while (!id || branchById(id)) id = branchIdFactory();

    const branch = {
      id,
      name: uniqueBranchName(name || nextVariantName()),
      parentBranchId:
        parent?.id && parent.id !== id ? parent.id : MAIN_SNAPSHOT_BRANCH_ID,
      rootSnapshotId: legacySnapshotId || null,
      headSnapshotId: legacySnapshotId || null,
      rootNodeId: originNode?.id || null,
      headNodeId: originNode?.id || null,
      headState: cloneState(sourceState),
      createdAt: date.toISOString(),
    };
    branches.push(branch);
    activeBranchId = branch.id;
    cursorNodeId = branch.headNodeId;
    cursorSnapshotId = legacySnapshotId || null;
    cursorBaselineState = cloneState(sourceState);
    cursorDetachedFromHead = false;
    restore(cloneState(sourceState));
    return branchView(branch, activeBranchId, records, historyNodes);
  }

  function createBranchFromNode(nodeId, name = '', { headState = null } = {}) {
    const source = nodeById(nodeId);
    if (!source) throw new Error('Variant source Step was not found.');
    return createVariant({
      originNodeId: source.id,
      parentVariantId: source.branchId,
      name,
      headState,
    });
  }

  function createBranch(snapshotId, name = '', { headState = null } = {}) {
    const source = recordById(snapshotId);
    if (!source) throw new Error('Variant source bookmark was not found.');
    if (source.historyNodeId && nodeById(source.historyNodeId)) {
      return createVariant({
        originNodeId: source.historyNodeId,
        parentVariantId: source.branchId,
        legacySnapshotId: source.id,
        name,
        headState,
      });
    }
    return createVariant({
      parentVariantId: source.branchId,
      legacySnapshotId: source.id,
      name,
      headState: headState || source.state,
    });
  }

  function switchBranch(id) {
    const branch = branchById(id);
    if (!branch) return false;
    const previousBranchId = activeBranchId;
    const previousCursorNodeId = cursorNodeId;
    const previousCursorSnapshotId = cursorSnapshotId;
    activeBranchId = branch.id;

    let restored = false;
    let restoredState = null;
    if (branch.headState && validateState(branch.headState)) {
      restoredState = cloneState(branch.headState);
      restore(restoredState);
      restored = true;
    } else if (branch.headSnapshotId) {
      const record = recordById(branch.headSnapshotId);
      if (record && validateState(record.state)) {
        restoredState = cloneState(record.state);
        restore(restoredState);
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
    cursorBaselineState = cloneState(restoredState || capture());
    cursorDetachedFromHead = false;
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
    const processNode = cursorNodeId ? nodeById(cursorNodeId) : null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      snapshotId: snapshot?.id || null,
      snapshotName: snapshot?.name || null,
      processLabel: processNode?.operation?.label || processNode?.operation?.kind || null,
      cursorNodeId,
      headNodeId: branch.headNodeId,
    };
  }

  function createBranchFromCursor(name = '') {
    const context = continuationContext();
    if (!context) throw new Error('The current process state is already at the variant HEAD.');

    const workingState = cloneState(capture());
    if (!validateState(workingState)) {
      throw new Error('Cannot create a variant from an invalid historical working state.');
    }
    return createVariant({
      originNodeId: context.cursorNodeId || null,
      parentVariantId: context.branchId,
      name: name || nextVariantName(),
      headState: workingState,
    });
  }

  function restoreActiveBranchHead() {
    return switchBranch(activeBranchId);
  }

  function hasHistoricalWorkingEdits() {
    if (!continuationContext()) return false;
    if (!cursorBaselineState) return true;
    try {
      return !deepEqual(capture(), cursorBaselineState);
    } catch {
      return true;
    }
  }

  function syncActiveHeadState() {
    const branch = branchById(activeBranchId);
    if (!branch || !isCursorAtBranchHead()) return false;

    const state = cloneState(capture());
    if (!validateState(state)) return false;

    const headNode = branch.headNodeId ? nodeById(branch.headNodeId) : null;
    const processRevision = Number(state?.model?.processRevision);
    if (
      headNode &&
      (!Number.isInteger(processRevision) || processRevision !== headNode.processRevision)
    ) {
      return false;
    }

    branch.headState = state;
    cursorBaselineState = cloneState(state);
    cursorDetachedFromHead = false;
    return true;
  }

  function parentBranchId(branch) {
    if (!branch || branch.id === MAIN_SNAPSHOT_BRANCH_ID) return null;
    const explicit = branchById(branch.parentBranchId)?.id || null;
    if (explicit && explicit !== branch.id) return explicit;
    const originNode = branch.rootNodeId ? nodeById(branch.rootNodeId) : null;
    if (originNode?.branchId && originNode.branchId !== branch.id) return originNode.branchId;
    const source = branch.rootSnapshotId ? recordById(branch.rootSnapshotId) : null;
    const candidate = branchById(source?.branchId)?.id || null;
    return candidate && candidate !== branch.id ? candidate : MAIN_SNAPSHOT_BRANCH_ID;
  }

  function removeBranch(id) {
    if (id === MAIN_SNAPSHOT_BRANCH_ID) {
      throw new Error('The Main variant cannot be deleted.');
    }
    const branch = branchById(id);
    if (!branch) return false;

    const descendants = branches.filter(
      (candidate) => candidate.id !== id && parentBranchId(candidate) === id,
    );
    if (descendants.length) {
      throw new Error('Delete child variants before deleting this variant.');
    }

    const fallbackId = parentBranchId(branch) || MAIN_SNAPSHOT_BRANCH_ID;
    if (activeBranchId === id && !switchBranch(fallbackId)) {
      throw new Error('Could not restore the parent variant before deletion.');
    }

    const removedRecordIds = new Set(
      records.filter((record) => record.branchId === id).map((record) => record.id),
    );
    records = records.filter((record) => record.branchId !== id);
    historyNodes = historyNodes.filter((node) => node.branchId !== id);
    branches = branches.filter((candidate) => candidate.id !== id);

    for (const record of records) {
      if (record.parentId && removedRecordIds.has(record.parentId)) record.parentId = null;
    }

    return {
      id,
      name: branch.name,
      fallbackBranchId: fallbackId,
      removedMilestones: removedRecordIds.size,
    };
  }

  function canRecordOperation() {
    return historyNodes.length < maxHistoryNodes;
  }

  function recordOperation(operation = {}) {
    if (!canRecordOperation()) {
      throw new Error(`Process history limit of ${maxHistoryNodes} reached.`);
    }
    if (continuationContext()) {
      throw new Error('A new variant is required before continuing from a historical checkpoint.');
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
      state,
    };
    historyNodes.push(node);
    if (!branch.rootNodeId) branch.rootNodeId = node.id;
    branch.headNodeId = node.id;
    branch.headState = state;
    cursorNodeId = node.id;
    cursorSnapshotId = null;
    cursorBaselineState = cloneState(state);
    cursorDetachedFromHead = false;
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
        const state = cloneState(capture());
        cursorBaselineState = cloneState(state);
        cursorDetachedFromHead = !stateMatchesBranchHead(branch, state, node.id);
        return true;
      }
      nodeId = node.parentId;
    }

    if (target === 0) {
      cursorNodeId = branch.rootNodeId && nodeById(branch.rootNodeId)?.processRevision === 0
        ? branch.rootNodeId
        : null;
      cursorSnapshotId = branch.rootSnapshotId || null;
      const state = cloneState(capture());
      cursorBaselineState = cloneState(state);
      cursorDetachedFromHead = !stateMatchesBranchHead(branch, state, cursorNodeId);
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
    cursorBaselineState = null;
    cursorDetachedFromHead = false;
  }

  function exportRecords() {
    return clone(records);
  }

  function exportBranchState() {
    const exportedNodes = historyNodes.map((node) => {
      const state = stateForProcessNode(node);
      return {
        ...node,
        ...(state ? { state } : { state: null }),
      };
    });
    const fullyRestorable = exportedNodes.every((node) => Boolean(node.state));
    return clone({
      version: fullyRestorable ? 3 : 2,
      activeBranchId,
      cursorNodeId,
      cursorSnapshotId,
      branches,
      nodes: exportedNodes,
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
          state: raw.state && validateState(raw.state) ? cloneState(raw.state) : null,
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
          parentBranchId:
            typeof raw.parentBranchId === 'string' && raw.parentBranchId
              ? raw.parentBranchId
              : null,
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
    for (const branch of importedBranches) {
      if (branch.id === MAIN_SNAPSHOT_BRANCH_ID) {
        branch.parentBranchId = null;
        continue;
      }
      if (
        !branch.parentBranchId ||
        !branchIds.has(branch.parentBranchId) ||
        branch.parentBranchId === branch.id
      ) {
        const originNode = branch.rootNodeId
          ? importedNodes.find((node) => node.id === branch.rootNodeId)
          : null;
        const source = branch.rootSnapshotId
          ? next.find((record) => record.id === branch.rootSnapshotId)
          : null;
        branch.parentBranchId =
          originNode?.branchId && originNode.branchId !== branch.id
            ? originNode.branchId
            : source?.branchId && source.branchId !== branch.id
              ? source.branchId
              : MAIN_SNAPSHOT_BRANCH_ID;
      }
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

    // Promote every legacy node whose exact state can already be recovered from
    // an attached milestone or the branch HEAD. This prevents a legacy HEAD
    // from losing its only restore state when the branch later advances.
    for (const node of historyNodes) {
      if (node.state) continue;
      const recoverable = stateForProcessNode(node);
      if (recoverable && validateState(recoverable)) node.state = cloneState(recoverable);
    }

    // V2 initially derived default branch names from the full milestone name.
    // Normalize only that exact legacy auto-name pattern; explicit user names stay untouched.
    const usedBranchNames = new Set(branches.map((branch) => branch.name));
    let legacyVariantIndex = 1;
    for (const branch of branches) {
      if (branch.id === MAIN_SNAPSHOT_BRANCH_ID || !branch.rootSnapshotId) continue;
      const source = records.find((record) => record.id === branch.rootSnapshotId);
      if (!source || !branch.name.startsWith(source.name)) continue;
      const suffix = branch.name.slice(source.name.length);
      if (!/^( branch| continuation)( \d+)?$/.test(suffix)) continue;

      usedBranchNames.delete(branch.name);
      while (usedBranchNames.has(`Variant ${legacyVariantIndex}`)) legacyVariantIndex += 1;
      branch.name = `Variant ${legacyVariantIndex}`;
      usedBranchNames.add(branch.name);
      legacyVariantIndex += 1;
    }

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

    const cursorSnapshot = cursorSnapshotId ? recordById(cursorSnapshotId) : null;
    const cursorNode = cursorNodeId ? nodeById(cursorNodeId) : null;
    const canonicalCursorState =
      cursorSnapshot?.state || stateForProcessNode(cursorNode) || capture();
    cursorBaselineState = cloneState(canonicalCursorState);
    const liveState = capture();
    cursorDetachedFromHead = !stateMatchesBranchHead(active, liveState, cursorNodeId);
    return records.length;
  }

  return {
    list,
    listHistory,
    listBranches,
    activeBranch,
    create,
    bookmarkCurrentStep,
    createBranch,
    createBranchFromNode,
    createBranchFromCursor,
    continuationContext,
    restoreActiveBranchHead,
    canRecordOperation,
    recordOperation,
    syncCursorToProcessRevision,
    switchBranch,
    rename,
    renameBranch,
    branchesUsingSnapshot,
    remove,
    removeBranch,
    restore: restoreById,
    restoreProcessNode,
    hasHistoricalWorkingEdits,
    syncActiveHeadState,
    clear,
    exportRecords,
    exportBranchState,
    importRecords,
  };
}
