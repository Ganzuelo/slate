/* Local calendar control styled with Slate's shared shadcn-inspired surfaces. */
(() => {
  let active = null, sequence = 0;
  function date(year, month, day) {
    const value = new Date(2000, 0, 1, 12);
    value.setFullYear(year, month, day); return value;
  }
  const iso = value => [String(value.getFullYear()).padStart(4, '0'), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  function parse(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number), result = date(year, month - 1, day);
    return year >= 1 && iso(result) === value ? result : null;
  }
  const valid = value => value.getFullYear() >= 1 && value.getFullYear() <= 9999;
  function toggle(trigger, {value = '', onSelect, icon}) {
    if (active?.trigger === trigger) { active.close(); return; }
    active?.close(false);
    const selected = parse(value), today = new Date(), todayISO = iso(today);
    let focused = selected || date(today.getFullYear(), today.getMonth(), today.getDate());
    let month = date(focused.getFullYear(), focused.getMonth(), 1);
    const panel = document.createElement('div'); panel.className = 'ui-calendar'; panel.popover = 'manual';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Choose task due date');
    panel.id = 'slate-calendar-' + ++sequence;
    const oldControls = trigger.getAttribute('aria-controls'), oldHasPopup = trigger.getAttribute('aria-haspopup');
    trigger.setAttribute('aria-controls', panel.id); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'true');
    function close(restore = true) {
      if (active?.panel !== panel) return;
      active = null; panel.remove(); observer.disconnect();
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focusOutside);
      document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved);
      trigger.setAttribute('aria-expanded', 'false');
      for (const [name, old] of [['aria-controls', oldControls], ['aria-haspopup', oldHasPopup]]) old === null ? trigger.removeAttribute(name) : trigger.setAttribute(name, old);
      if (restore && trigger.isConnected) trigger.focus({preventScroll:true});
    }
    function outside(event) { if (!panel.contains(event.target) && !trigger.contains(event.target)) close(false); }
    function focusOutside(event) { if (!panel.contains(event.target) && !trigger.contains(event.target)) close(false); }
    function moved(event) { if (!panel.contains(event.target)) close(false); }
    function choose(value) { close(); onSelect(value); }
    function position() {
      const rect = trigger.getBoundingClientRect(), bounds = panel.getBoundingClientRect(), edge = 8, gap = 6;
      const above = rect.top - gap - bounds.height, below = rect.bottom + gap;
      panel.style.left = Math.max(edge, Math.min(rect.left, window.innerWidth - bounds.width - edge)) + 'px';
      panel.style.top = Math.max(edge, Math.min(below + bounds.height > window.innerHeight - edge && above >= edge ? above : below, window.innerHeight - bounds.height - edge)) + 'px';
    }
    function button(label, action, className = '') {
      const el = document.createElement('button'); el.type = 'button'; el.className = className; el.setAttribute('aria-label', label); el.onclick = action; return el;
    }
    function moveMonth(amount, focusDay = false) {
      const next = date(month.getFullYear(), month.getMonth() + amount, 1); if (!valid(next)) return;
      const lastDay = date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      focused = date(next.getFullYear(), next.getMonth(), Math.min(focused.getDate(), lastDay)); month = next;
      draw(focusDay); position();
    }
    function draw(focusDay = false) {
      panel.replaceChildren();
      const header = document.createElement('div'); header.className = 'ui-calendar-header';
      const previous = button('Previous month', () => { moveMonth(-1); panel.querySelector('[aria-label="Previous month"]').focus(); }); previous.innerHTML = icon('left'); previous.disabled = month.getFullYear() === 1 && month.getMonth() === 0;
      const next = button('Next month', () => { moveMonth(1); panel.querySelector('[aria-label="Next month"]').focus(); }); next.innerHTML = icon('right'); next.disabled = month.getFullYear() === 9999 && month.getMonth() === 11;
      const caption = document.createElement('span'); caption.id = panel.id + '-month'; caption.setAttribute('aria-live', 'polite'); caption.textContent = month.toLocaleDateString(undefined, {month:'long',year:'numeric'});
      header.append(previous, caption, next); panel.append(header);
      const grid = document.createElement('table'); grid.className = 'ui-calendar-grid'; grid.setAttribute('role', 'grid'); grid.setAttribute('aria-labelledby', caption.id);
      const head = grid.createTHead().insertRow();
      for (let i = 0; i < 7; i++) { const cell = document.createElement('th'), day = date(2026, 10, 1 + i); cell.scope = 'col'; cell.textContent = day.toLocaleDateString(undefined, {weekday:'short'}); cell.setAttribute('aria-label', day.toLocaleDateString(undefined, {weekday:'long'})); head.append(cell); }
      const body = grid.createTBody(), first = date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
      for (let week = 0; week < 6; week++) {
        const row = body.insertRow();
        for (let day = 0; day < 7; day++) {
          const current = date(first.getFullYear(), first.getMonth(), first.getDate() + week * 7 + day), key = iso(current);
          const cell = row.insertCell(); cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-selected', String(key === value));
          const el = button(current.toLocaleDateString(undefined, {weekday:'long',year:'numeric',month:'long',day:'numeric'}), () => choose(key), 'ui-calendar-day');
          el.textContent = current.getDate(); el.dataset.date = key; el.disabled = !valid(current); el.tabIndex = key === iso(focused) ? 0 : -1;
          if (current.getMonth() !== month.getMonth()) el.classList.add('outside');
          if (key === value) el.classList.add('selected'); if (key === todayISO) el.setAttribute('aria-current', 'date');
          el.onfocus = () => { focused = current; grid.querySelectorAll('.ui-calendar-day').forEach(day => day.tabIndex = day === el ? 0 : -1); };
          el.onkeydown = event => {
            let target;
            const offset = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-current.getDay(),End:6-current.getDay()}[event.key];
            if (offset !== undefined) target = date(current.getFullYear(), current.getMonth(), current.getDate() + offset);
            else if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); event.stopPropagation(); moveMonth((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), true); return; }
            if (target && valid(target)) { event.preventDefault(); event.stopPropagation(); focused = target; month = date(target.getFullYear(),target.getMonth(),1); draw(true); position(); }
          };
          cell.append(el);
        }
      }
      panel.append(grid);
      const footer = document.createElement('div'); footer.className = 'ui-calendar-footer';
      const todayButton = button('Today', () => choose(todayISO)); todayButton.textContent = 'Today';
      const clear = button('Remove date', () => choose('')); clear.textContent = 'Remove date'; clear.disabled = !value;
      footer.append(todayButton, clear); panel.append(footer);
      if (focusDay) panel.querySelector('.ui-calendar-day[tabindex="0"]')?.focus({preventScroll:true});
    }
    panel.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Enter' || event.key === ' ') { const target = event.target.closest('button'); if (target) { event.preventDefault(); target.click(); } }
      else if (event.key === 'Tab') {
        const controls = [...panel.querySelectorAll('button')].filter(el => !el.disabled && el.tabIndex >= 0), index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index === 0 || !event.shiftKey && index === controls.length - 1) { event.preventDefault(); close(); }
      }
    };
    const observer = new MutationObserver(() => { if (!trigger.isConnected) close(false); });
    active = {trigger, panel, close};
    (trigger.closest('dialog[open]') || document.body).append(panel); draw(); panel.showPopover(); position();
    panel.querySelector('.ui-calendar-day[tabindex="0"]')?.focus({preventScroll:true});
    observer.observe(document.body, {childList:true,subtree:true});
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', focusOutside);
    document.addEventListener('scroll', moved, true); window.addEventListener('resize', moved);
  }
  window.SlateCalendar = Object.freeze({toggle});
})();
