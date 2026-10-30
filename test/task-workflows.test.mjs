import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { Vault } from '../core.mjs';

const [tasksSource,appSource,iconsSource]=await Promise.all(['tasks.js','app.js','vendor/icons.js'].map(name=>fs.readFile(new URL('../public/'+name,import.meta.url),'utf8')));
function setup(){
 const elements=new Map();
 const element=()=>({value:'',innerHTML:'',textContent:'',selectionStart:0,selectionEnd:0,children:[],classList:{toggle(){}},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});
 const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){}},location:{hash:''},sessionStorage:{getItem(){return '';}},window:{addEventListener(){}},console:{error(){},log(){}},clearTimeout});
 vm.runInContext(tasksSource,context);context.window.SlateTasks=context.SlateTasks;
 vm.runInContext(iconsSource,context);
 vm.runInContext(appSource.replace(/init\(\)\.catch\(e=>message\(e.message\)\);\s*$/,''),context);
 const run=code=>vm.runInContext(code,context);
 run(`renderTabs=()=>{};renderContext=()=>{};renderFiles=()=>{};schedulePersist=()=>{};settings.autoSave=false;mode='edit';`);
 return {run,context,elements};
}

test('query UI honors hide fields and escapes metadata and errors',()=>{
 const {run,elements}=setup();
 run(String.raw`notes=[{path:'Work/Report.md',content:'# Next\n- [ ] Review #work ⏫ 📅 2026-10-30'}];renderTaskQuery($('query'),'not done\ngroup by filename\nhide due date\nhide priority\nhide tags\nhide backlinks\nhide edit button\nhide task count');`);
 const html=elements.get('query').innerHTML;
 assert.match(html,/<h4>Report<\/h4>/);assert.match(html,/task-description">Review</);assert.ok(!html.includes('2026-10-30</span>'));assert.ok(!html.includes('Priority:'));assert.ok(!html.includes('data-task-open'));assert.ok(!html.includes('task-edit'));assert.ok(!html.includes('task-count'));
 run(`renderTaskQuery($('query'),'unsupported <img src=x>')`);
 assert.match(elements.get('query').innerHTML,/role="alert"/);assert.ok(!elements.get('query').innerHTML.includes('<img'));
});

test('cross-note task completion persists through Vault with CRLF and recurrence order',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slate-task-flow-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const vault=new Vault(root);await vault.init();
 const original='# Work\r\n- [ ] Review 🔁 every Friday 📅 2026-10-30\r\nKeep this\r\n';
 await vault.save('Work.md',original,null);
 const {run,context}=setup();
 context.testApi=async(route,data)=>data?vault.save(data.path,data.content,data.revision):vault.read(new URLSearchParams(route.split('?')[1]).get('path'));
 context.testRefresh=async()=>{context.testNotes=await vault.list();run('notes=testNotes;');};
 await run(`api=testApi;refresh=testRefresh;refresh()`);
 await run(String.raw`toggleTask('Work.md',2,notes[0].content.split('\r\n')[1])`);
 const saved=await vault.read('Work.md');
 assert.match(saved.content,/# Work\r\n- \[ \] Review 🔁 every Friday 📅 2026-11-06\r\n- \[x\] Review 🔁 every Friday 📅 2026-10-30 ✅ \d{4}-\d{2}-\d{2}\r\nKeep this\r\n$/);
 assert.equal(run('taskBusy'),false);
});

test('query actions refuse moved tasks and preserve newly unsaved source drafts',async()=>{
 const {run,context,elements}=setup();
 context.readNote={path:'Work.md',content:'- [ ] Different task',revision:'revision'};
 run(`writes=0;api=async(route,data)=>{if(data)writes++;return readNote;};refresh=async()=>{};`);
 await run(`toggleTask('Work.md',1,'- [ ] Old task')`);
 assert.equal(run('writes'),0);assert.match(elements.get('message').textContent,/moved or changed/);
 run(`drafts.set('Work.md',{dirty:true,content:'- [ ] Unsaved'});`);
 await run(`toggleTask('Work.md',1,'- [ ] Different task')`);
 assert.equal(run('writes'),0);assert.equal(run(`drafts.get('Work.md').content`),'- [ ] Unsaved');
});

test('editing in the active unsaved note retains surrounding text and query results use the draft',async()=>{
 const {run,elements}=setup();
 run(String.raw`current={path:'Work.md',type:'note',content:'# Work\n- [ ] Draft ⏫\nUnsaved prose',dirty:true};activeTab='Work.md';drafts.set('Work.md',current);notes=[{path:'Work.md',content:'- [ ] Old disk text'}];$('editor').value=current.content;openTaskDialog(getTasks()[0]);$('taskText').value='Revised';$('taskDue').value='2026-10-30';$('taskPriority').value='high';`);
 await run(`createTask({preventDefault(){}})`);
 assert.equal(run('current.content'),'# Work\n- [ ] Revised ⏫ 📅 2026-10-30\nUnsaved prose');assert.equal(run('current.dirty'),true);assert.equal(elements.get('taskDialog').open,false);
 assert.equal(run('getTasks()[0].text'),'Revised');
 run(`renderTaskQuery($('query'),'not done','- [ ] Live state update')`);
 assert.match(elements.get('query').innerHTML,/Live state update/);
});
