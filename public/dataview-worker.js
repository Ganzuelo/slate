import {createIndex,query,inline,javascript,renderValue} from './dataview-engine.js';
// No token, filesystem handle, DOM, or application bridge enters this worker.
// The worker response has its own CSP denying network and child workers.
self.onmessage=async event=>{
 const {notes,source,origin,kind,javascriptEnabled}=event.data;
 try {
  const index=createIndex(notes);
  if(index.error)throw new Error(index.error);
  const js=kind==='dataviewjs'||kind==='inlinejs';
  if(js&&!javascriptEnabled)throw new Error('JavaScript queries are disabled. Enable them in Settings → Dataview.');
  const html=js?await javascript(index,source,origin,kind==='inlinejs'):kind==='inline'?renderValue(inline(index,source,origin)):await query(index,source,origin);
  self.postMessage({html});
 }catch(error){self.postMessage({error:String(error.message||error)});}
};
