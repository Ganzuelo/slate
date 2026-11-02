const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let server,win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  const vault=await fs.mkdtemp(path.join(root,'evidence','dataview-vault-'));
  await fs.mkdir(path.join(vault,'Books'));
  await fs.writeFile(path.join(vault,'Books','Alpha.md'),'---\ntags: [book]\nrating: 8\n---\n# Alpha\n- [ ] Read sequel\n');
  await fs.writeFile(path.join(vault,'Books','Beta.md'),'---\ntags: [book]\nrating: 10\n---\n# Beta\n');
  const content='# Dataview dashboard\n\nPage: `= this.file.name`\n\n```dataview\nTABLE rating FROM #book SORT rating DESC\n```\n\n```dataview\nTASK FROM #book WHERE !completed\n```\n\n```dataviewjs\ndv.list(dv.pages("#book").file.link);\n```\n\nInline JS: `$= dv.pages("#book").length`\n';
  await fs.writeFile(path.join(vault,'Dashboard.md'),content);
  server=spawn('node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let output='';server.stdout.on('data',data=>{output+=data;const match=output.match(/Open: (http[^\s]+)/);if(match)resolve(match[1]);});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:950,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'dataview-'+Date.now()}});
  const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3&&!/Content Security Policy/.test(message)){errors.push(message);console.error('RENDERER:',message);}});
  await win.loadURL(url);const run=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){console.error('SCRIPT:',code);throw error;}};
  const wait=async(code)=>{for(let i=0;i<120;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  await wait('!!liveEditor && notes.length===3');
  await run("(async()=>{settings.autoSave=false;await openNote('Dashboard.md');setMode('preview');})()");
  await wait("document.querySelector('#preview .dataview-table tbody')?.textContent.includes('Beta')");
  assert.match(await run("$('preview').textContent"),/JavaScript queries are disabled/);
  assert.equal(await run("document.querySelector('#preview .dataview-inline').textContent"),'Dashboard');
  assert.equal(await run("document.querySelector('#preview tbody tr').textContent"),'Beta10');
  await run('settings.dataviewJavascript=true;update()');
  await wait("document.querySelector('#preview .dataview-list')?.textContent.includes('Alpha')");
  await wait("[...document.querySelectorAll('#preview .dataview-inline')].at(-1)?.textContent==='2'");
  for(const theme of ['dark','light']){
   await run(`settings.theme='${theme}';applySettings()`);
   await wait("!$('preview').textContent.includes('Loading Dataview')");await pause(100);
   await win.webContents.capturePage();await pause(100);
   await fs.writeFile(path.join(root,'evidence','dataview-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await run("document.querySelector('#preview [data-task-path]').click()");
  await wait("document.querySelector('#preview .dataview-query:nth-of-type(2)')?.textContent==='No results.' || !document.querySelector('#preview [data-task-path]')");
  assert.match(await fs.readFile(path.join(vault,'Books','Alpha.md'),'utf8'),/- \[x\] Read sequel/);
  await run("document.querySelector('#preview [data-link=\"Books/Beta.md\"]').click()");await wait("current?.path==='Books/Beta.md'");
  await run("draftChanged(getText().replace('rating: 10','rating: 12'))");
  await run("(async()=>{await openNote('Dashboard.md');setMode('edit');liveEditor.setSelection(0);})()");
  await wait("document.querySelector('#liveEditor .dataview-table tbody')?.textContent.includes('Beta')");
  await wait("document.querySelector('#liveEditor .dataview-table tbody')?.textContent.includes('Beta12')");
  await wait("[...document.querySelectorAll('#liveEditor .dataview-inline')].some(el=>el.textContent==='Dashboard')");
  assert.equal(await run("document.querySelector('#liveEditor .dataview-query .task-query-source').textContent"),'Edit query');
  await run("document.querySelector('#liveEditor .dataview-query .task-query-source').click()");
  assert.ok(await run("document.querySelector('#liveEditor .cm-content').textContent.includes('TABLE rating')"));
  await run("liveEditor.setSelection(0);settings.dataviewEnabled=false;liveEditor.refreshTasks();setMode('preview')");
  assert.equal(await run("document.querySelectorAll('#preview [data-dataview]').length"),0);
  // Treat even forged worker messages as untrusted HTML.
  assert.equal(await run(`(()=>{const el=document.createElement('div');el.append(SlateDataview.sanitize('<script>alert(1)</script><img src=x onerror=alert(1)><button onclick="alert(1)" data-link="javascript:alert(1)">X</button><svg onload="alert(1)"></svg>'));return el.innerHTML;})()`),'<button type="button">X</button>');
  await run("settings.dataviewEnabled=true;const el=document.createElement('div');document.body.append(el);el.id='dvTimeout';renderDataview(el,'while(true){}','dataviewjs')");
  await wait("document.getElementById('dvTimeout').textContent.includes('time limit')");
  // Verify worker policy blocks network while allowing the DataviewJS evaluator.
  await run("renderDataview(document.getElementById('dvTimeout'),'try { await fetch(\"/api/notes\"); dv.paragraph(\"NETWORK ALLOWED\"); } catch { dv.paragraph(\"NETWORK BLOCKED\"); }','dataviewjs')");
  await wait("document.getElementById('dvTimeout').textContent.includes('NETWORK BLOCKED')");
  assert.deepEqual(errors,[]);console.log('PASS: Dataview reading/live views, inline DQL/JS, settings, task toggles, navigation, output sanitization, worker timeout and network isolation; dark/light screenshots.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{win?.destroy();server?.kill();app.exit(process.exitCode||0);}
});
