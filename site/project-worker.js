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
  const { id, arrayBuffer, trustedBundledExample } = event.data || {};
  if (!id) return;
  try {
    const startedAt = performance.now();
    self.postMessage({ id, type: 'progress', stage: 'Parsing project JSON…' });
    const [projectIo, projectSchema] = await modules();
    const modulesReadyAt = performance.now();
    if (trustedBundledExample) {
      self.postMessage({ id, type: 'progress', stage: 'Verifying bundled integrity…' });
      const project = await projectIo.readProjectFile({
        name: 'bundled-example.wafercad',
        size: arrayBuffer.byteLength,
        text: async () => new TextDecoder().decode(arrayBuffer),
        arrayBuffer: async () => arrayBuffer,
      }, { trustedBundledExample });
      const completedAt = performance.now();
      self.postMessage({ id, type: 'done', project, timingsMs: {
        moduleLoad: modulesReadyAt - startedAt,
        parse: completedAt - modulesReadyAt,
        expand: 0,
        migrationAndValidation: 0,
        workerTotalBeforeSend: completedAt - startedAt,
      } });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    } catch {
      throw new Error('Project file is not valid JSON.');
    }
    const parsedAt = performance.now();
    self.postMessage({ id, type: 'progress', stage: 'Validating project…' });
    projectIo.expandProjectStorage(parsed);
    const expandedAt = performance.now();
    const project = projectSchema.validateProjectFile(projectSchema.migrateProjectFile(parsed));
    const validatedAt = performance.now();
    self.postMessage({
      id,
      type: 'done',
      project,
      timingsMs: {
        moduleLoad: modulesReadyAt - startedAt,
        parse: parsedAt - modulesReadyAt,
        expand: expandedAt - parsedAt,
        migrationAndValidation: validatedAt - expandedAt,
        workerTotalBeforeSend: validatedAt - startedAt,
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown project import error'),
    });
  }
};
