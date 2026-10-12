// One anchored tool-menu presentation shared by view adapters.
export function mountToolPopover(overlays, { content, trigger, onClose, label = 'View tools' }) {
  const menu = trigger.closest('.p-overflow');
  if (menu) trigger = document.querySelector(`[popovertarget="${menu.id}"]`);
  const node = overlays.mount('popover', {
    content,
    trigger,
    onClose,
    label,
    className: 'v2-main-tools',
  });
  const rect = trigger.getBoundingClientRect();
  node.style.inset = 'auto';
  node.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - node.offsetWidth - 8))}px`;
  node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - node.offsetHeight - 8))}px`;
  return node;
}
