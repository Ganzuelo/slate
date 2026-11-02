import { parseDocument } from 'yaml';
import { parsePage, parseFrontmatter } from '../vendor/dataview/src/data-import/markdown-file';
import { PageMetadata } from '../vendor/dataview/src/data-model/markdown';
import { parseQuery } from '../vendor/dataview/src/query/parse';
import { executeList, executeTable, executeTask, executeCalendar, executeInline, defaultLinkHandler } from '../vendor/dataview/src/query/engine';
import { Context } from '../vendor/dataview/src/expression/context';
import { matchingSourcePaths } from '../vendor/dataview/src/data-index/resolver';
import { EXPRESSION } from '../vendor/dataview/src/expression/parse';
import { DEFAULT_QUERY_SETTINGS } from '../vendor/dataview/src/settings';
import { Values, Link } from '../vendor/dataview/src/data-model/value';
import { DataArray } from '../vendor/dataview/src/api/data-array';
import { Result } from '../vendor/dataview/src/api/result';
import { DateTime, Duration } from 'luxon';

const settings = {...DEFAULT_QUERY_SETTINGS,renderNullAs:'-'};
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const position = (line,text='') => ({start:{line,col:0,offset:0},end:{line,col:text.length,offset:0}});

// Supply the Markdown cache Dataview normally receives from Obsidian. Fence
// contents and YAML never count as body metadata, tags, or tasks.
export function markdownCache(content) {
 const lines=content.split(/\r?\n/), cache={sections:[],headings:[],listItems:[],links:[],tags:[]};
 let first=0, fence=null, parents=[];
 if(lines[0]==='---') {
  const end=lines.findIndex((line,i)=>i>0&&/^(---|\.\.\.)\s*$/.test(line));
  if(end>0){const doc=parseDocument(lines.slice(1,end).join('\n'),{uniqueKeys:true});if(doc.errors.length)throw new Error('Invalid YAML: '+doc.errors[0].message);cache.frontmatter=doc.toJS({maxAliasCount:100});if(!cache.frontmatter||typeof cache.frontmatter!=='object'||Array.isArray(cache.frontmatter))cache.frontmatter={};first=end+1;}
 }
 const seen=new WeakSet();
 const frontmatterLinks=value=>{if(typeof value==='string')for(const match of value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)){cache.frontmatterLinks??=[];cache.frontmatterLinks.push({link:match[1],displayText:match[2]});}else if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))frontmatterLinks(child);}};
 frontmatterLinks(cache.frontmatter);
 for(let line=first;line<lines.length;line++) {
  const text=lines[line], mark=text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
  if(mark){if(!fence)fence={char:mark[1][0],length:mark[1].length};else if(mark[1][0]===fence.char&&mark[1].length>=fence.length&&!mark[2].trim())fence=null;continue;}
  if(fence||/^ {4}\S/.test(text)&&!parents.length)continue;
  const pos=position(line,text), list=text.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([^\]])\]\s*)?/), heading=text.match(/^(#{1,6})\s+(.*)$/);
  if(heading)cache.headings.push({heading:heading[2],level:heading[1].length,position:pos});
  if(list){const indent=list[1].replaceAll('\t','    ').length;while(parents.length&&parents.at(-1).indent>=indent)parents.pop();cache.listItems.push({position:pos,parent:parents.at(-1)?.line??-1,task:list[2],id:text.match(/\^([\w-]+)\s*$/)?.[1]});parents.push({line,indent});}
  else if(text.trim()&&!/^\s+/.test(text))parents=[];
  cache.sections.push({type:list?'list':heading?'heading':'paragraph',position:pos});
  const plain=text.replace(/`+[^`]*`+/g,'').replace(/%%.*?%%/g,'');
  for(const match of plain.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu))cache.tags.push({tag:'#'+match[1]});
  for(const match of plain.matchAll(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[[^\]]*\]\(([^)]+)\)/g)){
   const target=match[1]||match[3];if(!/^[a-z][\w+.-]*:|^\/\//i.test(target))cache.links.push({link:target,displayText:match[2],position:pos});
  }
 }
 return cache;
}

export function createIndex(notes) {
 const pages=new Map(), raw=new Map(notes.map(n=>[n.path,n]));
 const resolve=(target,origin='')=>{
  target=String(target).split('#')[0];try{target=decodeURIComponent(target);}catch{}
  const dir=origin.includes('/')?origin.slice(0,origin.lastIndexOf('/')+1):'';
  const normalize=p=>{const parts=[];for(const part of p.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}return parts.join('/');};
  for(const name of [normalize(dir+target),target])for(const p of [name,name+'.md'])if(raw.has(p))return {path:p};
  const matches=notes.filter(n=>n.path.split('/').at(-1).replace(/\.md$/i,'')===target.replace(/\.md$/i,''));
  return matches.length===1?{path:matches[0].path}:null;
 };
 const inverse=new Map(), tags=new Map(), resolvedLinks=Object.create(null);
 const index={pages,raw,metadataCache:{getFirstLinkpathDest:resolve,resolvedLinks},links:{getInverse:p=>inverse.get(p)||new Set()},tags:{getInverse:t=>tags.get(t.toLowerCase())||new Set()},starred:{starred:()=>false},vault:{getMarkdownFiles:()=>notes},csv:{get:async()=>Result.failure('CSV sources are not supported in Slate.')},prefix:{nodeExists:p=>p===''||notes.some(n=>n.path.startsWith(p.replace(/\/$/,'')+'/')),pathExists:p=>raw.has(p),get:p=>new Set(notes.filter(n=>!p||n.path.startsWith(p.replace(/\/$/,'')+'/')).map(n=>n.path)),resolveRelative:p=>p}};
 for(const note of notes){if(note.error)continue;try{const page=parsePage(note.path,note.content,{ctime:note.ctime||0,mtime:note.mtime||0,size:note.size??new TextEncoder().encode(note.content).length},markdownCache(note.content));pages.set(note.path,page);for(const tag of page.fullTags()){const key=tag.toLowerCase();if(!tags.has(key))tags.set(key,new Set());tags.get(key).add(note.path);}}catch(error){if(note.path)index.error=note.path+': '+error.message;}}
 for(const [path,page] of pages){resolvedLinks[path]=Object.create(null);for(const link of page.links){const target=resolve(link.path,path)?.path||link.path;resolvedLinks[path][target]=1;if(!inverse.has(target))inverse.set(target,new Set());inverse.get(target).add(path);}}
 // Normalize inline/frontmatter links as well as outgoing links, once every
 // page exists. This is the same canonicalization step used by Dataview.
 for(const [path,page] of pages)pages.set(path,PageMetadata.canonicalize(page,link=>link.withPath(resolve(link.path,path)?.path||link.path)));
 return index;
}

export function renderValue(value,depth=0) {
 if(depth>5)return '…';
 if(value==null)return '-';
 if(Values.isLink(value))return '<button type="button" class="wiki" data-link="'+esc(value.path)+'">'+esc(value.display||value.path.split('/').at(-1).replace(/\.md$/i,''))+'</button>';
 if(Values.isDate(value))return esc(value.toFormat('yyyy-MM-dd'));
 if(Values.isDuration(value))return esc(value.toHuman());
 if(Values.isWidget(value)&&value.$widget==='dataview:list-pair')return renderValue(value.key,depth+1)+': '+renderValue(value.value,depth+1);
 if(DataArray.isDataArray(value))value=value.array();
 if(Array.isArray(value))return value.map(v=>renderValue(v,depth+1)).join(', ');
 if(typeof value==='object')return esc(Values.toString(value));
 return esc(value);
}
const table=(names,rows)=>'<div class="dataview-table-wrap"><table class="dataview-table"><thead><tr>'+Array.from(names,n=>'<th>'+renderValue(n)+'</th>').join('')+'</tr></thead><tbody>'+Array.from(rows,r=>'<tr>'+Array.from(r,v=>'<td>'+renderValue(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const list=rows=>'<ul class="dataview-list">'+Array.from(rows,v=>'<li>'+renderValue(v)+'</li>').join('')+'</ul>';
function taskList(tasks,index) {
 return Array.from(tasks,t=>t.rows?'<h4>'+renderValue(t.key)+'</h4>'+taskList(t.rows,index):'<div class="dataview-task"><button type="button" class="task-check" role="checkbox" aria-checked="'+!!t.completed+'" aria-label="Toggle task" data-task-path="'+esc(t.path)+'" data-task-line="'+(t.line+1)+'" data-task-raw="'+esc(index.raw.get(t.path)?.content.split(/\r?\n/)[t.line])+'">'+(t.completed?'✓':'')+'</button><span>'+esc(t.text)+'</span> '+renderValue(Link.file(t.path))+'</div>').join('');
}
export async function query(index,source,origin) {
 const parsed=parseQuery(source).orElseThrow(),type=parsed.header.type;
 if(type==='table'){const result=(await executeTable(parsed,index,origin,settings)).orElseThrow();return table(result.names,result.data);}
 if(type==='list')return list((await executeList(parsed,index,origin,settings)).orElseThrow().data);
 if(type==='task')return taskList((await executeTask(parsed,origin,index,settings)).orElseThrow().tasks,index);
 if(type==='calendar'){const rows=(await executeCalendar(parsed,index,origin,settings)).orElseThrow().data.filter(r=>Values.isDate(r.date)).sort((a,b)=>a.date.toMillis()-b.date.toMillis());return table(['Date','File'],rows.map(r=>[r.date,r.link]));}
 throw new Error('Unsupported query type: '+type);
}
export function inline(index,source,origin) {return executeInline(EXPRESSION.field.tryParse(source),origin,index,settings).orElseThrow();}

export async function javascript(index,source,origin,isInline=false) {
 const output=[],array=v=>DataArray.wrap(Array.isArray(v)||DataArray.isDataArray(v)?v:[v],settings);
 const wrapPage=page=>{if(!page)return;const data=page.serialize(index);for(const [key,value] of Object.entries(data.file))if(Array.isArray(value))data.file[key]=array(value);return data;};
 const page=p=>wrapPage(index.pages.get(index.metadataCache.getFirstLinkpathDest(p,origin)?.path));
 const context=new Context(defaultLinkHandler(index,origin),settings,{this:page(origin)});
 const func=Object.fromEntries(Object.entries(context.functions).map(([key,value])=>[key,(...args)=>value(context,...args)]));
 const dv={
  current:()=>page(origin),page:p=>page(Values.isLink(p)?p.path:p),
  pages:(source='')=>array(Array.from(matchingSourcePaths(source?EXPRESSION.source.tryParse(source):{type:'folder',folder:''},index,origin).orElseThrow(),p=>wrapPage(index.pages.get(p))).filter(Boolean)),
  pagePaths:(source='')=>array(Array.from(matchingSourcePaths(source?EXPRESSION.source.tryParse(source):{type:'folder',folder:''},index,origin).orElseThrow())),
  array,isArray:v=>Array.isArray(v)||DataArray.isDataArray(v),isDataArray:DataArray.isDataArray,fileLink:Link.file,sectionLink:Link.header,blockLink:Link.block,
  date:v=>func.date(v),duration:v=>func.dur(v),luxon:{DateTime,Duration},func,
  parse:value=>{const result=EXPRESSION.inlineField.parse(value);return result.status?result.value:value;},literal:parseFrontmatter,
  compare:Values.compareValue,equal:(a,b)=>Values.compareValue(a,b)===0,clone:Values.deepCopy,
  evaluate:(expression,data={})=>{try{return context.evaluate(EXPRESSION.field.tryParse(expression),data);}catch(error){return Result.failure(error.message);}},
  tryEvaluate:(expression,data={})=>context.evaluate(EXPRESSION.field.tryParse(expression),data).orElseThrow(),
  list:rows=>output.push(list(rows)),table:(headers,rows)=>output.push(table(headers,rows)),taskList:tasks=>output.push(taskList(tasks,index)),
  header:(level,value)=>{level=Math.max(1,Math.min(6,Number(level)||1));output.push('<h'+level+'>'+renderValue(value)+'</h'+level+'>');},
  paragraph:value=>output.push('<p>'+renderValue(value)+'</p>'),span:value=>output.push(renderValue(value)),
  el:(tag,value)=>{if(!/^(p|span|div|strong|em|small|code|pre|h[1-6])$/.test(tag))throw new Error('Unsupported dv.el tag');output.push('<'+tag+'>'+renderValue(value)+'</'+tag+'>');},
  execute:async source=>output.push(await query(index,source,origin)),
 };
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const value=await new AsyncFunction('dv','dataview',isInline?'return ('+source+');':source)(dv,dv);
 return isInline?renderValue(value):output.join('');
}
