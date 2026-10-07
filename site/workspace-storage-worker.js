const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

const moduleUrl = new URL('./project-io.js', self.location.href);
moduleUrl.search = versionQuery;
const projectIo = import(moduleUrl.href);

self.onmessage = async ({ data }) => {
  const { id, project } = data || {};
  if (!id) return;
  try {
    const api = await projectIo;
    const stored = api.prepareProjectForWorkspaceStorage(project);
    self.postMessage({ id, type: 'done', project: stored });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) });
  }
};
