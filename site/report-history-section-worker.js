// Stateless, one historical Section state per worker invocation.
// The caller owns selection, checkpoint identity, image budgets and abort.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

let rendererPromise = null;
function renderer() {
  if (!rendererPromise) {
    const url = new URL('./report-section-svg.js', self.location.href);
    url.search = versionQuery;
    rendererPromise = import(url.href);
  }
  return rendererPromise;
}

self.onmessage = async (event) => {
  const { id, state, nodeId, width, height } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Slicing the saved physical structure…' });
    const { renderHistoricalSectionSvg } = await renderer();
    const result = renderHistoricalSectionSvg({ state, nodeId, width, height });
    self.postMessage({ id, type: 'done', ...result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Historical Section rendering failed.'),
    });
  }
};
