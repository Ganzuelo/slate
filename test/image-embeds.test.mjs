import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';

const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const editor = await fs.readFile(new URL('../public/live-editor.js', import.meta.url), 'utf8');
const assets = [
  {path:'Attachments/My photo.png',mime:'image/png'},
  {path:'Folder/Local photo.png',mime:'image/png'},
  {path:'A/duplicate.png',mime:'image/png'},
  {path:'B/duplicate.png',mime:'image/png'},
];
function attachmentContext(fetch) {
  const context=vm.createContext({attachments:assets,current:{path:'Folder/Note.md'},fetch,token:'private-token',URL:{createObjectURL:()=> 'blob:local-image'}});
  vm.runInContext(app.slice(app.indexOf('const embedCache='),app.indexOf('function renderProperties')),context);
  return context;
}
test('attachment resolution trims padding, preserves spaces, resolves local paths, and rejects remote or ambiguous targets',()=>{
  const ctx=attachmentContext();
  for(const raw of ['  Attachments/My photo.png  ','Attachments/My%20photo.png','../Attachments/My photo.png'])
    assert.equal(ctx.resolveAttachment(raw)?.path,assets[0].path);
  assert.equal(ctx.resolveAttachment('./Local photo.png')?.path,assets[1].path);
  assert.equal(ctx.resolveAttachment('My photo.png')?.path,assets[0].path);
  for(const raw of ['https://example.com/My photo.png','//example.com/a.png','data:image/png;base64,abc','file:///a.png','duplicate.png','missing.png'])
    assert.equal(ctx.resolveAttachment(raw),null,raw);
});
test('attachment loading deduplicates authenticated requests and retries failures without token URLs',async()=>{
  const calls=[];let fail=true;
  const ctx=attachmentContext(async(url,options)=>{calls.push({url,options});return {ok:!fail,blob:async()=>({})};});
  await assert.rejects(ctx.loadAttachment(assets[0]));
  fail=false;
  const values=await Promise.all([ctx.loadAttachment(assets[0]),ctx.loadAttachment(assets[0])]);
  assert.deepEqual(values,['blob:local-image','blob:local-image']);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.url,'/api/attachment?path=Attachments%2FMy%20photo.png');
    assert.equal(call.options.headers['X-Slate-Token'],'private-token');
    assert.ok(!call.url.includes('private-token'));
  }
});
const ctx=vm.createContext({EditorView,StateField,StateEffect,Decoration,WidgetType,syntaxTree});
vm.runInContext(editor.slice(editor.indexOf('function fenceContexts'),editor.indexOf('function codeFenceTab')),ctx);
vm.runInContext(editor.slice(editor.indexOf('const refreshTaskQueries='),editor.indexOf('function queryPreview')),ctx);
const resolver=attachmentContext();
const options={resolveAttachment:raw=>resolver.resolveAttachment(raw),loadAttachment:async()=> 'blob:local-image'};
test('standalone image source stays editable on its line and becomes an image when the cursor leaves',()=>{
  const text='Before\n![[  Attachments/My photo.png  ]]\nAfter';
  const field=ctx.imagePreview(options);
  const state=EditorState.create({doc:text,selection:{anchor:10},extensions:[markdown(),field]});
  let range=state.field(field).iter();
  assert.equal(range.from,text.indexOf('\nAfter'));
  assert.equal(range.to,range.from);
  assert.equal(range.value.spec.block,true);
  const next=state.update({selection:{anchor:0}}).state;
  range=next.field(field).iter();
  assert.equal(range.from,7);
  assert.equal(range.to,text.indexOf('\nAfter'));
  assert.equal(range.value.spec.widget.asset.path,assets[0].path);
  assert.equal(range.value.spec.block,true);
});
test('inline and fenced code remain literal and remote images never create widgets',()=>{
  for(const text of ['`![[Attachments/My photo.png]]`','`` ![[Attachments/My photo.png]] ``','```md\n![[Attachments/My photo.png]]\n```','~~~\n![photo](Attachments/My photo.png)\n~~~','![photo](https://example.com/image.png)']){
    const state=EditorState.create({doc:text,extensions:[markdown()]});
    assert.equal(ctx.imageEmbeds(state,options).length,0,text);
  }
  const state=EditorState.create({doc:'![photo](Attachments/My photo.png)',extensions:[markdown()]});
  assert.equal(ctx.imageEmbeds(state,options).length,1);
});
test('Reading view isolates code examples and hydrates padded image links with the shared loader',async()=>{
  const rendered=vm.createContext({settings:{strictLineBreaks:false},current:{path:'Note.md'},esc:s=>s,icon:()=>''});
  vm.runInContext(app.slice(app.indexOf('function inline('),app.indexOf('const embedCache=')),rendered);
  for(const text of ['`![[Attachments/My photo.png]]`','`` ![[Attachments/My photo.png]] ``','```md\n![[Attachments/My photo.png]]\n```']){
    const html=rendered.markdown(text);
    assert.ok(html.includes('<code>'));
    assert.ok(!html.includes('data-embed'),text);
  }
  assert.match(rendered.markdown('![[  Attachments/My photo.png  ]]'),/data-embed="  Attachments\/My photo.png  "/);
  let child;
  const target={dataset:{embed:'  Attachments/My photo.png  '},replaceChildren:node=>{child=node;}};
  const context=attachmentContext(async()=>({ok:true,blob:async()=>({})}));
  context.$=()=>({querySelectorAll:()=>[target]});
  context.document={createElement:tag=>({tag})};
  await context.hydrateEmbeds();
  assert.equal(child.tag,'img');
  assert.equal(child.src,'blob:local-image');
  assert.equal(child.alt,assets[0].path);
});
