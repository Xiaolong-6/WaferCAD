export function createProcessTaskController({
  root = document,
  status,
  setApplyDisabled = () => {},
}) {
  const $ = (id) => root.getElementById(id);
  let active = null,
    sequence = 0;

  function formatElapsed(ms) {
    const seconds = Math.max(0, ms) / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)}m ${(
        seconds % 60
      ).toFixed(1)}s`;
  }

  function syncDialog() {
    const dialog = $('processTaskDialog');
    if (!dialog) return;
    dialog.hidden = !active;
    if (!active) return;
    $('processTaskTitle').textContent = active.label;
    $('processTaskStage').textContent = active.stage;
    $('processTaskElapsed').textContent = formatElapsed(performance.now() - active.startedAt);
  }

  function clearActive() {
    if (!active) return;
    clearInterval(active.timer);
    active.worker?.terminate();
    active = null;
    setApplyDisabled(false);
    syncDialog();
  }

  function abort() {
    if (!active) return;
    const task = active;
    clearInterval(task.timer);
    task.worker.terminate();
    active = null;
    setApplyDisabled(false);
    syncDialog();
    status('Operation aborted. The structure was not changed.', 'warning');
    task.resolve({ aborted: true });
  }

  function run(model, params, label = 'Applying process…', areaRequest = null) {
    if (active) return Promise.resolve({ busy: true });

    return new Promise((resolve) => {
      const id = `process-${++sequence}`,
        workerUrl = new URL('../process-worker.js', import.meta.url),
        currentModuleUrl = new URL(import.meta.url);
      workerUrl.search = currentModuleUrl.search;
      const worker = new Worker(workerUrl),
        task = {
          id,
          worker,
          resolve,
          label,
          stage: 'Preparing worker…',
          startedAt: performance.now(),
          timer: null,
        };

      active = task;
      setApplyDisabled(true);
      syncDialog();
      task.timer = setInterval(syncDialog, 100);

      worker.onmessage = (event) => {
        const message = event.data || {};
        if (!active || active.id !== id || message.id !== id) return;

        if (message.type === 'progress') {
          active.stage = message.stage || 'Computing geometry…';
          syncDialog();
          return;
        }

        if (message.type === 'done') {
          clearInterval(active.timer);
          active.worker.terminate();
          active = null;
          setApplyDisabled(false);
          syncDialog();
          resolve({ model: message.model, result: message.result, aborted: false });
          return;
        }

        if (message.type === 'error') {
          clearInterval(active.timer);
          active.worker.terminate();
          active = null;
          setApplyDisabled(false);
          syncDialog();
          status(`Operation failed: ${message.message || 'unknown error'}`, 'error');
          resolve({ error: message.message || 'unknown error', aborted: false });
        }
      };

      worker.onerror = (event) => {
        if (!active || active.id !== id) return;
        const message = event.message || 'Process worker failed.';
        clearInterval(active.timer);
        active.worker.terminate();
        active = null;
        setApplyDisabled(false);
        syncDialog();
        status(`Operation failed: ${message}`, 'error');
        resolve({ error: message, aborted: false });
      };

      worker.postMessage({ id, model, params, areaRequest });
    });
  }

  function bind() {
    $('processTaskAbortBtn')?.addEventListener('click', abort);
    syncDialog();
  }

  return {
    bind,
    run,
    abort,
    isBusy: () => Boolean(active),
  };
}
