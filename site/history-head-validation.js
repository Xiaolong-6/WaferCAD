// A disposable worker owns strict scientific validation of the captured
// process head. The caller owns History transactions and guards against edits
// made while validation is pending.
export function validateHistoryHeadOffThread(state, fallbackValidator) {
  if (typeof globalThis.Worker !== 'function') {
    return Promise.resolve().then(() => fallbackValidator(state));
  }
  return new Promise((resolve, reject) => {
    let worker;
    let settled = false;
    const finish = (error, valid) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      if (error) reject(error);
      else resolve(Boolean(valid));
    };
    try {
      const url = new URL('./history-head-validate-worker.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      worker = new globalThis.Worker(url);
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1) return;
        if (data.type === 'done') finish(null, data.valid === true);
        else if (data.type === 'error')
          finish(new Error(data.message || 'History head validator failed.'));
      };
      worker.onerror = (event) =>
        finish(new Error(event.message || 'History head validator crashed.'));
      worker.onmessageerror = () =>
        finish(new Error('History head validator returned unreadable data.'));
      worker.postMessage({ id: 1, action: 'validate-head', state });
    } catch (error) {
      finish(error);
    }
  });
}
