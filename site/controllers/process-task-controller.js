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
    return seconds < 60
      ? `${seconds.toFixed(1)} s`
      : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
  }

  function syncDialog() {
    const dialog = $('processTaskDialog');
    if (!dialog) return;
    dialog.hidden = !active;
    if (!active) return;
    $('processTaskTitle').textContent = active.label;
    $('processTaskStage').textContent = active.stage;
    $('processTaskElapsed').textContent = formatElapsed(performance.now() - active.startedAt);
    const abortButton = $('processTaskAbortBtn');
    if (abortButton) {
      abortButton.hidden = active.abortable === false;
      abortButton.disabled = active.abortable === false;
    }
  }

  function finish(task) {
    clearInterval(task.timer);
    task.abortCurrent?.();
    task.abortCurrent = null;
    if (active?.id === task.id) active = null;
    setApplyDisabled(false);
    syncDialog();
  }

  function abort() {
    if (!active || active.abortable === false) return;
    const task = active;
    task.abortController.abort();
    task.abortCurrent?.();
    status(task.abortMessage, 'warning');
  }

  function runChildWorker(task, workerPath, payload, { transfer = [], stagePrefix = '' } = {}) {
    if (task.abortController.signal.aborted) return Promise.resolve({ aborted: true });

    return new Promise((resolve) => {
      const workerUrl = new URL(workerPath, import.meta.url),
        currentModuleUrl = new URL(import.meta.url);
      workerUrl.search = currentModuleUrl.search;

      let worker,
        settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        if (task.abortCurrent === abortCurrent) task.abortCurrent = null;
        worker?.terminate();
        resolve(result);
      };
      const abortCurrent = () => settle({ aborted: true });

      try {
        worker = new Worker(workerUrl);
      } catch (error) {
        settle({
          error: error?.message || String(error || 'Worker failed to start.'),
          aborted: false,
        });
        return;
      }

      task.abortCurrent = abortCurrent;
      if (stagePrefix) {
        task.stage = stagePrefix;
        syncDialog();
      }

      worker.onmessage = (event) => {
        const message = event.data || {};
        if (settled || message.id !== task.id) return;

        if (message.type === 'progress') {
          task.stage = [stagePrefix, message.stage || 'Working…'].filter(Boolean).join(' · ');
          syncDialog();
          return;
        }

        if (message.type === 'done') {
          settle({ ...message, aborted: false });
          return;
        }

        if (message.type === 'error') {
          settle({ error: message.message || 'unknown error', aborted: false });
        }
      };

      worker.onerror = (event) => {
        settle({ error: event.message || 'Worker failed.', aborted: false });
      };

      try {
        worker.postMessage({ id: task.id, ...payload }, transfer);
      } catch (error) {
        settle({
          error: error?.message || String(error || 'Worker message could not be sent.'),
          aborted: false,
        });
      }
    });
  }

  async function runTask(
    executor,
    {
      label = 'Working…',
      abortMessage = 'Task aborted. The workspace was not changed.',
      failurePrefix = 'Task failed',
      abortable = true,
      initialStage = 'Preparing…',
    } = {},
  ) {
    if (active) return { busy: true };

    const task = {
      id: `task-${++sequence}`,
      label,
      abortMessage,
      abortable,
      stage: initialStage,
      startedAt: performance.now(),
      timer: null,
      abortController: new AbortController(),
      abortCurrent: null,
    };

    active = task;
    setApplyDisabled(true);
    syncDialog();
    task.timer = setInterval(syncDialog, 100);

    try {
      const result = await executor({
        signal: task.abortController.signal,
        updateStage(stage) {
          if (!active || active.id !== task.id) return;
          task.stage = stage || 'Working…';
          syncDialog();
        },
        runWorker(workerPath, payload, options = {}) {
          return runChildWorker(task, workerPath, payload, options);
        },
      });

      if (task.abortController.signal.aborted && !result?.aborted) {
        return { aborted: true };
      }
      return result ?? { done: true, aborted: false };
    } catch (error) {
      if (task.abortController.signal.aborted || error?.name === 'AbortError') {
        return { aborted: true };
      }
      const message = error?.message || String(error || 'Unknown task error');
      status(`${failurePrefix}: ${message}`, 'error');
      return { error: message, aborted: false };
    } finally {
      finish(task);
    }
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
    return runTask(
      async ({ runWorker: runChild }) => {
        const result = await runChild(workerPath, payload, { transfer });
        if (result?.error) throw new Error(result.error);
        return result;
      },
      { label, abortMessage, failurePrefix },
    );
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
    runTask,
    runWorker,
    abort,
    isBusy: () => Boolean(active),
  };
}
