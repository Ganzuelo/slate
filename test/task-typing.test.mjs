import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState, EditorSelection } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { markdown, markdownLanguage, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';

// Exercise the editor's actual decoration builder with CodeMirror document and
// selection state, without needing a native window to render the widgets.
const source=await fs.readFile(new URL('../public/live-editor.js',import.meta.url),'utf8');
// Run the editor's own Enter command (as configured in live-editor.js).
const enterContext=vm.createContext({insertNewlineContinueMarkupCommand});
const enterFrom=source.indexOf('const continueList');
vm.runInContext(source.slice(enterFrom,source.indexOf('\n}',source.indexOf('function continueMarkup(',enterFrom))+2)+';globalThis.continueMarkup=continueMarkup;',enterContext);
function pressEnter(doc,at=doc.length){
 let state=EditorState.create({doc,selection:{anchor:at},extensions:[markdown({base:markdownLanguage})]});
 ensureSyntaxTree(state,state.doc.length,5000);
 const view={get state(){return state;},dispatch(tr){state=(tr.state?tr:state.update(tr)).state;}};
 assert.equal(enterContext.continueMarkup(view),true);
 return state;
}

test('Enter on a task continues with an empty task and the caret after its separator',()=>{
 for(const [doc,expected] of [['- [ ] Buy milk','- [ ] Buy milk\n- [ ] '],['- [x] Done','- [x] Done\n- [ ] '],['  * [ ] Nested','  * [ ] Nested\n  * [ ] '],['> - [ ] Quoted','> - [ ] Quoted\n> - [ ] ']]){
  const state=pressEnter(doc);
  assert.equal(state.doc.toString(),expected);
  assert.equal(state.selection.main.head,expected.length);
 }
});

test('Enter on an empty task ends the list instead of adding another task',()=>{
 const state=pressEnter('- [ ] Buy milk\n- [ ] ');
 assert.equal(state.doc.toString(),'- [ ] Buy milk\n');
 assert.equal(state.selection.main.head,state.doc.length);
});

const builder=source.slice(source.indexOf('function liveDecorations('),source.indexOf('function taskBlocks('));
const context=vm.createContext({Decoration,taskBlocks:()=>[],CheckboxWidget:class CheckboxWidget{constructor(checked,at,line){Object.assign(this,{checked,at,line});}},BulletWidget:class BulletWidget{},TaskControlsWidget:class TaskControlsWidget{}});
vm.runInContext(builder,context);
function checkboxes(state,{focused=true,code=false}={}){
 const fences=new Map(Array.from({length:state.doc.lines},(_,i)=>[i+1,{code,fence:false}]));
 const decorations=context.liveDecorations({state,hasFocus:focused,visibleRanges:[{from:0,to:state.doc.length}]},fences);
 const boxes=[];for(let cursor=decorations.iter();cursor.value;cursor.next())if(cursor.value.spec.widget?.constructor.name==='CheckboxWidget')boxes.push({from:cursor.from,to:cursor.to,...cursor.value.spec.widget});
 return boxes;
}

test('typing - [ ] becomes a checkbox once its separator space is typed, then stays while typing',()=>{
 let state=EditorState.create();
 for(const char of '- [ ] Buy milk'){
  state=state.update({changes:{from:state.doc.length,insert:char},selection:{anchor:state.doc.length+1}}).state;
  assert.equal(checkboxes(state).length,state.doc.length>=6?1:0,JSON.stringify(state.doc.toString()));
 }
 assert.equal(state.doc.toString(),'- [ ] Buy milk');
 assert.equal(checkboxes(state)[0].checked,false);
});

test('the checkbox widget stops at the closing bracket so the separator space stays visible',()=>{
 for(const doc of ['- [ ] ','- [ ] Buy milk','  * [x]\tTask']){
  const state=EditorState.create({doc,selection:{anchor:doc.length}});
  const [box]=checkboxes(state);
  assert.equal(doc.slice(box.from,box.to).trim().slice(-1),']',doc);
  assert.equal(box.to,doc.indexOf(']')+1);
 }
});

test('marker editing and selections expose Markdown; leaving the marker restores the checkbox',()=>{
 let state=EditorState.create({doc:'- [ ] Buy milk',selection:{anchor:3}});
 assert.equal(checkboxes(state).length,0);
 state=state.update({selection:{anchor:10}}).state;
 assert.equal(checkboxes(state).length,1);
 state=state.update({selection:EditorSelection.range(0,8)}).state;
 assert.equal(checkboxes(state).length,0);
 assert.equal(checkboxes(state,{focused:false}).length,1);
});

test('empty, checked, indented and numbered tasks render while fenced examples stay literal',()=>{
 for(const text of ['- [ ] ','- [x] ','  * [ ] ','1. [ ] ']){
  const state=EditorState.create({doc:text,selection:{anchor:text.length}});
  const boxes=checkboxes(state);assert.equal(boxes.length,1,text);assert.equal(boxes[0].checked,text.includes('[x]'));
  assert.equal(checkboxes(state,{code:true}).length,0);
 }
});

test('live urgency markers stay hidden for caret mappings and selections while literal code remains visible',()=>{
 for(const marker of ['🔺','⏫','🔼','🔽','⏬']){
  const doc='- [ ] **Task** `🔺` '+marker,from=doc.lastIndexOf(marker);
  for(const selection of [EditorSelection.cursor(from),EditorSelection.cursor(from+1),EditorSelection.range(0,doc.length)]){
   const state=EditorState.create({doc,selection});
   const decorations=context.liveDecorations({state,hasFocus:true,visibleRanges:[{from:0,to:doc.length}]},new Map([[1,{code:false}]]),null,()=>'',()=>{});
   const hidden=[];for(let cursor=decorations.iter();cursor.value;cursor.next())if(cursor.value.spec.taskMetadata)hidden.push([cursor.from,cursor.to]);
   assert.deepEqual(hidden,[[from-1,from+marker.length]]);
  }
 }
});

function hiddenMetadata(doc){
 const state=EditorState.create({doc,selection:{anchor:doc.length}});
 const decorations=context.liveDecorations({state,hasFocus:true,visibleRanges:[{from:0,to:doc.length}]},new Map([[1,{code:false}]]),null,()=>'',()=>{});
 const hidden=[],lines=[];
 for(let cursor=decorations.iter();cursor.value;cursor.next()){if(cursor.value.spec.taskMetadata)hidden.push(doc.slice(cursor.from,cursor.to));if(cursor.value.spec.class?.includes('cm-slate-task-line'))lines.push(cursor.value.spec.class);}
 return {hidden,lines};
}

test('a date and urgency run hides as one atomic range so the caret cannot split it',()=>{
 assert.deepEqual(hiddenMetadata('- [ ] Buy milk 📅 2026-11-05 ⏫').hidden,[' 📅 2026-11-05 ⏫']);
 assert.deepEqual(hiddenMetadata('- [ ] Buy 📅 2026-11-05 milk ⏫').hidden,[' 📅 2026-11-05',' ⏫']);
 // The separator after an empty task's checkbox stays visible text.
 assert.deepEqual(hiddenMetadata('- [ ] 📅 2026-11-05').hidden,['📅 2026-11-05']);
});

test('completed tasks are crossed out; open and other statuses are not',()=>{
 const done=doc=>{const state=EditorState.create({doc});const decorations=context.liveDecorations({state,hasFocus:false,visibleRanges:[{from:0,to:doc.length}]},new Map([[1,{code:false}]]));for(let cursor=decorations.iter();cursor.value;cursor.next())if(cursor.value.spec.class==='cm-slate-task-done')return true;return false;};
 for(const doc of ['- [x] Shipped','- [X] Shipped','  * [x] Nested'])assert.equal(done(doc),true,doc);
 for(const doc of ['- [ ] Open','- [/] Doing','- [x]','Plain [x] text'])assert.equal(done(doc),false,doc);
});

test('a completed task hides its completion marker and reserves the date and check slots',()=>{
 const doc='- [x] Plan 📅 2026-11-01 ⏫ ✅ 2026-11-02';
 assert.deepEqual(hiddenMetadata(doc),{hidden:[' 📅 2026-11-01 ⏫ ✅ 2026-11-02'],lines:['cm-slate-task-line has-due has-urgency']});
 assert.deepEqual(hiddenMetadata('- [x] Plain').lines,['cm-slate-task-line has-urgency']);
 assert.equal(pressEnter(doc,10).doc.toString(),doc+'\n- [ ] ');
});

test('task lines reserve right-edge space for the chips they show',()=>{
 assert.deepEqual(hiddenMetadata('- [ ] Plain').lines,['cm-slate-task-line']);
 assert.deepEqual(hiddenMetadata('- [ ] Low 🔽').lines,['cm-slate-task-line']);
 assert.deepEqual(hiddenMetadata('- [ ] Both 📅 2026-11-05 🔺').lines,['cm-slate-task-line has-due has-urgency']);
});

test('Enter at the end of task text keeps hidden metadata on its line',()=>{
 for(const at of [14,28]){
  const doc='- [ ] Buy milk 📅 2026-11-05 ⏫',state=pressEnter(doc,at);
  assert.equal(state.doc.toString(),doc+'\n- [ ] ');
  assert.equal(state.selection.main.head,state.doc.length);
 }
 // Enter inside the description still splits the text as usual.
 assert.equal(pressEnter('- [ ] Buy milk ⏫',9).doc.toString(),'- [ ] Buy\n- [ ]  milk ⏫');
});
