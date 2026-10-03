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

  function finish(task) {
    clearInterval(task.timer);
    task.worker.terminate();
    if (active?.id === task.id) active = null;
    setApplyDisabled(false);
    syncDialog();
  }

  function abort() {
    if (!active) return;
    const task = active;
    finish(task);
    status(task.abortMessage, 'warning');
    task.resolve({ aborted: true });
  }

  function runWorker(
    workerPath,
    payload,
    {
      label = 'Working…',
      abortMessage = 'Task aborted. The workspace was not changed.',
      failurePrefix = 'Task failed',
      transfer = [],
    } = {},
  ) {
    if (active) return Promise.resolve({ busy: true });

    return new Promise((resolve) => {
      const id = `task-${++sequence}`,
        workerUrl = new URL(workerPath, import.meta.url),
        currentModuleUrl = new URL(import.meta.url);
      workerUrl.search = currentModuleUrl.search;
      const worker = new Worker(workerUrl),
        task = {
          id,
          worker,
          resolve,
          label,
          abortMessage,
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
          active.stage = message.stage || 'Working…';
          syncDialog();
          return;
        }

        if (message.type === 'done') {
          finish(task);
          resolve({ ...message, aborted: false });
          return;
        }

        if (message.type === 'error') {
          const error = message.message || 'unknown error';
          finish(task);
          status(`${failurePrefix}: ${error}`, 'error');
          resolve({ error, aborted: false });
        }
      };

      worker.onerror = (event) => {
        if (!active || active.id !== id) return;
        const message = event.message || 'Worker failed.';
        finish(task);
        status(`${failurePrefix}: ${message}`, 'error');
        resolve({ error: message, aborted: false });
      };

      worker.postMessage({ id, ...payload }, transfer);
    });
  }

  function run(model, params, label = 'Applying process…', areaRequest = null) {
    return runWorker(
      '../process-worker.js',
      { model, params, areaRequest },
      {
        label,
        abortMessage: 'Operation aborted. The structure was not changed.',
        failurePrefix: 'Operation failed',
      },
    );
  }

  function bind() {
    $('processTaskAbortBtn')?.addEventListener('click', abort);
    syncDialog();
  }

  return {
    bind,
    run,
    runWorker,
    abort,
    isBusy: () => Boolean(active),
  };
}
