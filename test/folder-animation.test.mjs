import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function setup(reducedMotion=false){
 const animations=[];
 const element=()=>({children:[],dataset:{},attributes:{},classList:{toggle(){},add(){},remove(){}},
  append(child){child.parent=this;this.children.push(child);},replaceChildren(){this.children=[];},
  after(child){child.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,child);},
  remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);},
  setAttribute(key,value){this.attributes[key]=value;},getBoundingClientRect(){return {height:this.height??56};},scrollHeight:56,
  animate(frames,options){const animation={frames,options,cancel(){this.cancelled=true;}};animations.push(animation);return animation;}
 });
 const root=element();
 const context=vm.createContext({document:{getElementById:()=>root,createElement:element},window:{addEventListener(){},matchMedia:()=>({matches:reducedMotion,addEventListener(){}})},
  location:{hash:''},sessionStorage:{getItem(){}},localStorage:{getItem(){}},getComputedStyle:()=>({opacity:'1'})});
 const run=code=>vm.runInContext(code,context);
 run(source.replace('init().catch(e=>message(e.message));',''));
 run(`icon=()=>'';schedulePersist=()=>{};folders=['Projects'];notes=[{path:'Projects/Note.md'}];renderFiles();`);
 return {root,run,animations};
}

test('folder animation keeps the trigger and supports reversing an unfinished collapse',()=>{
 const {root,run,animations}=setup();
 const [trigger,children]=root.children;
 trigger.onclick();
 assert.equal(root.children[0],trigger);
 assert.equal(trigger.attributes['aria-expanded'],'false');
 assert.equal(children.inert,true);
 assert.equal(run(`closedFolders.has('Projects')`),true);
 children.height=24;
 trigger.onclick();
 assert.equal(animations[0].cancelled,true);
 assert.equal(animations[1].frames[0].height,'24px');
 assert.equal(children.inert,false);
 animations[1].onfinish();
 assert.equal(root.children[1],children);
 trigger.onclick();
 animations[2].onfinish();
 assert.equal(root.children.length,1);
 trigger.onclick();
 assert.equal(root.children[1].children.length,1);
 assert.equal(trigger.attributes['aria-expanded'],'true');
});

test('reduced motion opens and closes immediately without animations',()=>{
 const {root,animations}=setup(true);
 const trigger=root.children[0];
 trigger.onclick();
 assert.equal(root.children.length,1);
 trigger.onclick();
 assert.equal(root.children.length,2);
 assert.equal(root.children[1].inert,false);
 assert.equal(animations.length,0);
});
