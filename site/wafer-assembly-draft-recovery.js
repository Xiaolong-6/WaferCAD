// Independent durable Recovery for opt-in Assembly Bond drafts.
// Does not acquire the ordinary Workstation writer lease or replace its autosave.
import { validateBondedAssemblyProject } from './wafer-assembly.js';
import { validateProjectFile } from './project-schema.js';
import { validateAssemblyVariantGraph, assemblyVariantProject } from './wafer-assembly-variants.js';

const STORE = 'checkpoints';
const WORKSPACES = 'workspaces';

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
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'key' });
      }
      if (!request.result.objectStoreNames.contains(WORKSPACES)) {
        request.result.createObjectStore(WORKSPACES, { keyPath: 'id' });
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


  // Revision-checked, single-IDB-transaction publication. A record becomes
  // recoverable only after tx.oncomplete. Any write abort preserves the former
  // confirmed revision. No normal Workstation autosave data is touched.
  async function saveWorkspaceGraph(id, graph, expectedRevision = 0) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) {
      throw new Error('Invalid Assembly workspace identity.');
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('Invalid Assembly workspace expected revision.');
    }
    validateAssemblyVariantGraph(graph);
    const project = assemblyVariantProject(graph);
    validateBondedAssemblyProject(project);
    const payload = structuredClone(graph);
    const db = await database();
    try {
      const tx = db.transaction(WORKSPACES, 'readwrite');
      const done = completed(tx);
      const store = tx.objectStore(WORKSPACES);
      const existing = await requestValue(store.get(id));
      const actualRevision = existing?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        tx.abort();
        await done.catch(() => {});
        throw new Error('Assembly workspace revision conflict; reload Recovery before editing.');
      }
      const revision = expectedRevision + 1;
      store.put({
        id,
        revision,
        graph: payload,
        updatedAt: new Date().toISOString(),
      });
      await done;
      return { id, revision };
    } finally {
      db.close();
    }
  }

  async function loadWorkspaceGraph(id) {
    if (typeof id !== 'string' || !id) throw new Error('Invalid Assembly workspace identity.');
    const db = await database();
    try {
      const tx = db.transaction(WORKSPACES, 'readonly');
      const done = completed(tx);
      const record = await requestValue(tx.objectStore(WORKSPACES).get(id));
      await done;
      if (!record) throw new Error('Assembly workspace Recovery record not found.');
      if (!Number.isSafeInteger(record.revision) || record.revision < 1) {
        throw new Error('Assembly workspace Recovery revision is invalid.');
      }
      validateAssemblyVariantGraph(record.graph);
      const project = assemblyVariantProject(record.graph);
      validateBondedAssemblyProject(project);
      return { id, revision: record.revision, graph: structuredClone(record.graph), project };
    } finally {
      db.close();
    }
  }

  async function listWorkspaceGraphs() {
    const db = await database();
    try {
      const tx = db.transaction(WORKSPACES, 'readonly');
      const done = completed(tx);
      const entries = await requestValue(tx.objectStore(WORKSPACES).getAll());
      await done;
      // Validate on demand at load; listing is metadata-only and cannot
      // silently accept a forged physical model into the editor.
      return entries
        .map(({ id, revision, updatedAt, graph }) => ({
          id,
          revision,
          updatedAt,
          branches: graph?.branches?.length ?? 0,
          sources: graph?.sources?.length ?? 0,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } finally {
      db.close();
    }
  }

  return { checkpoint, load, list, saveWorkspaceGraph, loadWorkspaceGraph, listWorkspaceGraphs };
}
