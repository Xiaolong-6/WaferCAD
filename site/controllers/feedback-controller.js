export function createFeedbackController({ root = document } = {}) {
  const statusBar = root.getElementById('statusBar');
  const statusText = root.getElementById('statusText');
  const toastHost = root.getElementById('feedbackToasts');
  let toastTimer = null;

  function classify(message) {
    const text = String(message || '');
    if (/failed|invalid|must be|unavailable|requires|cannot|error/i.test(text)) return 'error';
    if (/warning|no material|removed|select .* first|not exposed|did not change|skipped/i.test(text))
      return 'warning';
    if (/reading|preparing|loading|importing|resolving/i.test(text)) return 'progress';
    if (/saved|opened|restored|exported|added|grew|etched|deleted|applied|imported/i.test(text))
      return 'success';
    return 'passive';
  }

  function show(message, level = 'auto') {
    const text = String(message ?? '');
    const resolved = level === 'auto' ? classify(text) : level;

    if (statusText) statusText.textContent = text;
    if (statusBar) statusBar.dataset.level = resolved;

    if (!toastHost || resolved === 'passive') return resolved;
    toastHost.replaceChildren();
    if (toastTimer != null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    const toast = root.createElement('div');
    toast.className = `feedback-toast ${resolved}`;
    toast.setAttribute('role', resolved === 'error' ? 'alert' : 'status');
    toast.textContent = text;
    toastHost.append(toast);

    const timeout =
      resolved === 'error' || resolved === 'progress'
        ? 0
        : resolved === 'warning'
          ? 5200
          : resolved === 'info'
            ? 3600
            : 2800;
    if (timeout) {
      toastTimer = setTimeout(() => {
        toast.remove();
        toastTimer = null;
      }, timeout);
    }
    return resolved;
  }

  return { show, classify };
}
