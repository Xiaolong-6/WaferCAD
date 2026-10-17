// Independent science probe. Run the *existing* 2D surface-union algorithm
// in a classic Worker with the same polygon-clipping library as production.
// Never modify the canonical model or the renderer from this Worker.
const query = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${query}`);
const moduleUrl = new URL('./model-view-geometry.js', self.location.href);
moduleUrl.search = query;
const geometryModule = import(moduleUrl.href);

self.onmessage = async ({ data }) => {
  if (data?.action !== 'surface-groups' || data.id !== 1) return;
  try {
    const { surfaceGroups } = await geometryModule;
    const started = performance.now();
    const groups = surfaceGroups(data.model, data.face);
    self.postMessage({
      id: 1,
      ok: true,
      face: data.face,
      computeMs: Math.round(performance.now() - started),
      groups,
    });
  } catch (error) {
    self.postMessage({ id: 1, ok: false, error: String(error?.stack || error) });
  }
};
