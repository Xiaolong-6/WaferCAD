const LEASE_KEY = 'wafercad.workspace.owner.v1';
const TAB_ID_KEY = 'wafercad.workspace.tab.v1';
const DEFAULT_LEASE_MS = 7000;
const DEFAULT_RENEW_MS = 2500;

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
  storage = globalThis.localStorage,
  windowRef = globalThis.window,
  now = () => Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
  renewMs = DEFAULT_RENEW_MS,
  tabId = null,
  onStateChange = () => {},
} = {}) {
  const resolvedTabId = tabId || persistentTabId(windowRef);
  let writable = false;
  let timer = null;

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
    const lease = currentLease();
    if (writable) {
      if (leaseIsActive(lease) && lease.tabId !== resolvedTabId) {
        writable = false;
        emit();
        return false;
      }
      if (!writeLease()) emit();
      return true;
    }
    // A tab that started as a non-owner never acquires the workspace silently.
    // Its in-memory state may have diverged while autosave was paused, so a
    // deliberate Take over flow must reconcile it with the latest saved state.
    return false;
  }

  function tryAcquire({ force = false } = {}) {
    const lease = currentLease();
    if (!force && leaseIsActive(lease) && lease.tabId !== resolvedTabId) {
      writable = false;
      emit();
      return false;
    }

    if (!writeLease()) {
      // Privacy/sandbox settings can make localStorage unavailable. In that
      // case cross-tab coordination is impossible, so keep the editor usable
      // and simply operate as a local single-tab session.
      writable = true;
      emit();
      return true;
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
    if (!writable) return false;
    try {
      if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
        return true;
      }
      const lease = currentLease();
      if (!leaseIsActive(lease)) return true;
      return lease.tabId === resolvedTabId;
    } catch {
      // Cross-tab coordination is unavailable; preserve the single-tab fallback.
      return true;
    }
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
    tabId: resolvedTabId,
  };
}
