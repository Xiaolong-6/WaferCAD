// Restore the exact persisted project inside a dedicated worker. Validation,
// migration, and the pre-migration Recovery checkpoint remain in the existing
// workspace-persistence owner; only the execution context changes.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

const moduleUrl = new URL('./workspace-persistence.js', self.location.href);
moduleUrl.search = versionQuery;
const persistenceModule = import(moduleUrl.href);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1 || data.action !== 'load-current') return;
  try {
    const persistence = await persistenceModule;
    const project = await persistence.loadWorkspaceStateDirect();
    self.postMessage({ id: 1, type: 'done', project });
  } catch (error) {
    self.postMessage({
      id: 1,
      type: 'error',
      message: error?.message || String(error || 'Workspace restore failed.'),
    });
  }
};
