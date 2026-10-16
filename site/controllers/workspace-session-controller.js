const LEASE_KEY = 'wafercad.workspace.owner.v1';
const TAB_ID_KEY = 'wafercad.workspace.tab.v1';
const DEFAULT_LEASE_MS = 7000;
const DEFAULT_RENEW_MS = 2500;

function safeLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function parseLease(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return null;
    if (typeof value.tabId !== 'string' || !Number.isFinite(value.expiresAt)) return null;
    return value;
  } catch {
    return null;
  }
}

function randomTabId(windowRef) {
  return (
    windowRef?.crypto?.randomUUID?.() ||
    globalThis.crypto?.randomUUID?.() ||
    `tab-${Math.random().toString(36).slice(2)}`
  );
}

function persistentTabId(windowRef) {
  try {
    const sessionStorage = windowRef?.sessionStorage,
      existing = sessionStorage?.getItem?.(TAB_ID_KEY);
    const navigation = windowRef?.performance?.getEntriesByType?.('navigation')?.[0],
      reloading = navigation?.type === 'reload' || windowRef?.performance?.navigation?.type === 1;
    // New browsing contexts may copy sessionStorage from an opener/duplicated
    // tab. Only a reload can reuse its stored identity before the old lease is
    // released; a fresh document otherwise receives an independent identity.
    if (existing && reloading) return existing;
    const created = randomTabId(windowRef);
    sessionStorage?.setItem?.(TAB_ID_KEY, created);
    return created;
  } catch {
    return randomTabId(windowRef);
  }
}

export function createWorkspaceSessionController({
  storage = safeLocalStorage(),
  windowRef = globalThis.window,
  now = () => Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
  renewMs = DEFAULT_RENEW_MS,
  tabId = null,
  onStateChange = () => {},
} = {}) {
  const resolvedTabId = tabId || persistentTabId(windowRef);
  let writable = false;
  let storageUnavailable = false;
  let timer = null;

  function storageAccessible() {
    try {
      if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function')
        return false;
      storage.getItem(LEASE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function currentLease() {
    try {
      return parseLease(storage?.getItem?.(LEASE_KEY));
    } catch {
      return null;
    }
  }

  function leaseIsActive(lease) {
    return Boolean(lease && lease.expiresAt > now());
  }

  function emit() {
    const lease = currentLease();
    onStateChange({
      writable,
      tabId: resolvedTabId,
      ownerTabId: leaseIsActive(lease) ? lease.tabId : null,
      storageUnavailable,
    });
  }

  function writeLease() {
    try {
      storage?.setItem?.(
        LEASE_KEY,
        JSON.stringify({
          tabId: resolvedTabId,
          expiresAt: now() + leaseMs,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function refreshOwnership() {
    if (!storageAccessible()) {
      if (writable || !storageUnavailable) {
        writable = false;
        storageUnavailable = true;
        emit();
      }
      return false;
    }
    if (storageUnavailable) {
      // Re-enable the explicit Take over action after storage permissions return;
      // a paused tab must still never silently acquire an expired lease.
      storageUnavailable = false;
      emit();
    }
    const lease = currentLease();
    if (writable) {
      if (leaseIsActive(lease) && lease.tabId !== resolvedTabId) {
        writable = false;
        emit();
        return false;
      }
      if (!writeLease()) {
        writable = false;
        storageUnavailable = true;
        emit();
        return false;
      }
      return true;
    }
    // A tab that started as a non-owner never acquires the workspace silently.
    // Its in-memory state may have diverged while autosave was paused, so a
    // deliberate Take over flow must reconcile it with the latest saved state.
    return false;
  }

  function tryAcquire({ force = false } = {}) {
    if (!storageAccessible()) {
      // If IndexedDB is still writable, a second tab could overwrite it without
      // a shared lease. Keep editing possible, but refuse all persistent writes.
      writable = false;
      storageUnavailable = true;
      emit();
      return false;
    }
    storageUnavailable = false;
    const lease = currentLease();
    if (!force && leaseIsActive(lease) && lease.tabId !== resolvedTabId) {
      writable = false;
      emit();
      return false;
    }

    if (!writeLease()) {
      writable = false;
      storageUnavailable = true;
      emit();
      return false;
    }

    const confirmed = currentLease();
    writable = Boolean(confirmed?.tabId === resolvedTabId);
    emit();
    return writable;
  }

  function takeOver() {
    return tryAcquire({ force: true });
  }

  function hasWriteLease() {
    if (!writable || !storageAccessible()) return false;
    const lease = currentLease();
    // Missing or expired ownership is never a valid storage-commit token.
    return leaseIsActive(lease) && lease.tabId === resolvedTabId;
  }

  function release() {
    if (timer != null) {
      windowRef?.clearInterval?.(timer);
      timer = null;
    }
    const lease = currentLease();
    try {
      if (lease?.tabId === resolvedTabId) storage?.removeItem?.(LEASE_KEY);
    } catch {}
    writable = false;
  }

  function handleStorage(event) {
    if (event?.key !== LEASE_KEY) return;
    const lease = parseLease(event.newValue);
    const nextWritable = writable && (!leaseIsActive(lease) || lease?.tabId === resolvedTabId);
    if (nextWritable !== writable) {
      writable = nextWritable;
      emit();
    }
  }

  function start() {
    tryAcquire();
    windowRef?.addEventListener?.('storage', handleStorage);
    timer = windowRef?.setInterval?.(refreshOwnership, renewMs) ?? null;
    return writable;
  }

  function stop() {
    windowRef?.removeEventListener?.('storage', handleStorage);
    release();
  }

  return {
    start,
    stop,
    takeOver,
    canWrite: () => writable,
    hasWriteLease,
    // Revalidate the original owner after a long main-thread task delayed the
    // renewal timer. Never acquire ownership for a read-only tab.
    refreshOwnedLease: () => writable && refreshOwnership(),
    tabId: resolvedTabId,
  };
}
