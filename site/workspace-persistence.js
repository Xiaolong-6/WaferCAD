import { migrateProjectFile, validateProjectFile } from './project-schema.js';

const DB_NAME = 'wafercad-workspace-v1';
const STORE_NAME = 'workspace';
const RECORD_KEY = 'current';

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

export async function saveWorkspaceState(project) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key: RECORD_KEY,
      project,
      updatedAt: new Date().toISOString(),
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function loadWorkspaceState() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(RECORD_KEY));
    await transactionDone(transaction);
    if (!record?.project) return null;
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
