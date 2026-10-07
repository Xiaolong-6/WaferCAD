import { expandProjectStorage, prepareProjectForWorkspaceStorage } from './project-io.js';
import {
  CURRENT_PROJECT_VERSION,
  migrateProjectFile,
  validateProjectFile,
} from './project-schema.js';

const DB_NAME = 'wafercad-workspace-v1';
const DB_VERSION = 2;
const STORE_NAME = 'workspace';
const META_STORE_NAME = 'workspace-metadata';
const RECORD_KEY = 'current';
const RECOVERY_PREFIX = 'recovery:';
const MAX_RECOVERY_POINTS = 8;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () =>
      reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () =>
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}

function recordMetadata(project, metadata = {}) {
  return {
    appCommit: String(metadata.appCommit || ''),
    projectVersion: Number(project?.version) || null,
    revision: Number(project?.model?.revision) || 0,
    reason: String(metadata.reason || ''),
  };
}

function metadataRecord(key, project, metadata = {}, updatedAt = new Date().toISOString()) {
  return {
    key,
    updatedAt,
    ...recordMetadata(project, metadata),
  };
}

function migrateLegacyMetadata(transaction) {
  if (!transaction) return;
  const payloadStore = transaction.objectStore(STORE_NAME);
  const metadataStore = transaction.objectStore(META_STORE_NAME);
  const cursorRequest = payloadStore.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const record = cursor.value || {};
    if (record.key) {
      metadataStore.put({
        key: record.key,
        updatedAt: String(record.updatedAt || ''),
        appCommit: String(record.appCommit || ''),
        projectVersion: Number(record.projectVersion ?? record.project?.version) || null,
        revision: Number(record.revision ?? record.project?.model?.revision) || 0,
        reason: String(record.reason || ''),
      });
    }
    cursor.continue();
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(META_STORE_NAME)) {
        database.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
      }
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        migrateLegacyMetadata(request.transaction);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB is unavailable.'));
  });
}

async function pruneRecoveryPoints(database, keep = MAX_RECOVERY_POINTS) {
  const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
  const payloadStore = transaction.objectStore(STORE_NAME);
  const metadataStore = transaction.objectStore(META_STORE_NAME);
  const records = await requestResult(metadataStore.getAll());
  const recoveries = records
    .filter((record) => String(record?.key || '').startsWith(RECOVERY_PREFIX))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  for (const record of recoveries.slice(Math.max(0, keep))) {
    payloadStore.delete(record.key);
    metadataStore.delete(record.key);
  }
  await transactionDone(transaction);
}

// Keep strict packing off the UI thread. Each request owns its worker and a
// structured-cloned candidate, so edits made while saving cannot alter that save.
export async function prepareWorkspaceStorage(project) {
  if (typeof globalThis.Worker !== 'function') {
    return Promise.resolve(prepareProjectForWorkspaceStorage(project));
  }
  return new Promise((resolve, reject) => {
    let worker;
    const finish = (error, stored) => {
      worker?.terminate();
      if (error) reject(error);
      else resolve(stored);
    };
    try {
      const url = new URL('./workspace-storage-worker.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      worker = new globalThis.Worker(url);
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1) return;
        if (data.type === 'done' && data.project) finish(null, data.project);
        else if (data.type === 'error')
          finish(new Error(data.message || 'Workspace packing failed.'));
      };
      worker.onerror = (event) =>
        finish(new Error(event.message || 'Workspace storage worker failed.'));
      worker.onmessageerror = () =>
        finish(new Error('Workspace storage worker returned unreadable data.'));
      worker.postMessage({ id: 1, project });
    } catch (error) {
      finish(error);
    }
  });
}

export async function saveWorkspaceState(project, metadata = {}, { canCommit = () => true } = {}) {
  const preparedProject = await prepareWorkspaceStorage(project);
  if (!canCommit()) return false;

  const database = await openDatabase();
  try {
    if (!canCommit()) return false;
    const updatedAt = new Date().toISOString();
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key: RECORD_KEY,
      project: preparedProject,
    });
    transaction
      .objectStore(META_STORE_NAME)
      .put(metadataRecord(RECORD_KEY, preparedProject, metadata, updatedAt));
    await transactionDone(transaction);
    return true;
  } finally {
    database.close();
  }
}

export async function createWorkspaceRecoveryCheckpoint(project, metadata = {}) {
  const preparedProject = await prepareWorkspaceStorage(project);
  const database = await openDatabase();
  try {
    const updatedAt = new Date().toISOString();
    const key = `${RECOVERY_PREFIX}${updatedAt}:${Math.random().toString(36).slice(2, 8)}`;
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key,
      project: preparedProject,
    });
    transaction
      .objectStore(META_STORE_NAME)
      .put(metadataRecord(key, preparedProject, metadata, updatedAt));
    await transactionDone(transaction);
    await pruneRecoveryPoints(database);
    return key;
  } finally {
    database.close();
  }
}

export async function listWorkspaceRecoveryPoints() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(META_STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(META_STORE_NAME).getAll());
    await done;
    return records
      .filter((record) => String(record?.key || '').startsWith(RECOVERY_PREFIX))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .map(({ key, updatedAt, appCommit, projectVersion, revision, reason }) => ({
        key,
        updatedAt,
        appCommit,
        projectVersion,
        revision,
        reason,
      }));
  } finally {
    database.close();
  }
}

export async function loadWorkspaceRecoveryPoint(key) {
  if (!String(key || '').startsWith(RECOVERY_PREFIX)) {
    throw new Error('Invalid recovery checkpoint key.');
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    await done;
    if (!record?.project) return null;
    const project = structuredClone(record.project);
    expandProjectStorage(project);
    return validateProjectFile(migrateProjectFile(project));
  } finally {
    database.close();
  }
}

export async function clearWorkspaceRecoveryPoints() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    const payloadStore = transaction.objectStore(STORE_NAME);
    const metadataStore = transaction.objectStore(META_STORE_NAME);
    const records = await requestResult(metadataStore.getAll());
    let removed = 0;
    for (const record of records) {
      if (!String(record?.key || '').startsWith(RECOVERY_PREFIX)) continue;
      payloadStore.delete(record.key);
      metadataStore.delete(record.key);
      removed++;
    }
    await transactionDone(transaction);
    return removed;
  } finally {
    database.close();
  }
}

export async function loadWorkspaceState() {
  const database = await openDatabase();
  let record = null;
  let metadata = null;
  try {
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readonly');
    const done = transactionDone(transaction);
    [record, metadata] = await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).get(RECORD_KEY)),
      requestResult(transaction.objectStore(META_STORE_NAME).get(RECORD_KEY)),
    ]);
    await done;
  } finally {
    database.close();
  }

  if (!record?.project) return null;
  const project = structuredClone(record.project);
  expandProjectStorage(project);
  const rawVersion = Number(project.version) || 1,
    migrated = validateProjectFile(migrateProjectFile(project));
  if (rawVersion < CURRENT_PROJECT_VERSION) {
    await createWorkspaceRecoveryCheckpoint(migrated, {
      appCommit: metadata?.appCommit,
      reason: `pre-migration-v${rawVersion}`,
    });
  }
  return migrated;
}

export async function clearWorkspaceState() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
    transaction.objectStore(META_STORE_NAME).delete(RECORD_KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
