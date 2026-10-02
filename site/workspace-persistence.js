import { CURRENT_PROJECT_VERSION, migrateProjectFile, validateProjectFile } from './project-schema.js';

const DB_NAME = 'wafercad-workspace-v1';
const STORE_NAME = 'workspace';
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB is unavailable.'));
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

async function pruneRecoveryPoints(database, keep = MAX_RECOVERY_POINTS) {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const records = await requestResult(store.getAll());
  const recoveries = records
    .filter((record) => String(record?.key || '').startsWith(RECOVERY_PREFIX))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  recoveries.slice(Math.max(0, keep)).forEach((record) => store.delete(record.key));
  await transactionDone(transaction);
}

export async function saveWorkspaceState(project, metadata = {}) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key: RECORD_KEY,
      project,
      updatedAt: new Date().toISOString(),
      ...recordMetadata(project, metadata),
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function createWorkspaceRecoveryCheckpoint(project, metadata = {}) {
  const database = await openDatabase();
  try {
    const updatedAt = new Date().toISOString();
    const key = `${RECOVERY_PREFIX}${updatedAt}:${Math.random().toString(36).slice(2, 8)}`;
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key,
      project: structuredClone(project),
      updatedAt,
      ...recordMetadata(project, metadata),
    });
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
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
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
    return validateProjectFile(migrateProjectFile(record.project));
  } finally {
    database.close();
  }
}

export async function loadWorkspaceState() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(RECORD_KEY));
    await done;
    if (!record?.project) return null;

    const rawVersion = Number(record.project.version) || 1;
    if (rawVersion < CURRENT_PROJECT_VERSION) {
      await createWorkspaceRecoveryCheckpoint(record.project, {
        appCommit: record.appCommit,
        reason: `pre-migration-v${rawVersion}`,
      });
    }
    return validateProjectFile(migrateProjectFile(record.project));
  } finally {
    database.close();
  }
}

export async function clearWorkspaceState() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
