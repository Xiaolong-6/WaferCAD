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
export const MAIN_SNAPSHOT_BRANCH_ID = 'main';

function defaultMainBranch() {
  return {
    id: MAIN_SNAPSHOT_BRANCH_ID,
    name: 'Main',
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: new Date(0).toISOString(),
  };
}

function branchView(branch, activeBranchId, records) {
  const ownSnapshotCount = records.reduce(
    (count, record) => count + (record.branchId === branch.id ? 1 : 0),
    0,
  );
  return {
    id: branch.id,
    name: branch.name,
    rootSnapshotId: branch.rootSnapshotId,
    headSnapshotId: branch.headSnapshotId,
    createdAt: branch.createdAt,
    ownSnapshotCount,
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
  maxRecords = MAX_SNAPSHOTS,
  maxBranches = MAX_SNAPSHOT_BRANCHES,
} = {}) {
  if (typeof capture !== 'function') throw new TypeError('capture must be a function');
  if (typeof restore !== 'function') throw new TypeError('restore must be a function');

  let records = [];
  let branches = [defaultMainBranch()];
  let activeBranchId = MAIN_SNAPSHOT_BRANCH_ID;
  const cloneState = createStateCloner();

  function branchById(id) {
    return branches.find((branch) => branch.id === id) || null;
  }

  function recordById(id) {
    return records.find((record) => record.id === id) || null;
  }

  function list() {
    return records.map(({ id, name, createdAt, branchId, parentId }) => ({
      id,
      name,
      createdAt,
      branchId,
      parentId,
    }));
  }

  function listBranches() {
    return branches.map((branch) => branchView(branch, activeBranchId, records));
  }

  function activeBranch() {
    const branch = branchById(activeBranchId) || branches[0] || defaultMainBranch();
    return branchView(branch, activeBranchId, records);
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
      state,
    };
    records.unshift(record);
    branch.headSnapshotId = record.id;
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      branchId: record.branchId,
      parentId: record.parentId,
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

    records.splice(index, 1);
    return true;
  }

  function restoreById(id) {
    const record = recordById(id);
    if (!record || !validateState(record.state)) return false;
    restore(clone(record.state));
    return true;
  }

  function uniqueBranchName(name) {
    const base = cleanName(name) || `Branch ${branches.length + 1}`;
    if (!branches.some((branch) => branch.name === base)) return base;
    let suffix = 2;
    while (branches.some((branch) => branch.name === `${base} ${suffix}`)) suffix += 1;
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
      createdAt: date.toISOString(),
    };
    branches.push(branch);
    activeBranchId = branch.id;
    return branchView(branch, activeBranchId, records);
  }

  function switchBranch(id) {
    const branch = branchById(id);
    if (!branch) return false;
    const previousBranchId = activeBranchId;
    activeBranchId = branch.id;
    if (branch.headSnapshotId && !restoreById(branch.headSnapshotId)) {
      activeBranchId = previousBranchId;
      return false;
    }
    return true;
  }

  function renameBranch(id, name) {
    const branch = branchById(id);
    const next = cleanName(name);
    if (!branch || !next) return false;
    branch.name = uniqueBranchName(next === branch.name ? next : next);
    return true;
  }

  function clear() {
    records = [];
    branches = [defaultMainBranch()];
    activeBranchId = MAIN_SNAPSHOT_BRANCH_ID;
  }

  function exportRecords() {
    return clone(records);
  }

  function exportBranchState() {
    return clone({
      version: 1,
      activeBranchId,
      branches,
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
        state: cloneState(raw.state),
      });
      seen.add(raw.id);
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
        if (branch.headSnapshotId) continue;
        branch.headSnapshotId =
          next.find((record) => record.branchId === branch.id)?.id || branch.rootSnapshotId || null;
      }
    }

    records = next;
    branches = importedBranches.slice(0, maxBranches);
    activeBranchId =
      typeof branchState?.activeBranchId === 'string' && branchById(branchState.activeBranchId)
        ? branchState.activeBranchId
        : MAIN_SNAPSHOT_BRANCH_ID;
    return records.length;
  }

  return {
    list,
    listBranches,
    activeBranch,
    create,
    createBranch,
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
