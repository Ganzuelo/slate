const $ = id => document.getElementById(id);
function fileType(path) { return /\.excalidraw$/i.test(path) ? 'whiteboard' : /\.canvas$/i.test(path) ? 'canvas' : 'note'; }
let whiteboardInstance = null, whiteboardLoad = null, whiteboardGeneration = 0;
function unmountWhiteboard() { whiteboardGeneration++; whiteboardInstance?.dispose(); whiteboardInstance = null; }
function excalidrawEnabled() { return settings.excalidrawEnabled !== false; }
function disableWhiteboardView() {
 if (current?.type !== 'whiteboard') return;
 unmountWhiteboard(); showView('emptyView'); renderBreadcrumb('No file is open');
 message('Excalidraw is disabled. Your whiteboard file is unchanged.');
}
async function mountWhiteboard(note) {
 unmountWhiteboard(); const generation = whiteboardGeneration;
 try {
  window.EXCALIDRAW_ASSET_PATH='/vendor/whiteboard/';
  whiteboardLoad ||= import('/vendor/whiteboard/whiteboard.js').catch(error=>{whiteboardLoad=null;throw error;});
  const module = await whiteboardLoad;
  if(generation!==whiteboardGeneration||activeTab!==note.path)return;
  whiteboardInstance=module.mount($('whiteboardHost'),{content:note.content,icon,name:title(note.path),onSave:()=>save(note),onError:error=>message(error.message),onChange:content=>{
   if(generation!==whiteboardGeneration)return;
   note.content=content;note.dirty=content!==note.original;dirty=!!current?.dirty;renderTabs();schedulePersist();queueAutoSave(note);
  }});
 } catch(error) { if(generation===whiteboardGeneration)message('Whiteboard could not open: '+error.message); }
}
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = name => name.split('/').pop().replace(/\.(md|canvas|excalidraw)$/i, '');
const desktop = window.slateDesktop;
const storage = {get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} } };
let token = location.hash.slice(1) || sessionStorage.getItem('slate-token');
if (location.hash) { sessionStorage.setItem('slate-token',token); history.replaceState(null,'','/'); }
const defaultSettings = {theme:'dark',accentColor:'#7f56d9',fontSize:16,interfaceFont:'',monospaceFont:'',showRibbon:true,showViewHeader:true,quickFontSize:false,lineWidth:true,livePreview:true,showTitle:true,spellcheck:true,autoSave:true,font:'Segoe UI',newFolder:'',newFileLocation:null,attachmentFolder:'Attachments',attachmentSubfolder:'',attachmentLocation:null,dailyFolder:'Daily',dailyFormat:'YYYY-MM-DD',templateFolder:'Templates',taskGlobalFilter:'',defaultViewMode:'editing',propertiesInDocument:'visible',showLineNumber:false,strictLineBreaks:false,rightToLeft:false,useTab:true,tabSize:4,alwaysUpdateLinks:true,promptDelete:true,excalidrawEnabled:true,dataviewEnabled:true,dataviewJavascript:false};
let settings = {...defaultSettings,...storage.get('settings',{})};
if(window.SlateDataview)window.SlateDataview.enabled=()=>settings.dataviewEnabled!==false;
const systemAppearance = window.matchMedia?.('(prefers-color-scheme: light)');
systemAppearance?.addEventListener('change', () => { if (settings.theme === 'system') applySettings(); });
let notes=[], folders=[], attachments=[], canvases=[], whiteboards=[], current=null, dirty=false, mode='edit', sidebar='files', rightPanel='backlinks', tabs=[], activeTab=null, bookmarks=storage.get('bookmarks',[]), closedFolders=new Set(), leftClosed=false,rightClosed=false,liveEditor=null;
let pendingSwitch=null,copyDraft=null,dialogAction='new',saving=false,split=false,historyPaths=[],historyIndex=-1,paletteKind='commands',paletteItems=[],paletteIndex=0,paletteVisible=[],canvasState=null,canvasSelected=null,canvasLinkFrom=null,canvasZoom=1,graphLocal=false,tasksFilter='all',taskBusy=false,editingTask=null;
const drafts = new Map();
const autoSaveTimers = new Map();
const autoSaveStarted = new Map();
let saveTail = Promise.resolve(), openGeneration = 0;
let ribbonLayout=null;
let explorerPins=new Set();
function icon(name, canonical = false) {
 const svg = (canonical && window.SlateLucideOverrides?.[name]) || window.SlateIcons?.[name];
 if (!svg) throw new Error('Unregistered Lucide icon: ' + name);
 return svg;
}
function hydrateIcons(root=document) { root.querySelectorAll?.('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }
function button(text, action, className='') { const el=document.createElement('button');el.type='button';el.textContent=text;el.className=className;el.onclick=action;return el; }
function message(text='') { $('message').textContent=text;$('message').hidden=!text; }
async function api(route,data) {
 const response=await fetch('/api/'+route,{method:data?'PUT':'GET',headers:{'X-Slate-Token':token||'',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status});return result;
}
function getText() { return liveEditor && !settings.livePreview ? $('editor').value : liveEditor && mode==='edit' ? liveEditor.getValue() : $('editor').value; }
function setText(value) { $('editor').value=value;liveEditor?.setValue(value);resizeEditor(); }
function resizeEditor() { const el=$('editor');if(el.style){el.style.height='auto';el.style.height=Math.max(450,el.scrollHeight)+'px';} }
function queueAutoSave(note){if(!settings.autoSave)return;if(!autoSaveStarted.has(note.path))autoSaveStarted.set(note.path,Date.now());clearTimeout(autoSaveTimers.get(note.path));const delay=Math.min(900,Math.max(0,2000-(Date.now()-autoSaveStarted.get(note.path))));autoSaveTimers.set(note.path,setTimeout(()=>{autoSaveTimers.delete(note.path);autoSaveStarted.delete(note.path);if(note.dirty)save(note);},delay));}
function draftChanged(text) { if(!current || current.type!=='note')return;current.content=text;current.dirty=true;dirty=true;$('editor').value=text;renderTabs();update();schedulePersist();queueAutoSave(current); }
function syncSavedText(text) {
 const editor=$('editor'), previous=editor.value, start=editor.selectionStart, end=editor.selectionEnd, scroll=editor.scrollTop;
 let from=0, oldEnd=previous.length, newEnd=text.length;
 while(from<oldEnd&&from<newEnd&&previous[from]===text[from])from++;
 while(oldEnd>from&&newEnd>from&&previous[oldEnd-1]===text[newEnd-1]){oldEnd--;newEnd--;}
 const map=position=>position<=from?position:position>=oldEnd?position+newEnd-oldEnd:newEnd;
 editor.value=text;
 if(Number.isFinite(start)&&Number.isFinite(end))editor.setSelectionRange?.(map(start),map(end));
 editor.scrollTop=scroll;
 if(liveEditor?.syncValue)liveEditor.syncValue(text);else liveEditor?.setValue(text);
 resizeEditor();update();
}
function reconcileNotes(incoming) {
 for(const data of incoming){
  const draft=drafts.get(data.path);
  if(!draft||draft.type!=='note'||draft.dirty||draft.saving||!data.revision||draft.revision===data.revision)continue;
  Object.assign(draft,{content:data.content,original:data.content,revision:data.revision});
  if(current===draft)syncSavedText(data.content);
 }
}
function fontStack(value, fallback) {
 const families = String(value ?? '').split(',').map(part => part.trim().replace(/['";{}]/g, '')).filter(Boolean);
 if (!families.length) return fallback;
 if (families.length === 1 && /^monospace$/i.test(families[0])) return 'Consolas, "Cascadia Mono", "Courier New", monospace';
 return families.map(name => /\s/.test(name) ? "'" + name + "'" : name).join(', ') + ', ' + fallback;
}
function newNoteFolder() {
 const mode = settings.newFileLocation || (settings.newFolder ? 'folder' : 'root');
 if (mode === 'current') return current?.path?.includes('/') ? current.path.slice(0, current.path.lastIndexOf('/')) : '';
 if (mode === 'folder') return String(settings.newFolder || '').replace(/\/$/, '');
 return '';
}
function attachmentFolderFor() {
 const mode = settings.attachmentLocation || (settings.attachmentFolder ? 'folder' : 'root');
 const currentFolder = current?.path?.includes('/') ? current.path.slice(0, current.path.lastIndexOf('/')) : '';
 const sub = String(settings.attachmentSubfolder || 'Attachments').replace(/\/$/, '') || 'Attachments';
 if (mode === 'current') return currentFolder;
 if (mode === 'subfolder') return (currentFolder ? currentFolder + '/' : '') + sub;
 if (mode === 'folder') return String(settings.attachmentFolder || '').replace(/\/$/, '');
 return '';
}
function applySettings() {
 ribbonLayout?.restore();
 const root=document.documentElement;if(!root)return;root.dataset.theme=settings.theme==='system'?(systemAppearance?.matches?'light':'dark'):settings.theme==='light'?'light':'dark';
 if(window.SlateAppearance){settings.accentColor=window.SlateAppearance.normalize(settings.accentColor);window.SlateAppearance.apply(root,settings.accentColor);}
 desktop?.setTheme?.(root.dataset.theme).catch(e=>message(e.message));
 settings.fontSize=Math.max(10,Math.min(30,Number(settings.fontSize)||16));settings.tabSize=Math.max(2,Math.min(8,Number(settings.tabSize)||4));
 root.style.setProperty('--font-size',settings.fontSize+'px');root.style.setProperty('--line-width',settings.lineWidth?'700px':'100%');
 root.style.setProperty('--editor-font',fontStack(settings.font,'sans-serif'));root.style.setProperty('--ui-font',fontStack(settings.interfaceFont,"'Segoe UI', sans-serif"));root.style.setProperty('--code-font',fontStack(settings.monospaceFont,'Consolas, "Cascadia Mono", "Courier New", monospace'));
 $('editor').spellcheck=settings.spellcheck;$('title').hidden=!settings.showTitle;
 const editorEl=$('editor');if(editorEl?.style)editorEl.style.tabSize=settings.tabSize;
 const noteView=$('noteView');if(noteView?.style)noteView.style.direction=settings.rightToLeft?'rtl':'';
 liveEditor?.setEditorOptions?.({lineNumbers:!!settings.showLineNumber,tabSize:settings.tabSize,useTab:!!settings.useTab});
 const whiteboardButton=$('whiteboardButton');if(whiteboardButton)whiteboardButton.hidden=!excalidrawEnabled();
 document.body.classList.toggle('left-closed',leftClosed);document.body.classList.toggle('right-closed',rightClosed);document.body.classList.toggle('ribbon-hidden',!settings.showRibbon);document.body.classList.toggle('view-header-hidden',!settings.showViewHeader);if(desktop)root.classList.add('is-desktop');
 if(current?.type==='note')renderProperties();
 if(current?.type==='note' && activeTab!=='@graph' && activeTab!=='@tasks')setMode(mode);storage.set('settings',settings);
}
let persistTimer;
function schedulePersist() { clearTimeout(persistTimer);persistTimer=setTimeout(persist,350); }
function workspace() { return {version:2,tabs,activeTab,bookmarks,explorerPins:[...explorerPins],settings,leftClosed,rightClosed,closedFolders:[...closedFolders],drafts:[...drafts.values()].filter(n=>n.dirty).map(n=>({path:n.path,type:n.type,content:n.content,revision:n.revision,original:n.original,dirty:true})).slice(0,30)}; }
function persist() { const state=workspace();storage.set('workspace',state);storage.set('bookmarks',bookmarks);desktop?.saveWorkspace(state).catch(e=>message(e.message)); }
async function refresh() {
 const revisions=new Map([...drafts].map(([path,draft])=>[path,draft.revision]));
 if (window.SlateNoteIcons && !iconWriteBusy) { const before = vaultIcons; try { const result = await api('icons'); if (!iconWriteBusy && vaultIcons === before) vaultIcons = result; } catch (error) { message(error.message); } }
 const result=await api('notes');notes=result.notes;reconcileNotes(notes.filter(note=>drafts.get(note.path)?.revision===revisions.get(note.path)));folders=result.folders||[];attachments=result.attachments||[];canvases=result.canvases||[];whiteboards=result.whiteboards||[];$('vaultName').textContent=result.vault;renderFiles();renderContext();liveEditor?.refreshTasks?.();if((mode==='preview'||split)&&current?.type==='note')update();if(window.SlateNoteIcons)repaintNoteIcons();if(activeTab==='@graph')renderGraph();if(activeTab==='@tasks')renderTasks();
}
function allFiles() { return [...notes.map(n=>({...n,type:'note'})),...canvases.map(n=>({...n,type:'canvas'})),...whiteboards.map(n=>({...n,type:'whiteboard'}))].sort((a,b)=>a.path.localeCompare(b.path)); }
function setSidebar(next) { sidebar=next;$('searchPanel').hidden=next!=='search';$('fileActions').hidden=next!=='files';for(const name of ['files','search','bookmarks','tags']){$(name+'Button').classList.toggle('active',name===next);$(name+'Button').setAttribute('aria-selected',String(name===next));}if(leftClosed){leftClosed=false;applySettings();}renderFiles();if(next==='search')$('search').focus(); }
function matchesSearch(note,query) {
 let q=query,ok=true;const matchCase=$('caseButton').classList.contains('active');
 q=q.replace(/(?:^|\s)(path|tag):(?:"([^"]+)"|(\S+))/g,(_,kind,quoted,word)=>{const value=(quoted||word).toLowerCase();if(kind==='path')ok=ok&&note.path.toLowerCase().includes(value);else ok=ok&&(note.tags||[]).some(t=>t.toLowerCase()===value.replace(/^#/,''));return '';}).trim();
 return ok&&(!q||(matchCase?note.content.includes(q)||note.path.includes(q):note.content.toLowerCase().includes(q.toLowerCase())||note.path.toLowerCase().includes(q.toLowerCase())));
}
function renderFiles() {
 const root=$('files');root.replaceChildren();
 if(sidebar==='search') {
  const q=$('search').value;const found=q?notes.filter(n=>matchesSearch(n,q)):[];$('searchCount').textContent=found.length+' results';
  for(const n of found){const wrap=document.createElement('div');wrap.className='search-result';const resultButton=button(title(n.path),()=>requestOpen(n.path),'file');if(window.SlateNoteIcons){resultButton.innerHTML=fileIcon(n.path)+'<span class="file-label">'+esc(title(n.path))+'</span>';hydrateNoteColors(resultButton);}resultButton.oncontextmenu=e=>showFileMenu({path:n.path,type:'note'},e);wrap.append(resultButton);const snippet=document.createElement('div');snippet.className='search-snippet';const term=q.replace(/(?:path|tag):\S+/g,'').trim();const at=n.content.toLowerCase().indexOf(term.toLowerCase());const text=n.content.slice(Math.max(0,at-50),Math.max(0,at-50)+210);snippet.textContent=text;wrap.append(snippet);root.append(wrap);}if(!found.length)empty(root,q?'No matches found.':'Type to search your vault.');return;
 }
 if(sidebar==='tags') {const counts=new Map();for(const n of notes)for(const tag of n.tags||[])counts.set(tag,(counts.get(tag)||0)+1);for(const [tag,count]of [...counts].sort((a,b)=>a[0].localeCompare(b[0]))){const b=button('#'+tag,()=>{setSidebar('search');$('search').value='tag:'+tag;renderFiles();},'tag-row');const c=document.createElement('span');c.textContent=count;b.append(c);root.append(b);}if(!counts.size)empty(root,'No tags found.');return;}
 if(sidebar==='bookmarks') {for(const p of bookmarks)if(allFiles().some(n=>n.path===p))root.append(fileButton({path:p,type:fileType(p)}));if(!root.children.length)empty(root,'No bookmarks yet. Use the bookmark icon on a note.');return;}
 const tree={children:new Map(),files:[]};
 function folderAt(p){let node=tree;let prefix='';for(const part of p.split('/').filter(Boolean)){prefix+=(prefix?'/':'')+part;if(!node.children.has(part))node.children.set(part,{children:new Map(),files:[],path:prefix});node=node.children.get(part);}return node;}
 for(const p of folders)folderAt(p);
 for(const n of allFiles()){const dir=n.path.includes('/')?n.path.slice(0,n.path.lastIndexOf('/')):'';folderAt(dir).files.push(n);}
 function draw(node,parent){
  const entries=[...node.children].map(([label,child])=>({path:child.path,label,child})).concat(node.files.map(note=>({path:note.path,label:note.path.split('/').pop(),note})));
  entries.sort((a,b)=>Number(explorerPins.has(b.path))-Number(explorerPins.has(a.path))||Number(!!b.child)-Number(!!a.child)||a.label.localeCompare(b.label));
  for(const entry of entries){
   if(entry.note){parent.append(fileButton(entry.note));continue;}
   const {label,child}=entry;
   const b=button('',()=>{if(closedFolders.has(child.path))closedFolders.delete(child.path);else closedFolders.add(child.path);renderFiles();schedulePersist();},'folder'+(closedFolders.has(child.path)?' closed':''));b.innerHTML=icon('down')+(window.SlateNoteIcons?fileIcon(child.path,'folder'):'')+'<span class="folder-label">'+esc(label)+'</span>';b.setAttribute('aria-expanded',String(!closedFolders.has(child.path)));b.dataset.path=child.path;b.oncontextmenu=e=>showFolderMenu(child.path,e);parent.append(b);
   if(!closedFolders.has(child.path)){const content=document.createElement('div');content.className='folder-children';draw(child,content);parent.append(content);}
  }
 }
 draw(tree,root);if(window.SlateNoteIcons)hydrateNoteColors(root);if(!root.children.length)empty(root,'No notes yet. Create a new note.');
}
function fileButton(note) {const b=button('',()=>requestOpen(note.path,note.type),'file'+(current?.path===note.path?' active':''));b.innerHTML=(window.SlateNoteIcons?fileIcon(note.path,note.type,note.type==='whiteboard'?'presentation':note.type==='canvas'?'layout':''):(note.type==='canvas'?icon('layout'):''))+'<span class="file-label">'+esc(title(note.path))+'</span>';b.dataset.tooltip=note.path;b.oncontextmenu=e=>showFileMenu(note,e);if(window.SlateNoteIcons)hydrateNoteColors(b);return b;}
function empty(el,text) {const p=document.createElement('p');p.className='empty';p.textContent=text;el.append(p);}
function renderTabs() {
 $('tabs').replaceChildren();for(const tab of tabs){const el=document.createElement('div');el.className='tab'+(activeTab===tab.path?' active':'')+(tab.pinned?' pinned':'');el.setAttribute('role','tab');el.setAttribute('aria-selected',String(activeTab===tab.path));el.tabIndex=0;el.innerHTML=(window.SlateNoteIcons&&!tab.path.startsWith('@')?fileIcon(tab.path,tab.type,tab.type==='whiteboard'?'presentation':tab.type==='canvas'?'layout':'notebook-text'):icon(tab.path==='@graph'?'graph-star':tab.path==='@tasks'?'check-square':tab.type==='whiteboard'?'presentation':tab.type==='canvas'?'layout':'notebook-text'))+'<span class="tab-label">'+esc(tab.path==='@graph'?'Graph view':tab.path==='@tasks'?'Tasks':title(tab.path))+(drafts.get(tab.path)?.dirty?' •':'')+'</span>';el.oncontextmenu=e=>showTabMenu(tab,e);el.onclick=()=>requestOpen(tab.path,tab.type);el.onkeydown=e=>{if(e.key==='Enter')requestOpen(tab.path,tab.type);};const close=button('',e=>{e.stopPropagation();if(tab.pinned){tab.pinned=false;renderTabs();schedulePersist();}else closeTab(tab.path);},'tab-close');close.innerHTML=icon(tab.pinned?'pin':'x');close.dataset.tooltip=tab.pinned?'Unpin':'Close';close.setAttribute('aria-label',(tab.pinned?'Unpin ':'Close ')+title(tab.path));el.append(close);$('tabs').append(el);if(window.SlateNoteIcons)hydrateNoteColors(el);}
}
function addTab(path,type) {if(!tabs.some(t=>t.path===path))tabs.push({path,type});activeTab=path;renderTabs();schedulePersist();}
function requestOpen(path,type=fileType(path),fromHistory=false) {openNote(path,type,fromHistory).catch(e=>message(e.message));}
async function openNote(path,type=fileType(path),fromHistory=false) {
 const generation=++openGeneration;
 if(current?.dirty&&settings.autoSave)save(current);
 if(path==='@tasks'){activeTab='@tasks';addTab(path,'tasks');showView('tasksView');renderBreadcrumb('Tasks');renderTasks();return;}
 if(path==='@graph'){activeTab='@graph';addTab(path,'graph');showView('graphView');renderBreadcrumb('Graph view');renderGraph();return;}
 if(type==='whiteboard'&&!excalidrawEnabled()){message('Excalidraw is disabled. Turn it on in Settings › Core plugins › Excalidraw to open whiteboards.');if(!current)showView('emptyView');return;}
 let note=drafts.get(path);
 if(!note||!note.dirty){const revision=note?.revision;const data=await api(type+'?path='+encodeURIComponent(path));if(generation!==openGeneration)return;note=drafts.get(path)||{type};if(!note.dirty&&!note.saving&&note.revision===revision)Object.assign(note,data,{original:data.content,dirty:false});drafts.set(path,note);}
 if(generation!==openGeneration)return;
 const isNewTab=!tabs.some(t=>t.path===path);
 current=note;dirty=!!note.dirty;activeTab=path;addTab(path,type);message();
 if(!fromHistory){historyPaths=historyPaths.slice(0,historyIndex+1);if(historyPaths.at(-1)!==path)historyPaths.push(path);historyIndex=historyPaths.length-1;}
 $('backButton').disabled=historyIndex<=0;$('forwardButton').disabled=historyIndex>=historyPaths.length-1;
 $('title').textContent=title(path);$('notePath').textContent=path;renderBreadcrumb(path);
 syncBookmarkButton();
 if(type==='whiteboard'){showView('whiteboardView');await mountWhiteboard(note);}
 else if(type==='canvas'){showView('canvasView');canvasState=JSON.parse(note.content);canvasSelected=null;canvasLinkFrom=null;canvasZoom=1;renderCanvas();}
 else{showView('noteView');setText(note.content);setMode(isNewTab&&!fromHistory?(settings.defaultViewMode==='reading'?'preview':'edit'):mode);renderProperties();}
 renderFiles();renderContext();update();schedulePersist();
}
// Each folder in a note's path links back to that folder in the file explorer, as in Obsidian; the note name is the current page.
function renderBreadcrumb(path) {
 const host=$('breadcrumb');host.replaceChildren();
 const parts=path.split('/');
 if(parts.length===1||!/\.(md|canvas|excalidraw)$/i.test(path)){const label=document.createElement('span');label.className='crumb-current';label.textContent=path.replace(/\.(md|canvas|excalidraw)$/i,'');host.append(label);return;}
 parts.slice(0,-1).forEach((part,i)=>{const folder=parts.slice(0,i+1).join('/');const crumb=button(part,()=>revealFolder(folder),'crumb crumb-folder');crumb.setAttribute('aria-label','Show '+folder+' in file explorer');const sep=document.createElement('span');sep.className='crumb-separator';sep.setAttribute('aria-hidden','true');sep.textContent='/';host.append(crumb,sep);});
 const name=document.createElement('span');name.className='crumb-current';name.setAttribute('aria-current','page');name.textContent=parts.at(-1).replace(/\.(md|canvas|excalidraw)$/i,'');host.append(name);
}
function revealFolder(path) {
 let prefix='';for(const part of path.split('/')){prefix+=(prefix?'/':'')+part;closedFolders.delete(prefix);}
 setSidebar('files');schedulePersist();
 const row=[...$('files').querySelectorAll('.folder')].find(el=>el.dataset.path===path);if(!row)return;
 row.scrollIntoView({block:'nearest'});row.focus({preventScroll:true});row.classList.add('revealed');setTimeout(()=>row.classList.remove('revealed'),1200);
}
function showView(id) {if(id!=='whiteboardView')unmountWhiteboard();for(const name of ['noteView','emptyView','graphView','canvasView','tasksView','whiteboardView'])$(name).hidden=name!==id;for(const name of ['viewModeButton','wordCount','characterCount'])$(name).hidden=id==='whiteboardView';if(id==='whiteboardView')$('modeStatus').textContent='Whiteboard';}
function syncBookmarkButton() {const button=$('bookmarkButton');if(!button)return;const bookmarked=!!current&&bookmarks.includes(current.path);button.classList.toggle('active',bookmarked);button.setAttribute('aria-pressed',String(bookmarked));if(button.dataset)button.dataset.tooltip=bookmarked?'Remove bookmark':'Bookmark note';button.setAttribute('aria-label',bookmarked?'Remove bookmark':'Bookmark note');}
function afterSafe(action) {if(current?.dirty&&settings.autoSave){save(current).then(saved=>{if(saved)action();});}else if(current?.dirty){pendingSwitch=action;$('switchDialog').showModal();}else action();}
function closeTab(path,onClosed=()=>{}) {
 if(tabs.find(tab=>tab.path===path)?.pinned){message('Unpin this tab before closing it.');return;}
 const draft=drafts.get(path);
 const finish=async()=>{
  tabs=tabs.filter(tab=>tab.path!==path);drafts.delete(path);
  if(activeTab===path){
   const last=tabs.at(-1);
   if(last)await openNote(last.path,last.type);
   else{current=null;dirty=false;activeTab=null;showView('emptyView');renderBreadcrumb('No file is open');renderTabs();renderFiles();renderContext();}
  }else renderTabs();
  schedulePersist();onClosed();
 };
 const run=()=>finish().catch(error=>message(error.message));
 if(draft?.dirty&&settings.autoSave){save(draft).then(saved=>{if(saved)run();});}
 else if(draft?.dirty){if(activeTab!==path)requestOpen(path,draft.type);pendingSwitch=run;$('switchDialog').showModal();}else run();
}
function save(requested) {
 const target=requested&&typeof requested.path==='string'?requested:current;
 const run=async()=>{
  if(!target)return true;
  if(saving){queueAutoSave(target);return false;}
  clearTimeout(autoSaveTimers.get(target.path));autoSaveTimers.delete(target.path);
  autoSaveStarted.delete(target.path);
  saving=true;target.saving=true;
  try{
   do{
    const raw=target.content;
    const content=target.original?.includes('\r\n')?raw.replace(/\r?\n/g,'\r\n'):raw;
    let result;
    for(let attempt=0;;attempt++){
     try{result=await api(target.type,{path:target.path,content,revision:target.revision,...(target.type==='note'?{baseContent:target.original}:{})});break;}
     catch(error){if(error.status!==409||target.type!=='note'||attempt>=2)throw error;}
    }
    const saved=result.content??content, latest=target.content;
    // Rebase keystrokes made while the write was pending onto the saved merge.
    const next=latest===raw?saved:target.type==='note'&&window.SlateNoteMerge?window.SlateNoteMerge(raw,latest,saved)??latest:latest;
    target.revision=result.revision;target.original=saved;target.content=next;target.dirty=next!==saved;
    if(current===target&&target.type==='note'&&next!==latest)syncSavedText(next);
    dirty=!!current?.dirty;renderTabs();schedulePersist();
   }while(target.dirty);
   message();return true;
  }catch(e){message(e.message+' Your draft is kept.');schedulePersist();return false;}
  finally{target.saving=false;saving=false;refresh().catch(e=>message(e.message));}
 };
 const pending=saveTail.then(run);saveTail=pending.catch(()=>{});return pending;
}
function update() {const text=current?.type!=='note'?'':$('editor').value;$('wordCount').textContent=(text.trim().match(/\S+/g)?.length||0)+' words';$('characterCount').textContent=text.length+' characters';if((mode==='preview'||split)&&current?.type==='note'){$('preview').innerHTML=markdown(text);hydrateEmbeds();hydrateTaskQueries();hydrateDataview();hydrateCodeBlocks();if(window.SlateNoteIcons)hydrateNoteColors($('preview'));}renderContext();}
function setMode(next) {if(current?.type==='whiteboard')return;mode=next;const editing=next==='edit';const live=editing&&settings.livePreview&&liveEditor;$('editor').hidden=!editing||!!live;if($('liveEditor'))$('liveEditor').hidden=!live;$('preview').hidden=editing&&!split;const viewModeButton=$('viewModeButton');viewModeButton.innerHTML=icon(editing?'book':'pencil');if(viewModeButton.dataset){viewModeButton.dataset.icon=editing?'book':'pencil';viewModeButton.dataset.tooltip=editing?'Reading view (Ctrl+E)':'Editing view (Ctrl+E)';}viewModeButton.setAttribute('aria-label',editing?'Reading view':'Editing view');$('noteView').classList.toggle('split',split&&editing);$('modeStatus').textContent=editing?(settings.livePreview&&liveEditor?'Live preview':'Source mode'):'Reading view';if(live)liveEditor.setValue($('editor').value);update();schedulePersist();}
function inline(text) {
 const escaped=esc(text);
 return escaped.replace(/(?<!`)(`+)(.+?)\1(?!`)|!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|==([^=]+)==|\*([^*]+)\*/g,(match,codeTicks,code,embed,wiki,imgAlt,imgUrl,label,url,strong,strike,highlight,em)=>{
  if(codeTicks){if(settings.dataviewEnabled!==false&&(code.startsWith('=')||code.startsWith('$=')))return '<span class="dataview-inline" data-dataview-kind="'+(code.startsWith('$=')?'inlinejs':'inline')+'" data-dataview="'+code.slice(code.startsWith('$=')?2:1).trim()+'"></span>';return '<code>'+code+'</code>';}
  if(embed)return '<span class="embed-placeholder" data-embed="'+embed.split('|')[0]+'">'+embed+'</span>';
  if(wiki){const [target,alias]=wiki.split('|');return '<button class="wiki" data-link="'+target+'">'+(alias||target)+'</button>';}
  if(imgUrl)return '<span class="embed-placeholder" data-embed="'+imgUrl+'">'+(imgAlt||imgUrl)+'</span>';
  if(url){if(/^https?:\/\//i.test(url))return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'<span class="external-link-icon" aria-hidden="true">'+icon('external-link')+'</span></a>';if(!/^[a-z]+:|^\/\//i.test(url))return '<button class="wiki" data-link="'+url+'">'+label+'</button>';return label;}
  if(strong)return '<strong>'+strong+'</strong>';if(strike)return '<del>'+strike+'</del>';if(highlight)return '<mark>'+highlight+'</mark>';return '<em>'+em+'</em>';
 });
}
function codeBlock(info,lines){const lang=info.split(/\s+/)[0];return '<div class="code-block"><div class="code-block-header"><span>'+esc(lang)+'</span><button type="button" class="code-copy" data-copy-code aria-label="Copy code" data-tooltip="Copy code"><span data-icon="copy"></span></button></div><pre'+(lang?' data-lang="'+esc(lang)+'"':'')+'><code>'+esc(lines.join('\n'))+'</code></pre></div>';}
function markdown(text) {
 text=text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');let html='',code=false,codeKind='',codeLines=[],list=null,paragraph=[],quote=[];const lines=text.split(/\r?\n/);
 const lineJoin=settings.strictLineBreaks?' ':'<br>';
 const flushP=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join(lineJoin)+'</p>';paragraph=[];}};
 const flushList=()=>{if(list){html+='</'+list+'>';list=null;}};
 const flushQuote=()=>{if(quote.length){const callout=quote[0].match(/^\[!([\w-]+)\][+-]?\s*(.*)$/);if(callout)html+='<div class="callout"><div class="callout-title">'+esc(callout[2]||callout[1][0].toUpperCase()+callout[1].slice(1))+'</div>'+quote.slice(1).map(inline).join(lineJoin)+'</div>';else html+='<blockquote>'+quote.map(inline).join(lineJoin)+'</blockquote>';quote=[];}};
 for(let i=0;i<lines.length;i++){const line=lines[i];if(/^\s*(```|~~~)/.test(line)){flushP();flushList();flushQuote();if(code){html+=settings.dataviewEnabled!==false&&/^(dataview|dataviewjs)$/.test(codeKind)?'<div class="dataview-query" data-dataview-kind="'+codeKind+'" data-dataview="'+esc(codeLines.join('\n'))+'"></div>':codeKind==='tasks'?'<div class="task-query" data-task-query="'+esc(codeLines.join('\n'))+'"></div>':codeBlock(codeKind,codeLines);codeLines=[];}else codeKind=line.replace(/^\s*(```|~~~)/,'').trim().toLowerCase();code=!code;continue;}if(code){codeLines.push(line);continue;}
  if(/^>\s?/.test(line)){flushP();flushList();quote.push(line.replace(/^>\s?/,''));continue;}flushQuote();
  const item=line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.*)$/);if(item){flushP();const kind=item[1]?'ul':'ol';if(list!==kind){flushList();html+='<'+kind+'>';list=kind;}const task=item[2].match(/^\[([^\]])\]\s+(.*)$/);html+='<li>'+(task?'<button class="task-check" role="checkbox" aria-checked="'+/x/i.test(task[1])+'" aria-label="Toggle task" data-task-path="'+esc(current?.path||'')+'" data-task-line="'+(i+1)+'" data-task-raw="'+esc(line)+'">'+(/x/i.test(task[1])?icon('check'):'')+'</button>'+inline(task[2]):inline(item[2]))+'</li>';continue;}flushList();
  const heading=line.match(/^(#{1,6})\s+(.*)$/);if(heading){flushP();html+='<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>';continue;}
  if(/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)){flushP();html+='<hr>';continue;}
  if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){flushP();const cells=s=>s.replace(/^\s*\||\|\s*$/g,'').split('|').map(c=>c.trim());html+='<table><thead><tr>'+cells(line).map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>';i++;while(i+1<lines.length&&lines[i+1].includes('|')){i++;html+='<tr>'+cells(lines[i]).map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>';}html+='</tbody></table>';continue;}
  if(!line.trim()){flushP();continue;}paragraph.push(line);
 }
 flushP();flushList();flushQuote();if(code)html+=codeBlock(codeKind,codeLines);return html;
}
const embedCache=new Map();
function resolveAttachment(raw, notePath=current?.path||'') {
 let target=String(raw).trim();try{target=decodeURIComponent(target);}catch{}
 if(!target||/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(target))return null;
 const dir=notePath.includes('/')?notePath.slice(0,notePath.lastIndexOf('/')+1):'';
 const normalize=p=>{const parts=[];for(const part of p.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}return parts.join('/');};
 const exact=attachments.find(a=>a.path===target)||attachments.find(a=>a.path===normalize(dir+target));
 if(exact)return exact;
 const matches=attachments.filter(a=>a.path.split('/').pop()===target);
 return matches.length===1?matches[0]:null;
}
async function loadAttachment(asset) {
 let pending=embedCache.get(asset.path);
 if(!pending){pending=(async()=>{const r=await fetch('/api/attachment?path='+encodeURIComponent(asset.path),{headers:{'X-Slate-Token':token}});if(!r.ok)throw new Error('Attachment could not be loaded.');return URL.createObjectURL(await r.blob());})();embedCache.set(asset.path,pending);pending.catch(()=>{if(embedCache.get(asset.path)===pending)embedCache.delete(asset.path);});}
 return pending;
}
async function hydrateEmbeds() {
 for(const el of $('preview').querySelectorAll?.('[data-embed]')||[]){const asset=resolveAttachment(el.dataset.embed);if(!asset)continue;
  try{const url=await loadAttachment(asset);if(asset.mime.startsWith('image/')){const img=document.createElement('img');img.src=url;img.alt=asset.path;img.className='note-image';el.replaceChildren(img);}else{const a=document.createElement('a');a.href=url;a.download=asset.path.split('/').pop();a.textContent='Download '+a.download;a.className='attachment-link';el.replaceChildren(a);}}catch{}
 }
}
function renderProperties() {const el=$('properties');if(!el?.replaceChildren)return;const meta=notes.find(n=>n.path===current?.path)?.frontmatter||{};el.replaceChildren();if(settings.propertiesInDocument==='hidden'||!Object.keys(meta).length){el.hidden=true;return;}
 if(settings.propertiesInDocument==='source'){const raw=String(current?.content??'').match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0];if(!raw){el.hidden=true;return;}el.hidden=false;const pre=document.createElement('pre');pre.className='properties-source';pre.textContent=raw;el.append(pre);return;}
 el.hidden=false;for(const [key,value]of Object.entries(meta)){const row=document.createElement('div');row.className='property-row';const k=document.createElement('span');k.className='property-key';k.textContent=key;const v=document.createElement('span');v.className='property-value';v.textContent=Array.isArray(value)?value.join(', '):String(value);row.append(k,v);el.append(row);}}
function renderContext() {
 for(const id of ['backlinks','outgoing','outline'])$(id).replaceChildren();const incoming=current?notes.filter(n=>n.resolved?.some(l=>l.path===current.path)):[];$('backlinkCount').textContent=incoming.length;
 for(const n of incoming){const b=button(title(n.path),()=>requestOpen(n.path));$('backlinks').append(b);}
 const outgoing=notes.find(n=>n.path===current?.path)?.resolved||[];for(const link of outgoing){const b=button(link.target+(link.path?'':' (not created)'),()=>followLink(link.target));$('outgoing').append(b);}
 for(const [index,line]of (current?.type==='note'?$('editor').value||'':'').split('\n').entries())if(/^#{1,6} /.test(line)){const b=button(line.replace(/^#+ /,''),()=>{setMode('edit');const pos=$('editor').value.split('\n').slice(0,index).join('\n').length+(index?1:0);if(liveEditor&&settings.livePreview){liveEditor.focus();liveEditor.setSelection(pos,pos);}else{$('editor').focus();$('editor').setSelectionRange(pos,pos);}});b.style&&(b.style.paddingLeft=((line.match(/^#+/)[0].length-1)*12+8)+'px');$('outline').append(b);}
 for(const [id,text]of [['backlinks','No backlinks found.'],['outgoing','No outgoing links found.'],['outline','No headings found.']])if(!$(id).children.length)empty($(id),text);
}
function setRightPanel(panel){rightPanel=panel;for(const name of ['backlinks','outgoing','outline']){$(name+'Section').hidden=name!==panel;$(name+'Tab').classList.toggle('active',name===panel);$(name+'Tab').setAttribute('aria-selected',String(name===panel));}}
function followLink(target) {const board=whiteboards.find(n=>n.path===target.split('#')[0]);if(board){requestOpen(board.path,'whiteboard');return;}const clean=target.split('#')[0].trim().replace(/\.md$/i,'');let decoded=clean;try{decoded=decodeURIComponent(clean);}catch{}const known=notes.find(n=>n.path===current?.path)?.resolved?.find(l=>l.target===decoded)?.path;const match=notes.filter(n=>title(n.path).toLowerCase()===decoded.toLowerCase());const found=known||notes.find(n=>n.path.toLowerCase()===(decoded+'.md').toLowerCase())?.path||(match.length===1?match[0].path:null);if(found)requestOpen(found);else newDialog(decoded+'.md');}
function newDialog(name='',action='new',target=current) {
 if(action==='new'&&!name)return newNote();
 dialogAction=action;dialogTarget=target?{...target}:null;
 copyDraft=action==='copy'?(target===current?(current?.type==='whiteboard'?current.content:current?.type==='canvas'?JSON.stringify(canvasState,null,2):getText()):target?.content??''):null;
 $('newPath').value=name;$('newError').textContent='';
 $('newDialogTitle').textContent={new:'New note',copy:'Make a copy',rename:'Rename file',move:'Move file',folder:'New folder',canvas:'New canvas',whiteboard:'New whiteboard'}[action];
 $('newPathLabel').textContent=action==='move'?'Destination path in vault':'Name';
 $('confirmNew').textContent=action==='rename'?'Rename':action==='move'?'Move':action==='copy'?'Create copy':'Create';
 const suggestions=$('destinationPaths');suggestions.replaceChildren();
 if(action==='move'&&target){const basename=target.path.split('/').pop();for(const folder of ['',...folders]){const option=document.createElement('option');option.value=(folder?folder+'/':'')+basename;suggestions.append(option);}}
 $('newDialog').showModal();$('newPath').focus();$('newPath').select?.();
}
async function createNote(name,content=null){if(!/\.md$/i.test(name))name+='.md';await api('note',{path:name,content:content??'',revision:null});await refresh();return name;}
let creatingNote=false, titleTarget=null;
const newFileTypes={
 note:{extension:'.md',create:name=>createNote(name)},
 whiteboard:{extension:'.excalidraw',create:name=>api('whiteboard',{path:name,content:JSON.stringify({type:'excalidraw',version:2,source:'Slate',elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}}),revision:null}).then(refresh)},
 canvas:{extension:'.canvas',create:name=>api('canvas',{path:name,content:JSON.stringify({nodes:[],edges:[]}),revision:null}).then(refresh)}
};
async function newFile(type,folder=''){
 if(type==='whiteboard'&&!excalidrawEnabled()){message('Excalidraw is disabled. Turn it on in Settings › Core plugins › Excalidraw to create whiteboards.');return;}
 if(creatingNote)return;creatingNote=true;
 try{
  await refresh();
  const {extension,create}=newFileTypes[type],prefix=folder?folder.replace(/\/$/,'')+'/':'';
  const paths=new Set([...notes,...canvases,...whiteboards,...drafts.values()].map(note=>note.path.toLowerCase()));
  let name=prefix+'Untitled'+extension,index=1;
  while(paths.has(name.toLowerCase()))name=prefix+'Untitled '+(index++)+extension;
  await create(name);
  if(type==='note'){await openNote(name);setMode('edit');if(settings.livePreview&&liveEditor)liveEditor.focus();else $('editor').focus();}
  else await openNote(name,type);
  schedulePersist();
 }catch(error){message(error.message);}finally{creatingNote=false;}
}
function newNote(folder=newNoteFolder()){return newFile('note',folder);}
async function renameNoteTitle(target,value){
 const old=target.path,name=value.trim();
 if(name===title(old))return;
 if(!name||/[\\/:*?"<>|\r\n]/.test(name)||/[. ]$/.test(name))throw new Error('Enter a valid note title without slashes or filename punctuation.');
 if(saving)throw new Error('A save is in progress. Try renaming again.');
 if(target.dirty&&!await save(target))throw new Error('Save the note successfully before changing its title.');
 saving=true;
 clearTimeout(autoSaveTimers.get(old));autoSaveTimers.delete(old);
 try{
  const newPath=old.slice(0,old.lastIndexOf('/')+1)+name+'.md';
  const result=await api('rename',{path:old,newPath,revision:target.revision,updateLinks:!!settings.alwaysUpdateLinks});
  drafts.delete(old);target.path=result.path;target.revision=result.revision;drafts.set(result.path,target);
  tabs=tabs.map(tab=>tab.path===old?{...tab,path:result.path}:tab);
  bookmarks=bookmarks.map(path=>path===old?result.path:path);historyPaths=historyPaths.map(path=>path===old?result.path:path);if(explorerPins.delete(old))explorerPins.add(result.path);
  if(activeTab===old)activeTab=result.path;
  await refresh();
  for(const note of notes){const draft=drafts.get(note.path);if(draft&&!draft.dirty)Object.assign(draft,{content:note.content,original:note.content,revision:note.revision});}
  if(current?.type==='note'&&activeTab===current.path){
   $('title').textContent=title(current.path);$('notePath').textContent=current.path;renderBreadcrumb(current.path);
   if(!current.dirty)setText(current.content);
  }
  renderTabs();renderFiles();update();schedulePersist();message();
 }finally{saving=false;if(target.dirty)queueAutoSave(target);}
}
async function commitNoteTitle(){
 const target=titleTarget,value=$('title').textContent;titleTarget=null;
 if(!target)return;
 try{await renameNoteTitle(target,value);}catch(error){message(error.message);}
 finally{if(current===target&&activeTab===target.path)$('title').textContent=title(target.path);}
}
async function handleNew(e){e.preventDefault();const submit=$('confirmNew');submit.disabled=true;
 try{let name=$('newPath').value.trim();
 if(dialogAction==='folder'){await api('folder',{path:name});await refresh();}
 else if(dialogAction==='rename'||dialogAction==='move'){
  const target=dialogTarget;if(!target)throw new Error('No file selected.');
  if(drafts.get(target.path)?.dirty)throw new Error('Save this file before renaming or moving it.');
  const old=target.path,wasActive=activeTab===old;
  const result=await api('rename',{path:old,newPath:name,revision:target.revision,updateLinks:!!settings.alwaysUpdateLinks});
  drafts.delete(old);tabs=tabs.map(tab=>tab.path===old?{...tab,path:result.path}:tab);bookmarks=bookmarks.map(path=>path===old?result.path:path);historyPaths=historyPaths.map(path=>path===old?result.path:path);if(explorerPins.delete(old))explorerPins.add(result.path);
  await refresh();
  for(const note of notes){const draft=drafts.get(note.path);if(draft&&!draft.dirty)Object.assign(draft,{content:note.content,original:note.content,revision:note.revision});}
  if(wasActive)await openNote(result.path,target.type);else{renderTabs();renderFiles();if(current?.type==='note'&&!current.dirty)setText(current.content);}
  message((dialogAction==='move'?'Moved':'Renamed')+' file. Updated '+result.updatedLinks+' links.');
 }
 else if(dialogAction==='whiteboard'||dialogAction==='copy'&&dialogTarget?.type==='whiteboard'){
  if(!excalidrawEnabled())throw new Error('Excalidraw is disabled. Turn it on in Settings › Core plugins › Excalidraw.');
  if(!/\.excalidraw$/i.test(name))name+='.excalidraw';await api('whiteboard',{path:name,content:copyDraft||JSON.stringify({type:'excalidraw',version:2,source:'Slate',elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}}),revision:null});await refresh();await openNote(name,'whiteboard');
 }
 else if(dialogAction==='canvas'||dialogAction==='copy'&&dialogTarget?.type==='canvas'){
  if(!name.endsWith('.canvas'))name+='.canvas';await api('canvas',{path:name,content:copyDraft||JSON.stringify({nodes:[],edges:[]}),revision:null});await refresh();await openNote(name,'canvas');
 }else{const folder=newNoteFolder();if(dialogAction==='new'&&folder&&!name.includes('/'))name=folder+'/'+name;name=await createNote(name,copyDraft);await openNote(name);}
 $('newDialog').close();schedulePersist();
 }catch(error){$('newError').textContent=error.message;}finally{submit.disabled=false;}}

function toggleBookmark(){if(!current)return;if(bookmarks.includes(current.path))bookmarks=bookmarks.filter(p=>p!==current.path);else bookmarks.push(current.path);syncBookmarkButton();renderFiles();schedulePersist();}
function formatDailyDate(date,format){const pad=n=>String(n).padStart(2,'0');return String(format||'YYYY-MM-DD').replace(/YYYY/g,date.getFullYear()).replace(/MM/g,pad(date.getMonth()+1)).replace(/DD/g,pad(date.getDate()));}
async function dailyNote(){const date=formatDailyDate(new Date(),settings.dailyFormat);const name=(settings.dailyFolder?settings.dailyFolder.replace(/\/$/,'')+'/':'')+date+'.md';try{if(!notes.some(n=>n.path===name))await createNote(name);await openNote(name);}catch(e){message(e.message);}}
async function chooseVault(){if(desktop){switchWorkspaceVault(()=>desktop.selectVault());}else message('Open another folder from the desktop app, or restart browser mode with --vault "folder path".');}
function commands(){return [
 ['Change current file icon',()=>current&&openIconPicker(current.path,current.type),'Ctrl Shift J'],['Create new note',()=>newDialog(),'Ctrl N'],['Open quick switcher',()=>openPalette('notes'),'Ctrl O'],['Open tasks',()=>requestOpen('@tasks','tasks')],['Create new task',()=>openTaskDialog()],['Edit task at cursor',editTaskAtCursor],['Toggle task at cursor',toggleTaskAtCursor,'Ctrl Enter'],['Open file recovery',openRecovery],['Open graph view',()=>{graphLocal=false;requestOpen('@graph','graph');}],['Open local graph',()=>{graphLocal=true;requestOpen('@graph','graph');}],['Create new whiteboard',()=>newDialog('Untitled.excalidraw','whiteboard')],['Create new canvas',()=>newDialog('Untitled.canvas','canvas')],['Open today’s daily note',dailyNote],['Insert template',()=>openPalette('templates')],['Toggle reading view',()=>setMode(mode==='edit'?'preview':'edit'),'Ctrl E'],['Toggle live preview',()=>{settings.livePreview=!settings.livePreview;applySettings();schedulePersist();}],['Save current file',save,'Ctrl S'],['Save a copy',()=>newDialog(current?current.path.replace(/\.(md|canvas|excalidraw)$/,' copy.$1'):'','copy')],['Rename current file',()=>current&&afterSafe(()=>newDialog(current.path,'rename'))],['Toggle split preview',()=>{split=!split;setMode('edit');}],['Toggle left sidebar',()=>{leftClosed=!leftClosed;applySettings();schedulePersist();}],['Toggle right sidebar',()=>{rightClosed=!rightClosed;applySettings();schedulePersist();}],['Open another vault',chooseVault],['Open settings',()=>openSettings(),'Ctrl ,'],['Search all files',()=>setSidebar('search'),'Ctrl Shift F'],['Bookmark current file',toggleBookmark],['Open random note',()=>notes.length&&requestOpen(notes[Math.floor(Math.random()*notes.length)].path)],['Refresh vault',()=>refresh().catch(e=>message(e.message))]
 ].filter(item=>item[0]!=='Create new whiteboard'||excalidrawEnabled()).map(([label,action,info])=>({label,action,info:info||''}));}
function openPalette(kind){paletteKind=kind;paletteIndex=0;paletteItems=kind==='commands'?commands():kind==='templates'?notes.filter(n=>n.path.startsWith(settings.templateFolder.replace(/\/$/,'')+'/')).map(n=>({label:title(n.path),info:n.path,action:()=>insertTemplate(n)})):allFiles().map(n=>({label:title(n.path),info:n.path,action:()=>requestOpen(n.path,n.type)}));$('paletteInput').value='';$('paletteInput').placeholder=kind==='commands'?'Type a command…':kind==='templates'?'Choose a template…':'Type a note name…';$('paletteDialog').showModal();renderPalette();$('paletteInput').focus();}
function renderPalette(){const q=$('paletteInput').value.toLowerCase();paletteVisible=paletteItems.filter(i=>(i.label+' '+i.info).toLowerCase().includes(q));paletteIndex=Math.max(0,Math.min(paletteIndex,paletteVisible.length-1));$('paletteResults').replaceChildren();paletteVisible.forEach((item,index)=>{const b=button('',()=>{$('paletteDialog').close();item.action();},'palette-result'+(index===paletteIndex?' chosen':''));b.innerHTML='<span>'+esc(item.label)+'</span><span class="result-info">'+esc(item.info)+'</span>';b.setAttribute('role','option');b.setAttribute('aria-selected',String(index===paletteIndex));$('paletteResults').append(b);});if(!paletteVisible.length)empty($('paletteResults'),paletteKind==='templates'?'No templates found in '+settings.templateFolder+'.':'No matches found.');}
function insertText(text){if(!current||current.type!=='note')return;if(mode!=='edit')setMode('edit');const el=$('editor');const selection=settings.livePreview?liveEditor?.getSelection?.():null;const at=selection?.from??el.selectionStart??getText().length;const value=getText();const next=value.slice(0,at)+text+value.slice(selection?.to??el.selectionEnd??at);setText(next);draftChanged(next);if(liveEditor&&settings.livePreview){liveEditor.focus();liveEditor.setSelection(at+text.length,at+text.length);}else{el.focus();el.setSelectionRange(at+text.length,at+text.length);}}
function insertTemplate(note){const now=new Date();insertText(note.content.replace(/\{\{title\}\}/g,current?title(current.path):'').replace(/\{\{date\}\}/g,now.toLocaleDateString('en-CA')).replace(/\{\{time\}\}/g,now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));}
let lastSettingsPage='general';
function openSettings(page){lastSettingsPage=page||lastSettingsPage;const dialog=$('settingsDialog');if(!dialog.open)dialog.showModal();renderSettings(lastSettingsPage);}
function renderAccentSetting(host) {
 const appearance=window.SlateAppearance;if(!appearance)return;
 const row=document.createElement('div');row.className='setting-row accent-setting';
 const details=document.createElement('div');details.innerHTML='<div class="setting-name">Accent color</div><div class="setting-description">Choose the accent color used throughout the app.</div>';
 const controls=document.createElement('div');controls.className='accent-controls';
 const presets=document.createElement('div');presets.className='accent-presets';presets.setAttribute('role','group');presets.setAttribute('aria-label','Accent color presets');
 const custom=document.createElement('div');custom.className='accent-custom';
 const picker=document.createElement('input');picker.type='color';picker.id='accentColorPicker';picker.setAttribute('aria-label','Custom accent color');
 const hex=document.createElement('input');hex.type='text';hex.id='accentColorHex';hex.maxLength=7;hex.spellcheck=false;hex.setAttribute('aria-label','Accent hex color');hex.setAttribute('aria-describedby','accentColorError');
 const error=document.createElement('p');error.id='accentColorError';error.className='accent-error';error.setAttribute('role','alert');
 const reset=button('',()=>setAccent(appearance.defaultColor),'accent-reset');reset.innerHTML=icon('rotate-ccw');reset.setAttribute('aria-label','Reset accent color to purple');reset.dataset.tooltip='Restore default';
 function sync() {
  const selected=appearance.normalize(settings.accentColor);picker.value=selected;hex.value=selected;hex.removeAttribute('aria-invalid');error.textContent='';
  for(const b of presets.children)b.setAttribute('aria-pressed',String(b.dataset.color===selected));
  reset.disabled=selected===appearance.defaultColor;
 }
 function setAccent(color) {settings.accentColor=appearance.normalize(color);appearance.apply(document.documentElement,settings.accentColor);storage.set('settings',settings);schedulePersist();sync();}
 for(const [label,color] of appearance.presets) {
  const b=button('',()=>setAccent(color),'accent-preset');b.dataset.color=color;b.dataset.tooltip=label;b.setAttribute('aria-label',label+' accent');
  const dot=document.createElement('span');dot.className='accent-dot';dot.style.backgroundColor=color;dot.style.color=appearance.tokens(color,'dark').on;dot.innerHTML=icon('check');b.append(dot);presets.append(b);
 }
 picker.oninput=()=>setAccent(picker.value);
 hex.onchange=()=>{if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.value.trim())){hex.setAttribute('aria-invalid','true');error.textContent='Enter a hex color such as #2563eb.';return;}setAccent(hex.value.trim());};
 hex.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();hex.onchange();}};
 custom.append(picker,hex,reset);controls.append(presets,custom,error);row.append(details,controls);host.append(row);sync();
}
function renderSettings(page){
 lastSettingsPage=page;
 const host=$('settingsContent');host.replaceChildren();
 document.querySelectorAll?.('[data-settings]').forEach(b=>{b.classList.toggle('active',b.dataset.settings===page);if(b.dataset.settings===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const titles={general:'General',editor:'Editor',files:'Files and links',appearance:'Appearance',hotkeys:'Hotkeys',daily:'Daily notes',templates:'Templates',tasks:'Tasks',dataview:'Dataview',excalidraw:'Excalidraw'};
 const h=document.createElement('h2');h.textContent=titles[page]||'Settings';host.append(h);
 const save=()=>{applySettings();schedulePersist();};
 const group=heading=>{if(heading){const titleEl=document.createElement('h3');titleEl.className='setting-group-heading';titleEl.textContent=heading;host.append(titleEl);}const items=document.createElement('div');items.className='setting-items';host.append(items);return items;};
 const info=(container,label,description)=>{const r=document.createElement('div');r.className='setting-row';const d=document.createElement('div');d.className='setting-info';d.innerHTML='<div class="setting-name">'+esc(label)+'</div>'+(description?'<div class="setting-description">'+esc(description)+'</div>':'');r.append(d);container.append(r);return r;};
 const controlOf=rowEl=>{const c=document.createElement('div');c.className='setting-control';rowEl.append(c);return c;};
 const toggle=(container,label,description,get,set)=>{const r=info(container,label,description);const c=controlOf(r);const input=document.createElement('input');input.type='checkbox';input.checked=!!get();input.setAttribute('aria-label',label);input.onchange=()=>{set(input.checked);save();};c.append(input);return input;};
 const select=(container,label,description,get,set,choices,onChange)=>{const r=info(container,label,description);const c=controlOf(r);const input=document.createElement('select');for(const [value,text]of choices){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}input.value=get();input.setAttribute('aria-label',label);input.onchange=()=>{set(input.value);save();onChange?.(input.value);};c.append(input);window.SlateSelect?.enhance(r,icon);return input;};
 const text=(container,label,description,get,set,options={})=>{const r=info(container,label,description);const c=controlOf(r);const input=document.createElement('input');input.type='text';input.value=get()??'';input.setAttribute('aria-label',label);if(options.placeholder)input.placeholder=options.placeholder;if(options.list)input.setAttribute('list',options.list);input.spellcheck=false;input.onchange=()=>{set(input.value);save();options.onChange?.(input.value);};input.oninput=()=>options.onInput?.(input.value);c.append(input);return {row:r,input};};
 const slider=(container,label,description,get,set,{min,max,step=1,format=value=>value+'px',resetValue}={})=>{const r=info(container,label,description);const c=controlOf(r);let reset=null;if(resetValue!==undefined){reset=button('','', 'setting-reset');reset.innerHTML=icon('rotate-ccw');reset.setAttribute('aria-label','Restore default');reset.dataset.tooltip='Restore default';c.append(reset);}const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=get();input.setAttribute('aria-label',label);const value=document.createElement('span');value.className='setting-value';const sync=()=>{value.textContent=format(Number(input.value));if(reset)reset.disabled=Number(input.value)===resetValue;};input.oninput=()=>{set(Number(input.value));sync();save();};if(reset)reset.onclick=()=>{input.value=resetValue;input.oninput();};c.append(input,value);sync();return input;};
 const action=(container,label,description,buttonText,onClick,cta=false)=>{const r=info(container,label,description);const c=controlOf(r);const b=button(buttonText,onClick,cta?'primary':'');c.append(b);return b;};
 const note=text=>{const p=document.createElement('p');p.className='muted settings-note';p.textContent=text;host.append(p);};
 if(page==='general'){
  const g=group();
  info(g,'Slate','Version 0.1.0 · An independent local Markdown workspace. Your notes stay in your vault folder, and no community plugin code runs.');
  info(g,'Appearance','Base color scheme, accent color, fonts, and interface toggles live under Appearance in the sidebar.');
  const adv=group('Advanced');
  action(adv,'Restore default settings','Reset appearance, editor, and file settings to their defaults. Your notes and vault are not changed.','Restore defaults',()=>{if(typeof window.confirm==='function'&&!window.confirm('Restore default settings? This resets Slate preferences, but does not change your notes.'))return;const ribbonOrder=settings.ribbonOrder;settings={...defaultSettings,ribbonOrder};applySettings();schedulePersist();renderSettings('general');});
 }
 if(page==='editor'){
  const g=group();
  select(g,'Default view for new tabs','The default view that a new Markdown tab gets opened in.',()=>settings.defaultViewMode,v=>{settings.defaultViewMode=v;},[['editing','Editing view'],['reading','Reading view']]);
  select(g,'Default editing mode','The default editing mode a new tab will start with.',()=>settings.livePreview?'live':'source',v=>{settings.livePreview=v==='live';},[['live','Live Preview'],['source','Source mode']]);
  const display=group('Display');
  toggle(display,'Readable line length','Limit maximum line length. Less content fits onscreen, but long blocks of text are more readable.',()=>settings.lineWidth,v=>{settings.lineWidth=v;});
  toggle(display,'Strict line breaks','Markdown specs ignore single line breaks in reading view. Turn this off to make single line breaks visible.',()=>settings.strictLineBreaks,v=>{settings.strictLineBreaks=v;});
  select(display,'Properties in document','Choose how properties are displayed at the top of notes. Select “source” to show properties as raw YAML.',()=>settings.propertiesInDocument,v=>{settings.propertiesInDocument=v;},[['visible','Visible'],['hidden','Hidden'],['source','Source']]);
  toggle(display,'Line numbers','Show line numbers in the gutter.',()=>settings.showLineNumber,v=>{settings.showLineNumber=v;});
  toggle(display,'Right-to-left (RTL)','Sets the default text direction of notes to right-to-left.',()=>settings.rightToLeft,v=>{settings.rightToLeft=v;});
  const behavior=group('Behavior');
  toggle(behavior,'Spellcheck','Turn on the spellchecker.',()=>settings.spellcheck,v=>{settings.spellcheck=v;});
  toggle(behavior,'Automatically save changes','Save continuously and merge external note changes automatically.',()=>settings.autoSave,v=>{settings.autoSave=v;if(v)for(const draft of drafts.values())if(draft.dirty)queueAutoSave(draft);});
  toggle(behavior,'Indent using tabs','Use tabs to indent by pressing the “Tab” key. Turn this off to indent using 4 spaces.',()=>settings.useTab,v=>{settings.useTab=v;});
  slider(behavior,'Indent visual width','Number of spaces a tab character will render as.',()=>settings.tabSize,v=>{settings.tabSize=v;},{min:2,max:8,step:1,format:value=>String(value),resetValue:4});
 }
 if(page==='appearance'){
  const g=group();
  select(g,'Base color scheme','Choose the default color scheme.',()=>settings.theme,v=>{settings.theme=v;},[['dark','Dark'],['light','Light'],['system','Adapt to system']]);
  renderAccentSetting(g);
  const iface=group('Interface');
  toggle(iface,'Inline title','Display the filename as an editable title inline with the file contents.',()=>settings.showTitle,v=>{settings.showTitle=v;});
  toggle(iface,'Show tab title bar','Display the header at the top of every tab.',()=>settings.showViewHeader,v=>{settings.showViewHeader=v;});
  toggle(iface,'Show ribbon','Display vertical toolbar on the side of the window.',()=>settings.showRibbon,v=>{settings.showRibbon=v;});
  const fonts=group('Font');
  text(fonts,'Interface font','Set base font for all of Slate.',()=>settings.interfaceFont,v=>{settings.interfaceFont=v;},{placeholder:'Enter font name...',list:'slateFontSuggestions'});
  text(fonts,'Text font','Set font for editing and reading views.',()=>settings.font,v=>{settings.font=v;},{placeholder:'Enter font name...',list:'slateFontSuggestions'});
  text(fonts,'Monospace font','Set font for places like code blocks and frontmatter.',()=>settings.monospaceFont,v=>{settings.monospaceFont=v;},{placeholder:'Enter font name...',list:'slateFontSuggestions'});
  slider(fonts,'Font size','Font size in pixels that affects editing and reading views.',()=>settings.fontSize,v=>{settings.fontSize=v;},{min:10,max:30,step:1,format:value=>value+'px',resetValue:16});
  toggle(fonts,'Quick font size adjustment','Adjust the font size using Ctrl + Scroll, or using the trackpad pinch-zoom gesture.',()=>settings.quickFontSize,v=>{settings.quickFontSize=v;});
  const list=document.createElement('datalist');list.id='slateFontSuggestions';for(const name of ['Segoe UI','Arial','Georgia','Times New Roman','Verdana','Consolas','Cascadia Mono','Courier New']){const o=document.createElement('option');o.value=name;list.append(o);}host.append(list);
 }
 if(page==='files'){
  const g=group();
  let folderRow=null;
  select(g,'Default location for new notes','Where newly created notes are placed.',()=>settings.newFileLocation||(settings.newFolder?'folder':'root'),v=>{settings.newFileLocation=v;},[['root','Vault folder'],['current','Same folder as current file'],['folder','In the folder specified below']],v=>{if(folderRow)folderRow.hidden=v!=='folder';});
  folderRow=text(g,'Folder to create new notes in','Newly created notes will appear in this folder.',()=>settings.newFolder,v=>{settings.newFolder=v;},{placeholder:'Example: folder 1/folder 2'}).row;
  folderRow.hidden=(settings.newFileLocation||(settings.newFolder?'folder':'root'))!=='folder';
  let attachFolderRow=null,attachSubRow=null;
  select(g,'Default location for new attachments','Where newly added attachments are placed.',()=>settings.attachmentLocation||(settings.attachmentFolder?'folder':'root'),v=>{settings.attachmentLocation=v;},[['root','Vault folder'],['current','Same folder as current file'],['subfolder','In subfolder under current folder'],['folder','In the folder specified below']],v=>{if(attachFolderRow)attachFolderRow.hidden=v!=='folder';if(attachSubRow)attachSubRow.hidden=v!=='subfolder';});
  attachFolderRow=text(g,'Attachment folder path','Place newly created attachment files, such as images created via drag-and-drop or audio recordings, in this folder.',()=>settings.attachmentFolder,v=>{settings.attachmentFolder=v;},{placeholder:'Attachments'}).row;
  attachSubRow=text(g,'Subfolder name','If your file is in “vault/folder”, and you set subfolder name to “attachments”, attachments will be saved to “vault/folder/attachments”.',()=>settings.attachmentSubfolder,v=>{settings.attachmentSubfolder=v;},{placeholder:'Attachments'}).row;
  const attachMode=settings.attachmentLocation||(settings.attachmentFolder?'folder':'root');attachFolderRow.hidden=attachMode!=='folder';attachSubRow.hidden=attachMode!=='subfolder';
  const links=group('Links');
  toggle(links,'Automatically update internal links','Turn off to keep existing links unchanged after renaming a file.',()=>settings.alwaysUpdateLinks,v=>{settings.alwaysUpdateLinks=v;});
  const trash=group('Trash');
  toggle(trash,'Confirm before deleting files','Avoid accidentally deleting files.',()=>settings.promptDelete,v=>{settings.promptDelete=v;});
  info(trash,'Deleted files','Files you delete are kept in the vault’s .slate-recovery folder and can be restored from File recovery.');
  note('Existing .obsidian settings and plugins are not loaded.');
 }
 if(page==='hotkeys'){renderHotkeys(host,group,info,note);}
 if(page==='daily'){
  const g=group();
  const formatRow=text(g,'Date format','Choose how daily notes are named in your vault.',()=>settings.dailyFormat,v=>{settings.dailyFormat=v||'YYYY-MM-DD';},{placeholder:'YYYY-MM-DD',onInput:value=>{formatRow.input.setAttribute('aria-description','Example: '+formatDailyDate(new Date(),value||'YYYY-MM-DD'));}});
  info(g,'Date format preview','Your current syntax looks like this: '+formatDailyDate(new Date(),settings.dailyFormat||'YYYY-MM-DD'));
  text(g,'New file location','New daily notes will be placed here.',()=>settings.dailyFolder,v=>{settings.dailyFolder=v;},{placeholder:'Example: folder 1/folder 2'});
 }
 if(page==='templates'){
  const g=group();
  text(g,'Template folder location','Files in this folder will be available as templates.',()=>settings.templateFolder,v=>{settings.templateFolder=v;},{placeholder:'Example: folder 1/folder 2'});
  note('Supported template variables: {{title}}, {{date}}, {{time}}.');
 }
 if(page==='tasks'){
  const g=group();
  text(g,'Global task filter','Only include task lines containing this text. Leave empty to include every checkbox.',()=>settings.taskGlobalFilter,v=>{settings.taskGlobalFilter=v;});
  note('Tasks are built in. Dates, priorities, basic recurrence and fenced tasks queries use Markdown files directly. Completing a recurring task creates its next occurrence. Unsupported recurrence rules return an error and leave the original task unchanged.');
 }
 if(page==='dataview'){
  const g=group();
  toggle(g,'Dataview','Render dataview blocks and inline expressions in reading view and live preview.',()=>settings.dataviewEnabled!==false,v=>{settings.dataviewEnabled=v;window.SlateDataview?.reset();liveEditor?.refreshTasks?.();});
  toggle(g,'JavaScript queries','Run dataviewjs blocks and $= expressions in an isolated worker with read-only note data and a five second time limit.',()=>!!settings.dataviewJavascript,v=>{settings.dataviewJavascript=v;window.SlateDataview?.reset();liveEditor?.refreshTasks?.();});
  note('DQL uses the original Dataview engine. JavaScript supports data queries and standard list, table, task, and text output. Obsidian app APIs, DOM access, dv.view, and CSV sources are not available. Calendar queries show a chronological date table.');
 }
 if(page==='excalidraw'){
  const g=group();
  toggle(g,'Excalidraw','Create and edit whiteboards with the embedded Excalidraw editor. Turning this off hides whiteboard creation and stops whiteboards from opening.',()=>excalidrawEnabled(),v=>{settings.excalidrawEnabled=v;if(!v)disableWhiteboardView();});
  info(g,'Whiteboard files',whiteboards.length===1?'1 whiteboard in this vault.':whiteboards.length+' whiteboards in this vault.');
  note('Existing .excalidraw files stay in your vault untouched and will open again when Excalidraw is turned back on.');
 }
}
function renderHotkeys(host,group,info,note){
 const g=group();
 const searchRow=info(g,'Search hotkeys','');
 const descEl=searchRow.querySelector('.setting-description');
 const control=document.createElement('div');control.className='setting-control';searchRow.append(control);
 const input=document.createElement('input');input.type='search';input.placeholder='Filter...';input.setAttribute('aria-label','Search hotkeys');control.append(input);
 const chips=document.createElement('div');chips.className='hotkey-filters';let filter='all';
 for(const [value,label] of [['all','All'],['assigned','Assigned'],['unassigned','Unassigned']]){const b=button(label,()=>{filter=value;for(const chip of chips.children)chip.classList.toggle('active',chip.dataset.filter===value);draw();},'hotkey-chip'+(value==='all'?' active':''));b.dataset.filter=value;chips.append(b);}
 g.append(chips);
 const list=document.createElement('div');list.className='hotkey-list';host.append(list);
 const all=commands();
 function draw(){
  const q=input.value.trim().toLowerCase();
  const visible=all.filter(item=>{const assigned=!!item.info;if(filter==='assigned'&&!assigned)return false;if(filter==='unassigned'&&assigned)return false;return !q||item.label.toLowerCase().includes(q);});
  if(descEl)descEl.textContent='Showing '+visible.length+(visible.length===1?' hotkey.':' hotkeys.');
  list.replaceChildren();
  for(const item of visible){const r=document.createElement('div');r.className='setting-row hotkey-row';const name=document.createElement('div');name.className='setting-name';name.textContent=item.label;const c=document.createElement('div');c.className='setting-control';if(item.info){const kbd=document.createElement('kbd');kbd.className='hotkey-kbd';kbd.textContent=item.info.split(/\s+/).join('+');c.append(kbd);}else{const blank=document.createElement('span');blank.className='muted';blank.textContent='Blank';c.append(blank);}r.append(name,c);list.append(r);}
  if(!visible.length)empty(list,'No hotkeys match your filter.');
 }
 input.oninput=draw;draw();
 note('Hotkeys cannot be changed in this version of Slate.');
}
function renderGraph(){window.SlateGraphView.render({notes,attachments,current:current?.type==='note'?current.path:null,local:graphLocal,onOpen(node){if(node.type==='file')requestOpen(node.id);else if(node.type==='unresolved')followLink(node.target);else if(node.type==='tag'){setSidebar('search');$('search').value='tag:'+node.label;renderFiles();}}});}
function canvasChanged(){if(!current)return;current.content=JSON.stringify(canvasState,null,2);current.dirty=true;dirty=true;renderTabs();schedulePersist();queueAutoSave(current);}
function renderCanvas(){if(!canvasState)return;const host=$('canvasCards');host.replaceChildren();host.style.transform='scale('+canvasZoom+')';for(const node of canvasState.nodes){const card=document.createElement('div');card.className='canvas-card'+(canvasSelected===node.id?' selected':'');card.style.left=node.x+'px';card.style.top=node.y+'px';card.style.width=node.width+'px';card.style.height=node.height+'px';card.dataset.id=node.id;const header=document.createElement('div');header.className='canvas-card-header';header.innerHTML=icon(node.type==='file'?'file':'text')+'<span>'+esc(node.type==='file'?title(node.file):'Text')+'</span>';const remove=button('',()=>{canvasState.nodes=canvasState.nodes.filter(n=>n.id!==node.id);canvasState.edges=canvasState.edges.filter(e=>e.fromNode!==node.id&&e.toNode!==node.id);canvasChanged();renderCanvas();});remove.innerHTML=icon('x');remove.dataset.tooltip='Remove card';remove.setAttribute('aria-label','Remove card');header.append(remove);const content=document.createElement('div');content.className='canvas-card-content';content.textContent=node.type==='file'?(notes.find(n=>n.path===node.file)?.content||node.file):node.text||'';card.append(header,content);card.onclick=e=>{if(e.target.closest('button'))return;if(canvasLinkFrom&&canvasLinkFrom!==node.id){canvasState.edges.push({id:crypto.randomUUID(),fromNode:canvasLinkFrom,fromSide:'right',toNode:node.id,toSide:'left'});canvasLinkFrom=null;$('canvasHint').textContent='Cards connected';canvasChanged();}canvasSelected=node.id;host.querySelectorAll('.canvas-card').forEach(c=>c.classList.toggle('selected',c.dataset.id===node.id));renderCanvasEdges();};content.ondblclick=()=>{if(node.type==='file'){requestOpen(node.file);return;}const ta=document.createElement('textarea');ta.value=node.text||'';content.replaceChildren(ta);ta.focus();ta.oninput=()=>{node.text=ta.value;canvasChanged();};ta.onblur=()=>renderCanvas();};header.onpointerdown=e=>{if(e.target.closest('button'))return;e.preventDefault();const start={x:e.clientX,y:e.clientY,nx:node.x,ny:node.y};header.setPointerCapture(e.pointerId);header.onpointermove=move=>{node.x=Math.round(start.nx+(move.clientX-start.x)/canvasZoom);node.y=Math.round(start.ny+(move.clientY-start.y)/canvasZoom);card.style.left=node.x+'px';card.style.top=node.y+'px';renderCanvasEdges();};header.onpointerup=()=>{header.onpointermove=null;header.onpointerup=null;canvasChanged();};};host.append(card);}renderCanvasEdges();}
function renderCanvasEdges(){const svg=$('canvasEdges');svg.replaceChildren();if(!canvasState)return;for(const edge of canvasState.edges){const a=canvasState.nodes.find(n=>n.id===edge.fromNode),b=canvasState.nodes.find(n=>n.id===edge.toNode);if(!a||!b)continue;const x1=(a.x+a.width)*canvasZoom,y1=(a.y+a.height/2)*canvasZoom,x2=b.x*canvasZoom,y2=(b.y+b.height/2)*canvasZoom;const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',`M${x1} ${y1} C${x1+70} ${y1},${x2-70} ${y2},${x2} ${y2}`);svg.append(p);}}
function addCanvasCard(type='text',file=null){if(!canvasState)return;const index=canvasState.nodes.length;canvasState.nodes.push({id:crypto.randomUUID(),type,x:80+(index%3)*290,y:70+Math.floor(index/3)*200,width:260,height:170,...(type==='file'?{file}:{text:'New card'})});canvasChanged();renderCanvas();}
async function uploadAttachment(file){if(!current||current.type!=='note'){message('Open a note before inserting an attachment.');return;}try{const buffer=new Uint8Array(await file.arrayBuffer());if(buffer.length>8*1024*1024)throw new Error('Attachment exceeds 8 MiB.');let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));const folder=attachmentFolderFor();const name=(folder?folder+'/':'')+file.name;await api('attachment',{path:name,base64:btoa(binary)});await refresh();insertText('![['+name+']]');}catch(e){message(e.message);}}
function initEvents(){
 if(window.SlateRibbon)ribbonLayout=window.SlateRibbon.mount(document.querySelector('.ribbon-tools'),{
  getOrder:()=>settings.ribbonOrder,
  onChange:order=>{settings.ribbonOrder=order;storage.set('settings',settings);schedulePersist();},
  openMenu:(items,event,label)=>contextMenus.open(items,event,label),
 });
 document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.target?.closest?.('.cm-editor,.slate-editor-host,#editor,#title'))document.documentElement.dataset.keyboardNavigation='true';},true);
 document.addEventListener('pointerdown',()=>{document.documentElement.dataset.keyboardNavigation='false';},true);
 $('editor').oninput=()=>{resizeEditor();draftChanged($('editor').value);};$('editor').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();const el=$('editor');el.setRangeText(settings.useTab?'\t':'    ',el.selectionStart,el.selectionEnd,'end');el.dispatchEvent(new Event('input'));}};
 const noteViewEl=$('noteView');noteViewEl?.addEventListener?.('wheel',e=>{if(!settings.quickFontSize||!e.ctrlKey)return;e.preventDefault();settings.fontSize=Math.max(10,Math.min(30,(Number(settings.fontSize)||16)+(e.deltaY<0?1:-1)));applySettings();schedulePersist();const range=document.getElementById('settingsContent')?.querySelector?.('input[type=range][aria-label="Font size"]');if(range){range.value=settings.fontSize;range.dispatchEvent(new Event('input')); }},{passive:false});
 $('search').oninput=renderFiles;$('caseButton').onclick=()=>{$('caseButton').classList.toggle('active');renderFiles();};
 for(const name of ['files','search','bookmarks','tags'])$(name+'Button').onclick=()=>setSidebar(name);
 for(const name of ['backlinks','outgoing','outline'])$(name+'Tab').onclick=()=>setRightPanel(name);
 $('toggleLeft').onclick=()=>{leftClosed=!leftClosed;applySettings();schedulePersist();};$('toggleRight').onclick=()=>{rightClosed=!rightClosed;applySettings();schedulePersist();};$('tabsMenuButton').onclick=showTabsMenu;
 $('title').onfocus=()=>{titleTarget=current?.type==='note'&&activeTab===current.path?current:null;};
 $('title').onblur=commitNoteTitle;
 $('title').onkeydown=e=>{
  if(e.key==='Enter'){e.preventDefault();e.stopPropagation();$('title').blur();}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(titleTarget)$('title').textContent=title(titleTarget.path);titleTarget=null;$('title').blur();}
 };
 $('whiteboardButton').onclick=()=>newFile('whiteboard');
 $('newButton').onclick=$('addTabButton').onclick=$('emptyNew').onclick=()=>newNote();$('folderButton').onclick=()=>newDialog('','folder');$('canvasButton').onclick=()=>newFile('canvas');
 $('refreshButton').onclick=()=>refresh().then(()=>message('Vault index refreshed. Open tabs retain their drafts.')).catch(e=>message(e.message));$('collapseButton').onclick=()=>{closedFolders=new Set(folders);renderFiles();schedulePersist();};
 $('cancelTrash').onclick=()=>{$('confirmDialog').close();trashTarget=null;};$('confirmTrash').onclick=confirmMenuTrash;
 $('viewModeButton').onclick=()=>setMode(mode==='edit'?'preview':'edit');$('bookmarkButton').onclick=toggleBookmark;
 $('moreButton').onclick=event=>{
  const target=current&&activeTab===current.path?current:null;
  const items=target?[menuItem('Save','file',()=>save(target),{disabled:saving,shortcut:'Ctrl S'}),menuItem(mode==='edit'?'Reading view':'Editing view','book',()=>setMode(mode==='edit'?'preview':'edit')),target.type==='note'&&menuItem('Toggle split preview','panel-right',()=>{split=!split;setMode('edit');}),menuSeparator,...fileMenuItems(target)]:[menuItem('Open file recovery','history',openRecovery)];
  contextMenus.open(items,event,'Note options');
 };
 $('newForm').onsubmit=handleNew;$('cancelNew').onclick=()=>$('newDialog').close();$('dailyButton').onclick=dailyNote;$('vaultNameButton').onclick=showVaultMenu;
 $('switcherButton').onclick=$('emptyOpen').onclick=()=>openPalette('notes');$('commandsButton').onclick=$('emptyCommands').onclick=()=>openPalette('commands');$('templateButton').onclick=()=>openPalette('templates');
 $('paletteInput').oninput=()=>{paletteIndex=0;renderPalette();};$('paletteInput').onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();paletteIndex=Math.max(0,Math.min(paletteVisible.length-1,paletteIndex+(e.key==='ArrowDown'?1:-1)));renderPalette();$('paletteResults').children[paletteIndex]?.scrollIntoView?.({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();const item=paletteVisible[paletteIndex];if(item){$('paletteDialog').close();item.action();}}};
 $('closeVaultManager').onclick=()=>$('vaultManagerDialog').close();$('openVaultFolder').onclick=()=>{ $('vaultManagerDialog').close();chooseVault(); };$('settingsButton').onclick=()=>openSettings();$('closeSettings').onclick=()=>$('settingsDialog').close();document.querySelectorAll?.('[data-settings]').forEach(b=>b.onclick=()=>renderSettings(b.dataset.settings));
 $('cancelSwitch').onclick=()=>{pendingSwitch=null;$('switchDialog').close();};$('discardSwitch').onclick=()=>{$('switchDialog').close();if(current){current.dirty=false;drafts.delete(current.path);}const action=pendingSwitch;pendingSwitch=null;action?.();};$('saveSwitch').onclick=async()=>{if(await save()){$('switchDialog').close();const action=pendingSwitch;pendingSwitch=null;action?.();}};
 $('preview').onclick=e=>{if(taskClick(e))return;const link=e.target.closest?.('[data-link]');if(link)followLink(link.dataset.link);};
 $('tasksButton').onclick=()=>requestOpen('@tasks','tasks');$('newTaskButton').onclick=()=>openTaskDialog();$('tasksSearch').oninput=renderTasks;$('taskList').onclick=taskClick;document.querySelectorAll?.('[data-task-filter]').forEach(b=>b.onclick=()=>{tasksFilter=b.dataset.taskFilter;document.querySelectorAll('[data-task-filter]').forEach(el=>el.classList.toggle('active',el===b));renderTasks();});$('taskForm').onsubmit=createTask;$('cancelTask').onclick=()=>$('taskDialog').close();$('closeRecovery').onclick=()=>$('recoveryDialog').close();
 $('backButton').onclick=()=>{if(historyIndex>0)requestOpen(historyPaths[--historyIndex],undefined,true);};$('forwardButton').onclick=()=>{if(historyIndex<historyPaths.length-1)requestOpen(historyPaths[++historyIndex],undefined,true);};
 $('graphButton').onclick=()=>{graphLocal=false;requestOpen('@graph','graph');};
 $('canvasCard').onclick=()=>addCanvasCard();$('canvasFile').onclick=()=>{paletteKind='canvas-file';paletteItems=notes.map(n=>({label:title(n.path),info:n.path,action:()=>addCanvasCard('file',n.path)}));paletteIndex=0;$('paletteInput').value='';$('paletteInput').placeholder='Add a note to canvas…';$('paletteDialog').showModal();renderPalette();};$('canvasConnect').onclick=()=>{if(canvasSelected){canvasLinkFrom=canvasSelected;$('canvasHint').textContent='Select another card to connect.';}else $('canvasHint').textContent='Select a card first, then choose Connect.';};$('canvasZoomIn').onclick=()=>{canvasZoom=Math.min(2,canvasZoom+.1);renderCanvas();};$('canvasZoomOut').onclick=()=>{canvasZoom=Math.max(.3,canvasZoom-.1);renderCanvas();};$('canvasReset').onclick=()=>{canvasZoom=1;renderCanvas();};
 $('attachmentInput').onchange=()=>{const file=$('attachmentInput').files[0];if(file)uploadAttachment(file);$('attachmentInput').value='';};
 $('noteView').ondragover=e=>e.preventDefault();$('noteView').ondrop=e=>{e.preventDefault();for(const file of e.dataTransfer.files)uploadAttachment(file);};
 window.addEventListener('beforeunload',e=>{persist();if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
 document.addEventListener('keydown',e=>{const mod=e.ctrlKey||e.metaKey;if(current?.type==='whiteboard'&&e.target.closest?.('.excalidraw')&&!(mod&&['s','w','n',','].includes(e.key.toLowerCase())))return;if(mod&&e.shiftKey&&e.key.toLowerCase()==='j'&&current){e.preventDefault();openIconPicker(current.path,current.type);}else if(mod&&e.key==='Enter'){e.preventDefault();toggleTaskAtCursor();}else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();save();}else if(mod&&e.key.toLowerCase()==='n'){e.preventDefault();newDialog();}else if(mod&&e.key.toLowerCase()==='o'){e.preventDefault();openPalette('notes');}else if(mod&&e.key.toLowerCase()==='p'){e.preventDefault();openPalette('commands');}else if(mod&&e.key.toLowerCase()==='e'){e.preventDefault();setMode(mode==='edit'?'preview':'edit');}else if(mod&&e.key===','){e.preventDefault();openSettings();}else if(mod&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();setSidebar('search');}else if(mod&&e.key.toLowerCase()==='w'&&activeTab){e.preventDefault();closeTab(activeTab);}else if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();$('backButton').onclick();}else if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();$('forwardButton').onclick();}else if(e.key==='Escape')hideMenu();});
}
function hideMenu(){contextMenus?.close();}
function taskHTML(task,hidden=[]){
 const priority = ['highest','high','medium','low','lowest'].includes(task.priority) ? task.priority : '';
 const overdue = task.due && task.due < window.SlateTasks.today() && !task.completed;
 const meta=(label,value,name='calendar-days',extra='')=>'<span class="task-meta-item '+extra+'">'+icon(name)+esc(label+': '+value)+'</span>';
 const raw=' data-task-raw="'+esc(task.raw)+'"';
 const description=hidden.includes('tags')?task.text.replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu,'').trim():task.text;
 return '<div class="task-row'+(task.completed?' completed':'')+'"><button class="task-check" role="checkbox" aria-checked="'+task.completed+'" aria-label="'+(task.completed?'Reopen task':'Complete task')+'" data-task-path="'+esc(task.path)+'" data-task-line="'+task.line+'"'+raw+'>'+ (task.completed?icon('check'):'')+'</button><div class="task-body"><div class="task-description">'+inline(description)+'</div><div class="task-meta">'+(!hidden.includes('backlinks')?'<button data-task-open="'+esc(task.path)+'" data-line="'+task.line+'" data-tooltip="'+esc(task.path+(task.heading?' › '+task.heading:''))+'">'+esc(task.filename||title(task.path))+(task.heading?' › '+esc(task.heading):'')+'</button>':'')+(priority&&!hidden.includes('priority')?meta('Priority',priority,'priority-'+priority):'')+['start','scheduled','due','created','done'].filter(key=>task[key]&&!hidden.includes(key+' date')).map(key=>meta(key[0].toUpperCase()+key.slice(1),task[key],'calendar-days',key==='due'&&overdue?'overdue':'')).join('')+(task.recurrence&&!hidden.includes('recurrence rule')?meta('Repeats',task.recurrence,'repeat'):'')+'</div></div>'+(!hidden.includes('edit button')?'<button class="task-edit" aria-label="Edit task" data-tooltip="Edit task" data-task-edit="'+esc(task.path)+'" data-task-line="'+task.line+'"'+raw+'>'+icon('pencil')+'</button>':'')+'</div>';
}
function getTasks(editorContent){return window.SlateTasks?window.SlateTasks.parseTasks(notes.map(note=>typeof editorContent==='string'&&note.path===current?.path?{...note,content:editorContent}:drafts.get(note.path)?.dirty?{...note,content:drafts.get(note.path).content}:note)).filter(t=>!settings.taskGlobalFilter||t.raw.includes(settings.taskGlobalFilter)):[];}
function renderTasks(){if(!window.SlateTasks){$('taskList').textContent='Loading Tasks…';return;}const today=window.SlateTasks.today();let tasks=getTasks();if(tasksFilter==='done')tasks=tasks.filter(t=>t.completed);else if(tasksFilter!=='all')tasks=tasks.filter(t=>!t.completed);if(tasksFilter==='today')tasks=tasks.filter(t=>t.due===today||t.scheduled===today);if(tasksFilter==='overdue')tasks=tasks.filter(t=>t.due&&t.due<today);if(tasksFilter==='upcoming')tasks=tasks.filter(t=>t.due&&t.due>today);const q=$('tasksSearch').value.toLowerCase();tasks=tasks.filter(t=>(t.text+' '+t.path).toLowerCase().includes(q));tasks.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.path.localeCompare(b.path)||a.line-b.line);$('taskTotal').textContent=tasks.length+' tasks';$('taskList').innerHTML=tasks.map(t=>taskHTML(t)).join('');if(!tasks.length)empty($('taskList'),'No tasks in this view.');}
function copyCode(button){const label=text=>{button.setAttribute('aria-label',text);button.dataset.tooltip=text;};copyMenuText(button.closest('.code-block').querySelector('code').textContent).then(()=>{button.innerHTML=icon('check');label('Copied');clearTimeout(button.resetTimer);button.resetTimer=setTimeout(()=>{button.innerHTML=icon('copy');label('Copy code');},1500);},()=>label('Copy failed'));}
function hydrateCodeBlocks(){for(const button of $('preview').querySelectorAll?.('[data-copy-code]')||[]){hydrateIcons(button);button.onclick=()=>copyCode(button);}const highlight=window.SlateEditor?.highlight;if(!highlight)return;for(const el of $('preview').querySelectorAll?.('pre[data-lang]>code')||[]){const result=highlight(el.textContent,el.parentElement.dataset.lang);if(result)el.replaceChildren(result);}}
function renderTaskQuery(el,query,editorContent){if(!window.SlateTasks)return;const result=window.SlateTasks.query(getTasks(editorContent),query);if(result.errors.length){el.innerHTML='<div class="task-query-error" role="alert">'+result.errors.map(esc).join('<br>')+'</div>';return;}const row=t=>taskHTML(t,result.hidden);el.innerHTML=(result.explanation?'<pre class="task-explanation">'+esc(result.explanation)+'</pre>':'')+(result.groups.length?result.groups.map(g=>'<h4>'+esc(g.name)+'</h4>'+g.tasks.map(row).join('')).join(''):result.tasks.map(row).join(''))+(!result.tasks.length?'<p class="muted">No tasks match this query.</p>':'')+(!result.hidden.includes('task count')?'<p class="task-count">'+result.tasks.length+' tasks</p>':'');}
function hydrateTaskQueries(){for(const el of $('preview').querySelectorAll?.('[data-task-query]')||[])renderTaskQuery(el,el.dataset.taskQuery);}
let dataviewSnapshot=null;
function dataviewNotes(editorContent){
 const source=current?.type==='note'&&!notes.some(n=>n.path===current.path)?[...notes,current]:notes;
 const content=source.map(note=>note.path===current?.path&&typeof editorContent==='string'?editorContent:drafts.get(note.path)?.content??note.content);
 if(dataviewSnapshot?.source===notes&&dataviewSnapshot.current===(source===notes?null:current?.path)&&content.length===dataviewSnapshot.content.length&&content.every((text,i)=>text===dataviewSnapshot.content[i]))return dataviewSnapshot.notes;
 const result=source.map((note,i)=>({...note,content:content[i]}));
 dataviewSnapshot={source:notes,current:source===notes?null:current?.path,content,notes:result};return result;
}
function renderDataview(el,source,kind='dataview',editorContent,onRendered){
 if(settings.dataviewEnabled===false){el.textContent=source;return;}
 if(!window.SlateDataview){el.textContent='Dataview is unavailable.';return;}
 return window.SlateDataview.render(el,{notes:dataviewNotes(editorContent),source,kind,origin:current?.path||'',javascriptEnabled:!!settings.dataviewJavascript},onRendered);
}
function hydrateDataview(){for(const el of $('preview').querySelectorAll?.('[data-dataview]')||[])renderDataview(el,el.dataset.dataview,el.dataset.dataviewKind,getText());}
function dataviewClick(event){if(taskClick(event))return;const link=event.target.closest?.('[data-link]');if(link)followLink(link.dataset.link);}
async function toggleTask(path,line,expectedRaw){if(taskBusy)return;if(drafts.get(path)?.dirty){message('Save the unsaved changes in '+title(path)+' before updating its tasks.');return;}taskBusy=true;try{const note=await api('note?path='+encodeURIComponent(path));const task=window.SlateTasks.parseTasks([note]).find(t=>t.line===line);if(!task||(expectedRaw!==undefined&&task.raw!==expectedRaw))throw new Error('This task moved or changed. Refresh and try again.');const edit=window.SlateTasks.complete(task);const content=window.SlateTasks.applyTaskChange(note.content,task,edit);const result=await api('note',{path,content,revision:note.revision});if(drafts.has(path)){const draft=drafts.get(path);Object.assign(draft,{content,original:content,revision:result.revision,dirty:false});if(current===draft){setText(content);dirty=false;update();}}await refresh();if(activeTab==='@tasks')renderTasks();if(mode==='preview'||split)update();message(edit.warnings?.join(' ')||'');schedulePersist();}catch(e){message(e.message);}finally{taskBusy=false;}}
function taskClick(e){const edit=e.target.closest?.('[data-task-edit]');if(edit){const task=getTasks().find(t=>t.path===edit.dataset.taskEdit&&t.line===Number(edit.dataset.taskLine)&&t.raw===edit.dataset.taskRaw);if(task)openTaskDialog(task);else message('This task moved or changed. Refresh and try again.');return true;}const check=e.target.closest?.('[data-task-path]');if(check){if(check.dataset.taskPath===current?.path&&activeTab===current.path){const task=window.SlateTasks.parseTasks([{path:current.path,content:getText()}]).find(t=>t.line===Number(check.dataset.taskLine));if(!task||task.raw!==check.dataset.taskRaw){message('This task moved or changed. Refresh and try again.');return true;}toggleEditorTask(task.line);}else toggleTask(check.dataset.taskPath,Number(check.dataset.taskLine),check.dataset.taskRaw);return true;}const open=e.target.closest?.('[data-task-open]');if(open){openNote(open.dataset.taskOpen).then(()=>{const line=Number(open.dataset.line);const pos=current.content.split('\n').slice(0,line-1).join('\n').length+(line>1?1:0);if(liveEditor&&settings.livePreview){liveEditor.focus();liveEditor.setSelection(pos,pos);}else{$('editor').focus();$('editor').setSelectionRange(pos,pos);}}).catch(e=>message(e.message));return true;}return false;}
function openTaskDialog(task=null){
 editingTask=task&&typeof task.raw==='string'?{...task}:null;
 $('taskDialogTitle').textContent=editingTask?'Edit task':'New task';$('taskSubmit').textContent=editingTask?'Save task':'Create task';
 $('taskText').value=editingTask?.text||'';for(const key of ['Due','Scheduled','Start','Recurrence'])$('task'+key).value=editingTask?.[key.toLowerCase()]||'';
 $('taskPriority').value=editingTask?.priority||'normal';$('taskFile').value=editingTask?.path||(current?.type==='note'?current.path:'Tasks.md');$('taskFile').disabled=!!editingTask;
 $('taskError').textContent='';window.SlateSelect?.enhance($('taskDialog'),icon);$('taskDialog').showModal();$('taskText').focus();
}
function cursorTask(){if(!current||activeTab!==current.path||current.type!=='note')return null;const pos=liveEditor&&settings.livePreview?liveEditor.getSelection().from:$('editor').selectionStart;const content=getText(),line=content.slice(0,pos).split('\n').length;return window.SlateTasks.parseTasks([{path:current.path,content}]).find(t=>t.line===line);}
function editTaskAtCursor(){const task=cursorTask();if(task)openTaskDialog(task);else message('Place the cursor on a task first.');}
function toggleTaskAtCursor(){const task=cursorTask();if(task)toggleEditorTask(task.line);}
async function createTask(e){
 e.preventDefault();if(taskBusy)return;taskBusy=true;$('taskSubmit').disabled=true;
 try{
  let path=$('taskFile').value.trim();if(!path.endsWith('.md'))path+='.md';
  const values={text:$('taskText').value,due:$('taskDue').value,scheduled:$('taskScheduled').value,start:$('taskStart').value,priority:$('taskPriority').value,recurrence:$('taskRecurrence').value.trim()};
  if(!editingTask&&settings.taskGlobalFilter&&!values.text.includes(settings.taskGlobalFilter))values.text+=' '+settings.taskGlobalFilter;
  const task=editingTask||{raw:'- [ ] New task'};
  const newLine=window.SlateTasks.editTask(task,values);
  if(editingTask&&current?.path===path&&activeTab===path){const next=window.SlateTasks.applyTaskChange(getText(),task,{completedLine:newLine});replaceEditorText(next);$('taskDialog').close();return;}
  if(drafts.get(path)?.dirty)throw new Error('Save the unsaved changes in this note first.');
  let note={content:'',revision:null};if(notes.some(n=>n.path===path))note=await api('note?path='+encodeURIComponent(path));
  const eol=note.content.includes('\r\n')?'\r\n':'\n';
  const content=editingTask?window.SlateTasks.applyTaskChange(note.content,task,{completedLine:newLine}):note.content+(note.content&&!note.content.endsWith('\n')?eol:'')+newLine+eol;
  const result=await api('note',{path,content,revision:note.revision});
  if(drafts.has(path)){const draft=drafts.get(path);Object.assign(draft,{content,original:content,revision:result.revision,dirty:false});if(current===draft){setText(content);update();}}
  await refresh();$('taskDialog').close();schedulePersist();
 }catch(e){$('taskError').textContent=e.message;}finally{taskBusy=false;$('taskSubmit').disabled=false;}
}
function replaceEditorText(next){if(liveEditor&&settings.livePreview){const old=getText(),selection=liveEditor.getSelection();let from=0,end=old.length,nextEnd=next.length;while(from<end&&from<nextEnd&&old[from]===next[from])from++;while(end>from&&nextEnd>from&&old[end-1]===next[nextEnd-1]){end--;nextEnd--;}const map=pos=>pos<=from?pos:pos>=end?pos+nextEnd-end:nextEnd;liveEditor.replaceRange(from,end,next.slice(from,nextEnd),map(selection.from),map(selection.to));}else{const pos=$('editor').selectionStart;setText(next);$('editor').setSelectionRange(Math.min(pos,next.length),Math.min(pos,next.length));draftChanged(next);}}
async function openRecovery(){try{const data=await api('recovery');const host=$('recoveryList');host.replaceChildren();for(const entry of data.entries)for(const file of entry.files){const row=document.createElement('div');row.className='recovery-row';const label=document.createElement('span');label.textContent=file.path+' · '+entry.operation+' · '+new Date(entry.created).toLocaleString();const b=button('View snapshot',async()=>{try{const snapshot=await api('recovery?id='+encodeURIComponent(entry.id)+'&path='+encodeURIComponent(file.path));let expectedRevision=null;try{const existing=await api((fileType(file.path))+'?path='+encodeURIComponent(file.path));expectedRevision=existing.revision;}catch(e){if(notes.some(n=>n.path===file.path)||canvases.some(n=>n.path===file.path)||whiteboards.some(n=>n.path===file.path))throw e;}const preview=document.createElement('pre');preview.textContent=snapshot.content.slice(0,16000);const restore=button(expectedRevision?'Restore over current file':'Restore missing file',async()=>{try{if(drafts.get(file.path)?.dirty)throw new Error('Save or close this file’s unsaved draft before restoring.');await api('restore',{id:entry.id,path:file.path,expectedRevision});drafts.delete(file.path);await refresh();$('recoveryDialog').close();await openNote(file.path,fileType(file.path));message('Snapshot restored.');}catch(e){message(e.message);}});restore.className='primary';row.append(preview,restore);b.disabled=true;}catch(e){message(e.message);}});row.append(label,b);host.append(row);}if(!data.entries.length)empty(host,'No recovery snapshots yet.');$('recoveryDialog').showModal();}catch(e){message(e.message);}}
function toggleEditorTask(line){if(!current||current.type!=='note'||!window.SlateTasks)return;try{const text=getText();const task=window.SlateTasks.parseTasks([{path:current.path,content:text}]).find(t=>t.line===line);if(!task)throw new Error('Task not found at this line.');const edit=window.SlateTasks.complete(task);const next=window.SlateTasks.applyTaskChange(text,task,edit);replaceEditorText(next);message(edit.warnings?.join(' ')||'');}catch(e){message(e.message);}}
window.SlateWikiLinks?.mountSource($('editor'),{getNotes:()=>notes,getCurrentPath:()=>current?.path});
function mountLiveEditor(){if(!window.SlateEditor||liveEditor)return;const host=$('liveEditor');if(!host)return;liveEditor=window.SlateEditor.mount(host,{value:$('editor').value,lineNumbers:!!settings.showLineNumber,tabSize:settings.tabSize,useTab:!!settings.useTab,resolveAttachment,loadAttachment,getNotes:()=>notes,getCurrentPath:()=>current?.path,onChange:text=>draftChanged(text),onSave:save,onFollowLink:followLink,onToggleTask:toggleEditorTask,renderTaskQuery,renderDataview,onDataviewClick:dataviewClick,onTaskClick:taskClick,icon});setMode(mode);}
window.addEventListener('slate-editor-ready',mountLiveEditor);window.addEventListener('slate-editor-ready',hydrateCodeBlocks);
async function init(){if(window.SlateNoteIcons)initIconPicker();hydrateIcons();window.SlateSelect?.enhance(document,icon);initEvents();installContextMenus();let state=storage.get('workspace',null);const pinState=desktop?await desktop.loadWorkspace():state;if(desktop)state=pinState||state;explorerPins=new Set(Array.isArray(pinState?.explorerPins)?pinState.explorerPins.filter(path=>typeof path==='string'):[]);if(state){settings={...settings,...state.settings};bookmarks=state.bookmarks||bookmarks;leftClosed=!!state.leftClosed;rightClosed=!!state.rightClosed;closedFolders=new Set(state.closedFolders||[]);for(const draft of state.drafts||[])drafts.set(draft.path,draft);tabs=state.tabs||[];activeTab=state.activeTab;}
 applySettings();await refresh();tabs=tabs.filter(t=>t.path==='@graph'||t.path==='@tasks'||allFiles().some(n=>n.path===t.path));mountLiveEditor();if(activeTab&&tabs.some(t=>t.path===activeTab))await openNote(activeTab,tabs.find(t=>t.path===activeTab).type);else if(notes.length)await openNote(notes.find(n=>n.path==='Welcome.md')?.path||notes[0].path);else showView('emptyView');setInterval(()=>{if(!saving)refresh().catch(()=>{});},15000);}
init().catch(e=>message(e.message));
