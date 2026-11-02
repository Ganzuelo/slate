import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { Vault } from '../core.mjs';
import { mergeNote } from '../note-merge.mjs';

const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
function setup() {
 const elements = new Map(), timers = new Map(); let timerId = 0;
 const element = () => ({value:'',style:{},classList:{toggle(){}},setAttribute(){},replaceChildren(){},append(){},showModal(){this.open=true;}});
 const context = vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},window:{addEventListener(){},SlateNoteMerge:mergeNote},location:{hash:''},sessionStorage:{getItem(){}},setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout(id){timers.delete(id);},console});
 vm.runInContext(source.replace('init().catch(e=>message(e.message));',''),context);
 const run = code => vm.runInContext(code, context);
 run(`renderTabs=renderFiles=renderContext=update=schedulePersist=renderProperties=renderBreadcrumb=syncBookmarkButton=showView=setMode=()=>{};refresh=async()=>{};setText=text=>$('editor').value=text;settings.autoSave=true;`);
 return {context,run,elements,timers};
}
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slate-autosave-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const vault=new Vault(root);await vault.init();return vault;
}

test('automatic text merge retains independent edits, same-position additions, and overlapping changes', () => {
 assert.equal(mergeNote('Hello world\nEnd\n','Hello brave world\nEnd\n','Hello world\nEnd!\n'),'Hello brave world\nEnd!\n');
 assert.equal(mergeNote('Start\n','Start\nLocal\n','Start\nRemote\n'),'Start\nRemote\nLocal\n');
 assert.equal(mergeNote('A\n','A\nSame\n','A\nSame\n'),'A\nSame\n');
 const merged=mergeNote('The quick brown fox.','The slow brown fox.','The quick red fox.');
 assert.equal(merged,'The slow red fox.');
 assert.equal(typeof mergeNote('Original text','Local replacement','Remote replacement'),'string');
});

test('uninterrupted typing cannot postpone autosave beyond two seconds', () => {
 const {run,timers}=setup();
 run(`let testNow=0;Date.now=()=>testNow;const draft={path:'A.md',dirty:true};queueAutoSave(draft);`);
 assert.equal([...timers.values()][0].delay,900);
 run('testNow=800;queueAutoSave(draft)');assert.equal([...timers.values()][0].delay,900);
 run('testNow=1600;queueAutoSave(draft)');assert.equal([...timers.values()][0].delay,400);
 run('testNow=2100;queueAutoSave(draft)');assert.equal([...timers.values()][0].delay,0);
});

test('stale note saves merge automatically and both original versions can be recovered', async t => {
 const vault=await fixture(t), base='Heading\nBody\n';
 const original=await vault.save('A.md',base,null);
 await vault.save('A.md','Heading!\nBody\n',original.revision);
 const saved=await vault.save('A.md','Heading\nBody and addition\n',original.revision,'note',base);
 assert.equal(saved.content,'Heading!\nBody and addition\n');
 assert.equal((await vault.read('A.md')).content,saved.content);
 const {entries}=await vault.recoveries();assert.equal(entries.length,2);
 const snapshots=await Promise.all(entries.map(entry=>vault.recoveryRead(entry.id,'A.md')));
 assert.deepEqual(new Set(snapshots.map(s=>s.content)),new Set(['Heading!\nBody\n','Heading\nBody and addition\n']));
 await assert.rejects(vault.save('A.md','unsafe',original.revision,'note','wrong baseline'),{status:409});
});

test('rapid switching saves each note without a dialog and ignores a slow earlier open', async t => {
 const vault=await fixture(t);await vault.save('A.md','A',null);await vault.save('B.md','B',null);
 const {context,run,elements}=setup();
 context.testApi=async(route,data)=>data?vault.save(data.path,data.content,data.revision,'note',data.baseContent):vault.read(new URLSearchParams(route.split('?')[1]).get('path'));
 run('api=testApi');await run(`openNote('A.md')`);run(`draftChanged('A edited')`);
 await run(`openNote('B.md')`);run(`draftChanged('B edited')`);await run(`openNote('A.md')`);await run('saveTail');
 assert.equal((await vault.read('A.md')).content,'A edited');assert.equal((await vault.read('B.md')).content,'B edited');
 assert.equal(elements.get('switchDialog')?.open,undefined);
 let resolveA;context.testApi=route=>route.includes('A.md')?new Promise(resolve=>{resolveA=resolve;}):vault.read('B.md');
 run('api=testApi');
 const slow=run(`openNote('A.md')`);await run(`openNote('B.md')`);resolveA(await vault.read('A.md'));await slow;
 assert.equal(run('current.path'),'B.md');
});

test('keystrokes during a merged save are rebased and drained before save resolves', async t => {
 const vault=await fixture(t), original=await vault.save('A.md','Hello\n',null);
 const {context,run}=setup();context.original=original;
 run(String.raw`current={...original,type:'note',original:'Hello\n',content:'Hello local\n',dirty:true};drafts.set('A.md',current);`);
 await vault.save('A.md','Remote\nHello\n',original.revision);
 let release, writes=0;
 context.testApi=async(route,data)=>{
  if(++writes===1)await new Promise(resolve=>{release=resolve;});
  return vault.save(data.path,data.content,data.revision,'note',data.baseContent);
 };
 run('api=testApi');const pending=run('save()');await Promise.resolve();
 run(String.raw`current.content='Hello local more\n';current.dirty=true;`);release();
 assert.equal(await pending,true);assert.equal((await vault.read('A.md')).content,'Remote\nHello local more\n');
 assert.equal(run('current.dirty'),false);assert.equal(writes,2);
});

test('clean cached notes pick up external changes while dirty drafts keep their baseline', () => {
 const {context,run}=setup();
 run(`current={path:'A.md',type:'note',content:'old',original:'old',revision:'old',dirty:false};drafts.set('A.md',current);`);
 context.incoming=[{path:'A.md',content:'external',revision:'new'}];run('reconcileNotes(incoming)');
 assert.equal(run('current.content'),'external');assert.equal(run("$('editor').value"),'external');
 run(`current.content='draft';current.dirty=true;`);context.incoming=[{path:'A.md',content:'new external',revision:'newer'}];run('reconcileNotes(incoming)');
 assert.equal(run('current.content'),'draft');assert.equal(run('current.original'),'external');
});

test('closing with autosave enabled waits for the write without opening a save prompt', async () => {
 const {context,run,elements}=setup();let release;
 context.testApi=()=>new Promise(resolve=>{release=()=>resolve({revision:'saved',content:'draft'});});
 run(`api=testApi;current={path:'A.md',type:'note',content:'draft',original:'base',revision:'base',dirty:true};drafts.set('A.md',current);tabs=[{path:'A.md',type:'note'}];activeTab='A.md';closeTab('A.md');`);
 await Promise.resolve();assert.equal(run('tabs.length'),1);release();await run('saveTail');await Promise.resolve();
 assert.equal(run('tabs.length'),0);assert.equal(elements.get('switchDialog')?.open,undefined);
});
