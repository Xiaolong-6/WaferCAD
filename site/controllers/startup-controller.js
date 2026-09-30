export function createStartupController({
  takeStartupFile,
  openLayoutFile,
  openProjectFile,
  openVisualizationExample,
  status,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
}) {
  async function initializeWorkspaceStart() {
    const params = new URLSearchParams(locationRef?.search || ''),
      start = params.get('start');
    if (!start) return;

    try {
      historyRef.replaceState(null, '', './app.html');
    } catch {}

    if (start === 'example') {
      openVisualizationExample();
      return;
    }

    if (start !== 'staged') return;

    try {
      const staged = await takeStartupFile();
      if (!staged) {
        status('No pending welcome-page file was found. Use Import layout or Open project.');
        return;
      }
      if (staged.kind === 'layout') await openLayoutFile(staged.file);
      else if (staged.kind === 'project') await openProjectFile(staged.file);
      else status('The pending welcome-page file type is unsupported.');
    } catch (error) {
      console.error(error);
      status(`Could not open the welcome-page file: ${error.message}`);
    }
  }

  return { initializeWorkspaceStart };
}
