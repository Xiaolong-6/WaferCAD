const LEASE_KEY = 'wafercad.workspace.owner.v1';
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

export function createWorkspaceSessionController({
  storage = globalThis.localStorage,
  windowRef = globalThis.window,
  now = () => Date.now(),
  leaseMs = DEFAULT_LEASE_MS,
  renewMs = DEFAULT_RENEW_MS,
  tabId = globalThis.crypto?.randomUUID?.() || `tab-${Math.random().toString(36).slice(2)}`,
  onStateChange = () => {},
} = {}) {
  let writable = false;
  let timer = null;

  function currentLease() {
    return parseLease(storage?.getItem?.(LEASE_KEY));
  }

  function leaseIsActive(lease) {
    return Boolean(lease && lease.expiresAt > now());
  }

  function emit() {
    const lease = currentLease();
    onStateChange({
      writable,
      tabId,
      ownerTabId: leaseIsActive(lease) ? lease.tabId : null,
    });
  }

  function writeLease() {
    storage?.setItem?.(
      LEASE_KEY,
      JSON.stringify({
        tabId,
        expiresAt: now() + leaseMs,
      }),
    );
  }

  function refreshOwnership() {
    const lease = currentLease();
    if (writable) {
      if (leaseIsActive(lease) && lease.tabId !== tabId) {
        writable = false;
        emit();
        return false;
      }
      writeLease();
      return true;
    }
    return false;
  }

  function tryAcquire({ force = false } = {}) {
    const lease = currentLease();
    if (!force && leaseIsActive(lease) && lease.tabId !== tabId) {
      writable = false;
      emit();
      return false;
    }

    writeLease();
    const confirmed = currentLease();
    writable = Boolean(confirmed?.tabId === tabId);
    emit();
    return writable;
  }

  function takeOver() {
    return tryAcquire({ force: true });
  }

  function release() {
    if (timer != null) {
      windowRef?.clearInterval?.(timer);
      timer = null;
    }
    const lease = currentLease();
    if (lease?.tabId === tabId) storage?.removeItem?.(LEASE_KEY);
    writable = false;
  }

  function handleStorage(event) {
    if (event?.key !== LEASE_KEY) return;
    const lease = parseLease(event.newValue);
    const nextWritable = writable && (!leaseIsActive(lease) || lease?.tabId === tabId);
    if (nextWritable !== writable) {
      writable = nextWritable;
      emit();
    }
  }

  function start() {
    tryAcquire();
    windowRef?.addEventListener?.('storage', handleStorage);
    windowRef?.addEventListener?.('pagehide', release);
    timer = windowRef?.setInterval?.(refreshOwnership, renewMs) ?? null;
    return writable;
  }

  function stop() {
    windowRef?.removeEventListener?.('storage', handleStorage);
    windowRef?.removeEventListener?.('pagehide', release);
    release();
  }

  return {
    start,
    stop,
    takeOver,
    canWrite: () => writable,
    tabId,
  };
}
