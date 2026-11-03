import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const sources = await Promise.all(['app-menus.js','app.js'].map(name => fs.readFile(new URL('../public/'+name,import.meta.url),'utf8')));
function setup(desktop = null) {
  const elements = new Map();
  const element = () => ({value:'',children:[],disabled:false,classList:{toggle(){},contains(){return false;}},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},select(){}});
  const context = vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){}},location:{hash:''},sessionStorage:{getItem(){return '';}},window:{slateDesktop:desktop,addEventListener(){}},clearTimeout,console});
  for(const source of sources)vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  run(`current={path:'B.md',type:'note',content:'B text',revision:'b',dirty:false};activeTab='B.md';drafts.set('B.md',current);drafts.set('A.md',{path:'A.md',type:'note',content:'A text',original:'A text',revision:'a',dirty:false});tabs=[{path:'A.md',type:'note'},{path:'B.md',type:'note'}];getText=()=>current.content;renderTabs=()=>{};renderFiles=()=>{};renderContext=()=>{};schedulePersist=()=>{};refresh=async()=>{};setText=text=>{current.content=text;};requests=[];api=async(route,data)=>{requests.push({route,data});return {path:data?.newPath||data?.path,updatedLinks:0};};`);
  return {run,elements,context};
}

test('file menus retain the clicked target without activating it, even if the caller object changes', async () => {
 const {run}=setup();
 await run(`(async()=>{const target={path:'A.md',type:'note'};const items=fileMenuItems(target);target.path='B.md';await items.find(item=>item?.label==='Rename…').action();})()`);
 assert.equal(run('dialogTarget.path'),'A.md'); assert.equal(run('current.path'),'B.md'); assert.equal(run('activeTab'),'B.md');
 assert.equal(run('requests.length'),0);
});

test('new notes open immediately with unique names and respect the destination folder', async () => {
 const {run}=setup();
 run(`notes=[{path:'Projects/Untitled.md'},{path:'Projects/Untitled 1.md'}];settings.newFolder='Projects';opened=[];openNote=async path=>opened.push(path);setMode=()=>{};`);
 await run('newDialog()');
 assert.equal(run('requests[0].data.path'),'Projects/Untitled 2.md');
 assert.equal(run('requests[0].data.content'),'');
 assert.equal(run('requests[0].data.revision'),null);
 assert.equal(run('opened[0]'),'Projects/Untitled 2.md');
 assert.equal(run("$('newDialog').open"),undefined);
 await run("folderMenuItems('').find(item=>item?.label==='New note').action()");
 assert.equal(run('opened[1]'),'Untitled.md');
});

test('new whiteboards and canvases open immediately with unique Untitled names', async () => {
 const {run}=setup();
 run(`whiteboards=[{path:'Untitled.excalidraw'}];canvases=[{path:'Plans/Untitled.canvas'}];opened=[];openNote=async (path,type)=>opened.push(type+':'+path);`);
 await run("newFile('whiteboard')");
 assert.equal(run('requests[0].route'),'whiteboard');
 assert.equal(run('requests[0].data.path'),'Untitled 1.excalidraw');
 assert.equal(JSON.parse(run('requests[0].data.content')).type,'excalidraw');
 assert.equal(run('opened[0]'),'whiteboard:Untitled 1.excalidraw');
 await run("folderMenuItems('Plans').find(item=>item?.label==='New canvas').action()");
 assert.equal(run('requests[1].route'),'canvas');
 assert.equal(run('requests[1].data.path'),'Plans/Untitled 1.canvas');
 assert.equal(run('opened[1]'),'canvas:Plans/Untitled 1.canvas');
 assert.equal(run("$('newDialog').open"),undefined);
});

test('inline titles save dirty content before renaming and update workspace paths', async () => {
 const {run}=setup();
 run(`current.dirty=true;bookmarks=['B.md'];historyPaths=['B.md'];save=async target=>{requests.push({route:'save',data:{content:target.content}});target.dirty=false;target.revision='saved';return true;};update=()=>{};`);
 await run("renameNoteTitle(current,'New title')");
 assert.equal(run('requests[0].route'),'save');
 assert.equal(run('requests[1].route'),'rename');
 assert.equal(run('requests[1].data.revision'),'saved');
 assert.equal(run('current.path'),'New title.md');
 assert.equal(run('activeTab'),'New title.md');
 assert.equal(run('tabs[1].path'),'New title.md');
 assert.equal(run('bookmarks[0]'),'New title.md');
 assert.equal(run('historyPaths[0]'),'New title.md');
 assert.equal(run("drafts.get('New title.md')===current"),true);
 assert.equal(run("drafts.has('B.md')"),false);
});

test('inline titles retain their folder and reject empty titles or path changes', async () => {
 const {run}=setup();run(`current.path='Projects/B.md';update=()=>{};`);
 for(const name of ['', '  ', '../Moved', 'Folder/Note', 'Line\nBreak'])await assert.rejects(run(`renameNoteTitle(current,${JSON.stringify(name)})`),/valid note title/);
 assert.equal(run('requests.length'),0);
 await run("renameNoteTitle(current,'Renamed')");
 assert.equal(run('requests[0].data.newPath'),'Projects/Renamed.md');
});

test('failed inline rename preserves the draft and original workspace paths', async () => {
 const {run}=setup();run(`api=async()=>{throw new Error('A file already exists');};`);
 await assert.rejects(run("renameNoteTitle(current,'Taken')"),/already exists/);
 assert.equal(run('current.path'),'B.md');
 assert.equal(run('activeTab'),'B.md');
 assert.equal(run('tabs[1].path'),'B.md');
 assert.equal(run("drafts.get('B.md')===current"),true);
 assert.equal(run('saving'),false);
});

test('rename submitted from an inactive file menu uses that file revision and preserves the active note', async () => {
 const {run}=setup();
 await run(`menuFileDialog({path:'A.md',type:'note'},'rename')`);
 run(`$('newPath').value='Moved/A.md';bookmarks=['A.md','B.md'];`);
 await run(`handleNew({preventDefault(){}})`);
 assert.equal(run('requests[0].route'),'rename'); assert.equal(run('requests[0].data.path'),'A.md'); assert.equal(run('requests[0].data.revision'),'a');
 assert.equal(run('current.path'),'B.md'); assert.equal(run('activeTab'),'B.md');
 assert.equal(run('tabs[0].path'),'Moved/A.md'); assert.equal(run('bookmarks[0]'),'Moved/A.md');
});

test('dirty target drafts cannot be renamed or trashed and are still available to copy', async () => {
 const {run}=setup();run(`drafts.get('A.md').dirty=true;drafts.get('A.md').content='Unsaved A';`);
 await assert.rejects(run(`menuFileDialog({path:'A.md',type:'note'},'rename')`),/Save this file/);
 await assert.rejects(run(`prepareMenuTrash({path:'A.md',type:'note'})`),/Save this file/);
 await run(`menuFileDialog({path:'A.md',type:'note'},'copy')`);
 assert.equal(run('copyDraft'),'Unsaved A');assert.equal(run('requests.length'),0);assert.equal(run("drafts.get('A.md').dirty"),true);
});

test('trash confirmation keeps its original target and a disk conflict retains every draft', async () => {
 const {run}=setup();await run(`prepareMenuTrash({path:'A.md',type:'note'})`);
 run(`api=async(route,data)=>{requests.push({route,data});throw new Error('Changed on disk');};`);
 await run('confirmMenuTrash()');
 assert.equal(run('requests[0].data.path'),'A.md');assert.equal(run('requests[0].data.revision'),'a');
 assert.equal(run("drafts.has('A.md')"),true);assert.equal(run('current.path'),'B.md');assert.equal(run("$('confirmDialog').open"),true);
});

test('editor formatting uses the captured selection and refuses a stale note', () => {
 const {run}=setup();
 run(`settings.livePreview=true;current.content='Hello world';changes=[];liveEditor={getSelection:()=>({from:6,to:11}),replaceRange:(...args)=>changes.push(args),canUndo:()=>false,canRedo:()=>false};`);
 run(`editorMenuItems().find(item=>item?.label==='Format').children.find(item=>item.label==='Bold').action()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(changes[0])')),[6,11,'**world**',8,13]);
 run(`staleItems=editorMenuItems();current.content='Changed elsewhere';`);
 assert.throws(()=>run(`staleItems.find(item=>item?.label==='Format').children[0].action()`),/note changed/);
 assert.equal(run('changes.length'),1);
});

test('bulk close waits for inactive tab loads and cannot resurrect a closed tab', async () => {
 const {run}=setup();
 run(`drafts.delete('A.md');openNote=async(path,type)=>{await Promise.resolve();activeTab=path;current={path,type};tabs=tabs.some(tab=>tab.path===path)?tabs:[...tabs,{path,type}];};closeMenuTabs(['B.md','A.md']);`);
 for(let index=0;index<8;index++)await Promise.resolve();
 assert.equal(run('tabs.length'),0);assert.equal(run('activeTab'),null);
});

test('with autosave disabled, bulk close skips pinned tabs and pauses at unsaved drafts without closing later tabs', () => {
 const {run}=setup();run(`settings.autoSave=false;tabs[1].pinned=true;drafts.get('A.md').dirty=true;closeMenuTabs(['A.md','B.md']);`);
 assert.equal(run('tabs.length'),2);assert.equal(run("$('switchDialog').open"),true);assert.equal(run('typeof pendingSwitch'),'function');
 run('pendingSwitch=null');assert.equal(run('tabs.length'),2);assert.equal(run("drafts.get('A.md').dirty"),true);
});

test('tab menu caret sits left of the right sidebar toggle', async () => {
 const html = await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="tabsMenuButton"') > -1 && html.indexOf('id="tabsMenuButton"') < html.indexOf('id="toggleRight"'));
});

test('tab menu lists open tabs with the focused tab checked and switches on selection', () => {
 const {run}=setup();
 run(`opened=[];requestOpen=(path,type)=>opened.push(path+':'+type);tabs=[{path:'A.md',type:'note'},{path:'@graph',type:'graph'},{path:'B.md',type:'note'}];activeTab='B.md';`);
 const labels = JSON.parse(run(`JSON.stringify(tabsMenuItems().map(item=>item.separator?'-':item.label))`));
 assert.deepEqual(labels,['Bookmark 2 tabs…','Close all','-','A','Graph view','B']);
 assert.equal(run(`tabsMenuItems().some(item=>item.label==='Stack tabs')`),false);
 assert.equal(run(`tabsMenuItems().filter(item=>!item.separator).at(-1).checked`),true);
 assert.equal(run(`tabsMenuItems().filter(item=>!item.separator).at(-2).checked`),false);
 run(`tabsMenuItems().find(item=>item.label==='A').action()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(opened)')),['A.md:note']);
});

test('tab menu bookmarks only real files and closes all unpinned tabs', async () => {
 const {run}=setup();
 run(`tabs=[{path:'A.md',type:'note'},{path:'@graph',type:'graph'},{path:'B.md',type:'note'}];activeTab='B.md';bookmarks=['A.md'];renderTabs=()=>{};renderFiles=()=>{};`);
 run(`tabsMenuItems().find(item=>item.label.startsWith('Bookmark')).action()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(bookmarks)')),['A.md','B.md']);
 run(`drafts.clear();closeMenuTabs=paths=>{globalThis.closedPaths=paths;};tabsMenuItems().find(item=>item.label==='Close all').action()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(closedPaths)')),['A.md','@graph','B.md']);
});

test('tab menu disables bookmark and close when nothing applies', () => {
 const {run}=setup();
 run(`tabs=[];activeTab=null;`);
 const items = JSON.parse(run(`JSON.stringify(tabsMenuItems().map(item=>({label:item.label,disabled:!!item.disabled})))`));
 assert.deepEqual(items,[{label:'Bookmark 0 tabs…',disabled:true},{label:'Close all',disabled:true}]);
});

test('vault dropdown lists known vaults above its trigger and switches only an inactive vault', async () => {
 const opened = [], saved = [];
 const {run,context}=setup({ listVaults:async()=>[{name:'First',path:'first',current:true},{name:'Second',path:'second',current:false}],openVault:async path=>opened.push(path),saveWorkspace:async state=>saved.push(state) });
 run(`contextMenus={open(items,event,label,options){globalThis.vaultMenu={items,event,label,options};}};afterSafe=action=>action();globalThis.trigger={};`);
 await run(`showVaultMenu({preventDefault(){},currentTarget:trigger})`);
 assert.equal(run('vaultMenu.options.side'),'top'); assert.equal(run('vaultMenu.event.currentTarget===trigger'),true);
 assert.equal(run('vaultMenu.items[0].checked'),true);
 await run('vaultMenu.items[0].action()'); assert.equal(opened.length,0);
 run('vaultMenu.items[1].action()');
 for(let index=0;index<8;index++)await Promise.resolve();
 assert.deepEqual(opened,['second']);assert.equal(saved.length,1);
 assert.equal(run('vaultMenu.items.at(-1).action===openVaultManager'),true);
});

test('vault switching waits for workspace persistence and stops on a save failure', async () => {
 let completeSave, opened = false;
 const {run}=setup({saveWorkspace:()=>new Promise(resolve=>{completeSave=resolve;})});
 run('afterSafe=action=>action();');
 const switching=run('switchWorkspaceVault(async()=>{globalThis.didOpen=true;})');
 assert.equal(run('globalThis.didOpen'),undefined); completeSave(); await switching;
 assert.equal(run('globalThis.didOpen'),true);
 const failed=setup({saveWorkspace:async()=>{throw new Error('Workspace could not be saved');},openVault:async()=>{opened=true;}});
 failed.run('afterSafe=action=>action();');
 await failed.run("switchWorkspaceVault(()=>desktop.openVault('second'))");
 assert.equal(opened,false);assert.equal(failed.run("lastMessage"),'Workspace could not be saved');
});

test('with autosave disabled, dirty notes pause vault switching before any workspace or navigation request', () => {
 let saved=false;
 const {run}=setup({saveWorkspace:async()=>{saved=true;}});
 run('settings.autoSave=false;current.dirty=true;switchWorkspaceVault(async()=>{});');
 assert.equal(run("$('switchDialog').open"),true);assert.equal(saved,false);assert.equal(run('typeof pendingSwitch'),'function');
});
