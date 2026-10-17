// Strict historical-head validation on a disposable worker. This uses the
// exact schema used for foreground validation, without weakening geometry gates.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);
const url = new URL('./project-schema.js', self.location.href);
url.search = versionQuery;
const schema = import(url.href);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1 || data.action !== 'validate-head') return;
  try {
    if (!data.state || data.state.snapshots != null) {
      self.postMessage({ id: 1, type: 'done', valid: false });
      return;
    }
    const { validateProjectFile } = await schema;
    validateProjectFile(data.state);
    self.postMessage({ id: 1, type: 'done', valid: true });
  } catch {
    self.postMessage({ id: 1, type: 'done', valid: false });
  }
};
