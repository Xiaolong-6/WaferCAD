// Independent durable Recovery for opt-in Assembly Bond drafts.
// Does not acquire the ordinary Workstation writer lease or replace its autosave.
import { validateBondedAssemblyProject } from './wafer-assembly.js';
import { validateProjectFile } from './project-schema.js';

const STORE = 'checkpoints';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Assembly draft IndexedDB request failed.'));
  });
}

function completed(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error || new Error('Assembly Recovery transaction aborted.'));
    transaction.onerror = () =>
      reject(transaction.error || new Error('Assembly Recovery transaction failed.'));
  });
}

export function createAssemblyBondDraftRecovery({
  indexedDB = globalThis.indexedDB,
  databaseName = 'wafercad-assembly-bond-drafts-v1',
} = {}) {
  async function database() {
    if (!indexedDB?.open) {
      throw new Error('Assembly Bond requires IndexedDB for durable Recovery.');
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    return requestValue(request);
  }

  async function checkpoint(project, reason = 'pre-wafer-bond') {
    // First Bond checkpoints the independent receiver, later Bonds checkpoint
    // the immutable Assembly baseline. Both are complete portable projects.
    validateProjectFile(project);
    validateBondedAssemblyProject(project);
    const copy = structuredClone(project);
    const key = `${new Date().toISOString()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const db = await database();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const done = completed(tx);
      tx.objectStore(STORE).put({
        key,
        reason,
        project: copy,
        updatedAt: new Date().toISOString(),
      });
      await done;
      return key;
    } finally {
      db.close();
    }
  }

  async function load(key) {
    if (typeof key !== 'string' || !key) throw new Error('Invalid Assembly Recovery key.');
    const db = await database();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const done = completed(tx);
      const record = await requestValue(tx.objectStore(STORE).get(key));
      await done;
      if (!record) throw new Error('Assembly Recovery checkpoint not found.');
      validateProjectFile(record.project);
      validateBondedAssemblyProject(record.project);
      return structuredClone(record.project);
    } finally {
      db.close();
    }
  }

  async function list() {
    const db = await database();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const done = completed(tx);
      const records = await requestValue(tx.objectStore(STORE).getAll());
      await done;
      return records
        .map(({ key, reason, updatedAt, project }) => ({
          key,
          reason,
          updatedAt,
          sourceCount: project?.waferAssembly?.sources?.length || 1,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } finally {
      db.close();
    }
  }

  return { checkpoint, load, list };
}
