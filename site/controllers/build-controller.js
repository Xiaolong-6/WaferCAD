export function createBuildController({
  buildVersion,
  status,
  documentRef = document,
  fetchImpl = fetch,
  repositoryUrl = 'https://github.com/Xiaolong-6/WaferCAD',
  onUpdateAvailable = () => {},
}) {
  let announcedBuildUpdate = '';

  async function checkForBuildUpdate() {
    if (!/^[0-9a-f]{7,64}$/i.test(buildVersion)) return;
    try {
      const response = await fetchImpl('./build-info.json', { cache: 'no-store' });
      if (!response.ok) return;
      const info = await response.json();
      const current = String(info.commit || '').trim();
      if (!current || current === buildVersion || current === announcedBuildUpdate) return;
      announcedBuildUpdate = current;
      const host = documentRef.getElementById('buildCommit');
      if (host) {
        host.textContent = `commit ${buildVersion.slice(0, 7)} · update`;
        host.title = `Loaded ${buildVersion.slice(0, 7)}; deployed ${current.slice(0, 7)}. Save, then reload.`;
      }
      onUpdateAvailable(current);
      status(
        `Update ${current.slice(0, 7)} available. Use Reload safely to update without losing the workspace.`,
      );
    } catch {}
  }

  async function loadBuildCommit() {
    const host = documentRef.getElementById('buildCommit');
    if (!host) return;

    try {
      const response = await fetchImpl('./build-info.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('build info unavailable');
      const info = await response.json();
      const commit = String(info.commit || '').trim();
      if (!commit) throw new Error('build commit missing');
      host.textContent = `commit ${commit.slice(0, 7)}`;
      host.href = `${repositoryUrl}/commit/${commit}`;
      host.target = '_blank';
      host.rel = 'noreferrer';
      host.title = `Open commit ${commit}`;
    } catch {
      host.textContent = 'commit local';
      host.removeAttribute('href');
      host.removeAttribute('target');
      host.removeAttribute('rel');
      host.title = 'Local build; no deployed commit is available';
    }
  }

  return { checkForBuildUpdate, loadBuildCommit };
}
