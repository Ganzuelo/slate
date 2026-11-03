// Exercise the real drawing engine in Electron against a disposable vault.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), {spawn} = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanup(){win?.destroy();if(server?.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}if(vault&&path.dirname(vault)===os.tmpdir()&&path.basename(vault).startsWith('slate-whiteboard-'))await fs.rm(vault,{recursive:true,force:true});}
// Excalidraw falls back to browser downloads without the native file picker, which a hidden window cannot answer.
app.commandLine.appendSwitch('disable-blink-features','FileSystemAccess,FileSystemAccessLocal');
app.whenReady().then(async()=>{
 try {
  vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-whiteboard-'));
  await fs.writeFile(path.join(vault,'Note.md'),'# Notes\n');
  server=spawn('node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',data=>{out+=data;const m=out.match(/Open: (http[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'whiteboard-'+Date.now()}});
  const errors=[],remote=[];
  win.webContents.on('console-message',event=>{if(event.level==='error'&&!event.message.includes('409 (Conflict)')){errors.push(event.message);console.error('Renderer:',event.message);}});
  win.webContents.session.webRequest.onBeforeRequest((details,cb)=>{if(/^https?:/.test(details.url)&&!details.url.startsWith(new URL(url).origin+'/'))remote.push(details.url);cb({cancel:false});});
  await win.loadURL(url);win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=code=>win.webContents.executeJavaScript(code,true);
  async function until(code){for(let i=0;i<100;i++){if(await run(code))return;await pause(100);}throw new Error('Timed out: '+code+' '+await run("lastMessage"));}
  await until('!!current && !!liveEditor');
  await run("settings.autoSave=false;$('whiteboardButton').click()");await until("current?.path==='Untitled.excalidraw'");
  await until("!!document.querySelector('#whiteboardHost canvas')");
  await pause(500);
  assert.equal(await run('current.type'),'whiteboard');
  await run("document.querySelector('[data-testid=\"toolbar-rectangle\"]').click()");
  const box=await run("(()=>{const r=$('whiteboardHost').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  assert.ok(box.height>250,JSON.stringify(box));
  for(const [type,x,y] of [['mouseDown',400,300],['mouseMove',600,430],['mouseUp',600,430]]){win.webContents.sendInputEvent({type,x:Math.round(box.x+x),y:Math.round(box.y+y),button:'left',clickCount:1});await pause(100);}
  await until('JSON.parse(current.content).elements.length===1');
  await run("document.querySelector('[data-testid=\"button-undo\"]').click()");
  await until('JSON.parse(current.content).elements.length===0');
  await run("document.querySelector('[data-testid=\"button-redo\"]').click()");
  await until('JSON.parse(current.content).elements.length===1');
  await run("document.querySelector('[data-testid=\"toolbar-text\"]').click()");
  for(const type of ['mouseDown','mouseUp']){win.webContents.sendInputEvent({type,x:Math.round(box.x+660),y:Math.round(box.y+350),button:'left',clickCount:1});await pause(100);}
  await until("!!document.querySelector('#whiteboardHost textarea')");
  await win.webContents.insertText('Slate whiteboard');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until("JSON.parse(current.content).elements.some(el=>el.type==='text'&&el.text==='Slate whiteboard')");
  await run('save()');assert.equal(await run('current.dirty'),false);
  let disk=JSON.parse(await fs.readFile(path.join(vault,'Untitled.excalidraw'),'utf8'));assert.equal(disk.elements[0].type,'rectangle');
  await run("openNote('Note.md')");assert.equal(await run("$('whiteboardHost').childElementCount"),0);
  await run("openNote('Untitled.excalidraw')");await until("!!document.querySelector('#whiteboardHost canvas')");await pause(300);
  assert.equal(await run('JSON.parse(current.content).elements.length'),2);
  const download=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Export timeout')),10000);win.webContents.session.once('will-download',(event,item)=>{item.setSavePath(path.join(vault,'Sketch.png'));item.once('done',(_,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(new Error(state));});});});
  // Export through Excalidraw's own image dialog.
  await run("document.querySelector('[data-testid=\"main-menu-trigger\"]').click()");await until("!!document.querySelector('[data-testid=\"image-export-button\"]')");
  await run("document.querySelector('[data-testid=\"image-export-button\"]').click()");await until("!!document.querySelector('[aria-label=\"Export to PNG\"]')");
  await run("document.querySelector('[aria-label=\"Export to PNG\"]').click()");await download;
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(200);
  assert.ok((await fs.stat(path.join(vault,'Sketch.png'))).size>100);
  for(const theme of ['dark','light']){
   await run(`settings.theme='${theme}';applySettings()`);await pause(200);
   await run("document.querySelector('[data-testid=\"toolbar-rectangle\"]').click()");
   // Excalidraw keeps its original toolbar and theme (DESIGN.md exception).
   assert.equal(await run("document.querySelector('[data-testid=\"toolbar-rectangle\"]').checked"),true);
   assert.equal(await run("document.querySelector('#whiteboardHost .excalidraw').classList.contains('theme--dark')"),theme==='dark');
   await fs.writeFile(path.join(root,'evidence','whiteboard-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  // An external edit must never be overwritten by a stale whiteboard draft.
  const external=JSON.parse(await fs.readFile(path.join(vault,'Untitled.excalidraw'),'utf8'));external.appState.viewBackgroundColor='#eeeeee';
  await fs.writeFile(path.join(vault,'Untitled.excalidraw'),JSON.stringify(external));
  assert.equal(await run('save()'),false);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(vault,'Untitled.excalidraw'),'utf8')),external);
  await run("newDialog('Copy.excalidraw','copy');$('confirmNew').click()");
  await until("current.path==='Copy.excalidraw' && !!document.querySelector('#whiteboardHost canvas')");
  assert.equal(JSON.parse(await fs.readFile(path.join(vault,'Copy.excalidraw'),'utf8')).elements.length,2);
  await run("newDialog('Renamed.excalidraw','rename');$('confirmNew').click()");
  await until("current.path==='Renamed.excalidraw' && !!document.querySelector('#whiteboardHost canvas')");
  await run("settings.autoSave=true;document.querySelector('[data-testid=\"toolbar-rectangle\"]').click()");
  for(const [type,x,y] of [['mouseDown',400,500],['mouseMove',500,580],['mouseUp',500,580]]){win.webContents.sendInputEvent({type,x:Math.round(box.x+x),y:Math.round(box.y+y),button:'left',clickCount:1});await pause(100);}
  await until('JSON.parse(current.content).elements.length===3 && !current.dirty');
  assert.equal(JSON.parse(await fs.readFile(path.join(vault,'Renamed.excalidraw'),'utf8')).elements.length,3);
  await run('persist()');await win.reload();await pause(250);
  await until("current?.path==='Renamed.excalidraw' && !!document.querySelector('#whiteboardHost canvas')");
  assert.equal(await run('JSON.parse(current.content).elements.length'),3);
  assert.deepEqual(remote,[],'runtime stays local');assert.deepEqual(errors,[],'no renderer/CSP errors');
  console.log('PASS: create, draw, undo/redo, text, save/conflict, copy/rename, autosave/reload, tab switching, PNG export, dark/light render and local assets.');
  await cleanup();app.exit(0);
 }catch(error){console.error(error);await cleanup();app.exit(1);}
});
