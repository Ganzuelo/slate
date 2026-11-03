let contextMenus = null, dialogTarget = null, trashTarget = null;
const menuSeparator = Object.freeze({ separator: true });
function switchWorkspaceVault(action) {
 return afterSafe(async () => {
  try {
   clearTimeout(persistTimer);
   await desktop.saveWorkspace(workspace());
   await action();
  } catch (error) { message(error.message); }
 });
}
async function showVaultMenu(event) {
 event.preventDefault();
 const trigger = event.currentTarget;
 try {
  const vaults = desktop?.listVaults ? await desktop.listVaults() : [{ name: $('vaultName').textContent, current: true }];
  contextMenus.open([
   ...vaults.map(vault => menuItem(vault.name, 'vault', () => {
    if (!vault.current) switchWorkspaceVault(() => desktop.openVault(vault.path));
   }, { checked: vault.current, title: vault.path || vault.name })),
   menuSeparator,
   menuItem('Manage vaults…', 'settings', openVaultManager),
  ], { type: 'click', currentTarget: trigger }, 'Switch vault', { side: 'top' });
 } catch (error) { message(error.message); }
}
async function openVaultManager() {
 const dialog = $('vaultManagerDialog'), host = $('vaultManagerList');
 const error = $('vaultManagerError'); error.textContent = '';
 try {
  const vaults = desktop?.listVaults ? await desktop.listVaults() : [{ name: $('vaultName').textContent, current: true }];
  host.replaceChildren();
  for (const vault of vaults) {
   const row = document.createElement('div'); row.className = 'vault-manager-row'; row.setAttribute('role', 'listitem');
   if (vault.current) row.className += ' is-current';
   const symbol = document.createElement('span'); symbol.className = 'icon'; symbol.innerHTML = icon('vault'); symbol.setAttribute('aria-hidden', 'true'); row.append(symbol);
   const details = document.createElement('div'); details.className = 'vault-manager-details';
   const name = document.createElement('strong'); name.textContent = vault.name;
   const folder = document.createElement('span'); folder.textContent = vault.path || 'Vault switching is available in the desktop app.';
   const heading = document.createElement('div'); heading.className = 'vault-manager-name'; heading.append(name);
   details.append(heading, folder); row.append(details);
   const actions = document.createElement('div'); actions.className = 'vault-manager-row-actions';
   if (vault.current) {
    const current = document.createElement('span'); current.className = 'vault-current'; current.innerHTML = icon('check');
    const label = document.createElement('span'); label.textContent = 'Current'; current.append(label); heading.append(current);
    if (desktop?.revealPath) {
     const reveal = button('', () => desktop.revealPath('', 'folder').catch(e => { error.textContent = e.message; }));
     reveal.innerHTML = icon('folder-open'); reveal.dataset.tooltip = 'Show vault in system explorer'; reveal.setAttribute('aria-label', reveal.dataset.tooltip); actions.append(reveal);
    }
   } else {
    const open = button('Open', () => { dialog.close(); switchWorkspaceVault(() => desktop.openVault(vault.path)); });
    const remove = button('', async () => {
     remove.disabled = true;
     try { await desktop.forgetVault(vault.path); await openVaultManager(); $('closeVaultManager').focus(); }
     catch (e) { error.textContent = e.message; remove.disabled = false; }
    });
    remove.innerHTML = icon('x'); remove.dataset.tooltip = 'Remove from list'; remove.setAttribute('aria-label', 'Remove ' + vault.name + ' from list');
    actions.append(open, remove);
   }
   row.append(actions); host.append(row);
  }
  $('openVaultFolder').hidden = !desktop?.selectVault;
  $('createVault').hidden = !desktop?.createVault;
  $('vaultManagerDesktopHint').hidden = !!desktop?.selectVault;
  if (!dialog.open) dialog.showModal();
 } catch (e) { if (!dialog.open) dialog.showModal(); error.textContent = e.message; }
}
function manageVaultFolder() {
 const dialog = $('vaultManagerDialog');
 dialog.close();
 return switchWorkspaceVault(async () => {
  try {
   const result = await desktop.selectVault();
   if (!result?.changed) await openVaultManager();
  } catch (error) {
   await openVaultManager();
   $('vaultManagerError').textContent = error.message;
  }
 });
}
function openVaultWizard() {
 if (!desktop?.chooseVaultLocation || !desktop?.createVault) return;
 return afterSafe(() => {
  const dialog = $('vaultWizardDialog'), error = $('vaultWizardError');
  let step = 0, location = null, busy = false;
  const name = $('vaultWizardName'), next = $('vaultWizardNext');
  const panels = ['vaultWizardNameStep', 'vaultWizardLocationStep', 'vaultWizardReviewStep'];
  name.value = ''; $('vaultWizardLocation').value = '';
  const setBusy = value => {
   busy = value;
   dialog.setAttribute('aria-busy', String(value));
   for (const id of ['vaultWizardNext', 'vaultWizardBack', 'vaultWizardCancel', 'vaultWizardBrowse']) $(id).disabled = value;
  };
  const render = () => {
   error.textContent = '';
   panels.forEach((id, index) => { $(id).hidden = index !== step; });
   dialog.querySelectorAll('[data-vault-step]').forEach(el => {
    if (Number(el.dataset.vaultStep) === step) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
   });
   $('vaultWizardBack').hidden = step === 0;
   next.textContent = step === 2 ? 'Create vault' : 'Continue';
   $('vaultWizardReviewName').textContent = name.value.trim();
   $('vaultWizardReviewPath').textContent = location ? location.path.replace(/[\\/]$/, '') + location.separator + name.value.trim() : '';
   if (step === 0) name.focus();
   else $(step === 1 ? 'vaultWizardLocationTitle' : 'vaultWizardReviewTitle').focus();
  };
  $('vaultWizardBack').onclick = () => { if (!busy) { step--; render(); } };
  $('vaultWizardCancel').onclick = () => { if (!busy) dialog.close(); };
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  dialog.onclose = () => { openVaultManager().then(() => $('createVault').focus()); };
  $('vaultWizardBrowse').onclick = async () => {
   error.textContent = ''; setBusy(true);
   try {
    const chosen = await desktop.chooseVaultLocation();
    if (chosen) { location = chosen; $('vaultWizardLocation').value = chosen.path; }
   } catch (e) { error.textContent = e.message; }
   finally { setBusy(false); $('vaultWizardBrowse').focus(); }
  };
  $('vaultWizardForm').onsubmit = async event => {
   event.preventDefault();
   if (busy) return;
   error.textContent = '';
   if (step === 0) {
    const value = name.value.trim();
    if (!value || /[\\/:*?"<>|\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) {
     error.textContent = 'Enter a valid name without slashes or filename punctuation.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return;
    }
    name.removeAttribute('aria-invalid'); name.value = value;
   }
   if (step === 1 && !location) { error.textContent = 'Choose a parent folder to continue.'; $('vaultWizardBrowse').focus(); return; }
   if (step < 2) { step++; render(); return; }
   setBusy(true); next.textContent = 'Creating…';
   try {
    clearTimeout(persistTimer);
    await desktop.saveWorkspace(workspace());
    const result = await desktop.createVault(name.value);
    if (!result?.changed) throw new Error('The vault could not be opened. Please try again.');
   } catch (e) { error.textContent = e.message; setBusy(false); next.textContent = 'Create vault'; next.focus(); }
  };
  $('vaultManagerDialog').close();
  setBusy(false); name.removeAttribute('aria-invalid');
  dialog.showModal(); render();
 });
}
function menuItem(label, glyph, action, extra = {}) { return { label, icon: glyph, action, ...extra }; }
async function readMenuTarget(target) {
 const draft = drafts.get(target.path);
 if (draft) return { ...draft, content: draft === current ? (draft.type === 'whiteboard' ? draft.content : draft.type === 'canvas' ? JSON.stringify(canvasState, null, 2) : getText()) : draft.content };
 return { ...await api((target.type || 'note') + '?path=' + encodeURIComponent(target.path)), type: target.type || 'note', dirty: false };
}
async function menuFileDialog(target, action) {
 const note = await readMenuTarget(target);
 if (note.dirty && action !== 'copy') throw new Error('Save this file’s unsaved changes before renaming or moving it.');
 const name = action === 'copy' ? target.path.replace(/\.(md|canvas|excalidraw)$/i, ' copy.$1') : target.path;
 newDialog(name, action, note);
}
function bookmarkPath(path) {
 bookmarks = bookmarks.includes(path) ? bookmarks.filter(p => p !== path) : [...bookmarks, path];
 if (current?.path === path) syncBookmarkButton();
 renderFiles(); schedulePersist();
}
function toggleExplorerPin(path) {
 if (!explorerPins.delete(path)) explorerPins.add(path);
 renderFiles(); schedulePersist();
}
async function copyMenuText(text) {
 if (desktop?.writeClipboard) await desktop.writeClipboard(text);
 else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
 else throw new Error('Clipboard is unavailable in this browser. Use the desktop app.');
}
async function readMenuClipboard() {
 if (desktop?.readClipboard) return desktop.readClipboard();
 if (navigator.clipboard?.readText) return navigator.clipboard.readText();
 throw new Error('Clipboard is unavailable in this browser. Use the desktop app.');
}
function pathMenu(target) {
 return menuItem('Copy path', 'clipboard', null, { children: [
  menuItem('Vault-relative path', 'file', () => copyMenuText(target.path)),
  desktop?.getVault && menuItem('Absolute path', 'folder', async () => {
   const vault = await desktop.getVault(); await copyMenuText(vault.path.replace(/[\\/]$/, '') + '\\' + target.path.replaceAll('/', '\\'));
  }),
 ] });
}
function fileMenuItems(target) {
 const note = Object.freeze({ path: target.path, type: target.type || 'note' });
 if (note.type === 'file') return [
  menuItem('Open file', typeof fileTypeIcon === 'function' ? fileTypeIcon(note.path, note.type) : 'file', () => openNote(note.path, note.type)),
  menuItem('Change icon…', 'image', () => openIconPicker(note.path, note.type)),
  menuItem(bookmarks.includes(note.path) ? 'Remove bookmark' : 'Bookmark', 'bookmark', () => bookmarkPath(note.path)),
  menuSeparator,
  menuItem('Copy internal link', 'link', () => copyMenuText('[[' + note.path + ']]')),
  pathMenu(note),
  desktop?.revealPath && menuItem('Show in system explorer', 'folder-open', () => desktop.revealPath(note.path, note.type)),
 ];
 return [
  menuItem('Open in new tab', 'files', () => openNote(note.path, note.type)),
  menuItem('Change icon…', 'image', () => openIconPicker(note.path, note.type)),
  menuItem((explorerPins.has(note.path) ? 'Unpin ' : 'Pin ') + (note.type === 'note' ? 'Note' : note.type === 'canvas' ? 'Canvas' : 'Whiteboard'), 'pin', () => toggleExplorerPin(note.path)),
  menuSeparator,
  menuItem('Make a copy…', 'copy', () => menuFileDialog(note, 'copy')),
  menuItem('Move file to…', 'folder-input', () => menuFileDialog(note, 'move')),
  menuItem(bookmarks.includes(note.path) ? 'Remove bookmark' : 'Bookmark', 'bookmark', () => bookmarkPath(note.path)),
  menuSeparator,
  menuItem('Copy internal link', 'link', () => copyMenuText('[[' + note.path.replace(/\.md$/i, '') + ']]')),
  pathMenu(note),
  menuItem('Open file recovery', 'history', openRecovery),
  desktop?.revealPath && menuItem('Show in system explorer', 'folder-open', () => desktop.revealPath(note.path, note.type)),
  menuSeparator,
  menuItem('Rename…', 'pencil', () => menuFileDialog(note, 'rename')),
  menuItem('Move to trash…', 'trash', () => prepareMenuTrash(note), { danger: true }),
 ];
}
function showFileMenu(target, event) { contextMenus.open(fileMenuItems(target), event, 'File actions: ' + title(target.path)); }
function folderMenuItems(path) {
 const prefix = path ? path + '/' : '';
 return [
  menuItem('New note', 'notebook-text', () => newNote(path)),
  menuItem('New folder', 'folder-plus', () => newDialog(prefix + 'Untitled', 'folder')),
  excalidrawEnabled() && menuItem('New whiteboard', 'presentation', () => newFile('whiteboard', path)),
  menuItem('New canvas', 'layout', () => newFile('canvas', path)),
  menuSeparator,
  path && menuItem('Search in folder', 'folder-search', () => { setSidebar('search'); $('search').value = 'path:"' + path + '"'; renderFiles(); }),
  path && menuItem('Change icon…', 'image', () => openIconPicker(path, 'folder')),
  path && menuItem(explorerPins.has(path) ? 'Unpin Folder' : 'Pin Folder', 'pin', () => toggleExplorerPin(path)),
  path && pathMenu({ path, type: 'folder' }),
  desktop?.revealPath && menuItem('Show in system explorer', 'folder-open', () => desktop.revealPath(path, 'folder')),
  menuSeparator,
  path && menuItem(closedFolders.has(path) ? 'Expand folder' : 'Collapse folder', 'fold', () => { if (closedFolders.has(path)) closedFolders.delete(path); else closedFolders.add(path); renderFiles(); schedulePersist(); }),
  menuItem('Collapse all folders', 'fold', () => { closedFolders = new Set(folders); renderFiles(); schedulePersist(); }),
  menuItem('Refresh vault', 'refresh', refresh),
 ];
}
function showFolderMenu(path, event) { contextMenus.open(folderMenuItems(path), event, path ? 'Folder actions: ' + path : 'Vault actions'); }
function closeMenuTabs(paths) {
 const queue = paths.filter(path => tabs.some(tab => tab.path === path && !tab.pinned));
 const next = () => { const path = queue.shift(); if (path) closeTab(path, next); };
 next();
}
function tabDisplayTitle(tab) { return tab.path === '@graph' ? 'Graph view' : tab.path === '@tasks' ? 'Tasks' : title(tab.path); }
function tabDisplayIcon(tab) { return tab.path === '@graph' ? 'graph-star' : tab.path === '@tasks' ? 'check-square' : tab.type === 'whiteboard' ? 'presentation' : tab.type === 'canvas' ? 'layout' : tab.type === 'file' && typeof fileTypeIcon === 'function' ? fileTypeIcon(tab.path, tab.type) : 'notebook-text'; }
function bookmarkAllTabs() {
 const paths = tabs.filter(tab => !tab.path.startsWith('@')).map(tab => tab.path);
 bookmarks = [...new Set([...bookmarks, ...paths])];
 if (current) syncBookmarkButton();
 renderFiles(); schedulePersist();
}
function tabsMenuItems() {
 const open = tabs.map(tab => ({ path: tab.path, type: tab.type }));
 const bookmarkable = open.filter(tab => !tab.path.startsWith('@'));
 const all = open.map(tab => tab.path);
 const closable = all.some(path => tabs.some(tab => tab.path === path && !tab.pinned));
 return [
  menuItem('Bookmark ' + bookmarkable.length + ' tab' + (bookmarkable.length === 1 ? '' : 's') + '…', 'bookmark', bookmarkAllTabs, { disabled: !bookmarkable.length }),
  menuItem('Close all', 'x', () => closeMenuTabs(all), { disabled: !closable }),
  ...(open.length ? [menuSeparator, ...open.map(tab => menuItem(tabDisplayTitle(tab), tabDisplayIcon(tab), () => requestOpen(tab.path, tab.type), { checked: tab.path === activeTab, title: tab.path }))] : []),
 ];
}
function showTabsMenu(event) { contextMenus.open(tabsMenuItems(), event, 'Tab menu'); }
function tabMenuItems(target) {
 const tab = tabs.find(tab => tab.path === target.path);
 if (!tab) return [];
 const path = tab.path, after = tabs.slice(tabs.indexOf(tab) + 1).map(tab => tab.path);
 const closable = paths => paths.some(path => tabs.some(tab => tab.path === path && !tab.pinned));
 const other = tabs.filter(tab => tab.path !== path).map(tab => tab.path), all = tabs.map(tab => tab.path);
 return [
  menuItem('Close', 'x', () => closeTab(path), { disabled: !!tab.pinned, shortcut: 'Ctrl W' }),
  menuItem('Close others', 'x', () => closeMenuTabs(other), { disabled: !closable(other) }),
  menuItem('Close tabs after', 'x', () => closeMenuTabs(after), { disabled: !closable(after) }),
  menuItem('Close all', 'x', () => closeMenuTabs(all), { disabled: !closable(all) }),
  menuSeparator,
  menuItem(tab.pinned ? 'Unpin' : 'Pin', 'pin', () => { tab.pinned = !tab.pinned; renderTabs(); schedulePersist(); }),
  !path.startsWith('@') && menuItem('Change icon…', 'image', () => openIconPicker(path, tab.type)),
 ];
}
function showTabMenu(tab, event) { contextMenus.open(tabMenuItems(tab), event, 'Tab actions'); }
async function prepareMenuTrash(target) {
 const note = await readMenuTarget(target);
 if (note.dirty) throw new Error('Save this file’s unsaved changes before moving it to trash.');
 trashTarget = Object.freeze(note);
 if (settings.promptDelete === false) { await confirmMenuTrash(); return; }
 $('confirmText').textContent = '“' + title(note.path) + '” will be moved to trash.';
 $('confirmDialog').showModal();
}
async function confirmMenuTrash() {
 const note = trashTarget; if (!note) return;
 const confirm = $('confirmTrash'); if (confirm.disabled) return; confirm.disabled = true;
 try {
  if (drafts.get(note.path)?.dirty) throw new Error('This file has unsaved changes. Save them before moving it to trash.');
  await api('trash', { path: note.path, revision: note.revision });
  const tab = tabs.find(tab => tab.path === note.path); if (tab) tab.pinned = false;
  drafts.delete(note.path); bookmarks = bookmarks.filter(path => path !== note.path); explorerPins.delete(note.path);
  if (tab) closeTab(note.path);
  else if (current?.path === note.path) { current = null; dirty = false; }
  await refresh(); $('confirmDialog').close(); trashTarget = null;
  message('File moved to .slate-recovery. Restore it from File recovery.',{type:'success',action:{label:'File recovery',onClick:()=>openRecovery()}}); schedulePersist();
 } catch (error) { message(error.message); } finally { confirm.disabled = false; }
}
function editorMenuSnapshot() {
 const live = settings.livePreview && liveEditor;
 const selection = live ? liveEditor.getSelection() : { from: $('editor').selectionStart, to: $('editor').selectionEnd };
 return { path: current.path, content: getText(), from: selection.from, to: selection.to, live: !!live };
}
function replaceMenuSelection(snapshot, text, selectFrom = text.length, selectTo = selectFrom) {
 if (current?.path !== snapshot.path || getText() !== snapshot.content) throw new Error('The note changed while the menu was open. Open the menu again.');
 if (snapshot.live) liveEditor.replaceRange(snapshot.from, snapshot.to, text, snapshot.from + selectFrom, snapshot.from + selectTo);
 else {
  const editor = $('editor'); editor.focus(); editor.setSelectionRange(snapshot.from, snapshot.to);
  if (!document.execCommand('insertText', false, text)) { editor.setRangeText(text, snapshot.from, snapshot.to, 'end'); editor.dispatchEvent(new Event('input')); }
  editor.setSelectionRange(snapshot.from + selectFrom, snapshot.from + selectTo);
 }
}
function editorMenuItems() {
 const snapshot = editorMenuSnapshot(), selected = snapshot.content.slice(snapshot.from, snapshot.to);
 const wrap = (before, after = before, placeholder = 'text') => {
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
   const text = selected.slice(before.length, -after.length); replaceMenuSelection(snapshot, text, 0, text.length);
  } else if (snapshot.content.slice(snapshot.from - before.length, snapshot.from) === before && snapshot.content.slice(snapshot.to, snapshot.to + after.length) === after) {
   replaceMenuSelection({ ...snapshot, from: snapshot.from - before.length, to: snapshot.to + after.length }, selected, 0, selected.length);
  } else { const text = selected || placeholder; replaceMenuSelection(snapshot, before + text + after, before.length, before.length + text.length); }
 };
 const prefix = marker => {
  const from = snapshot.content.lastIndexOf('\n', snapshot.from - 1) + 1;
  let to = snapshot.content.indexOf('\n', snapshot.to); if (to < 0) to = snapshot.content.length;
  const range = { ...snapshot, from, to };
  const text = snapshot.content.slice(from, to).split('\n').map(line => marker + line.replace(/^(?:#{1,6} |>[ \t]?|[-*+] (?:\[[ xX]\] )?|\d+[.)] )/, '')).join('\n');
  replaceMenuSelection(range, text, 0, text.length);
 };
 return [
  menuItem('Add internal link', 'link', () => wrap('[[', ']]', 'Note name')),
  menuItem('Add external link', 'external-link', () => wrap('[', '](https://)', 'Link text')),
  menuSeparator,
  menuItem('Format', 'pencil', null, { children: [
   menuItem('Bold', 'bold', () => wrap('**'), { shortcut: 'Ctrl B' }),
   menuItem('Italic', 'italic', () => wrap('*'), { shortcut: 'Ctrl I' }),
   menuItem('Strikethrough', 'strikethrough', () => wrap('~~')),
   menuItem('Highlight', 'highlighter', () => wrap('==')),
   menuItem('Inline code', 'code', () => wrap('`')),
  ] }),
  menuItem('Paragraph', 'paragraph', null, { children: [
   menuItem('Heading 1', 'heading', () => prefix('# ')), menuItem('Heading 2', 'heading', () => prefix('## ')),
   menuItem('Heading 3', 'heading', () => prefix('### ')), menuItem('Bullet list', 'list', () => prefix('- ')),
   menuItem('Numbered list', 'list-ordered', () => prefix('1. ')), menuItem('Task list', 'check-square', () => prefix('- [ ] ')),
   menuItem('Quote', 'quote', () => prefix('> ')),
  ] }),
  menuItem('Insert', 'plus', null, { children: [
   menuItem('Code block', 'code', () => wrap('```\n', '\n```', 'code')),
   menuItem('Horizontal rule', 'minus', () => replaceMenuSelection(snapshot, '\n\n---\n\n')),
   menuItem('Table', 'table', () => replaceMenuSelection(snapshot, '\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n')),
   menuItem('Attachment…', 'paperclip', () => $('attachmentInput').click()),
  ] }),
  menuSeparator,
  menuItem('Undo', 'undo', () => { if (snapshot.live) liveEditor.undo(); else { $('editor').focus(); document.execCommand('undo'); } }, { disabled: snapshot.live && !liveEditor.canUndo(), shortcut: 'Ctrl Z' }),
  menuItem('Redo', 'redo', () => { if (snapshot.live) liveEditor.redo(); else { $('editor').focus(); document.execCommand('redo'); } }, { disabled: snapshot.live && !liveEditor.canRedo(), shortcut: 'Ctrl Y' }),
  menuSeparator,
  menuItem('Cut', 'scissors', async () => { await copyMenuText(selected); replaceMenuSelection(snapshot, ''); }, { disabled: !selected, shortcut: 'Ctrl X' }),
  menuItem('Copy', 'copy', () => copyMenuText(selected), { disabled: !selected, shortcut: 'Ctrl C' }),
  menuItem('Paste as plain text', 'clipboard', async () => replaceMenuSelection(snapshot, await readMenuClipboard()), { shortcut: 'Ctrl V' }),
  menuItem('Select all', 'select-all', () => { if (snapshot.live) liveEditor.setSelection(0, snapshot.content.length); else { $('editor').focus(); $('editor').select(); } }, { shortcut: 'Ctrl A' }),
 ];
}
function installContextMenus() {
 contextMenus = window.SlateContextMenu.create({ icon, onError: error => message(error.message) });
 $('files').oncontextmenu = event => { if (!event.target.closest('.file,.folder')) showFolderMenu('', event); };
 for (const id of ['editor', 'liveEditor']) $(id).oncontextmenu = event => {
  if (current?.type === 'note' && activeTab === current.path && mode === 'edit') contextMenus.open(editorMenuItems(), event, 'Editor actions');
 };
 $('preview').oncontextmenu = event => {
  const link = event.target.closest('[data-link]');
  if (link) {
   const target = link.dataset.link;
   contextMenus.open([menuItem('Open linked note', 'file', () => followLink(target)), menuItem('Copy internal link', 'link', () => copyMenuText('[[' + target + ']]'))], event, 'Link actions');
  } else if (current?.type === 'note') {
   const selected = window.getSelection()?.toString() || '';
   contextMenus.open([menuItem('Copy', 'copy', () => copyMenuText(selected), { disabled: !selected }), menuItem('Edit note', 'pencil', () => setMode('edit')), menuSeparator, ...fileMenuItems(current)], event, 'Reading view actions');
  }
 };
}
