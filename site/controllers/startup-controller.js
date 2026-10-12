export function createStartupController({
  takeStartupFile,
  openLayoutFile,
  openProjectFile,
  openBundledExample,
  status,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
}) {
  // Called only by the startup coordinator after it protects any persisted
  // workspace (or finds no saved workspace to replace). A startup load must
  // not ask the not-yet-ready persistence controller for a second checkpoint.
  async function initializeWorkspaceStart() {
    const params = new URLSearchParams(locationRef?.search || ''),
      start = params.get('start');
    if (!start) return true;

    try {
      const entry = /(?:^|\/)app-legacy\.html$/.test(locationRef?.pathname || '')
        ? './app-legacy.html'
        : './app.html';
      // Embedded previews must retain their source/view protocol on reload.
      if (params.get('preview') !== '1') historyRef.replaceState(null, '', entry);
    } catch {}

    if (start === 'empty') return true;

    if (start === 'example') {
      const exampleId = params.get('example') || 'photodetector-literature';
      return Boolean(await openBundledExample(exampleId, { startupProtected: true }));
    }

    if (start !== 'staged') return false;

    try {
      const staged = await takeStartupFile();
      if (!staged) {
        status('No pending welcome-page file was found. Use Import layout or Open project.');
        return false;
      }
      if (staged.kind === 'layout') {
        return Boolean(await openLayoutFile(staged.file, { startupProtected: true }));
      }
      if (staged.kind === 'project') {
        return Boolean(await openProjectFile(staged.file, { startupProtected: true }));
      }
      status('The pending welcome-page file type is unsupported.');
      return false;
    } catch (error) {
      console.error(error);
      status(`Could not open the welcome-page file: ${error.message}`);
      return false;
    }
  }

  return { initializeWorkspaceStart };
}
