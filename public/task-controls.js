/* Shared task date and urgency controls. The editor, reading view and task
   dialog all use Slate's calendar and the same urgency menu. */
(() => {
  const fields = new WeakMap();
  function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ''); if (!match) return value || '';
    const date = new Date(2000, 0, 1, 12); date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const options = {month: 'short', day: 'numeric'};
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString(undefined, options);
  }
  function urgencyItems(priority, onSelect) {
    const selected = window.SlateTasks.urgency(priority).value;
    return window.SlateTasks.urgencies.map(({value, label}) => ({label, icon: 'priority-' + value, checked: value === selected, action: () => onSelect(value)}));
  }
  // Set values show as quiet chips; one Lucide button opens every task option.
  // A completed task shows its completion date and a green check instead of
  // its due date and urgency.
  function inline(task, icon, data = {}) {
    const root = document.createElement('span'); root.className = 'task-inline-controls'; root.contentEditable = 'false';
    if (task.status === '/' && !task.completed) {
      const chip = document.createElement('span'); chip.className = 'task-chip task-progress'; chip.dataset.chip = 'progress';
      chip.dataset.tooltip = 'In progress'; chip.innerHTML = icon('circle-play'); chip.append('In progress'); root.append(chip);
    }
    const date = task.completed && task.done ? task.done : task.due;
    if (date) {
      const chip = document.createElement('span'), label = (date === task.done ? 'Completed ' : 'Due ') + formatDate(date);
      chip.dataset.chip = 'due'; chip.className = 'task-chip' + (!task.completed && task.due < window.SlateTasks.today() ? ' overdue' : '');
      chip.dataset.tooltip = label; chip.setAttribute('aria-label', label); chip.setAttribute('role', 'img');
      chip.innerHTML = icon('calendar-days'); const text = document.createElement('span'); text.textContent = formatDate(date); text.setAttribute('aria-hidden', 'true'); chip.append(text);
      root.append(chip);
    }
    const urgency = window.SlateTasks.urgency(task.priority);
    if (task.completed) {
      const chip = document.createElement('span');
      chip.className = 'task-chip'; chip.dataset.chip = 'urgency'; chip.dataset.tooltip = 'Completed'; chip.setAttribute('aria-label', 'Completed'); chip.setAttribute('role', 'img');
      chip.innerHTML = icon('task-done'); root.append(chip);
    } else if (urgency.value !== 'low') {
      const chip = document.createElement('span'), label = 'Urgency: ' + urgency.label;
      chip.className = 'task-chip'; chip.dataset.chip = 'urgency'; chip.dataset.tooltip = label; chip.setAttribute('aria-label', label); chip.setAttribute('role', 'img');
      chip.innerHTML = icon('priority-' + urgency.value); root.append(chip);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'task-menu-button';
    button.setAttribute('aria-label', 'Task options'); button.dataset.tooltip = 'Task options';
    button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
    Object.assign(button.dataset, data); button.innerHTML = icon('more'); root.append(button);
    return root;
  }
  // Dialog fields keep a hidden input as the form value and open the same
  // calendar and urgency menu as the inline task controls.
  function enhance(root, {icon, menus}) {
    for (const input of root.querySelectorAll('input[data-task-date], input[data-task-urgency]')) {
      if (fields.has(input)) { fields.get(input)(); continue; }
      const urgency = input.hasAttribute('data-task-urgency'), label = root.querySelector('label[for="' + input.id + '"]');
      const name = label?.textContent || (urgency ? 'Urgency' : 'Date');
      const trigger = document.createElement('button'); trigger.type = 'button'; trigger.id = input.id + 'Trigger';
      trigger.className = 'ui-select-trigger ui-task-field'; if (label) label.htmlFor = trigger.id;
      const value = document.createElement('span'); value.className = 'ui-select-value'; trigger.append(value);
      if (urgency) trigger.setAttribute('aria-haspopup', 'menu'), trigger.setAttribute('aria-expanded', 'false');
      const sync = () => {
        if (urgency) { const level = window.SlateTasks.urgency(input.value); value.innerHTML = icon('priority-' + level.value); value.append(level.label); }
        else { value.innerHTML = icon('calendar-days'); value.append(input.value ? formatDate(input.value) : 'No date'); value.classList.toggle('placeholder', !input.value); }
        trigger.setAttribute('aria-label', name + ': ' + (urgency ? window.SlateTasks.urgency(input.value).label : input.value ? formatDate(input.value) : 'No date'));
      };
      const set = next => { input.value = next; sync(); input.dispatchEvent(new Event('change', {bubbles: true})); };
      trigger.onclick = event => {
        if (urgency) menus.open(urgencyItems(input.value, set), event, 'Task urgency');
        else window.SlateCalendar.toggle(trigger, {value: input.value, onSelect: set, icon, label: 'Choose ' + name.toLowerCase()});
      };
      input.after(trigger); fields.set(input, sync); sync();
    }
  }
  window.SlateTaskControls = Object.freeze({formatDate, urgencyItems, inline, enhance});
})();
