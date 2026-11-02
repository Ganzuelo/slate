(() => {
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let running=0,queue=[],cache=new Map(),snapshot=null,javascriptEnabled=false;
 const workers=new Set();
 function reset(){queue.splice(0).forEach(job=>job.reject(new Error('Query canceled.')));for(const cancel of [...workers])cancel();cache.clear();}
 function pump(){while(running<2&&queue.length){const job=queue.shift();running++;let worker,timer,finished=false;
  const finish=(error,html)=>{if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();workers.delete(cancel);running--;error?job.reject(error):job.resolve(html);pump();};
  const cancel=()=>finish(new Error('Query canceled.'));workers.add(cancel);
  try{worker=new Worker('/vendor/dataview-worker.js');timer=setTimeout(()=>finish(new Error('Query exceeded the 5 second time limit.')),5000);worker.onmessage=event=>{const data=event.data;if(data&&typeof data.html==='string'&&data.html.length<=2000000)finish(null,data.html);else finish(new Error(String(data?.error||'Invalid query result.')));};worker.onerror=()=>finish(new Error('Dataview worker failed.'));worker.postMessage(job.data);}catch(error){finish(error);}
 }}
 // JavaScript queries can post arbitrary messages. Rebuild output from a narrow
 // allowlist instead of trusting worker HTML, including data attributes.
 function sanitize(html){
  const template=document.createElement('template'),fragment=document.createDocumentFragment();template.innerHTML=html;
  const allowed=new Set('DIV SPAN P UL OL LI TABLE THEAD TBODY TR TH TD H1 H2 H3 H4 H5 H6 STRONG EM SMALL CODE PRE BUTTON'.split(' '));
  let count=0;
  const copy=(node,parent)=>{
   if(++count>50000)throw new Error('Query output is too large.');
   if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
   if(node.nodeType!==1||!allowed.has(node.tagName))return;
   const el=document.createElement(node.tagName.toLowerCase());
   const classes=(node.getAttribute('class')||'').split(/\s+/).filter(c=>/^(dataview-[a-z-]+|wiki|task-check)$/.test(c));if(classes.length)el.className=classes.join(' ');
   if(node.tagName==='BUTTON'){
    el.type='button';
    const link=node.getAttribute('data-link');if(link!==null&&!/^[a-z][\w+.-]*:|^[\\/]|\.\.(?:[\\/]|$)/i.test(link))el.dataset.link=link;
    const path=node.getAttribute('data-task-path'),line=node.getAttribute('data-task-line');
    if(path&&/\.md$/i.test(path)&&!path.includes('..')&&!/[:\\]/.test(path)&&/^\d+$/.test(line||'')){
     el.dataset.taskPath=path;el.dataset.taskLine=line;el.dataset.taskRaw=node.getAttribute('data-task-raw')||'';el.setAttribute('role','checkbox');el.setAttribute('aria-checked',String(node.getAttribute('aria-checked')==='true'));el.setAttribute('aria-label','Toggle task');
     if(node.getAttribute('aria-checked')==='true'&&window.SlateIcons?.check)el.innerHTML=window.SlateIcons.check;
    }
   }
   if(!el.classList.contains('task-check'))for(const child of node.childNodes)copy(child,el);
   parent.append(el);
  };
  for(const child of template.content.childNodes)copy(child,fragment);
  return fragment;
 }
 function request(data){
  if(data.notes!==snapshot||data.javascriptEnabled!==javascriptEnabled){reset();snapshot=data.notes;javascriptEnabled=data.javascriptEnabled;}
  const key=JSON.stringify([data.source,data.origin,data.kind]);
  if(!cache.has(key)){const promise=new Promise((resolve,reject)=>{queue.push({data,resolve,reject});pump();});cache.set(key,promise);promise.catch(()=>{if(cache.get(key)===promise)cache.delete(key);});if(cache.size>100)cache.delete(cache.keys().next().value);}
  return cache.get(key);
 }
 async function render(el,data,onRendered){
  const marker={};el.dataviewRender=marker;el.textContent='Loading Dataview…';
  try{const html=await request(data);if(el.dataviewRender!==marker)return;el.replaceChildren(sanitize(html));if(!el.childNodes.length)el.textContent=data.kind.startsWith('inline')?'':'No results.';}
  catch(error){if(el.dataviewRender!==marker)return;el.innerHTML='<span class="dataview-error" role="alert">Dataview: '+escape(error.message)+'</span>';}
  onRendered?.();
 }
 window.SlateDataview={render,reset,sanitize};
})();
