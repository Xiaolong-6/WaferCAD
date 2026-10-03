import {
  clearWorkspaceRecoveryPoints,
  createWorkspaceRecoveryCheckpoint,
  listWorkspaceRecoveryPoints,
  loadWorkspaceRecoveryPoint,
  loadWorkspaceState,
  saveWorkspaceState,
} from '../workspace-persistence.js';

const PERSIST_MARKER_KEY = 'wafercad.workspace.persisted.v1';
const CHANNEL_NAME = 'wafercad.workspace.sync.v1';

function parseMarker(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object' || typeof value.saveId !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

function saveId(windowRef) {
  return (
    windowRef?.crypto?.randomUUID?.() ||
    globalThis.crypto?.randomUUID?.() ||
    `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

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
  confirmAction = async () => false,
  chooseAction = async () => 'cancel',
  storage = globalThis.localStorage,
  windowRef = globalThis.window,
  channelFactory = (name) =>
    typeof globalThis.BroadcastChannel === 'function' ? new BroadcastChannel(name) : null,
}) {
  const $ = (id) => root.getElementById(id);
  let ready = false,
    timer = null,
    write = Promise.resolve(),
    updateCommit = '',
    dirty = false,
    saving = false,
    failed = false,
    editVersion = 0,
    lastSavedAt = null,
    baseSaveId = null,
    remoteSaveId = null,
    ownerTabId = null,
    channel = null,
    channelSequence = 0;
  const flushWaiters = new Map();

  function readMarker() {
    try {
      return parseMarker(storage?.getItem?.(PERSIST_MARKER_KEY));
    } catch {
      return null;
    }
  }

  function writeMarker() {
    const marker = {
      saveId: saveId(windowRef),
      tabId: workspaceSession?.tabId || '',
      updatedAt: new Date().toISOString(),
    };
    try {
      storage?.setItem?.(PERSIST_MARKER_KEY, JSON.stringify(marker));
    } catch {}
    baseSaveId = marker.saveId;
    remoteSaveId = marker.saveId;
    lastSavedAt = new Date(marker.updatedAt);
    return marker;
  }

  function setSaveStatus(text, state = 'passive') {
    const host = $('workspaceSaveStatus');
    if (!host) return;
    host.textContent = text;
    host.dataset.state = state;
    host.dataset.failed = state === 'error' ? 'true' : 'false';
  }

  function savedTimeLabel(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function syncSaveStatus() {
    if (failed) {
      setSaveStatus('Local save failed', 'error');
      return;
    }
    if (saving) {
      setSaveStatus('Saving…', 'saving');
      return;
    }
    if (dirty) {
      setSaveStatus(
        hasWriteAccess()
          ? 'Unsaved changes'
          : 'Unsaved changes · autosave paused',
        'dirty',
      );
      return;
    }
    if (!hasWriteAccess()) {
      setSaveStatus('Saved copy unchanged · autosave paused', 'paused');
      return;
    }
    if (lastSavedAt) {
      setSaveStatus(`Saved locally · ${savedTimeLabel(lastSavedAt)}`, 'saved');
      return;
    }
    setSaveStatus('Local autosave ready', 'saved');
  }

  function hasWriteAccess() {
    return workspaceSession?.hasWriteLease?.() ?? workspaceSession?.canWrite?.() ?? false;
  }

  function clearTimer() {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  function markDirty() {
    editVersion++;
    dirty = true;
    failed = false;
    syncSaveStatus();
  }

  async function saveCurrentProject(project) {
    const saved = await saveWorkspaceState(
      project,
      { appCommit },
      { canCommit: hasWriteAccess },
    );
    if (!saved) {
      saving = false;
      dirty = true;
      syncSaveStatus();
      return false;
    }
    return true;
  }

  function persistNow() {
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return Promise.resolve(false);
    }
    if (!dirty && !saving) {
      syncSaveStatus();
      return Promise.resolve(true);
    }

    clearTimer();
    const project = buildProjectSnapshot(true),
      savingVersion = editVersion;
    saving = true;
    failed = false;
    syncSaveStatus();

    write = write
      .catch(() => {})
      .then(() => saveCurrentProject(project))
      .then((saved) => {
        if (!saved) return false;
        writeMarker();
        saving = false;
        if (editVersion === savingVersion) dirty = false;
        syncSaveStatus();
        if (dirty) schedule({ markDirty: false });
        return true;
      });

    write.catch((error) => {
      saving = false;
      failed = true;
      syncSaveStatus();
      console.warn('Workspace autosave failed.', error);
    });
    return write;
  }

  function schedule({ markDirty: shouldMarkDirty = true } = {}) {
    if (shouldMarkDirty) markDirty();
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return;
    }
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
      const writable = hasWriteAccess() ?? false;
      restore.disabled = !writable;
      if (clear) clear.disabled = !writable;
    } catch (error) {
      console.warn('Could not list workspace recovery points.', error);
    }
  }

  function syncSessionState({ writable, ownerTabId: nextOwnerTabId = null }) {
    ownerTabId = nextOwnerTabId;
    const workspace = root.querySelector('.workspace'),
      dialog = $('workspaceConflictDialog');
    if (workspace) {
      workspace.inert = false;
      workspace.dataset.autosaveOwner = writable ? 'true' : 'false';
    }
    if (dialog) {
      dialog.hidden = writable;
      const title = dialog.querySelector('strong'),
        copy = dialog.querySelector('span');
      if (title) {
        title.textContent = dirty
          ? 'This tab has unsaved changes.'
          : 'This workspace is open in another tab.';
      }
      if (copy) {
        copy.textContent = dirty
          ? 'Autosave is paused here. Take over to reconcile this tab with the latest saved workspace.'
          : 'Editing stays available, but local autosave is paused here to prevent conflicts.';
      }
    }

    if (!writable) {
      clearTimer();
      if ($('workspaceRestoreBtn')) $('workspaceRestoreBtn').disabled = true;
      if ($('workspaceRecoveryClearBtn')) $('workspaceRecoveryClearBtn').disabled = true;
      syncSaveStatus();
      status(
        dirty
          ? 'This tab has unsaved changes while another tab owns local autosave. Use Take over to reconcile both states.'
          : 'Another tab owns local autosave. Editing remains available; use Take over before saving from this tab.',
        'warning',
      );
    } else {
      syncSaveStatus();
      void refreshRecoveryOptions();
    }
  }

  function setUpdateCommit(commit) {
    updateCommit = String(commit || '');
  }

  function ensureChannel() {
    if (channel) return channel;
    try {
      channel = channelFactory?.(CHANNEL_NAME) || null;
    } catch {
      channel = null;
    }
    if (!channel) return null;

    channel.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'flush-request') {
        if (
          !hasWriteAccess() ||
          (message.ownerTabId && message.ownerTabId !== workspaceSession.tabId)
        ) {
          return;
        }
        void persistNow().finally(() => {
          try {
            channel?.postMessage({
              type: 'flush-response',
              requestId: message.requestId,
              tabId: workspaceSession.tabId,
              marker: readMarker(),
            });
          } catch {}
        });
        return;
      }

      if (message.type === 'flush-response' && flushWaiters.has(message.requestId)) {
        const resolve = flushWaiters.get(message.requestId);
        flushWaiters.delete(message.requestId);
        resolve(message);
      }
    };
    return channel;
  }

  function requestOwnerFlush(timeoutMs = 900) {
    const syncChannel = ensureChannel();
    if (!syncChannel || !ownerTabId) return Promise.resolve(false);
    const requestId = `${workspaceSession.tabId}:flush:${++channelSequence}`;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        flushWaiters.delete(requestId);
        resolve(value);
      };
      flushWaiters.set(requestId, (message) => finish(Boolean(message)));
      windowRef?.setTimeout?.(() => finish(false), timeoutMs);
      try {
        syncChannel.postMessage({
          type: 'flush-request',
          requestId,
          ownerTabId,
          requesterTabId: workspaceSession.tabId,
        });
      } catch {
        finish(false);
      }
    });
  }

  async function restoreSelectedRecovery() {
    if (!hasWriteAccess()) {
      status('This tab cannot restore Recovery until it owns local autosave.', 'warning');
      return;
    }
    const key = $('workspaceRecoverySelect')?.value;
    if (!key) return;
    if (
      !(await confirmAction({
        title: 'Restore recovery checkpoint?',
        message: 'The selected local checkpoint will replace the current workspace.',
        detail: 'The current workspace is checkpointed first.',
        confirmLabel: 'Restore',
        danger: true,
      }))
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
      markDirty();
      const persisted = await persistNow();
      if (!persisted) throw new Error('Another tab took over local autosave.');
      await refreshRecoveryOptions();
      status(`Restored local recovery checkpoint for "${normalizedProjectName()}".`);
    } catch (error) {
      console.error(error);
      status(`Recovery restore failed: ${error.message}`, 'error');
    }
  }

  async function reloadSafely() {
    if (!hasWriteAccess()) {
      status('This tab does not own autosave. Take over before reloading safely.', 'warning');
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
      saving = true;
      syncSaveStatus();
      write = write
        .catch(() => {})
        .then(() => saveCurrentProject(project))
        .then((saved) => {
          if (!saved) throw new Error('Another tab took over local autosave.');
          writeMarker();
          return createWorkspaceRecoveryCheckpoint(project, {
            appCommit,
            reason: updateCommit ? `pre-update-${updateCommit.slice(0, 7)}` : 'pre-reload',
          });
        });
      await write;
      dirty = false;
      saving = false;
      syncSaveStatus();
      workspaceSession.stop();
      globalThis.location.reload();
    } catch (error) {
      saving = false;
      failed = true;
      if (button) {
        button.disabled = false;
        button.textContent = 'Reload safely';
      }
      syncSaveStatus();
      status(`Safe reload cancelled: ${error.message}`, 'error');
    }
  }

  async function checkpointCurrent(reason = 'pre-destructive-action') {
    if (!ready || !hasWriteAccess()) return false;
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
    if (!hasWriteAccess()) {
      status('This tab cannot Save locally while another tab owns browser storage.', 'warning');
      return;
    }
    try {
      const projectName = normalizedProjectName(getProjectName());
      setProjectName(projectName);
      syncProjectNameInput();
      const persisted = await persistNow();
      if (!persisted) throw new Error('Another tab took over local autosave.');
      const project = buildProjectSnapshot(true);
      await createWorkspaceRecoveryCheckpoint(project, {
        appCommit,
        reason: `manual-save · ${projectName}`,
      });
      await refreshRecoveryOptions();
      setSaveStatus(`Saved checkpoint · ${savedTimeLabel()}`, 'saved');
      status(`Saved "${projectName}" locally. It is available in Recovery.`);
    } catch (error) {
      console.error(error);
      failed = true;
      syncSaveStatus();
      status(`Local Save failed: ${error.message}`, 'error');
    }
  }

  async function takeOverWorkspace() {
    const flushed = await requestOwnerFlush(),
      marker = readMarker(),
      savedChanged = Boolean(marker?.saveId && marker.saveId !== baseSaveId),
      latestSaved = savedChanged || !flushed ? await loadWorkspaceState().catch(() => null) : null;

    let choice = 'use-current';
    if (savedChanged) {
      choice = await chooseAction({
        title: 'Workspace states differ',
        message: dirty
          ? 'This tab has unsaved edits, and another tab has saved a newer workspace.'
          : 'Another tab has saved a newer workspace since this tab was opened.',
        detail: flushed
          ? 'Choose which state this tab should own. The displaced saved state is protected with a Recovery checkpoint when needed.'
          : 'The other tab did not confirm a final flush, so it may also contain newer unsaved edits.',
        cancelValue: 'cancel',
        actions: [
          { value: 'cancel', label: 'Cancel', default: true },
          { value: 'load-saved', label: 'Load latest saved', kind: 'primary' },
          { value: 'use-current', label: 'Use this tab', kind: 'danger' },
        ],
      });
    } else {
      const confirmed = await confirmAction({
        title: dirty ? 'Take over with unsaved edits?' : 'Take over workspace?',
        message: dirty
          ? 'This tab has unsaved edits. The latest saved workspace has not changed since this tab started.'
          : 'This tab will become the local autosave owner.',
        detail: flushed
          ? 'The previous owner confirmed its latest state was saved.'
          : 'The previous owner did not confirm a final flush.',
        confirmLabel: 'Take over',
        danger: Boolean(dirty),
      });
      if (!confirmed) choice = 'cancel';
    }

    if (choice === 'cancel') return;
    if (!workspaceSession.takeOver()) {
      status('Could not take over the local workspace.', 'error');
      return;
    }

    if (choice === 'load-saved' && latestSaved) {
      loadProjectSnapshot(latestSaved);
      snapshotManager.importRecords(latestSaved.snapshots || []);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      fit3d();
      dirty = false;
      failed = false;
      baseSaveId = marker?.saveId || baseSaveId;
      remoteSaveId = marker?.saveId || remoteSaveId;
      lastSavedAt = marker?.updatedAt ? new Date(marker.updatedAt) : lastSavedAt;
      syncSaveStatus();
      status('Took over this workspace and loaded the latest saved state.', 'success');
    } else {
      if (savedChanged && latestSaved) {
        await createWorkspaceRecoveryCheckpoint(latestSaved, {
          appCommit,
          reason: 'pre-takeover-remote',
        });
      }
      if (savedChanged && !dirty) markDirty();
      const persisted = dirty ? await persistNow() : true;
      if (!persisted || !hasWriteAccess()) {
        status('Workspace takeover was interrupted by another tab before this state could be saved.', 'error');
        syncSaveStatus();
        return;
      }
      syncSaveStatus();
      status(
        savedChanged
          ? 'Took over this workspace and kept this tab. The previous saved state is available in Recovery.'
          : 'This tab now owns the local workspace.',
        'success',
      );
    }
    await refreshRecoveryOptions();
  }

  async function initializePersistedWorkspace() {
    const hasExplicitStart = new URLSearchParams(globalThis.location?.search || '').has('start');
    let allowInitialAutosave = true,
      restoredSaved = false;
    const marker = readMarker();
    baseSaveId = marker?.saveId || null;
    remoteSaveId = baseSaveId;
    lastSavedAt = marker?.updatedAt ? new Date(marker.updatedAt) : null;

    try {
      if (hasExplicitStart) {
        const saved = await loadWorkspaceState();
        if (saved && hasWriteAccess()) {
          try {
            await createWorkspaceRecoveryCheckpoint(saved, {
              appCommit,
              reason: 'pre-welcome-start',
            });
          } catch (error) {
            console.error(error);
            loadProjectSnapshot(saved);
            snapshotManager.importRecords(saved.snapshots || []);
            syncBaseControls();
            syncTransformInputs();
            renderAll();
            renderSnapshots();
            fit3d();
            restoredSaved = true;
            status(
              `Welcome action cancelled because the current workspace could not be checkpointed: ${error.message}`,
              'error',
            );
            return;
          }
        }
        const started = await initializeWorkspaceStart();
        if (!started && saved) {
          loadProjectSnapshot(saved);
          snapshotManager.importRecords(saved.snapshots || []);
          syncBaseControls();
          syncTransformInputs();
          renderAll();
          renderSnapshots();
          fit3d();
          restoredSaved = true;
          status(
            `Welcome action failed; restored local workspace "${normalizedProjectName()}".`,
            'warning',
          );
        }
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
          restoredSaved = true;
          status(`Restored local workspace "${normalizedProjectName()}".`);
        }
      }
    } catch (error) {
      allowInitialAutosave = false;
      console.warn('Workspace restore failed.', error);
      status(`Local workspace restore failed: ${error.message}`, 'error');
    } finally {
      ready = true;
      if (allowInitialAutosave && hasExplicitStart && !restoredSaved) {
        markDirty();
        schedule({ markDirty: false });
      } else if (allowInitialAutosave && !hasExplicitStart && !restoredSaved && hasWriteAccess()) {
        markDirty();
        schedule({ markDirty: false });
      } else {
        dirty = false;
        syncSaveStatus();
      }
      void refreshRecoveryOptions();
    }
  }

  function handlePersistStorage(event) {
    if (event?.key !== PERSIST_MARKER_KEY) return;
    const marker = parseMarker(event.newValue);
    remoteSaveId = marker?.saveId || null;
    syncSaveStatus();
    if (!hasWriteAccess() && marker?.saveId && marker.saveId !== baseSaveId) {
      const dialog = $('workspaceConflictDialog'),
        copy = dialog?.querySelector('span');
      if (copy) {
        copy.textContent = dirty
          ? 'This tab has unsaved edits and another tab has saved a newer state. Take over to reconcile them.'
          : 'Another tab has saved a newer state. Take over to load or replace it deliberately.';
      }
    }
  }

  function bind() {
    ensureChannel();
    windowRef?.addEventListener?.('storage', handlePersistStorage);

    $('workspaceTakeOverBtn').onclick = () => {
      void takeOverWorkspace();
    };

    $('safeReloadBtn').onclick = () => {
      void reloadSafely();
    };
    $('workspaceRecoverySelect').onchange = (event) => {
      $('workspaceRestoreBtn').disabled = !event.target.value || !hasWriteAccess();
    };
    $('workspaceRestoreBtn').onclick = () => {
      void restoreSelectedRecovery();
    };
    $('workspaceRecoveryClearBtn').onclick = async () => {
      if (!hasWriteAccess()) {
        status('This tab cannot clear local Recovery while another tab owns browser storage.', 'warning');
        return;
      }
      if (
        !(await confirmAction({
          title: 'Clear Recovery?',
          message: 'Remove all local Recovery checkpoints?',
          detail: 'The current autosaved workspace is kept.',
          confirmLabel: 'Clear Recovery',
          danger: true,
        }))
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
    isDirty: () => dirty,
    getBaseSaveId: () => baseSaveId,
    getRemoteSaveId: () => remoteSaveId,
  };
}
