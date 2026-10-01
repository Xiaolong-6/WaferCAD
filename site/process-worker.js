self.importScripts('./vendor/polygon-clipping.umd.js');

let modelModulePromise = null;

function modelModule() {
  if (!modelModulePromise) modelModulePromise = import('./model.js');
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
