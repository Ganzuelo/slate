/* Built-in help. Topics are static, author-written content rendered with DOM APIs.
   Inline syntax: **bold**, `code`, {Ctrl+N} for keys, and [Label](topic-id) for links between topics. */
(() => {
 const topics = [
  { group: 'Getting started', id: 'welcome', title: 'Welcome to Slate', icon: 'house', summary: 'What Slate is and how the window is laid out.', blocks: [
   'Slate is a local-first workspace for notes, tasks, and whiteboards. Everything you write is saved as ordinary files in a folder on your computer, called a **vault**. There is no cloud account, no telemetry, and no plugin runtime.',
   { h: 'Finding your way around' },
   { list: [
    '**Ribbon** (far left): quick switcher, graph view, tasks, new whiteboard, new canvas, daily note, templates, and the command palette.',
    '**Left sidebar**: the file explorer, search, bookmarks, and tags. The vault name, Help, and Settings sit in its footer.',
    '**Tabs** (top): every open note, view, and board. The left and right sidebar toggles sit at either end of the title bar.',
    '**Editor**: the note itself, with back and forward history, the note location, bookmark, and reading-view controls above it.',
    '**Right sidebar**: backlinks, outgoing links, and the outline of the current note.',
    '**Status bar** (bottom): word count, character count, and the current editing mode.',
   ] },
   { h: 'First steps' },
   { steps: [
    'Press {Ctrl+N} to create a note, give it a name, and start typing. Slate saves automatically.',
    'Type `[[` to link to another note. See [Links and backlinks](links).',
    'Press {Ctrl+P} to open the command palette and browse everything Slate can do.',
   ] },
   { tip: 'Press {F1} at any time to open this help.' },
  ] },
  { group: 'Getting started', id: 'vaults', title: 'Vaults', icon: 'vault', summary: 'Create, open, and switch between vaults.', blocks: [
   'A vault is a folder of Markdown files and boards. Slate reads and writes that folder directly, so you can keep using your existing backup or sync tools on it.',
   { h: 'Switching vaults' },
   'Click the vault name in the bottom-left corner to see the vaults you have opened before. Choose one to switch to it, or choose **Manage vaults** for more options. Slate saves your workspace before switching and asks about unsaved changes first.',
   { h: 'Managing vaults' },
   { list: [
    '**Create new vault** walks you through naming the vault, choosing a parent folder, and reviewing the result.',
    '**Open folder as vault** opens any existing folder of notes.',
    '**Remove from list** forgets a vault without deleting any of its files.',
    '**Show vault in system explorer** reveals the current vault folder.',
   ] },
   { tip: 'Trying Slate on an existing vault from another app? Start with a copy. Slate ignores hidden folders such as `.obsidian` and never changes them.' },
  ] },

  { group: 'Writing', id: 'editing', title: 'Writing and editing', icon: 'pen-line', summary: 'Editing modes, formatting, saving, and attachments.', blocks: [
   'Notes are Markdown files. Write headings with `#`, lists with `-`, checkboxes with `- [ ]`, and code with backticks. Code blocks are highlighted by language.',
   { h: 'Editing modes' },
   { list: [
    '**Live Preview** formats Markdown as you type and reveals the raw syntax on the line you are editing.',
    '**Source mode** shows plain Markdown.',
    '**Reading view** shows the finished note. Toggle it with {Ctrl+E} or the book button above the note.',
    '**Split preview** shows the source and the rendered note side by side. Find it in the command palette.',
   ] },
   'Choose the default editing mode and view for new tabs in **Settings → Editor**.',
   { h: 'Formatting' },
   'Right-click selected text for **Format** (bold, italic, strikethrough, highlight, inline code) and **Insert** (link, list, task list, quote, code block, table, horizontal rule, attachment). The usual shortcuts work: {Ctrl+B}, {Ctrl+I}, {Ctrl+Z}, and {Ctrl+Y}.',
   { h: 'Titles and properties' },
   'The note title above the editor is the file name. Click it to rename; press {Enter} to save or {Esc} to cancel. YAML frontmatter at the top of a note (between `---` lines) appears as note properties.',
   { h: 'Saving' },
   'Slate saves changes automatically, and {Ctrl+S} saves immediately. An unsaved tab shows a dot after its name. If another app changes the same file, Slate detects the conflict instead of overwriting it.',
   { h: 'Attachments' },
   'Drag images, audio, video, PDFs, or office documents into a note to add them as attachments. Choose where they are stored in **Settings → Files and links**.',
  ] },
  { group: 'Writing', id: 'links', title: 'Links and backlinks', icon: 'link', summary: 'Connect notes with wiki links.', blocks: [
   'Type `[[` to link to another note. Slate suggests matching notes as you type; press {Enter} to choose one.',
   { code: '[[Project plan]]\n[[Work/Project plan|the plan]]' },
   'Text after `|` is an alias: it is shown in place of the note name. Click a link in reading view or Live Preview to open it, or right-click it to open it in a new tab or copy it.',
   { h: 'Backlinks, outgoing links, and outline' },
   'Open the right sidebar to see which notes link **to** the current note (backlinks), which notes it links **to** (outgoing links), and a clickable outline of its headings.',
   { h: 'Renaming keeps links working' },
   'When you rename or move a note, Slate rewrites wiki links that point to it. Turn this off with **Automatically update internal links** in **Settings → Files and links**.',
   'To see how notes connect at a glance, open the [graph view](graph).',
  ] },
  { group: 'Writing', id: 'daily-templates', title: 'Daily notes and templates', icon: 'calendar-days', summary: 'A note for every day, and reusable starting text.', blocks: [
   { h: 'Daily notes' },
   'Click the calendar in the ribbon, or run **Open today’s daily note** from the command palette, to open today’s note. Slate creates it if it does not exist yet.',
   'Set the date format (for example `YYYY-MM-DD`) and the folder for daily notes in **Settings → Daily notes**.',
   { h: 'Templates' },
   'Templates are ordinary notes stored in your template folder (set in **Settings → Templates**). Click the stamp in the ribbon and choose a template to insert it at the cursor.',
   'Templates can use these variables, which are filled in when inserted:',
   { table: [['Variable', 'Becomes'], ['`{{title}}`', 'The current note’s name'], ['`{{date}}`', 'Today’s date'], ['`{{time}}`', 'The current time']] },
  ] },

  { group: 'Organizing', id: 'files', title: 'Files and folders', icon: 'folder-tree', summary: 'The explorer, context menus, trash, and recovery.', blocks: [
   'The file explorer lists every note, canvas, and whiteboard in your vault. Click a folder to expand or collapse it, and use the toolbar above the list to create notes and folders, refresh, or collapse every folder.',
   { h: 'Context menus' },
   'Right-click a file, folder, or empty space for actions such as **Open in new tab**, **Rename**, **Move file to**, **Make a copy**, **Copy internal link**, **Copy path**, **Bookmark**, **Change icon**, **Show in system explorer**, and **Move to trash**.',
   { h: 'Pinning' },
   'Pin important notes and folders from their context menu to keep them at the top of the explorer.',
   { h: 'Importing files' },
   'Drag Markdown, text, canvas, whiteboard, image, audio, video, PDF, CSV, or office files (such as DOCX, XLSX, and PPTX) from your computer onto the explorer to copy them into the vault — the file is imported automatically, with no save prompt. Drop them on a folder to place them there. Click a document in the explorer to preview it in Slate: images, PDFs, audio, and video play in place, spreadsheets show as tables, and Word, spreadsheet, and presentation files show their text. Use the download button in the preview only when you want a separate copy.',
   { h: 'Trash and recovery' },
   'Files you move to the trash are kept in the vault’s `.slate-recovery` folder. Before Slate overwrites a file, it keeps the previous version in `.slate-history`. Run **Open file recovery** from the command palette or the explorer menu to restore either.',
   'Turn off the delete confirmation in **Settings → Files and links**.',
  ] },
  { group: 'Organizing', id: 'search', title: 'Search, bookmarks, and tags', icon: 'search', summary: 'Find any note quickly.', blocks: [
   { h: 'Quick switcher' },
   'Press {Ctrl+O} and type part of a note’s name to jump to it.',
   { h: 'Search' },
   'Press {Ctrl+Shift+F} to search the text of every note. Use the buttons below the search box to match case. Right-click a folder and choose **Search in folder** to narrow the search.',
   { h: 'Bookmarks' },
   'Click the bookmark button above a note, or run **Bookmark current file**, to save it in the Bookmarks list in the left sidebar.',
   { h: 'Tags' },
   'Add tags such as `#project` anywhere in a note or in its frontmatter. The Tags list in the left sidebar shows every tag and how often it is used.',
  ] },
  { group: 'Organizing', id: 'tabs', title: 'Tabs and navigation', icon: 'app-window', summary: 'Work with several notes at once.', blocks: [
   'Each note, board, and view opens in a tab. Click **+** in the tab strip to create a note.',
   { list: [
    'Right-click a tab to pin it, close it, close other tabs, or close the tabs after it. Pinned tabs stay open during bulk closes.',
    'Press {Ctrl+W} to close the current tab. Slate asks before discarding unsaved changes.',
    'Use the back and forward buttons above the note, or {Alt+Left} and {Alt+Right}, to move through your history.',
    'Toggle either sidebar from the buttons at the ends of the title bar.',
   ] },
  ] },
  { group: 'Organizing', id: 'icons', title: 'File icons and emoji', icon: 'smile', summary: 'Give files, folders, and tabs their own symbol.', blocks: [
   'Right-click a file or folder and choose **Change icon**, or press {Ctrl+Shift+J} for the current file. Pick a Lucide icon in one of nine colors, or any Unicode emoji.',
   'Icons appear in the explorer and on tabs. They follow files when you rename or move them, and are stored in the vault’s `.slate-icons.json` file.',
  ] },

  { group: 'Tasks and data', id: 'tasks', title: 'Tasks', icon: 'check-square', summary: 'Checkboxes with dates, urgency, and repeats.', blocks: [
   'Tasks are Markdown checkboxes, so they live inside your notes:',
   { code: '- [ ] Send the quarterly report 📅 2026-11-14' },
   { h: 'Creating and completing tasks' },
   { list: [
    'Type `- [ ]` in any note, or press {Ctrl+T} to open the **New task** dialog and choose its note, dates, urgency, and repeat rule.',
    'Click a checkbox, or press {Ctrl+Enter} on a task line, to complete or reopen it. Completion adds today’s date.',
    'Hover a task to reveal the **Task options** button at the right edge of the line. Use it to mark a task as in progress or open, set a due date, choose an urgency, or edit the task.',
   ] },
   'Type `- [/] Task` (or `-[/] Task`) to mark work as in progress. An **In progress** badge appears to the left of the due date, including on undated tasks. Completing the task removes the badge.',
   { h: 'Urgency' },
   { table: [['Urgency', 'Meaning'], ['**Urgent**', 'Red: needs attention now'], ['**High**', 'Amber: important'], ['**Low**', 'Blue: the default']] },
   { h: 'The Tasks view' },
   'Click the tasks button in the ribbon to see every task in the vault. Filter by **All**, **Today**, **Upcoming**, **Overdue**, or **Done**, and click a task’s source to jump to it in its note.',
   { h: 'Repeating (recurring) tasks' },
   'Add a rule such as `every weekday`, `every 2 weeks`, `every month on the last`, or `every Friday`. Completing a repeating task creates its next occurrence. Add `when done` to count from the day you finish it.',
   'To show live task lists inside notes, use [task queries](task-queries). Limit which checkboxes count as tasks with the global filter in **Settings → Tasks**.',
  ] },
  { group: 'Tasks and data', id: 'task-queries', title: 'Task queries', icon: 'list-filter', summary: 'Live task lists inside any note.', blocks: [
   'A fenced `tasks` block shows a live list of matching tasks from across the vault. Completing a task in the list updates its source note.',
   { code: '```tasks\nnot done\ndue before tomorrow\ngroup by filename\nsort by due\n```' },
   { table: [
    ['Purpose', 'Examples'],
    ['Completion', '`done`, `not done`'],
    ['Dates', '`due today`, `scheduled before tomorrow`, `due before in 7 days`'],
    ['Text and paths', '`path includes Work/`, `description does not include draft`'],
    ['Tags', '`tags include #work`'],
    ['Priority', '`priority is above medium`'],
    ['Logic', '`(due today) OR (scheduled today)`, `NOT (tags include #waiting)`'],
    ['Sort, group, limit', '`sort by priority`, `group by folder`, `limit 20`'],
    ['Display', '`hide due date`, `hide task count`'],
   ] },
   'In Live Preview, move the cursor into the block or click **Edit query** to change it. Unknown instructions show an error instead of an unfiltered list.',
  ] },
  { group: 'Tasks and data', id: 'dataview', title: 'Dataview', icon: 'table', summary: 'Query your notes like a database.', blocks: [
   'Dataview turns note metadata into tables and lists. It reads frontmatter, inline fields such as `Rating:: 8`, tags, links, tasks, and file information.',
   { code: '```dataview\nTABLE rating AS Rating, genre AS Genre\nFROM #book\nWHERE read\nSORT rating DESC\n```' },
   'Query types include `TABLE`, `LIST`, `TASK`, and `CALENDAR`. Inline expressions such as `= this.file.name` work inside a sentence.',
   { h: 'JavaScript queries' },
   '`dataviewjs` blocks are off by default. Turn them on in **Settings → Dataview**. They run in an isolated worker with read-only note data, no network access, and a five-second time limit.',
  ] },

  { group: 'Views and boards', id: 'graph', title: 'Graph view', icon: 'graph-star', summary: 'See how your notes connect.', blocks: [
   'Click the graph button in the ribbon to see every note as a dot and every link as a line. Linked notes cluster together, and notes with no links ring the outside.',
   { list: [
    'Scroll to zoom toward the cursor and drag to pan. Labels appear as you zoom in.',
    'Click a note to open it.',
    'Run **Open local graph** from the command palette to show only the current note’s neighbors.',
    'Open graph settings to filter by tags, attachments, orphans, or link direction, color groups of notes, show arrows, and tune the layout forces.',
   ] },
  ] },
  { group: 'Views and boards', id: 'whiteboards', title: 'Whiteboards', icon: 'presentation', summary: 'Sketch and diagram with Excalidraw.', blocks: [
   'Click the whiteboard button in the ribbon to create a board. Whiteboards use the bundled Excalidraw editor and are saved in your vault as `.excalidraw` files.',
   'Draw shapes, arrows, text, and freehand sketches with Excalidraw’s own toolbar. Boards save automatically, follow Slate’s light or dark theme, and can be exported as PNG images from Excalidraw’s menu.',
   'Turn whiteboards off in **Settings → Excalidraw**. Existing whiteboard files stay in your vault.',
  ] },
  { group: 'Views and boards', id: 'canvas', title: 'Canvas', icon: 'layout', summary: 'Arrange cards on an open board.', blocks: [
   'Click the canvas button in the ribbon to create a `.canvas` board. Use the toolbar to add text cards or cards that show a note, connect cards to each other, zoom, and reset the view.',
  ] },

  { group: 'Customizing', id: 'commands', title: 'Commands and shortcuts', icon: 'keyboard', summary: 'Do everything from the keyboard.', blocks: [
   'Press {Ctrl+P} to open the command palette and search every command. Use the arrow keys to choose one and {Enter} to run it. **Settings → Hotkeys** lists every command and its shortcut.',
   { keys: [
    ['F1', 'Open help'],
    ['Ctrl+P', 'Command palette'],
    ['Ctrl+O', 'Quick switcher'],
    ['Ctrl+N', 'New note'],
    ['Ctrl+T', 'New task'],
    ['Ctrl+Enter', 'Complete or reopen the task at the cursor'],
    ['Ctrl+S', 'Save the current file'],
    ['Ctrl+E', 'Toggle reading view'],
    ['Ctrl+W', 'Close the current tab'],
    ['Ctrl+Shift+F', 'Search all files'],
    ['Ctrl+Shift+J', 'Change the current file’s icon'],
    ['Ctrl+,', 'Settings'],
    ['Alt+Left', 'Go back'],
    ['Alt+Right', 'Go forward'],
   ] },
   'On macOS, use {Cmd} in place of {Ctrl}.',
  ] },
  { group: 'Customizing', id: 'appearance', title: 'Appearance', icon: 'palette', summary: 'Theme, accent color, fonts, and layout.', blocks: [
   'Open **Settings → Appearance** to change how Slate looks. Changes apply immediately.',
   { list: [
    '**Base color scheme**: dark, light, or adapt to your system.',
    '**Accent color**: choose a preset, pick any color, or enter a hex value.',
    '**Fonts**: interface, text, and monospace fonts, plus font size. With quick font size adjustment on, {Ctrl} + scroll changes the size.',
    '**Interface**: show or hide the inline title, the tab title bar, and the ribbon.',
   ] },
   { h: 'Reordering the ribbon' },
   'Drag ribbon buttons up or down to reorder them. You can also right-click a button and choose **Move up**, **Move down**, or **Reset icon order**, or press {Alt+Up} and {Alt+Down}.',
  ] },
  { group: 'Customizing', id: 'settings', title: 'Settings overview', icon: 'settings', summary: 'Where every preference lives.', blocks: [
   'Open Settings with the gear button in the bottom-left corner or {Ctrl+,}.',
   { table: [
    ['Section', 'What you can change'],
    ['General', 'Version information and restoring default settings'],
    ['Editor', 'Default view and editing mode, line length, and display options'],
    ['Files and links', 'Where new notes and attachments go, link updates, and the trash'],
    ['Appearance', 'Theme, accent color, fonts, and interface toggles'],
    ['Hotkeys', 'A searchable list of commands and shortcuts'],
    ['Daily notes', 'Date format and folder'],
    ['Templates', 'Template folder'],
    ['Tasks', 'Global task filter'],
    ['Dataview', 'Dataview and JavaScript queries'],
    ['Excalidraw', 'Turn whiteboards on or off'],
   ] },
  ] },
  { group: 'Customizing', id: 'privacy', title: 'Privacy and your data', icon: 'shield-check', summary: 'Your notes stay on your computer.', blocks: [
   { list: [
    'Notes are plain `.md` files, boards are `.canvas` and `.excalidraw` files, and all of them stay in your vault folder.',
    'Slate has no cloud sync, account, telemetry, auto-update, or community plugins, and it does not download remote content.',
    'Slate keeps its own data in hidden vault folders: `.slate-history` for earlier versions, `.slate-recovery` for trash, and `.slate-icons.json` for file icons.',
   ] },
   'Because everything is a file, you can back up, sync, or version your vault with any tool you already use.',
  ] },
 ];

 const byId = new Map(topics.map(topic => [topic.id, topic]));
 const textOf = topic => [topic.title, topic.summary, ...topic.blocks.flatMap(block => typeof block === 'string' ? [block] : Object.values(block).flat(2))].join(' ').replace(/[*`{}[\]()]/g, ' ').toLowerCase();
 const search = query => {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return terms.length ? topics.filter(topic => { const text = textOf(topic); return terms.every(term => text.includes(term)); }) : topics;
 };

 function inline(doc, source, go) {
  const fragment = doc.createDocumentFragment();
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|\{([^}]+)\}|\[([^\]]+)\]\(([a-z-]+)\)/g;
  let at = 0, match;
  while ((match = pattern.exec(source))) {
   if (match.index > at) fragment.append(source.slice(at, match.index));
   let el;
   if (match[1] !== undefined) { el = doc.createElement('strong'); el.append(inline(doc, match[1], go)); }
   else if (match[2] !== undefined) { el = doc.createElement('code'); el.textContent = match[2]; }
   else if (match[3] !== undefined) { el = doc.createElement('kbd'); el.className = 'hotkey-kbd'; el.textContent = match[3]; }
   else { const target = match[5]; el = doc.createElement('a'); el.href = '#help-' + target; el.className = 'help-link'; el.textContent = match[4]; el.onclick = event => { event.preventDefault(); go(target); }; }
   fragment.append(el);
   at = pattern.lastIndex;
  }
  if (at < source.length) fragment.append(source.slice(at));
  return fragment;
 }

 function renderTopic(host, id, go, icon) {
  const doc = host.ownerDocument;
  const topic = byId.get(id) || topics[0];
  const make = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.append(inline(doc, text, go)); return el; };
  host.replaceChildren();
  const title = make('h2', '', topic.title); title.id = 'helpTopicTitle'; title.tabIndex = -1;
  host.append(title, make('p', 'help-summary', topic.summary));
  for (const block of topic.blocks) {
   if (typeof block === 'string') host.append(make('p', '', block));
   else if (block.h) host.append(make('h3', 'help-heading', block.h));
   else if (block.list || block.steps) { const list = make(block.steps ? 'ol' : 'ul', 'help-list'); for (const item of block.list || block.steps) list.append(make('li', '', item)); host.append(list); }
   else if (block.code) { const pre = make('pre', 'help-code'); const code = doc.createElement('code'); code.textContent = block.code; pre.append(code); host.append(pre); }
   else if (block.tip) { const tip = make('div', 'help-tip'); const mark = doc.createElement('span'); mark.innerHTML = icon('lightbulb'); tip.append(mark, make('p', '', block.tip)); host.append(tip); }
   else if (block.table) {
    const table = make('table', 'help-table'), head = doc.createElement('thead'), body = doc.createElement('tbody');
    const [header, ...rows] = block.table;
    const headRow = doc.createElement('tr'); for (const cell of header) { const th = make('th', '', cell); th.scope = 'col'; headRow.append(th); } head.append(headRow);
    for (const row of rows) { const tr = doc.createElement('tr'); for (const cell of row) tr.append(make('td', '', cell)); body.append(tr); }
    table.append(head, body); host.append(table);
   }
   else if (block.keys) {
    const list = make('dl', 'help-keys');
    for (const [keys, description] of block.keys) { const row = make('div', 'help-key-row'); const dt = doc.createElement('dt'); const kbd = make('kbd', 'hotkey-kbd'); kbd.textContent = keys; dt.append(kbd); row.append(make('dd', '', description), dt); list.append(row); }
    host.append(list);
   }
  }
  const index = topics.indexOf(topic), pager = make('nav', 'help-pager');
  pager.setAttribute('aria-label', 'Help pages');
  for (const [offset, label, className] of [[-1, 'Previous', 'help-previous'], [1, 'Next', 'help-next']]) {
   const next = topics[index + offset];
   if (!next) { pager.append(doc.createElement('span')); continue; }
   const b = make('button', className); b.type = 'button';
   const caption = make('span', 'help-pager-label'); caption.textContent = label;
   const name = make('span', 'help-pager-title'); name.textContent = next.title;
   b.append(caption, name); b.onclick = () => go(next.id, true); pager.append(b);
  }
  host.append(pager);
  host.scrollTop = 0;
  return topic;
 }

 function renderNav(nav, query, activeId, go, icon) {
  const doc = nav.ownerDocument;
  const matches = search(query);
  nav.replaceChildren();
  if (!matches.length) { const empty = doc.createElement('p'); empty.className = 'help-empty'; empty.textContent = 'No help topics match.'; nav.append(empty); return matches; }
  let groupEl = null, groupName = null;
  for (const topic of matches) {
   if (topic.group !== groupName) {
    groupName = topic.group;
    const label = doc.createElement('div'); label.className = 'settings-group-title'; label.id = 'helpGroup-' + topic.id; label.textContent = groupName;
    groupEl = doc.createElement('div'); groupEl.setAttribute('role', 'group'); groupEl.setAttribute('aria-labelledby', label.id);
    nav.append(label, groupEl);
   }
   const b = doc.createElement('button'); b.type = 'button'; b.dataset.help = topic.id;
   const mark = doc.createElement('span'); mark.dataset.icon = topic.icon; mark.innerHTML = icon(topic.icon);
   const label = doc.createElement('span'); label.className = 'settings-label'; label.textContent = topic.title;
   b.append(mark, label);
   if (topic.id === activeId) { b.classList.add('active'); b.setAttribute('aria-current', 'page'); }
   b.onclick = () => go(topic.id);
   groupEl.append(b);
  }
  return matches;
 }

 function mount({ dialog, nav, content, searchInput, close, icon }) {
  let active = topics[0].id;
  const go = (id, focusTitle = false) => {
   active = renderTopic(content, id, go, icon).id;
   renderNav(nav, searchInput.value, active, go, icon);
   if (focusTitle) content.querySelector('h2')?.focus();
  };
  searchInput.oninput = () => { const matches = renderNav(nav, searchInput.value, active, go, icon); if (matches.length && !matches.some(topic => topic.id === active)) go(matches[0].id); };
  searchInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); nav.querySelector('button')?.focus(); } };
  nav.onkeydown = event => {
   if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
   const buttons = [...nav.querySelectorAll('button')], at = buttons.indexOf(event.target);
   if (at < 0) return;
   event.preventDefault();
   const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
   const id = buttons[next].dataset.help;
   go(id);
   nav.querySelector('[data-help="' + id + '"]')?.focus();
  };
  close.onclick = () => dialog.close();
  return {
   open(id) {
    if (id && byId.has(id)) active = id;
    if (!dialog.open) dialog.showModal();
    searchInput.value = '';
    go(active);
    nav.querySelector('[aria-current="page"]')?.focus();
   },
  };
 }

 window.SlateHelp = { topics, search, mount };
})();
