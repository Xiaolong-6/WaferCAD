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

export function createSnapshotManager({
  capture,
  restore,
  validateState = () => true,
  now = () => new Date(),
  idFactory = () => `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  maxRecords = MAX_SNAPSHOTS,
} = {}) {
  if (typeof capture !== 'function') throw new TypeError('capture must be a function');
  if (typeof restore !== 'function') throw new TypeError('restore must be a function');

  let records = [];
  const cloneState = createStateCloner();

  function list() {
    return records.map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }

  function create(name = '') {
    if (records.length >= maxRecords) {
      throw new Error(`Snapshot limit of ${maxRecords} reached.`);
    }
    const stamp = now();
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    const state = cloneState(capture());
    if (!validateState(state)) throw new Error('Cannot save an invalid workspace state.');

    const record = {
      id: idFactory(),
      name: cleanName(name) || defaultSnapshotName(date),
      createdAt: date.toISOString(),
      state,
    };
    records.unshift(record);
    return { id: record.id, name: record.name, createdAt: record.createdAt };
  }

  function rename(id, name) {
    const record = records.find((item) => item.id === id);
    const next = cleanName(name);
    if (!record || !next) return false;
    record.name = next;
    return true;
  }

  function remove(id) {
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) return false;
    records.splice(index, 1);
    return true;
  }

  function restoreById(id) {
    const record = records.find((item) => item.id === id);
    if (!record || !validateState(record.state)) return false;
    restore(cloneState(record.state));
    return true;
  }

  function clear() {
    records = [];
  }

  function exportRecords() {
    return clone(records);
  }

  function importRecords(value) {
    if (!Array.isArray(value)) {
      records = [];
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
        state: cloneState(raw.state),
      });
      seen.add(raw.id);
    }

    records = next;
    return records.length;
  }

  return {
    list,
    create,
    rename,
    remove,
    restore: restoreById,
    clear,
    exportRecords,
    importRecords,
  };
}
