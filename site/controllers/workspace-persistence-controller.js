import {
  clearWorkspaceRecoveryPoints,
  createWorkspaceRecoveryCheckpoint,
  listWorkspaceRecoveryPoints,
  loadWorkspaceRecoveryPoint,
  loadWorkspaceState,
  saveWorkspaceState,
} from '../workspace-persistence.js';

export function createWorkspacePersistenceController({
  root = document,
  workspaceSession,
  appCommit = '',
  status,
  buildProjectSnapshot,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs,
  renderAll,
  renderSnapshots,
  fit3d,
  initializeWorkspaceStart,
  normalizedProjectName,
  getProjectName,
  setProjectName,
  syncProjectNameInput,
}) {
  const $ = (id) => root.getElementById(id);
  let ready = false,
    timer = null,
    write = Promise.resolve(),
    updateCommit = '';

  function setSaveStatus(text, failed = false) {
    const host = $('workspaceSaveStatus');
    if (!host) return;
    host.textContent = text;
    host.dataset.failed = failed ? 'true' : 'false';
  }

  function savedTimeLabel(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function clearTimer() {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  function persistNow() {
    if (!ready || !workspaceSession?.canWrite()) return Promise.resolve(false);
    clearTimer();
    const project = buildProjectSnapshot(true);
    setSaveStatus('Autosaving…');
    write = write
      .catch(() => {})
      .then(() => saveWorkspaceState(project, { appCommit }))
      .then(() => {
        setSaveStatus(`Autosaved · ${savedTimeLabel()}`);
        return true;
      });
    write.catch((error) => {
      setSaveStatus('Local save failed', true);
      console.warn('Workspace autosave failed.', error);
    });
    return write;
  }

  function schedule() {
    if (!ready || !workspaceSession?.canWrite()) return;
    setSaveStatus('Autosaving…');
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void persistNow();
    }, 800);
  }

  async function refreshRecoveryOptions() {
    const select = $('workspaceRecoverySelect'),
      restore = $('workspaceRestoreBtn'),
      clear = $('workspaceRecoveryClearBtn');
    if (!select || !restore) return;
    try {
      const points = await listWorkspaceRecoveryPoints();
      select.replaceChildren();
      if (!points.length) {
        select.append(new Option('No recovery points', ''));
        restore.disabled = true;
        if (clear) clear.disabled = true;
        return;
      }
      for (const point of points) {
        const date = new Date(point.updatedAt),
          reason = point.reason ? ` · ${point.reason}` : '',
          commit = point.appCommit ? ` · ${point.appCommit.slice(0, 7)}` : '';
        select.append(new Option(`${date.toLocaleString()}${reason}${commit}`, point.key));
      }
      const writable = workspaceSession?.canWrite() ?? false;
      restore.disabled = !writable;
      if (clear) clear.disabled = !writable;
    } catch (error) {
      console.warn('Could not list workspace recovery points.', error);
    }
  }

  function syncSessionState({ writable }) {
    const workspace = root.querySelector('.workspace'),
      dialog = $('workspaceConflictDialog');
    if (workspace) {
      workspace.inert = false;
      workspace.dataset.autosaveOwner = writable ? 'true' : 'false';
    }
    if (dialog) dialog.hidden = writable;
    if (!writable) {
      clearTimer();
      setSaveStatus('Autosave paused · another tab owns local storage');
      if ($('workspaceRestoreBtn')) $('workspaceRestoreBtn').disabled = true;
      if ($('workspaceRecoveryClearBtn')) $('workspaceRecoveryClearBtn').disabled = true;
      status(
        'Another tab owns local autosave. Editing and mask import remain available; use Take over to save from this tab.',
        'warning',
      );
    } else {
      if (ready) schedule();
      void refreshRecoveryOptions();
    }
  }

  function setUpdateCommit(commit) {
    updateCommit = String(commit || '');
  }

  async function restoreSelectedRecovery() {
    if (!workspaceSession?.canWrite()) {
      status('This tab is read-only. Take over the workspace before restoring a checkpoint.', 'warning');
      return;
    }
    const key = $('workspaceRecoverySelect')?.value;
    if (!key) return;
    if (
      !globalThis.confirm(
        'Restore this local recovery checkpoint? The current workspace will be checkpointed first.',
      )
    ) {
      return;
    }

    try {
      const current = buildProjectSnapshot(true);
      await createWorkspaceRecoveryCheckpoint(current, {
        appCommit,
        reason: 'pre-restore',
      });
      const recovered = await loadWorkspaceRecoveryPoint(key);
      if (!recovered) throw new Error('Recovery checkpoint is unavailable.');
      loadProjectSnapshot(recovered);
      snapshotManager.importRecords(recovered.snapshots || []);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      fit3d();
      await persistNow();
      await refreshRecoveryOptions();
      status(`Restored local recovery checkpoint for "${normalizedProjectName()}".`);
    } catch (error) {
      console.error(error);
      status(`Recovery restore failed: ${error.message}`, 'error');
    }
  }

  async function reloadSafely() {
    if (!workspaceSession?.canWrite()) {
      status('This tab is read-only. Update from the tab that owns the workspace.', 'warning');
      return;
    }
    const button = $('safeReloadBtn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }

    try {
      clearTimer();
      const project = buildProjectSnapshot(true);
      setSaveStatus('Autosaving…');
      write = write
        .catch(() => {})
        .then(() => saveWorkspaceState(project, { appCommit }))
        .then(() =>
          createWorkspaceRecoveryCheckpoint(project, {
            appCommit,
            reason: updateCommit ? `pre-update-${updateCommit.slice(0, 7)}` : 'pre-reload',
          }),
        );
      await write;
      setSaveStatus(`Autosaved · ${savedTimeLabel()}`);
      workspaceSession.stop();
      globalThis.location.reload();
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Reload safely';
      }
      setSaveStatus('Local save failed', true);
      status(`Safe reload cancelled: ${error.message}`, 'error');
    }
  }

  async function checkpointCurrent(reason = 'pre-destructive-action') {
    if (!ready || !workspaceSession?.canWrite()) return false;
    clearTimer();
    const project = buildProjectSnapshot(true);
    await createWorkspaceRecoveryCheckpoint(project, {
      appCommit,
      reason,
    });
    await refreshRecoveryOptions();
    return true;
  }

  async function saveCheckpoint() {
    if (!workspaceSession?.canWrite()) {
      status('This tab cannot Save locally while another tab owns browser storage.', 'warning');
      return;
    }
    try {
      const projectName = normalizedProjectName(getProjectName());
      setProjectName(projectName);
      syncProjectNameInput();
      clearTimer();
      const project = buildProjectSnapshot(true);
      setSaveStatus('Autosaving…');
      write = write
        .catch(() => {})
        .then(() => saveWorkspaceState(project, { appCommit }))
        .then(() =>
          createWorkspaceRecoveryCheckpoint(project, {
            appCommit,
            reason: `manual-save · ${projectName}`,
          }),
        );
      await write;
      setSaveStatus(`Saved checkpoint · ${savedTimeLabel()}`);
      await refreshRecoveryOptions();
      status(`Saved "${projectName}" locally. It is available in Recovery.`);
    } catch (error) {
      console.error(error);
      setSaveStatus('Local save failed', true);
      status(`Local Save failed: ${error.message}`, 'error');
    }
  }

  async function initializePersistedWorkspace() {
    const hasExplicitStart = new URLSearchParams(globalThis.location?.search || '').has('start');
    try {
      if (hasExplicitStart) {
        await initializeWorkspaceStart();
      } else {
        const saved = await loadWorkspaceState();
        if (saved) {
          loadProjectSnapshot(saved);
          snapshotManager.importRecords(saved.snapshots || []);
          syncBaseControls();
          syncTransformInputs();
          renderAll();
          renderSnapshots();
          fit3d();
          status(`Restored local workspace "${normalizedProjectName()}".`);
        }
      }
    } catch (error) {
      console.warn('Workspace restore failed.', error);
      status(`Local workspace restore failed: ${error.message}`);
    } finally {
      ready = true;
      schedule();
      void refreshRecoveryOptions();
    }
  }

  function bind() {
    $('workspaceTakeOverBtn').onclick = () => {
      if (
        !globalThis.confirm(
          'Take over editing in this tab? The other tab will become read-only and may contain newer unsaved edits.',
        )
      ) {
        return;
      }
      if (workspaceSession.takeOver()) {
        status('This tab now owns the local workspace.');
        schedule();
        void refreshRecoveryOptions();
      }
    };

    $('safeReloadBtn').onclick = () => {
      void reloadSafely();
    };
    $('workspaceRecoverySelect').onchange = (event) => {
      $('workspaceRestoreBtn').disabled = !event.target.value || !workspaceSession?.canWrite();
    };
    $('workspaceRestoreBtn').onclick = () => {
      void restoreSelectedRecovery();
    };
    $('workspaceRecoveryClearBtn').onclick = async () => {
      if (!workspaceSession?.canWrite()) {
        status('This tab cannot clear local Recovery while another tab owns browser storage.', 'warning');
        return;
      }
      if (
        !globalThis.confirm(
          'Clear all local Recovery checkpoints? The current autosaved workspace is kept.',
        )
      ) {
        return;
      }
      try {
        const removed = await clearWorkspaceRecoveryPoints();
        await refreshRecoveryOptions();
        status(
          removed
            ? `Cleared ${removed} local Recovery checkpoint${removed === 1 ? '' : 's'}.`
            : 'Recovery is already empty.',
        );
      } catch (error) {
        console.error(error);
        status(`Could not clear Recovery: ${error.message}`, 'error');
      }
    };
    $('saveProjectBtn').onclick = () => {
      void saveCheckpoint();
    };
  }

  return {
    bind,
    persistNow,
    schedule,
    refreshRecoveryOptions,
    checkpointCurrent,
    syncSessionState,
    setUpdateCommit,
    initializePersistedWorkspace,
  };
}
