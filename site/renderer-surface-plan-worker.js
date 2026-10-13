// Run the existing deterministic physical-ownership plan off the UI thread.
// Only plain scientific geometry is exchanged; no Three.js/WebGL state crosses.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

const moduleUrl = new URL('./renderer-geometry.js', self.location.href);
moduleUrl.search = versionQuery;
const geometryModule = import(moduleUrl.href);
const transportModule = import(
  new URL('./renderer-surface-plan-stream.js' + versionQuery, self.location.href)
);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1 || data.action !== 'surface-plan') return;
  try {
    const { buildRenderSurfacePlan } = await geometryModule;
    const plan = buildRenderSurfacePlan(data.model, data.clip ?? null);
    const { sendSurfacePlanChunks } = await transportModule;
    sendSurfacePlanChunks(plan, (message) => self.postMessage({ id: 1, ...message }));
  } catch (error) {
    self.postMessage({
      id: 1,
      type: 'error',
      message: error?.message || String(error || 'Surface ownership calculation failed.'),
    });
  }
};
