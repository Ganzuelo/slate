// Sonner-style toasts: a bottom-right stack of dismissible, optionally
// actionable alerts that replaces the old banner above notes.
(() => {
 const icons = {success: 'circle-check', info: 'info', warning: 'triangle-alert', error: 'circle-x'};
 const durations = {success: 4000, info: 4000, warning: 6000, error: 8000};
 const visible = 3;
 const toasts = [];
 let section, list, hovering = false;

 function host() {
  if (list) return list;
  section = document.createElement('section');
  // A manual popover sits in the top layer, so alerts stay visible above modal dialogs.
  section.popover = 'manual';
  section.className = 'toaster'; section.setAttribute('aria-label', 'Notifications'); section.tabIndex = -1;
  list = document.createElement('ol');
  section.append(list); document.body.append(section);
  // Hovering or focusing the stack expands it and pauses every timer.
  const pause = value => { hovering = value; section.classList.toggle('expanded', value); for (const toast of toasts) value ? stopTimer(toast) : startTimer(toast); };
  section.addEventListener('pointerenter', () => pause(true));
  section.addEventListener('pointerleave', () => { if (!section.contains(document.activeElement)) pause(false); });
  section.addEventListener('focusin', () => pause(true));
  section.addEventListener('focusout', event => { if (!section.contains(event.relatedTarget) && !section.matches(':hover')) pause(false); });
  section.addEventListener('keydown', event => {
   if (event.key !== 'Escape') return;
   const toast = toasts.find(t => t.el.contains(event.target)); if (!toast) return;
   event.preventDefault(); event.stopPropagation(); dismiss(toast.id);
  });
  return list;
 }
 function startTimer(toast) {
  if (hovering || !toast.duration || toast.timer) return;
  toast.started = Date.now();
  toast.timer = setTimeout(() => dismiss(toast.id), toast.remaining);
 }
 function stopTimer(toast) {
  if (!toast.timer) return;
  clearTimeout(toast.timer); toast.timer = null;
  toast.remaining = Math.max(1000, toast.remaining - (Date.now() - toast.started));
 }
 function raise() {
  if (!section?.showPopover) return;
  if (!toasts.length) { if (section.matches(':popover-open')) section.hidePopover(); return; }
  if (!section.matches(':popover-open')) { section.showPopover(); return; }
  // Re-showing moves the stack above a modal dialog opened since the last toast.
  if (section.contains(document.activeElement) || !document.querySelector('dialog:modal')) return;
  section.hidePopover(); section.showPopover();
 }
 function layout() {
  if (toasts[0]) list.style.setProperty('--front-height', toasts[0].el.offsetHeight + 'px');
  toasts.forEach((toast, index) => {
   toast.el.style.setProperty('--index', index);
   toast.el.classList.toggle('front', index === 0);
   toast.el.classList.toggle('collapsed', index >= visible);
   toast.el.setAttribute('aria-hidden', index >= visible ? 'true' : 'false');
  });
 }
 function iconHtml(name) { return window.SlateIcons?.[name] || ''; }
 function render(toast) {
  const el = document.createElement('li');
  el.className = 'toast'; el.dataset.type = toast.type;
  el.setAttribute('role', toast.type === 'error' ? 'alert' : 'status');
  const symbol = document.createElement('span'); symbol.className = 'toast-icon'; symbol.innerHTML = iconHtml(icons[toast.type]);
  const body = document.createElement('div'); body.className = 'toast-body';
  const title = document.createElement('div'); title.className = 'toast-title'; title.textContent = toast.title; body.append(title);
  if (toast.description) { const text = document.createElement('div'); text.className = 'toast-description'; text.textContent = toast.description; body.append(text); }
  el.append(symbol, body);
  if (toast.action) {
   const action = document.createElement('button'); action.type = 'button'; action.className = 'toast-action'; action.textContent = toast.action.label;
   action.onclick = () => { dismiss(toast.id); toast.action.onClick?.(); };
   el.append(action);
  }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'toast-close';
  close.innerHTML = iconHtml('x'); close.setAttribute('aria-label', 'Dismiss notification'); close.dataset.tooltip = 'Dismiss';
  close.onclick = () => dismiss(toast.id);
  el.append(close);
  swipe(el, toast);
  return el;
 }
 // Swiping a toast to the right dismisses it, as in Sonner.
 function swipe(el, toast) {
  let start = null;
  el.addEventListener('pointerdown', event => { if (event.button || event.target.closest('button')) return; start = event.clientX; el.setPointerCapture(event.pointerId); });
  el.addEventListener('pointermove', event => { if (start !== null) el.style.setProperty('--swipe', Math.max(0, event.clientX - start) + 'px'); });
  const end = event => {
   if (start === null) return;
   const distance = event.clientX - start; start = null;
   if (distance > 60) { el.classList.add('swiped'); dismiss(toast.id); } else el.style.removeProperty('--swipe');
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
 }
 let nextId = 1;
 function show(input) {
  const options = typeof input === 'string' ? {title: input} : input || {};
  const title = String(options.title || '').trim(); if (!title) return null;
  const type = icons[options.type] ? options.type : 'info';
  // Repeating the same alert refreshes it instead of stacking copies.
  const existing = toasts.find(t => (options.id && t.id === options.id) || (t.title === title && t.type === type && (t.description || '') === (options.description || '')));
  if (existing) dismiss(existing.id, true);
  const duration = options.duration === undefined ? durations[type] : options.duration;
  const toast = {id: options.id || nextId++, type, title, description: options.description || '', action: options.action, duration, remaining: duration || 0, timer: null};
  toast.el = render(toast);
  toasts.unshift(toast);
  host().prepend(toast.el);
  raise(); layout();
  // Force a style flush so the enter transition runs without depending on animation frames.
  void toast.el.offsetHeight; toast.el.classList.add('mounted');
  startTimer(toast);
  return toast.id;
 }
 function dismiss(id, immediate = false) {
  const index = toasts.findIndex(t => t.id === id); if (index < 0) return;
  const [toast] = toasts.splice(index, 1);
  clearTimeout(toast.timer);
  const hadFocus = toast.el.contains(document.activeElement);
  if (immediate) toast.el.remove();
  else { toast.el.classList.add('removing'); setTimeout(() => { toast.el.remove(); if (!toasts.length) raise(); }, 200); }
  layout();
  if (hadFocus) (toasts[0]?.el.querySelector('button') || document.getElementById('editor'))?.focus?.();
 }
 function dismissWhere(predicate) { for (const toast of [...toasts]) if (predicate(toast)) dismiss(toast.id); }
 const api = {show, dismiss, dismissWhere, list: () => toasts.map(({id, type, title, description}) => ({id, type, title, description}))};
 for (const type of Object.keys(icons)) api[type] = (title, options = {}) => show({...options, title, type});
 window.SlateToast = Object.freeze(api);
})();
