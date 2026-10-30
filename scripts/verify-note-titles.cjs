// Verify creation and inline title editing in a disposable vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-title-'));
  await fs.writeFile(path.join(vault,'Welcome.md'),'See [[Untitled]].');
  server=spawn('node',[path.resolve(__dirname,'../server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'note-title-verification'}});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=code=>win.webContents.executeJavaScript(code,true);
  const until=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  await until('!!current && !!liveEditor');
  await run("$('newButton').click()");await until("current?.path==='Untitled.md'");
  assert.equal(await run("$('newDialog').open"),false);
  assert.equal(await run('getText()'),'');
  await run("$('addTabButton').click()");await until("current?.path==='Untitled 1.md'");
  await run("openNote('Untitled.md')");
  await run("settings.autoSave=false;replaceEditorText('Draft body');$('title').focus();$('title').textContent='Renamed';$('title').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await until("current?.path==='Renamed.md'&&!saving");
  assert.equal(await fs.readFile(path.join(vault,'Renamed.md'),'utf8'),'Draft body');
  assert.equal(await fs.readFile(path.join(vault,'Welcome.md'),'utf8'),'See [[Renamed]].');
  assert.equal(await run("document.querySelector('.tab.active .tab-label').textContent"),'Renamed');
  await run("$('title').focus();$('title').textContent='Canceled';$('title').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await run("$('title').textContent"),'Renamed');
  await run("$('title').focus();$('title').textContent='Untitled 1';$('title').blur()");
  await until("!saving && $('message').textContent.includes('already exists')");
  assert.equal(await run('current.path'),'Renamed.md');
  for(const theme of ['dark','light']){
   await run(`message();settings.theme='${theme}';applySettings();$('title').focus()`);
   assert.equal(await run("getComputedStyle($('title')).outlineStyle"),'none','title caret should not draw a focus box');
   await pause(150);
   await fs.writeFile(path.resolve(__dirname,'../evidence/note-title-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   await run("liveEditor.focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))");
   const editorOutline=await run("(()=>{const el=document.querySelector('.slate-editor-host .cm-content')||document.querySelector('.slate-editor-host .cm-editor');return {content:getComputedStyle(document.querySelector('.slate-editor-host .cm-content')).outlineStyle,editor:getComputedStyle(document.querySelector('.slate-editor-host .cm-editor')).outlineStyle};})()");
   assert.equal(editorOutline.content,'none','Tab in the note should not outline the content');
   assert.equal(editorOutline.editor,'none','Tab in the note should not outline the editor');
   await run("$('graphButton').focus()");
   assert.equal(await run("getComputedStyle($('graphButton')).outlineStyle"),'solid','chrome keeps a keyboard focus ring');
   await run("$('title').blur()");
  }
  console.log('Verified instant creation, unique names, inline rename, draft saving, link updates, Escape, collision handling, and no title/editor focus boxes in both themes.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{
  if(win)win.destroy();
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  if(vault&&path.dirname(vault)===os.tmpdir()&&path.basename(vault).startsWith('slate-title-'))await fs.rm(vault,{recursive:true,force:true});
  app.exit(process.exitCode||0);
 }
});
