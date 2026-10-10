// Optional dev-only reload transport. Direct file opening makes no network request.
(() => {
  const status = document.getElementById('v2-live-status');
  window.addEventListener('error', () => {
    document.body.dataset.pageErrors = String(Number(document.body.dataset.pageErrors) + 1);
  });
  window.addEventListener('unhandledrejection', () => {
    document.body.dataset.pageErrors = String(Number(document.body.dataset.pageErrors) + 1);
  });
  if (!['http:', 'https:'].includes(location.protocol)) return;
  // No subscription on production/other servers without an explicit dev flag.
  if (!new URL(location.href).searchParams.has('live')) {
    status.textContent = 'Preview · Refresh to update';
    return;
  }
  const events = new EventSource('/__v2_events');
  events.addEventListener('open', () => {
    status.textContent = 'Live preview · Reloads when files change';
  });
  events.addEventListener('reload', () => location.reload());
  events.addEventListener('error', () => {
    status.textContent = 'Connecting live preview…';
  });
})();
