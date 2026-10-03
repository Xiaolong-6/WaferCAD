const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);


function versioned(path) {
  const url = new URL(path, self.location.href);
  url.search = versionQuery;
  return url.href;
}

let modulesPromise = null;
function modules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import(versioned('./project-io.js')),
      import(versioned('./project-schema.js')),
    ]);
  }
  return modulesPromise;
}

self.onmessage = async (event) => {
  const { id, arrayBuffer } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Parsing project JSON…' });
    const [projectIo, projectSchema] = await modules();
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    } catch {
      throw new Error('Project file is not valid JSON.');
    }
    self.postMessage({ id, type: 'progress', stage: 'Validating project…' });
    projectIo.expandProjectStorage(parsed);
    const project = projectSchema.validateProjectFile(projectSchema.migrateProjectFile(parsed));
    self.postMessage({ id, type: 'done', project });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown project import error'),
    });
  }
};
