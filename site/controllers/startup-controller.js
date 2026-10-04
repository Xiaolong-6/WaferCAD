export function createStartupController({
  takeStartupFile,
  openLayoutFile,
  openProjectFile,
  openBundledExample,
  openVisualizationExample,
  status,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
}) {
  async function initializeWorkspaceStart() {
    const params = new URLSearchParams(locationRef?.search || ''),
      start = params.get('start');
    if (!start) return true;

    try {
      historyRef.replaceState(null, '', './app.html');
    } catch {}

    if (start === 'empty') return true;

    if (start === 'example') {
      const exampleId = params.get('example') || 'visualization';
      if (exampleId === 'visualization') return Boolean(await openVisualizationExample());
      return Boolean(await openBundledExample(exampleId));
    }

    if (start !== 'staged') return false;

    try {
      const staged = await takeStartupFile();
      if (!staged) {
        status('No pending welcome-page file was found. Use Import layout or Open project.');
        return false;
      }
      if (staged.kind === 'layout') return Boolean(await openLayoutFile(staged.file));
      if (staged.kind === 'project') return Boolean(await openProjectFile(staged.file));
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
