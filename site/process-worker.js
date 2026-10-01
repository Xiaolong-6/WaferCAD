const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

let modelModulePromise = null;

function modelModule() {
  if (!modelModulePromise) {
    const url = new URL('./model.js', self.location.href);
    url.search = versionQuery;
    modelModulePromise = import(url.href);
  }
  return modelModulePromise;
}

self.onmessage = async (event) => {
  const { id, model, params } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Computing geometry…' });
    const { applyOperation } = await modelModule();
    const nextModel = structuredClone(model);
    const result = applyOperation(nextModel, params);
    self.postMessage({ id, type: 'done', model: nextModel, result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown process error'),
    });
  }
};
