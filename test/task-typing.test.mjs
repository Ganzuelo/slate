import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState, EditorSelection } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

// Exercise the editor's actual decoration builder with CodeMirror document and
// selection state, without needing a native window to render the widgets.
const source=await fs.readFile(new URL('../public/live-editor.js',import.meta.url),'utf8');
const builder=source.slice(source.indexOf('function liveDecorations('),source.indexOf('function taskBlocks('));
const context=vm.createContext({Decoration,taskBlocks:()=>[],CheckboxWidget:class CheckboxWidget{constructor(checked,at,line){Object.assign(this,{checked,at,line});}},BulletWidget:class BulletWidget{}});
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
