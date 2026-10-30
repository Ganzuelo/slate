/* Local select controls inspired by shadcn/ui. Native selects remain the form source. */
(() => {
  const controls = new WeakMap();
  let sequence = 0;
  function enhance(root, icon) {
    for (const select of root.querySelectorAll('select')) {
      if (controls.has(select)) { controls.get(select)(); continue; }
      if (select.multiple || select.size > 1 || !HTMLElement.prototype.showPopover) continue;
      const wrapper = document.createElement('div'); wrapper.className = 'ui-select';
      select.before(wrapper); wrapper.append(select); select.hidden = true;
      const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'ui-select-trigger';
      const value = document.createElement('span'); value.className = 'ui-select-value';
      trigger.append(value); trigger.insertAdjacentHTML('beforeend', icon('down'));
      const label = select.getAttribute('aria-label') || select.labels?.[0]?.textContent || 'Choose an option';
      trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
      trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
      const list = document.createElement('div'); list.className = 'ui-select-content'; list.popover = 'auto';
      list.id = 'slate-select-' + ++sequence; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
      trigger.setAttribute('aria-controls', list.id); wrapper.append(trigger, list);
      let query = '', queryAt = 0;
      const options = () => [...list.children].filter(option => option.getAttribute('aria-disabled') !== 'true');
      const isOpen = () => list.matches(':popover-open');
      function close(restore = false) {
        if (isOpen()) list.hidePopover();
        if (restore) trigger.focus({ preventScroll: true });
      }
      function sync() {
        value.textContent = select.selectedOptions[0]?.textContent || 'Choose an option'; trigger.disabled = select.disabled;
        list.replaceChildren();
        for (const option of select.options) {
          const row = document.createElement('div'); row.className = 'ui-select-option'; row.tabIndex = -1;
          row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected));
          row.setAttribute('aria-disabled', String(option.disabled)); row.dataset.value = option.value;
          const text = document.createElement('span'); text.textContent = option.textContent; row.append(text);
          row.insertAdjacentHTML('beforeend', icon('check'));
          row.onclick = () => {
            if (option.disabled) return;
            const changed = select.value !== option.value;
            select.value = option.value; sync(); close(true);
            if (changed) { select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); }
          };
          list.append(row);
        }
      }
      function open(last = false) {
        if (trigger.disabled) return;
        sync(); query = '';
        list.showPopover();
        const rect = trigger.getBoundingClientRect(), gap = 6, edge = 8;
        list.style.width = Math.min(Math.max(rect.width, 160), window.innerWidth - edge * 2) + 'px';
        const below = window.innerHeight - rect.bottom - gap - edge, above = rect.top - gap - edge;
        const maxHeight = Math.max(64, Math.min(400, Number(select.dataset.maxHeight) || 280));
        const height = Math.min(list.scrollHeight + 2, maxHeight), flip = below < height && above > below;
        list.style.maxHeight = Math.max(0, Math.min(maxHeight, flip ? above : below)) + 'px';
        list.style.left = Math.max(edge, Math.min(rect.left, window.innerWidth - list.getBoundingClientRect().width - edge)) + 'px';
        list.style.top = (flip ? rect.top - gap - list.getBoundingClientRect().height : rect.bottom + gap) + 'px';
        const rows = options();
        (rows.find(row => row.getAttribute('aria-selected') === 'true') || (last ? rows.at(-1) : rows[0]))?.focus({ preventScroll: true });
        document.activeElement?.scrollIntoView({ block: 'nearest' });
      }
      trigger.onclick = () => isOpen() ? close() : open();
      function keydown(event) {
        const key = event.key;
        if (key === 'Escape' && !isOpen()) return;
        let rows = options(), index = rows.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(key)) {
          event.preventDefault(); event.stopPropagation();
          if (key === 'Escape') { close(true); return; }
          if (!isOpen()) { open(key === 'ArrowUp' || key === 'End'); return; }
          if (key === 'Enter' || key === ' ') { document.activeElement?.click(); return; }
          const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
          rows[next]?.focus(); rows[next]?.scrollIntoView({ block: 'nearest' });
        } else if (key === 'Tab') {
          close(true); // Let the browser advance from the trigger in normal form order.
        } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); event.stopPropagation();
          if (!isOpen()) { open(); rows = options(); index = rows.indexOf(document.activeElement); }
          if (Date.now() - queryAt > 700) query = '';
          query += key.toLowerCase(); queryAt = Date.now();
          const search = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
          const match = search.find(row => row.textContent.toLowerCase().startsWith(query));
          match?.focus(); match?.scrollIntoView({ block: 'nearest' });
        }
      }
      trigger.onkeydown = keydown; list.onkeydown = keydown;
      const dismiss = event => { if (!list.contains(event.target)) close(); };
      list.addEventListener('beforetoggle', event => {
        const opening = event.newState === 'open'; trigger.setAttribute('aria-expanded', String(opening));
        window[opening ? 'addEventListener' : 'removeEventListener']('resize', dismiss);
        document[opening ? 'addEventListener' : 'removeEventListener']('scroll', dismiss, true);
      });
      select.addEventListener('change', sync);
      select.form?.addEventListener('reset', () => queueMicrotask(sync));
      select.labels?.forEach(label => label.addEventListener('click', event => { event.preventDefault(); trigger.focus(); }));
      controls.set(select, sync); sync();
    }
  }
  window.SlateSelect = Object.freeze({ enhance });
})();
