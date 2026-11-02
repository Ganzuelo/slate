import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState, EditorSelection } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

// Exercise the editor's actual decoration builder with CodeMirror document and
// selection state, without needing a native window to render the widgets.
const source=await fs.readFile(new URL('../public/live-editor.js',import.meta.url),'utf8');
const spacingContext=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function fenceContexts('),source.indexOf('function codeFenceTab('))+source.slice(source.indexOf('function taskSpacing('),source.indexOf('class ExternalLinkWidget')),spacingContext);
const spacing=EditorState.transactionFilter.of(spacingContext.taskSpacing);

test('closing a newly typed checkbox adds one space and moves the caret in the same transaction',()=>{
 for(const prefix of ['- [ ', '  * [ ', '1. [ ', '> - [ ']){
  let state=EditorState.create({doc:prefix,selection:{anchor:prefix.length},extensions:[spacing]});
  state=state.update({changes:{from:prefix.length,insert:']'},selection:{anchor:prefix.length+1},userEvent:'input.type'}).state;
  assert.equal(state.doc.toString(),prefix+'] ');
  assert.equal(state.selection.main.head,prefix.length+2);
  state=state.update({changes:{from:state.selection.main.head,insert:'Task'},userEvent:'input.type'}).state;
  assert.equal(state.doc.toString(),prefix+'] Task');
 }
});

test('task spacing leaves code examples, pastes, and existing separators unchanged',()=>{
 for(const [doc,insert,event,expected] of [['```md\n- [ ',']','input.type','```md\n- [ ]'],['','- [ ]','input.paste','- [ ]'],['- [ ','] ','input.type','- [ ] ']]){
  const state=EditorState.create({doc,extensions:[spacing]}).update({changes:{from:doc.length,insert},selection:{anchor:doc.length+insert.length},userEvent:event}).state;
  assert.equal(state.doc.toString(),expected);
 }
});

test('closing a checkbox jumps over an existing separator or inserts one before text',()=>{
 for(const [doc,expected] of [['- [  ','- [ ] '],['- [ \tTask','- [ ]\tTask'],['- [ Task','- [ ] Task']]){
  const state=EditorState.create({doc,selection:{anchor:4},extensions:[spacing]}).update({changes:{from:4,insert:']'},selection:{anchor:5},userEvent:'input.type'}).state;
  assert.equal(state.doc.toString(),expected);assert.equal(state.selection.main.head,6);
 }
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

test('typing - [ ] produces a checkbox immediately and retains it while typing its description',()=>{
 let state=EditorState.create();
 for(const char of '- [ ]'){
  state=state.update({changes:{from:state.doc.length,insert:char},selection:{anchor:state.doc.length+1}}).state;
  assert.equal(checkboxes(state).length,char===']'?1:0);
 }
 for(const char of ' Buy milk'){
  state=state.update({changes:{from:state.doc.length,insert:char},selection:{anchor:state.doc.length+1}}).state;
  assert.equal(checkboxes(state).length,1);
 }
 assert.equal(state.doc.toString(),'- [ ] Buy milk');
 assert.equal(checkboxes(state)[0].checked,false);
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
 for(const text of ['- [ ]','- [x]','  * [ ]','1. [ ]']){
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
   assert.deepEqual(hidden,[[from,from+marker.length]]);
  }
 }
});
