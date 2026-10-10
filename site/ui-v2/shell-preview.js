// Debug controls are deliberately outside product navigation.
(() => {
  const boot = () => {
    const shell = window.WaferCadV2Shell;
    if (!shell?.ready) return;
  const example = document.getElementById('v2-example');
  const empty = document.getElementById('v2-empty');
  example.value = shell.snapshot().state.example;
  function update(domain, failed = false) {
    shell.debug({ example: example.value, domain, empty: empty.checked, failed });
  }
  example.addEventListener('change', () => update());
  empty.addEventListener('change', () => update('history'));
  document.getElementById('v2-failure').addEventListener('click', () => {
    empty.checked = false;
    update('recipe', true);
  });
    document.body.dataset.ready = 'true';
  };
  if (window.WaferCadV2Shell?.ready) boot();
  else window.addEventListener('wafercad-v2-ready', boot, { once: true });
})();
