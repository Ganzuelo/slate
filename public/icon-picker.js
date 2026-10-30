let vaultIcons = null, iconPickerTarget = null, iconPickerName = '', iconPickerColor = '', iconPickerMatches = [], iconPickerLimit = 240;
let iconWriteBusy = false;
let iconPickerMode = 'icons', iconPickerSelections = {icons:'notebook-text',emoji:''};
const iconModel = () => window.SlateNoteIcons;
function assignedIcon(path, kind = 'note') { return iconModel()?.resolve(vaultIcons?.config,path,kind,null,window.SlateIcons); }
function noteIconMarkup(item, fallback = '') {
 if (!item) return fallback ? icon(fallback) : '';
 const emoji = iconModel().emoji(item.icon);
 if (emoji) return '<span class="note-icon note-emoji" role="img" aria-label="' + esc(emoji.name) + '">' + esc(emoji.glyph) + '</span>';
 return '<span class="note-icon" data-note-color="' + esc(iconModel().color(item.color)) + '">' + icon(item.icon,true) + '</span>';
}
function fileIcon(path, kind = 'note', fallback = '') { return noteIconMarkup(assignedIcon(path,kind),fallback); }
function hydrateNoteColors(root = document) { root.querySelectorAll?.('[data-note-color]').forEach(el => { el.style.color = el.dataset.noteColor; }); }
function repaintNoteIcons() { renderFiles(); renderTabs(); }
async function saveIconConfig(change) {
 if (iconWriteBusy) throw new Error('An icon change is being saved. Try again in a moment.');
 if (!vaultIcons) throw new Error('Icon settings are unavailable. Refresh the vault and try again.');
 iconWriteBusy = true;
 try {
  const config = structuredClone(vaultIcons.config); change(config);
  const saved = await api('icons', { config, revision: vaultIcons.revision });
  vaultIcons = saved; repaintNoteIcons();
 } catch (error) {
  try { vaultIcons = await api('icons'); repaintNoteIcons(); } catch {}
  throw error;
 } finally { iconWriteBusy = false; }
}
function openIconPicker(path, kind = 'note') {
 if (!vaultIcons) { message('Icon settings are unavailable. Refresh the vault and try again.'); return; }
 iconPickerTarget = Object.freeze({path,kind});
 const assignment = assignedIcon(path,kind);
 iconPickerName = assignment?.icon || (kind === 'folder' ? 'folder' : kind === 'canvas' ? 'layout-dashboard' : 'notebook-text');
 iconPickerMode = iconModel().emoji(iconPickerName) ? 'emoji' : 'icons';
 iconPickerSelections = {icons:iconPickerMode === 'icons' ? iconPickerName : kind === 'folder' ? 'folder' : kind === 'canvas' ? 'layout-dashboard' : 'notebook-text',emoji:iconPickerMode === 'emoji' ? iconPickerName : iconModel().emojis[0].id};
 iconPickerColor = assignment?.color || '';
 $('iconPickerPath').value = kind === 'folder' ? path.split('/').pop() : title(path); $('iconPickerPath').dataset.tooltip = path; $('iconPickerPathLabel').textContent = kind === 'folder' ? 'Folder' : 'File';
 $('iconSearch').value = ''; $('iconPickerError').textContent = '';
 const select = $('iconColor'); select.dataset.maxHeight = '336'; select.replaceChildren();
 for (const item of [{name:'',label:'Default'},...iconModel().palette]) {
  const option = document.createElement('option'); option.value = item.name; option.textContent = item.label; select.append(option);
 }
 if (iconPickerColor && !iconModel().palette.some(item => item.name === iconPickerColor)) {
  const option = document.createElement('option'); option.value = iconPickerColor; option.textContent = 'Existing color'; select.append(option);
 }
 select.value = iconPickerColor; window.SlateSelect?.enhance($('iconColorControl'),icon);
 $('iconColorControl').querySelector('.ui-select-content').onbeforetoggle = updateIconPickerColor;
 updateIconPickerColor(); renderIconPicker();
 $('iconPickerDialog').showModal(); $('iconSearch').focus();
}
function updateIconPickerColor() {
 const host = $('iconColorControl'), trigger = host.querySelector('.ui-select-trigger');
 const isEmoji = !!iconModel().emoji(iconPickerName);
 if (isEmoji) host.dataset.tooltip = 'Emoji use their original colors'; else delete host.dataset.tooltip;
 $('iconColor').disabled = isEmoji;
 if (trigger) {
  trigger.disabled = isEmoji;
  const label = $('iconColor').selectedOptions[0]?.textContent || 'Default';
  trigger.setAttribute('aria-label',isEmoji ? 'Emoji use their original colors' : 'Icon color: ' + label); trigger.dataset.tooltip = isEmoji ? 'Emoji use their original colors' : 'Icon color: ' + label;
  trigger.style.color = iconModel().color(iconPickerColor) || 'var(--muted)';
 }
 for (const option of host.querySelectorAll('.ui-select-option')) {
  option.style.color = iconModel().color(option.dataset.value);
  let glyph = option.querySelector('.icon-color-glyph');
  if (!glyph) { glyph = document.createElement('span'); glyph.className = 'icon-color-glyph'; glyph.innerHTML = icon('paint-bucket'); option.prepend(glyph); }
  glyph.style.color = iconModel().color(option.dataset.value) || 'var(--muted)';
 }
 $('iconResults').style.color = iconModel().color(iconPickerColor) || 'var(--muted)';
}
function renderIconPicker() {
 iconPickerMatches = iconPickerMode === 'emoji' ? iconModel().emojiSuggestions($('iconSearch').value,vaultIcons.config.recent) : iconModel().suggestions($('iconSearch').value,window.SlateIconNames,vaultIcons.config.recent);
 $('iconModeIcons').setAttribute('aria-selected',String(iconPickerMode === 'icons')); $('iconModeEmoji').setAttribute('aria-selected',String(iconPickerMode === 'emoji'));
 $('iconModeIcons').tabIndex = iconPickerMode === 'icons' ? 0 : -1; $('iconModeEmoji').tabIndex = iconPickerMode === 'emoji' ? 0 : -1;
 $('iconResults').setAttribute('aria-label',iconPickerMode === 'emoji' ? 'Emoji' : 'Lucide icons');
 $('iconResults').setAttribute('aria-labelledby',iconPickerMode === 'emoji' ? 'iconModeEmoji' : 'iconModeIcons');
 $('iconSearch').placeholder = iconPickerMode === 'emoji' ? 'Search emoji' : 'Search icons'; $('iconSearch').setAttribute('aria-label',$('iconSearch').placeholder);
 iconPickerLimit = 240; $('iconResults').replaceChildren(); $('iconResults').scrollTop = 0;
 appendIconChoices(0); updateIconPickerColor();
 $('iconResultsCount').textContent = iconPickerMatches.length + (iconPickerMode === 'emoji' ? ' emoji' : ' icons');
}
function appendIconChoices(from) {
 const host = $('iconResults');
 for (const name of iconPickerMatches.slice(from,iconPickerLimit)) {
  const emoji = iconModel().emoji(name);
  const b = button('',()=>selectIconPickerName(name),'icon-choice');
  if (emoji) { const glyph=document.createElement('span');glyph.className='emoji-glyph';glyph.setAttribute('aria-hidden','true');glyph.textContent=emoji.glyph;b.append(glyph); } else b.innerHTML = icon(name,true);
  const label = emoji?.name || name.replaceAll('-',' ');
  b.setAttribute('aria-label',label); b.dataset.tooltip = label; b.dataset.iconName = name;
  b.setAttribute('aria-pressed',String(name === iconPickerName)); host.append(b);
 }
 if (!iconPickerMatches.length) empty(host,iconPickerMode === 'emoji' ? 'No matching emoji.' : 'No matching icons.');
}
function selectIconPickerName(name) {
 iconPickerName = name;
 iconPickerSelections[iconPickerMode] = name;
 $('iconResults').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.iconName === name)));
 $('iconResultsCount').textContent = (iconModel().emoji(name)?.name || name.replaceAll('-',' ')) + ' selected';
 updateIconPickerColor();
}
function setIconPickerMode(mode) {
 iconPickerSelections[iconPickerMode] = iconPickerName; iconPickerMode = mode; iconPickerName = iconPickerSelections[mode]; renderIconPicker();
}
async function submitIconPicker(action = 'assign') {
 const target = iconPickerTarget; if (!target || iconWriteBusy) return;
 const selectedName = iconPickerName, selectedColor = iconModel().emoji(iconPickerName) ? '' : iconPickerColor;
 const controls = ['iconApply','iconReset']; controls.forEach(id=>$(id).disabled=true);
 try {
  if (!(target.kind === 'folder' ? folders.includes(target.path) : allFiles().some(file=>file.path === target.path))) throw new Error('The target moved or was deleted. Refresh and choose it again.');
  await saveIconConfig(config=>{
   if (action === 'reset') delete config.entries[target.path];
   else { config.entries[target.path] = {icon:selectedName,color:selectedColor}; config.recent = [selectedName,...config.recent.filter(name=>name !== selectedName)].slice(0,24); }
  });
  $('iconPickerDialog').close();
 } catch (error) { $('iconPickerError').textContent = error.message; }
 finally { controls.forEach(id=>$(id).disabled=false); }
}
function initIconPicker() {
 $('iconModeIcons').onclick = () => setIconPickerMode('icons'); $('iconModeEmoji').onclick = () => setIconPickerMode('emoji');
 $('iconPickerModes').onkeydown = event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault();const mode=event.key === 'Home' ? 'icons' : event.key === 'End' ? 'emoji' : iconPickerMode === 'icons' ? 'emoji' : 'icons'; setIconPickerMode(mode); $(mode === 'icons' ? 'iconModeIcons' : 'iconModeEmoji').focus(); } };
 $('iconSearch').oninput = renderIconPicker;
 $('iconColor').onchange = () => { iconPickerColor = $('iconColor').value; updateIconPickerColor(); };
 for (const id of ['iconCancel','iconClose']) $(id).onclick=()=>$('iconPickerDialog').close();
 $('iconApply').onclick=()=>submitIconPicker(); $('iconReset').onclick=()=>submitIconPicker('reset');
 $('iconResults').onscroll=()=>{ const host=$('iconResults'); if(host.scrollTop+host.clientHeight>=host.scrollHeight-60 && iconPickerLimit<iconPickerMatches.length){const from=iconPickerLimit;iconPickerLimit+=240;appendIconChoices(from);} };
 $('iconSearch').onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();$('iconResults').querySelector('button')?.focus();}};
 $('iconResults').onkeydown=event=>{
  const buttons=[...$('iconResults').querySelectorAll('button')],at=buttons.indexOf(document.activeElement);
  const columns=Math.max(1,Math.round($('iconResults').clientWidth/(buttons[0]?.getBoundingClientRect().width||44)));
  const keys={ArrowDown:at+columns,ArrowUp:at-columns,ArrowRight:at+1,ArrowLeft:at-1,Home:0,End:iconPickerMatches.length-1};
  if(Object.hasOwn(keys,event.key)) {event.preventDefault();const next=Math.max(0,Math.min(keys[event.key],iconPickerMatches.length-1));if(next>=buttons.length){const from=iconPickerLimit;iconPickerLimit=Math.max(iconPickerLimit,next+1);appendIconChoices(from);} $('iconResults').children[next]?.focus();}
 };
}
