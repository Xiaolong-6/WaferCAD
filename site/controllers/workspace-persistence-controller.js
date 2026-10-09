import {
  clearWorkspaceRecoveryPoints,
  createWorkspaceRecoveryCheckpoint,
  listWorkspaceRecoveryPoints,
  loadWorkspaceRecoveryPoint,
  loadWorkspaceState,
  saveWorkspaceState,
} from '../workspace-persistence.js';
import {
  applyWorkspaceViewState,
  captureWorkspaceStructuralIdentity,
  extractWorkspaceViewState,
  workspaceStructuralIdentityEqual,
} from '../workspace-dirty-domains.js';

const PERSIST_MARKER_KEY = 'wafercad.workspace.persisted.v1';
const VIEW_STATE_KEY = 'wafercad.workspace.view.v1';
const CHANNEL_NAME = 'wafercad.workspace.sync.v1';
const AUTOSAVE_IDLE_MS = 1800;
const VIEW_AUTOSAVE_IDLE_MS = 2600;
const INTERACTION_SETTLE_MS = 1400;
const TRANSIENT_INTERACTION_MS = 450;
const SNAPSHOT_MUTATION_METHODS = [
  'create',
  'bookmarkStep',
  'bookmarkCurrentStep',
  'createBranch',
  'createBranchFromNode',
  'createBranchFromCursor',
  'restoreActiveBranchHead',
  'replaceBranchTailFrom',
  'truncateBranchAfter',
  'removeHeadStep',
  'recordOperation',
  'syncCursorToProcessRevision',
  'switchBranch',
  'rename',
  'renameBranch',
  'renameHistoryEntity',
  'remove',
  'removeBranch',
  'restore',
  'restoreProcessNode',
  'clear',
  'importRecords',
];

function parseMarker(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object' || typeof value.saveId !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

function parseViewRecord(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      Number(value.version) !== 1 ||
      typeof value.saveId !== 'string' ||
      !value.state ||
      typeof value.state !== 'object'
    ) {
      return null;
    }
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
  taskController = null,
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
    viewDirty = false,
    pendingDomainCheck = false,
    saving = false,
    failed = false,
    editVersion = 0,
    historyMutationVersion = 0,
    structuralBaseline = null,
    lastSavedAt = null,
    baseSaveId = null,
    remoteSaveId = null,
    ownerTabId = null,
    channel = null,
    channelSequence = 0,
    interactionDepth = 0,
    transientTimer = null;
  const flushWaiters = new Map();

  function installSnapshotMutationTracking() {
    for (const name of SNAPSHOT_MUTATION_METHODS) {
      const original = snapshotManager?.[name];
      if (typeof original !== 'function' || original.__wafercadPersistenceTracked) continue;
      const tracked = function (...args) {
        const result = original.apply(snapshotManager, args);
        if (result && typeof result.then === 'function') {
          return result.then((value) => {
            if (value !== false) historyMutationVersion += 1;
            return value;
          });
        }
        if (result !== false) historyMutationVersion += 1;
        return result;
      };
      tracked.__wafercadPersistenceTracked = true;
      snapshotManager[name] = tracked;
    }
  }

  installSnapshotMutationTracking();

  function readMarker() {
    try {
      return parseMarker(storage?.getItem?.(PERSIST_MARKER_KEY));
    } catch {
      return null;
    }
  }

  function readViewRecord() {
    try {
      return parseViewRecord(storage?.getItem?.(VIEW_STATE_KEY));
    } catch {
      return null;
    }
  }

  function clearStoredViewState() {
    try {
      storage?.removeItem?.(VIEW_STATE_KEY);
    } catch {}
  }

  function bumpPersistenceMetric(domain) {
    const workspace = root.querySelector('.workspace');
    if (!workspace) return;
    const key = domain === 'view' ? 'viewAutosaveCount' : 'fullAutosaveCount';
    workspace.dataset[key] = String((Number(workspace.dataset[key]) || 0) + 1);
    workspace.dataset.lastAutosaveDomain = domain;
  }

  function currentStructuralIdentity(project = buildProjectSnapshot(false)) {
    return captureWorkspaceStructuralIdentity(project, {
      projectName: normalizedProjectName(getProjectName()),
      historyToken: String(historyMutationVersion),
    });
  }

  function setStructuralBaseline(project = buildProjectSnapshot(false)) {
    structuralBaseline = currentStructuralIdentity(project);
    return structuralBaseline;
  }

  function applyStoredViewState(project) {
    const record = readViewRecord();
    if (!record || !baseSaveId || record.saveId !== baseSaveId) return false;
    return applyWorkspaceViewState(project, record.state);
  }

  function saveCurrentViewState() {
    if (!baseSaveId || !hasWriteAccess()) return false;
    const project = buildProjectSnapshot(false),
      record = {
        version: 1,
        saveId: baseSaveId,
        updatedAt: new Date().toISOString(),
        state: extractWorkspaceViewState(project),
      };
    try {
      storage?.setItem?.(VIEW_STATE_KEY, JSON.stringify(record));
      viewDirty = false;
      bumpPersistenceMetric('view');
      return true;
    } catch (error) {
      console.warn('Workspace view-state autosave failed.', error);
      return false;
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
        hasWriteAccess() ? 'Unsaved changes' : 'Unsaved changes · autosave paused',
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

  function loadProjectWithSnapshotHistory(project, { restoreView = false } = {}) {
    if (restoreView) applyStoredViewState(project);
    loadProjectSnapshot(project);
    snapshotManager.importRecords(project.snapshots || [], project.snapshotBranches);
    return Boolean(project?.display?.threeCamera);
  }

  function adoptLoadedCurrentProject(project) {
    const hasCamera = loadProjectWithSnapshotHistory(project, { restoreView: true });
    clearTimer();
    dirty = false;
    viewDirty = false;
    pendingDomainCheck = false;
    failed = false;
    setStructuralBaseline();
    return hasCamera;
  }

  function clearTimer() {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  function clearTransientTimer() {
    if (transientTimer == null) return;
    clearTimeout(transientTimer);
    transientTimer = null;
  }

  function classifyCurrentDirty() {
    pendingDomainCheck = false;
    if (dirty) {
      syncSaveStatus();
      return 'structural';
    }
    const current = currentStructuralIdentity();
    if (!structuralBaseline || !workspaceStructuralIdentityEqual(structuralBaseline, current)) {
      dirty = true;
      viewDirty = false;
      syncSaveStatus();
      return 'structural';
    }
    viewDirty = true;
    syncSaveStatus();
    return 'view';
  }

  function markStructuralDirty() {
    editVersion += 1;
    pendingDomainCheck = false;
    dirty = true;
    viewDirty = false;
    failed = false;
    syncSaveStatus();
  }

  function markViewDirty() {
    editVersion += 1;
    pendingDomainCheck = false;
    if (!dirty) viewDirty = true;
    failed = false;
    syncSaveStatus();
  }

  function beginInteraction() {
    interactionDepth += 1;
    clearTimer();
  }

  function endInteraction() {
    interactionDepth = Math.max(0, interactionDepth - 1);
    if (interactionDepth || transientTimer != null) return;
    if (pendingDomainCheck) classifyCurrentDirty();
    if (dirty || viewDirty) {
      schedule({
        markDirty: false,
        delay: dirty ? INTERACTION_SETTLE_MS : VIEW_AUTOSAVE_IDLE_MS,
      });
    }
  }

  function pulseInteraction(delay = TRANSIENT_INTERACTION_MS) {
    clearTimer();
    clearTransientTimer();
    transientTimer = setTimeout(
      () => {
        transientTimer = null;
        if (interactionDepth) return;
        if (pendingDomainCheck) classifyCurrentDirty();
        if (dirty || viewDirty) {
          schedule({
            markDirty: false,
            delay: dirty ? INTERACTION_SETTLE_MS : VIEW_AUTOSAVE_IDLE_MS,
          });
        }
      },
      Math.max(0, Number(delay) || TRANSIENT_INTERACTION_MS),
    );
  }

  function markDirty() {
    editVersion += 1;
    failed = false;
    if (dirty) {
      syncSaveStatus();
      return;
    }
    if (interactionDepth > 0 || transientTimer != null) {
      pendingDomainCheck = true;
      return;
    }
    classifyCurrentDirty();
  }

  async function runVisibleTask(executor, options) {
    if (taskController?.runTask) return taskController.runTask(executor, options);
    try {
      return await executor({ updateStage() {} });
    } catch (error) {
      return { error: error?.message || String(error || 'Task failed.') };
    }
  }

  async function saveCurrentProject(project) {
    const saved = await saveWorkspaceState(project, { appCommit }, { canCommit: hasWriteAccess });
    if (!saved) {
      saving = false;
      dirty = true;
      syncSaveStatus();
      return false;
    }
    return true;
  }

  function persistNow({ force = false } = {}) {
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return Promise.resolve(false);
    }
    if (!force && (interactionDepth > 0 || transientTimer != null)) {
      syncSaveStatus();
      return Promise.resolve(false);
    }
    if (pendingDomainCheck) classifyCurrentDirty();

    if (!dirty && !saving) {
      const savedView = viewDirty ? saveCurrentViewState() : true;
      syncSaveStatus();
      return Promise.resolve(savedView);
    }
    if (saving) return write;

    clearTimer();
    const savingIdentity = currentStructuralIdentity(),
      project = buildProjectSnapshot(true),
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
        clearStoredViewState();
        structuralBaseline = savingIdentity;
        saving = false;
        dirty = false;
        viewDirty = false;
        pendingDomainCheck = false;
        bumpPersistenceMetric('full');
        if (editVersion !== savingVersion) classifyCurrentDirty();
        syncSaveStatus();
        if (dirty || viewDirty) schedule({ markDirty: false });
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

  function schedule({ markDirty: shouldMarkDirty = true, delay = AUTOSAVE_IDLE_MS } = {}) {
    if (shouldMarkDirty) markDirty();
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return;
    }
    clearTimer();
    if (interactionDepth > 0 || transientTimer != null || pendingDomainCheck) return;
    if (!dirty && !viewDirty) return;
    const requestedDelay = Math.max(0, Number(delay) || AUTOSAVE_IDLE_MS),
      effectiveDelay = dirty ? requestedDelay : Math.max(requestedDelay, VIEW_AUTOSAVE_IDLE_MS);
    timer = setTimeout(() => {
      timer = null;
      void persistNow();
    }, effectiveDelay);
  }

  function scheduleStructural({ delay = AUTOSAVE_IDLE_MS } = {}) {
    markStructuralDirty();
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return;
    }
    clearTimer();
    if (interactionDepth > 0 || transientTimer != null) return;
    timer = setTimeout(
      () => {
        timer = null;
        void persistNow();
      },
      Math.max(0, Number(delay) || AUTOSAVE_IDLE_MS),
    );
  }

  function scheduleView({ delay = VIEW_AUTOSAVE_IDLE_MS } = {}) {
    markViewDirty();
    if (!ready || !hasWriteAccess()) {
      syncSaveStatus();
      return;
    }
    if (dirty) {
      schedule({ markDirty: false, delay: AUTOSAVE_IDLE_MS });
      return;
    }
    clearTimer();
    if (interactionDepth > 0 || transientTimer != null) return;
    timer = setTimeout(
      () => {
        timer = null;
        void persistNow();
      },
      Math.max(VIEW_AUTOSAVE_IDLE_MS, Number(delay) || VIEW_AUTOSAVE_IDLE_MS),
    );
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
      if (ready && (dirty || viewDirty || pendingDomainCheck)) schedule({ markDirty: false });
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
        void persistNow({ force: true }).finally(() => {
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

    const result = await runVisibleTask(
      async ({ updateStage }) => {
        updateStage('Protecting current workspace…');
        const current = buildProjectSnapshot(true);
        await createWorkspaceRecoveryCheckpoint(current, {
          appCommit,
          reason: 'pre-restore',
        });

        updateStage('Loading Recovery checkpoint…');
        const recovered = await loadWorkspaceRecoveryPoint(key);
        if (!recovered) throw new Error('Recovery checkpoint is unavailable.');
        const hasCamera = loadProjectWithSnapshotHistory(recovered);
        syncBaseControls();
        syncTransformInputs();
        renderAll();
        renderSnapshots();
        if (!hasCamera) fit3d();
        markStructuralDirty();

        updateStage('Saving restored workspace…');
        const persisted = await persistNow({ force: true });
        if (!persisted) throw new Error('Another tab took over local autosave.');
        await refreshRecoveryOptions();
        return { ok: true };
      },
      {
        label: 'Restoring Recovery checkpoint…',
        failurePrefix: 'Recovery restore failed',
        abortable: false,
      },
    );

    if (result?.busy) {
      status('Another background task is already running.', 'warning');
      return;
    }
    if (result?.error || !result?.ok) {
      if (result?.error && !taskController?.runTask) {
        status(`Recovery restore failed: ${result.error}`, 'error');
      }
      return;
    }
    status(`Restored local recovery checkpoint for "${normalizedProjectName()}".`);
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
          clearStoredViewState();
          return createWorkspaceRecoveryCheckpoint(project, {
            appCommit,
            reason: updateCommit ? `pre-update-${updateCommit.slice(0, 7)}` : 'pre-reload',
          });
        });
      await write;
      dirty = false;
      viewDirty = false;
      pendingDomainCheck = false;
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
    // A refused checkpoint must not strand edits by cancelling the queued
    // autosave; keep the dirty workspace scheduled after a transient failure.
    const resumePendingAutosave = () => {
      if (!hasWriteAccess()) return;
      if (pendingDomainCheck) classifyCurrentDirty();
      if (dirty || viewDirty) schedule({ markDirty: false });
    };

    const result = await runVisibleTask(
      async ({ updateStage }) => {
        updateStage('Protecting current workspace…');
        const project = buildProjectSnapshot(true);
        await createWorkspaceRecoveryCheckpoint(project, {
          appCommit,
          reason,
        });
        await refreshRecoveryOptions();
        return { ok: true };
      },
      {
        label: 'Creating Recovery checkpoint…',
        failurePrefix: 'Recovery checkpoint failed',
        abortable: false,
      },
    );

    if (result?.busy) {
      resumePendingAutosave();
      status('Another background task is already running.', 'warning');
      return false;
    }
    if (result?.error || !result?.ok) {
      resumePendingAutosave();
      return false;
    }
    return true;
  }

  async function saveCheckpoint() {
    if (!hasWriteAccess()) {
      status('This tab cannot Save locally while another tab owns browser storage.', 'warning');
      return;
    }

    const projectName = normalizedProjectName(getProjectName());
    setProjectName(projectName);
    syncProjectNameInput();

    const result = await runVisibleTask(
      async ({ updateStage }) => {
        updateStage('Saving current workspace…');
        const persisted = await persistNow({ force: true });
        if (!persisted) throw new Error('Another tab took over local autosave.');

        updateStage('Creating Recovery checkpoint…');
        const project = buildProjectSnapshot(true);
        await createWorkspaceRecoveryCheckpoint(project, {
          appCommit,
          reason: `manual-save · ${projectName}`,
        });
        await refreshRecoveryOptions();
        return { ok: true };
      },
      {
        label: `Saving "${projectName}"…`,
        failurePrefix: 'Local Save failed',
        abortable: false,
      },
    );

    if (result?.busy) {
      status('Another background task is already running.', 'warning');
      return;
    }
    if (result?.error || !result?.ok) {
      failed = true;
      syncSaveStatus();
      if (result?.error && !taskController?.runTask) {
        status(`Local Save failed: ${result.error}`, 'error');
      }
      return;
    }

    setSaveStatus(`Saved checkpoint · ${savedTimeLabel()}`, 'saved');
    status(`Saved "${projectName}" locally. It is available in Recovery.`);
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
      if (dirty) {
        await createWorkspaceRecoveryCheckpoint(buildProjectSnapshot(true), {
          appCommit,
          reason: 'pre-takeover-current',
        });
      }
      baseSaveId = marker?.saveId || baseSaveId;
      remoteSaveId = marker?.saveId || remoteSaveId;
      const hasCamera = adoptLoadedCurrentProject(latestSaved);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      if (!hasCamera) fit3d();
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
      if (savedChanged && !dirty) markStructuralDirty();
      const persisted =
        dirty || viewDirty || pendingDomainCheck ? await persistNow({ force: true }) : true;
      if (!persisted || !hasWriteAccess()) {
        status(
          'Workspace takeover was interrupted by another tab before this state could be saved.',
          'error',
        );
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
        if (saved) applyStoredViewState(saved);
        if (saved && hasWriteAccess()) {
          try {
            await createWorkspaceRecoveryCheckpoint(saved, {
              appCommit,
              reason: 'pre-welcome-start',
            });
          } catch (error) {
            console.error(error);
            const hasCamera = adoptLoadedCurrentProject(saved);
            syncBaseControls();
            syncTransformInputs();
            renderAll();
            renderSnapshots();
            if (!hasCamera) fit3d();
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
          const hasCamera = adoptLoadedCurrentProject(saved);
          syncBaseControls();
          syncTransformInputs();
          renderAll();
          renderSnapshots();
          if (!hasCamera) fit3d();
          restoredSaved = true;
          status(
            `Welcome action failed; restored local workspace "${normalizedProjectName()}".`,
            'warning',
          );
        }
      } else {
        const saved = await loadWorkspaceState();
        if (saved) {
          const hasCamera = adoptLoadedCurrentProject(saved);
          syncBaseControls();
          syncTransformInputs();
          renderAll();
          renderSnapshots();
          if (!hasCamera) fit3d();
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
      if (allowInitialAutosave && !restoredSaved) {
        markStructuralDirty();
        schedule({ markDirty: false });
      } else {
        dirty = false;
        viewDirty = false;
        pendingDomainCheck = false;
        if (restoredSaved && !structuralBaseline) setStructuralBaseline();
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
    root?.addEventListener?.('pointerdown', beginInteraction, true);
    windowRef?.addEventListener?.('pointerup', endInteraction, true);
    windowRef?.addEventListener?.('pointercancel', endInteraction, true);
    root?.addEventListener?.('wheel', () => pulseInteraction(), { capture: true, passive: true });
    root?.addEventListener?.(
      'input',
      (event) => {
        if (event.target?.type === 'range') pulseInteraction();
      },
      true,
    );

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
        status(
          'This tab cannot clear local Recovery while another tab owns browser storage.',
          'warning',
        );
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
      const result = await runVisibleTask(
        async ({ updateStage }) => {
          updateStage('Removing local Recovery checkpoints…');
          const removed = await clearWorkspaceRecoveryPoints();
          await refreshRecoveryOptions();
          return { ok: true, removed };
        },
        {
          label: 'Clearing Recovery…',
          failurePrefix: 'Could not clear Recovery',
          abortable: false,
        },
      );

      if (result?.busy) {
        status('Another background task is already running.', 'warning');
        return;
      }
      if (result?.error || !result?.ok) return;

      status(
        result.removed
          ? `Cleared ${result.removed} local Recovery checkpoint${result.removed === 1 ? '' : 's'}.`
          : 'Recovery is already empty.',
      );
    };
    $('saveProjectBtn').onclick = () => {
      void saveCheckpoint();
    };
  }

  return {
    bind,
    persistNow,
    schedule,
    scheduleStructural,
    scheduleView,
    refreshRecoveryOptions,
    checkpointCurrent,
    syncSessionState,
    setUpdateCommit,
    initializePersistedWorkspace,
    beginInteraction,
    endInteraction,
    pulseInteraction,
    isInteracting: () => interactionDepth > 0 || transientTimer != null,
    isDirty: () => dirty,
    isViewDirty: () => viewDirty || pendingDomainCheck,
    getBaseSaveId: () => baseSaveId,
    getRemoteSaveId: () => remoteSaveId,
  };
}
