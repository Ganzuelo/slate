/* Shared shadcn-style tooltips, kept local for Slate's vanilla JavaScript UI. */
(() => {
  const tip = document.createElement('div');
  tip.id = 'slate-tooltip';
  tip.className = 'ui-tooltip';
  tip.popover = 'manual';
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  let trigger = null, timer = null, closeTimer = null;

  function close() {
    clearTimeout(timer); clearTimeout(closeTimer);
    if (trigger) {
      const ids = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
      if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
      else trigger.removeAttribute('aria-describedby');
    }
    if (tip.matches(':popover-open')) tip.hidePopover();
    trigger = null;
  }

  function position() {
    const rect = trigger.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const gap = 8, padding = 8;
    const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
    const candidates = {
      top: { x: centerX - box.width / 2, y: rect.top - gap - box.height },
      bottom: { x: centerX - box.width / 2, y: rect.bottom + gap },
      left: { x: rect.left - gap - box.width, y: centerY - box.height / 2 },
      right: { x: rect.right + gap, y: centerY - box.height / 2 },
    };
    const preferred = trigger.dataset.tooltipSide || (trigger.closest('.ribbon') ? 'right' : trigger.closest('.titlebar') ? 'bottom' : 'top');
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const order = [...new Set([preferred, opposite[preferred], 'top', 'bottom', 'right', 'left'])].filter(side => candidates[side]);
    const overflow = ({ x, y }) => Math.max(padding - x, 0) + Math.max(x + box.width + padding - window.innerWidth, 0) + Math.max(padding - y, 0) + Math.max(y + box.height + padding - window.innerHeight, 0);
    // Try centered placements first; only shift against an edge as a last resort.
    const side = order.find(side => !overflow(candidates[side])) || order.reduce((best, side) => overflow(candidates[side]) < overflow(candidates[best]) ? side : best);
    const point = candidates[side];
    tip.style.left = Math.max(padding, Math.min(point.x, window.innerWidth - box.width - padding)) + 'px';
    tip.style.top = Math.max(padding, Math.min(point.y, window.innerHeight - box.height - padding)) + 'px';
    tip.dataset.side = side;
    tip.style.setProperty('--tooltip-arrow-x', Math.max(8, Math.min(centerX - parseFloat(tip.style.left), box.width - 8)) + 'px');
    tip.style.setProperty('--tooltip-arrow-y', Math.max(8, Math.min(centerY - parseFloat(tip.style.top), box.height - 8)) + 'px');
  }

  function open(target, delay) {
    clearTimeout(closeTimer);
    if (target === trigger && tip.matches(':popover-open')) return;
    close();
    if (!target?.dataset.tooltip) return;
    trigger = target;
    timer = setTimeout(() => {
      if (!target.isConnected || !target.getClientRects().length || target.closest('[hidden], [inert]')) { close(); return; }
      tip.textContent = target.dataset.tooltip;
      // A child of the modal/popover is allowed to join its top layer.
      (target.closest('dialog, :popover-open') || document.body).append(tip);
      const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(tip.id); target.setAttribute('aria-describedby', [...ids].join(' '));
      tip.showPopover(); position();
    }, delay);
  }

  const targetOf = event => event.target.closest?.('[data-tooltip]');
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (tip.contains(event.target)) { clearTimeout(closeTimer); return; }
    const target = targetOf(event);
    if (target) open(target, 400);
  });
  document.addEventListener('pointerout', event => {
    if (!trigger || trigger.contains(event.relatedTarget) || tip.contains(event.relatedTarget)) return;
    clearTimeout(timer);
    closeTimer = setTimeout(close, 120);
  });
  document.addEventListener('focusin', event => {
    const target = targetOf(event);
    if (target?.matches(':focus-visible')) open(target, 0);
  });
  document.addEventListener('focusout', close);
  document.addEventListener('pointerdown', close, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); }, true);
  document.addEventListener('scroll', close, true);
  document.addEventListener('close', close, true);
  document.addEventListener('toggle', event => {
    if (trigger && event.target !== tip && event.newState === 'closed' && event.target.contains(trigger)) close();
  }, true);
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  new MutationObserver(() => {
    if (trigger && (!trigger.isConnected || !trigger.getClientRects().length || trigger.closest('[hidden], [inert]'))) close();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'inert', 'class'] });
})();
