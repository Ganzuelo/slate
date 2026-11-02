import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const bundle=await fs.readFile(new URL('../public/vendor/dataview-worker.js',import.meta.url),'utf8');
const notes=[
 {path:'Books/Alpha.md',ctime:Date.UTC(2024,0,1),mtime:Date.UTC(2025,1,2),content:'---\ntags: [book/fiction]\nrating: 8\nread: true\nfinished: 2024-08-17\nthoughts:\n  score: 9\n---\n# Alpha\nGenre:: Fantasy\n[field:: 42]\n- [ ] Read sequel [due:: 2025-01-01]\n  - [x] Buy book\n[[Beta]]\n```js\nFake:: 999\n#wrong\n- [ ] Fake task\n```'},
 {path:'Books/Beta.md',content:'---\ntags: [book]\nrating: 10\nread: false\n---\n# Beta\nGenre:: History\n- [x] Finished reading\n'},
 {path:'Dashboard.md',content:'# Dashboard\n[[Books/Alpha]]\n'},
];
async function run(source,kind='dataview',extra={}){
 let result;
 const context=vm.createContext({TextEncoder,console,self:{postMessage:data=>{result=data;}}});
 vm.runInContext(bundle,context);
 await context.self.onmessage({data:{notes,source,origin:'Dashboard.md',kind,javascriptEnabled:true,...extra}});
 return result;
}
const html=async(...args)=>{const result=await run(...args);assert.ok(!result.error,result.error);return result.html;};

test('Dataview uses upstream DQL for typed YAML, inline fields, dates, nested metadata and sorting',async()=>{
 const result=await html('TABLE rating, thoughts.score, genre, field, finished.year FROM #book WHERE read SORT rating DESC');
 assert.match(result,/Alpha/);assert.doesNotMatch(result,/Beta/);for(const value of ['8','9','Fantasy','42','2024'])assert.match(result,new RegExp('>'+value+'<'));
 assert.match(await html('TABLE WITHOUT ID file.name AS Name FROM "Books" SORT rating DESC'),/Beta[\s\S]*Alpha/);
 assert.match(await html('LIST FROM #book/fiction'),/Alpha/);
 assert.doesNotMatch(await html('LIST FROM #wrong'),/Alpha/);
});
test('Dataview supports source combinations, links, GROUP BY, FLATTEN, LIMIT and functions',async()=>{
 assert.match(await html('LIST FROM [[Books/Alpha]]'),/Dashboard/);
 assert.match(await html('LIST FROM outgoing([[Books/Alpha]])'),/Beta/);
 const groups=await html('TABLE rows.file.link FROM #book GROUP BY genre SORT genre');assert.match(groups,/Fantasy/);assert.match(groups,/History/);
 assert.match(await html('LIST WITHOUT ID upper(file.name) FROM #book FLATTEN rating AS score WHERE score > 8 LIMIT 1'),/BETA/);
 assert.doesNotMatch(await html('LIST FROM #book AND !#book/fiction'),/Alpha/);
});
test('Dataview tasks preserve physical line numbers, raw source, nesting, completion and metadata',async()=>{
 const result=await html('TASK FROM #book WHERE !completed');
 assert.match(result,/Read sequel/);assert.doesNotMatch(result,/Fake task|Buy book|Finished reading/);
 assert.match(result,/data-task-path="Books\/Alpha.md" data-task-line="12"/);
 assert.match(result,/data-task-raw="- \[ \] Read sequel \[due:: 2025-01-01\]"/);
 assert.match(await html('TASK FROM #book GROUP BY completed'),/Read sequel/);
});
test('Dataview inline expressions, file timestamps, calendar output and diagnostics',async()=>{
 assert.equal(await html('this.file.name','inline'),'Dashboard');
 assert.equal(await html('[[Books/Alpha]].file.mtime.year','inline'),'2025');
 assert.match(await html('CALENDAR finished FROM #book'),/2024-08-17/);
 assert.match((await run('TABLE FROM')).error,/PARSING|parse|expected/i);
 assert.match((await run('LIST FROM csv("books.csv")')).error,/CSV sources/);
});
test('DataviewJS uses upstream DataArrays and read-only data rendering API',async()=>{
 const result=await html('for (const group of dv.pages("#book").groupBy(p=>p.genre)) { dv.header(3,group.key); dv.table(["Name","Rating"],group.rows.sort(p=>p.rating,"desc").map(p=>[p.file.link,p.rating])); }','dataviewjs');
 assert.match(result,/Fantasy/);assert.match(result,/Alpha/);assert.match(result,/History/);
 assert.match(await html('dv.taskList(dv.pages("#book").file.tasks.where(t=>!t.completed));','dataviewjs'),/Read sequel/);
 assert.equal(await html('dv.current().file.name','inlinejs'),'Dashboard');
 assert.equal(await html('dv.current().file.outlinks.where(l=>l.path.includes("Alpha")).length','inlinejs'),'1');
 assert.equal(await html('dv.array(42).first()','inlinejs'),'42');
 assert.equal(await html('dv.duration("2 days").as("hours")','inlinejs'),'48');
 assert.equal(await html('dv.tryEvaluate("x + 2", {x: 3})','inlinejs'),'5');
 assert.match((await run('dv.paragraph("hi")','dataviewjs',{javascriptEnabled:false})).error,/disabled/);
 assert.match((await run('dv.app.vault.delete("x")','dataviewjs')).error,/undefined/);
});
test('frontmatter and inline links use canonical paths, including outgoing link sources',async()=>{
 const data=[{path:'Books/Alpha.md',content:'---\nrelated: "[[Beta]]"\n---\n[other:: [[Beta]]]'},notes[1]];
 assert.match(await html('LIST FROM outgoing([[Books/Alpha]])','dataview',{notes:data}),/Beta/);
 assert.equal(await html('dv.page("Books/Alpha").related.path','inlinejs',{notes:data}),'Books/Beta.md');
 assert.equal(await html('dv.page("Books/Alpha").other.path','inlinejs',{notes:data}),'Books/Beta.md');
});
test('query output escapes stored HTML and JavaScript text',async()=>{
 assert.equal(await html('dv.paragraph("<img src=x onerror=alert(1)>");','dataviewjs'),'<p>&lt;img src=x onerror=alert(1)&gt;</p>');
 const result=await html('TABLE evil FROM ""', 'dataview',{notes:[{path:'X.md',content:'---\nevil: "<script>alert(1)</script>"\n---'}]});
 assert.doesNotMatch(result,/<script>/);assert.match(result,/&lt;script&gt;/);
});
