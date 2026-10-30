/* Local ribbon ordering. Move existing buttons so their actions and focus survive. */
(() => {
 function normalize(order, defaults) {
  return [...new Set([...(Array.isArray(order) ? order : []), ...defaults])].filter(id => defaults.includes(id));
 }
 function mount(host, { getOrder, onChange, openMenu }) {
  const buttons = [...host.querySelectorAll('button')];
  const defaults = buttons.map(button => button.id);
  let drag = null, suppressClickUntil = 0;
  const order = () => [...host.children].map(button => button.id);
  function render(ids) { for (const id of ids) host.append(buttons.find(button => button.id === id)); }
  function restore() { if (!drag) render(normalize(getOrder(), defaults)); }
  function commit(ids, focus) {
   render(ids); onChange(ids);
   focus?.focus({ preventScroll: true });
  }
  function move(button, offset) {
   const ids = order(), from = ids.indexOf(button.id), to = from + offset;
   if (to < 0 || to >= ids.length) return;
   ids.splice(from, 1); ids.splice(to, 0, button.id); commit(ids, button);
  }
  function menu(button, event) {
   const index = order().indexOf(button.id);
   openMenu([
    { label: 'Move up', icon: 'arrow-up', disabled: index === 0, action: () => move(button, -1) },
    { label: 'Move down', icon: 'arrow-down', disabled: index === buttons.length - 1, action: () => move(button, 1) },
    { separator: true },
    { label: 'Reset icon order', icon: 'refresh', action: () => commit([...defaults], button) },
   ], event, 'Toolbar: ' + button.getAttribute('aria-label'));
  }
  function finish(cancel = false) {
   if (!drag) return;
   const previous = drag; drag = null;
   if (previous.started) {
    suppressClickUntil = Date.now() + 400;
    host.classList.remove('reordering'); previous.button.classList.remove('ribbon-dragging');
    if (cancel) render(previous.order); else commit(order(), previous.button);
    if (host.hasPointerCapture(previous.pointerId)) host.releasePointerCapture(previous.pointerId);
   }
  }
  for (const button of buttons) {
   button.style.touchAction = 'none';
   button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown Shift+F10');
   button.dataset.tooltip += ' · Drag to reorder';
   button.oncontextmenu = event => menu(button, event);
   button.addEventListener('keydown', event => {
    if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
     event.preventDefault(); event.stopPropagation(); move(button, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
     event.preventDefault(); menu(button, event);
    }
   });
  }
  host.addEventListener('click', event => {
   if (event.detail > 0 && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  host.addEventListener('pointerdown', event => {
   if (event.button !== 0 || !event.isPrimary) return;
   const button = event.target.closest('button');
   if (!buttons.includes(button)) return;
   suppressClickUntil = 0;
   drag = { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, order: order(), started: false };
  });
  host.addEventListener('pointermove', event => {
   if (!drag || event.pointerId !== drag.pointerId) return;
   if (!drag.started) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.started = true; host.setPointerCapture(event.pointerId);
    host.classList.add('reordering'); drag.button.classList.add('ribbon-dragging');
   }
   event.preventDefault();
   const remaining = [...host.children].filter(button => button !== drag.button);
   const next = remaining.find(button => { const rect = button.getBoundingClientRect(); return event.clientY < rect.top + rect.height / 2; });
   // Only move the node when crossing an item, keeping pointer capture on the host.
   if (drag.button.nextElementSibling !== (next || null)) host.insertBefore(drag.button, next || null);
  });
  host.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointerId) finish(); });
  host.addEventListener('pointercancel', () => finish(true));
  host.addEventListener('lostpointercapture', () => finish(true));
  document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); } }, true);
  window.addEventListener('blur', () => finish(true));
  restore();
  return { restore };
 }
 window.SlateRibbon = { normalize, mount };
})();
