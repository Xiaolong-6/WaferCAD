export function classifyStatusMessage(message) {
  const text = String(message || '');
  if (/failed|invalid|must be|unavailable|requires|cannot|error/i.test(text)) return 'error';
  if (
    /warning|no material|removed|select .* first|not exposed|did not change|skipped|area is empty/i.test(text)
  )
    return 'warning';
  if (/reading|preparing|loading|importing|resolving/i.test(text)) return 'progress';
  if (
    /saved|opened|restored|exported|download requested|deposited|extended|etched|deleted|applied|imported/i.test(
      text,
    )
  )
    return 'success';
  return 'passive';
}

export function createFeedbackController({ root = document } = {}) {
  const statusBar = root.getElementById('statusBar');
  const statusText = root.getElementById('statusText');
  const classify = classifyStatusMessage;

  function show(message, level = 'auto') {
    const text = String(message ?? '');
    const resolved = level === 'auto' ? classify(text) : level;

    if (statusText) statusText.textContent = text;
    if (statusBar) statusBar.dataset.level = resolved;
    return resolved;
  }

  return { show, classify };
}
