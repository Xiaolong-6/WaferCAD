// A read-only analysis worker. Keep polygon booleans off the UI thread.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

let diagnosticsPromise;
self.onmessage = async ({ data }) => {
  const { id, model } = data || {};
  if (!id || !model) return;
  try {
    if (!diagnosticsPromise) {
      const url = new URL('./process-diagnostics.js', self.location.href);
      url.search = versionQuery;
      diagnosticsPromise = import(url.href);
    }
    const { analyzeProcessGeometry } = await diagnosticsPromise;
    const report = analyzeProcessGeometry(model);
    self.postMessage({ id, type: 'done', report });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Geometry analysis failed'),
    });
  }
};
