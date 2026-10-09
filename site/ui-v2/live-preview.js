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
    status.textContent = '普通预览 · 修改后刷新';
    return;
  }
  const events = new EventSource('/__v2_events');
  events.addEventListener('open', () => {
    status.textContent = '实时预览 · 文件保存后自动刷新';
  });
  events.addEventListener('reload', () => location.reload());
  events.addEventListener('error', () => {
    status.textContent = '实时预览连接中…';
  });
})();
