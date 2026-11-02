/* Local, keyboard-accessible context menus. Actions are supplied by the app. */
(() => {
  function create({ icon, onError = () => {} }) {
    const panels = [];
    let opener = null, query = '', queryAt = 0;
    const enabled = panel => [...panel.querySelectorAll('button')].filter(button => !button.disabled);
    function close(restore = true) {
      panels.splice(0).forEach(panel => panel.remove());
      if (opener?.getAttribute?.('aria-haspopup') === 'menu') opener.setAttribute('aria-expanded', 'false');
      if (restore && opener?.isConnected) opener.focus?.({ preventScroll: true });
      opener = null;
    }
    function trim(depth) { while (panels.length > depth) panels.pop().remove(); }
    function place(panel, x, y, maxHeight = window.innerHeight - 12) {
      const gap = 6;
      panel.style.maxHeight = Math.max(80, maxHeight) + 'px';
      const rect = panel.getBoundingClientRect();
      panel.style.left = Math.max(gap, Math.min(x, window.innerWidth - rect.width - gap)) + 'px';
      panel.style.top = Math.max(gap, Math.min(y, window.innerHeight - rect.height - gap)) + 'px';
    }
    function build(items, label, depth, parentButton = null) {
      trim(depth);
      const panel = document.createElement('div');
      panel.className = 'context-menu'; panel.setAttribute('role', 'menu');
      panel.setAttribute('aria-label', label); panel.tabIndex = -1;
      panel.parentButton = parentButton;
      let previousSeparator = true;
      for (const item of items.filter(Boolean)) {
        if (item.separator) {
          if (previousSeparator) continue;
          const separator = document.createElement('div'); separator.className = 'context-menu-separator'; separator.setAttribute('role', 'separator'); panel.append(separator); previousSeparator = true; continue;
        }
        previousSeparator = false;
        const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
        button.className = 'context-menu-item' + (item.danger ? ' danger' : '');
        button.setAttribute('role', 'menuitem'); button.disabled = !!item.disabled;
        if (item.checked !== undefined) { button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(item.checked)); }
        if (item.title) button.dataset.tooltip = item.title;
        button.innerHTML = icon(item.icon || 'file');
        const title = document.createElement('span'); title.className = 'context-menu-label'; title.textContent = item.label; button.append(title);
        if (item.checked) button.insertAdjacentHTML('beforeend', icon('check'));
        if (item.shortcut) { const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut; button.append(shortcut); }
        if (item.children) { button.insertAdjacentHTML('beforeend', icon('right')); button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false'); }
        function submenu(focus) {
          if (button.disabled || !item.children) return;
          panel.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', String(el === button)));
          const child = build(item.children, item.label, depth + 1, button);
          const rect = button.getBoundingClientRect(); const width = child.getBoundingClientRect().width;
          place(child, rect.right + width + 6 > window.innerWidth ? rect.left - width - 3 : rect.right + 3, rect.top - 5);
          if (focus) (enabled(child)[0] || child).focus();
        }
        button.onpointerenter = () => { if (item.children) submenu(false); else { trim(depth + 1); panel.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false')); } };
        button.openSubmenu = submenu;
        button.onclick = () => {
          if (button.disabled) return;
          if (item.children) { submenu(true); return; }
          close();
          try { Promise.resolve(item.action?.()).catch(onError); } catch (error) { onError(error); }
        };
        panel.append(button);
      }
      if (panel.lastElementChild?.getAttribute('role') === 'separator') panel.lastElementChild.remove();
      (opener?.closest?.('dialog[open]') || document.body).append(panel); panels.push(panel); return panel;
    }
    function open(items, event, label = 'Actions', options = {}) {
      event.preventDefault?.(); event.stopPropagation?.(); close(false);
      opener = event.currentTarget || document.activeElement; query = '';
      const panel = build(items, label, 0);
      if (opener?.getAttribute?.('aria-haspopup') === 'menu') opener.setAttribute('aria-expanded', 'true');
      const rect = opener?.getBoundingClientRect?.() || { left: 6, bottom: 6 };
      const anchored = event.type === 'click' || event.type === 'keydown';
      if (options.side === 'top') {
        panel.style.minWidth = Math.max(220, rect.width || 0) + 'px';
        panel.style.maxHeight = Math.max(80, rect.top - 12) + 'px';
        place(panel, rect.left, rect.top - panel.getBoundingClientRect().height - 6, rect.top - 12);
      } else place(panel, anchored ? rect.left : (event.clientX ?? rect.left), anchored ? rect.bottom + 6 : (event.clientY ?? rect.bottom));
      (enabled(panel)[0] || panel).focus({ preventScroll: true });
    }
    document.addEventListener('pointerdown', event => { if (panels.length && !panels.some(panel => panel.contains(event.target))) close(false); }, true);
    document.addEventListener('contextmenu', event => { if (panels.length && !panels.some(panel => panel.contains(event.target))) close(false); }, true);
    window.addEventListener('resize', () => close(false));
    window.addEventListener('blur', () => close(false));
    document.addEventListener('scroll', event => { if (panels.length && !panels.some(panel => panel.contains(event.target))) close(false); }, true);
    document.addEventListener('keydown', event => {
      if (!panels.length) return;
      const panel = panels.find(panel => panel.contains(document.activeElement)) || panels.at(-1);
      const buttons = enabled(panel), index = buttons.indexOf(document.activeElement);
      const key = event.key;
      if (['ArrowDown','ArrowUp','Home','End','ArrowRight','ArrowLeft','Enter',' ','Escape','Tab'].includes(key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (key === 'Escape' || key === 'Tab') { close(); return; }
        if (key === 'ArrowRight') { document.activeElement.openSubmenu?.(true); return; }
        if (key === 'ArrowLeft') { if (panel.parentButton) { const parent = panel.parentButton; trim(panels.indexOf(panel)); parent.setAttribute('aria-expanded','false'); parent.focus(); } return; }
        if (key === 'Enter' || key === ' ') { document.activeElement.click?.(); return; }
        if (!buttons.length) return;
        const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus(); buttons[next].scrollIntoView({ block: 'nearest' });
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (Date.now() - queryAt > 700) query = ''; query += key.toLowerCase(); queryAt = Date.now();
        const ordered = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)];
        ordered.find(button => button.querySelector('.context-menu-label').textContent.toLowerCase().startsWith(query))?.focus();
      }
    }, true);
    return { open, close, get isOpen() { return panels.length > 0; } };
  }
  window.SlateContextMenu = Object.freeze({ create });
})();
