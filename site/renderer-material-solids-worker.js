// A single child of the existing Surface Plan worker. Only independent
// material solids are returned; physical cap/sidewall ownership stays in the
// parent, preserving the original deterministic final surface plan.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);
const moduleUrl = new URL('./process-topology.js', self.location.href);
moduleUrl.search = versionQuery;
const topologyModule = import(moduleUrl.href);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1) return;
  try {
    const { materialSolidsFromTopology } = await topologyModule;
    const solids = materialSolidsFromTopology(data.model, data.clip ?? null);
    self.postMessage({ id: 1, type: 'done', solids });
  } catch (error) {
    self.postMessage({ id: 1, type: 'error', message: error?.message || String(error) });
  }
};
