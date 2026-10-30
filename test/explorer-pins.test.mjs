import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const sources = await Promise.all(['app-menus.js', 'app.js'].map(name => fs.readFile(new URL('../public/' + name, import.meta.url), 'utf8')));
function setup(desktop) {
 const elements = new Map(), stored = new Map();
 const element = () => ({children: [], dataset: {}, classList: {toggle() {}}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];}, setAttribute() {}, close() {}, focus() {}});
 const context = vm.createContext({document: {getElementById(id) {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);}, createElement: element}, window: {slateDesktop: desktop, addEventListener() {}}, location: {hash: ''}, sessionStorage: {getItem() {return '';}}, localStorage: {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)}, clearTimeout, setInterval() {}});
 for (const source of sources) vm.runInContext(source.replace('init().catch(e=>message(e.message));', ''), context);
 const run = code => vm.runInContext(code, context);
 run(`icon=()=>'<svg></svg>';schedulePersist=()=>{};refresh=async()=>{};renderTabs=()=>{};update=()=>{};`);
 const tree = () => JSON.parse(run(`JSON.stringify((function rows(root){return root.children.map(el=>el.className==='folder-children'?rows(el):el.dataset.path||el.dataset.tooltip);})($('files')))`));
 return {run, tree, stored};
}

test('pins sort only within their parent, with pinned notes above unpinned folders', () => {
 const {run, tree} = setup();
 run(`folders=['Archive','Inbox','Projects','Projects/Alpha','Projects/Zeta'];notes=[{path:'A.md'},{path:'Projects/A.md'},{path:'Projects/Z.md'},{path:'Projects/Alpha/Child.md'}];explorerPins=new Set(['Inbox','Projects/Z.md','Projects/Zeta']);renderFiles();`);
 assert.deepEqual(tree(), ['Inbox', [], 'Archive', [], 'Projects', ['Projects/Zeta', [], 'Projects/Z.md', 'Projects/Alpha', ['Projects/Alpha/Child.md'], 'Projects/A.md'], 'A.md']);
 run(`toggleExplorerPin('Projects/Z.md');`);
 assert.deepEqual(tree()[5], ['Projects/Zeta', [], 'Projects/Alpha', ['Projects/Alpha/Child.md'], 'Projects/A.md', 'Projects/Z.md']);
 run(`closedFolders.add('Projects');renderFiles();`);
 assert.deepEqual(tree(), ['Inbox', [], 'Archive', [], 'Projects', 'A.md']);
});

test('file and folder menus pin their captured targets silently without opening notes or changing tab pins', () => {
 const {run} = setup();
 run(`current={path:'Active.md'};tabs=[{path:'Other.md',pinned:false}];calls=[];message=text=>calls.push(text);schedulePersist=()=>calls.push('persist');target={path:'Other.md',type:'note'};items=fileMenuItems(target);target.path='Active.md';items.find(item=>item?.label==='Pin Note').action();folderMenuItems('Inbox').find(item=>item?.label==='Pin Folder').action();`);
 assert.equal(run(`explorerPins.has('Other.md')&&explorerPins.has('Inbox')`), true);
 assert.equal(run('current.path'), 'Active.md');
 assert.equal(run('tabs[0].pinned'), false);
 assert.equal(run(`JSON.stringify(calls)`), '["persist","persist"]');
 assert.equal(run(`folderMenuItems('').some(item=>item?.label==='Pin Folder')`), false);
 run(`fileMenuItems({path:'Other.md'}).find(item=>item?.label==='Unpin Note').action();folderMenuItems('Inbox').find(item=>item?.label==='Unpin Folder').action();`);
 assert.equal(run('explorerPins.size'), 0);
});

test('pins persist and restore per vault without leaking the previous vault fallback', async () => {
 let state = null;
 const {run, stored} = setup({loadWorkspace: async () => state, saveWorkspace: async value => {state = JSON.parse(JSON.stringify(value));}});
 run(`explorerPins=new Set(['Inbox','Projects/Z.md']);persist();`);
 assert.deepEqual(state.explorerPins, ['Inbox', 'Projects/Z.md']);
 run(`hydrateIcons=()=>{};initEvents=()=>{};installContextMenus=()=>{};applySettings=()=>{};mountLiveEditor=()=>{};showView=()=>{};explorerPins.clear();`);
 await run('init()');
 assert.equal(run(`JSON.stringify([...explorerPins])`), '["Inbox","Projects/Z.md"]');
 state = null;
 assert.ok(stored.get('workspace').includes('Inbox'));
 await run('init()');
 assert.equal(run('explorerPins.size'), 0);
 state = {explorerPins: 'invalid'};
 await run('init()');
 assert.equal(run('explorerPins.size'), 0);
});

test('pins follow successful note renames and moves, and survive failed changes', async () => {
 const {run} = setup();
 run(`current={path:'Old.md',type:'note',dirty:false};activeTab='Old.md';explorerPins.add('Old.md');api=async()=>({path:'Renamed.md'});`);
 await run(`renameNoteTitle(current,'Renamed')`);
 assert.equal(run(`JSON.stringify([...explorerPins])`), '["Renamed.md"]');
 run(`dialogAction='move';dialogTarget={path:'Renamed.md',type:'note'};$('newPath').value='Inbox/Renamed.md';api=async()=>({path:'Inbox/Renamed.md'});activeTab='Other.md';`);
 await run('handleNew({preventDefault(){}})');
 assert.equal(run(`JSON.stringify([...explorerPins])`), '["Inbox/Renamed.md"]');
 run(`dialogTarget.path='Inbox/Renamed.md';api=async()=>{throw new Error('Conflict');};`);
 await run('handleNew({preventDefault(){}})');
 assert.equal(run(`JSON.stringify([...explorerPins])`), '["Inbox/Renamed.md"]');
});

test('trashing removes a pin only after the file is successfully trashed', async () => {
 const {run} = setup();
 run(`explorerPins.add('Old.md');trashTarget={path:'Old.md',revision:'r'};api=async()=>{throw new Error('Conflict');};`);
 await run('confirmMenuTrash()');
 assert.equal(run(`explorerPins.has('Old.md')`), true);
 run(`api=async()=>({});`);
 await run('confirmMenuTrash()');
 assert.equal(run('explorerPins.size'), 0);
});
