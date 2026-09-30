const DB_NAME = 'wafercad-startup-v1';
const STORE_NAME = 'pending-files';
const RECORD_KEY = 'startup';

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
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB is unavailable.'));
  });
}

export async function stageStartupFile(file, kind) {
  if (!(file instanceof Blob)) throw new Error('No file selected.');
  if (!['layout', 'project'].includes(kind)) throw new Error('Unsupported startup file type.');

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key: RECORD_KEY,
      kind,
      name: file.name || 'WaferCAD file',
      type: file.type || '',
      lastModified: Number(file.lastModified) || Date.now(),
      blob: file,
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function takeStartupFile() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestResult(store.get(RECORD_KEY));
    store.delete(RECORD_KEY);
    await transactionDone(transaction);
    if (!record?.blob) return null;
    return {
      kind: record.kind,
      file: new File([record.blob], record.name, {
        type: record.type || record.blob.type || '',
        lastModified: Number(record.lastModified) || Date.now(),
      }),
    };
  } finally {
    database.close();
  }
}
