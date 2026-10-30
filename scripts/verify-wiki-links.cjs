const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let server,win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 try{
 const vault=await fs.mkdtemp(path.join(root,'evidence','wiki-vault-'));
 await fs.mkdir(path.join(vault,'Projects'));await fs.mkdir(path.join(vault,'Archive'));
 for(const file of ['Welcome.md','Projects/Slate.md','Archive/Slate.md','Planning.md'])await fs.writeFile(path.join(vault,file),'# '+file+'\n');
 server=spawn('node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match)resolve(match[1]);});server.on('error',reject);});
 win=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'wiki-verification'}});
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
 await win.loadURL(url);
 const run=code=>win.webContents.executeJavaScript(code,true);
 for(let i=0;i<50;i++){if(await run("!!current && !!liveEditor"))break;await pause(50);}
 await run("settings.autoSave=false;liveEditor.setValue('See ');liveEditor.setSelection(4);liveEditor.focus()");
 await win.webContents.insertText('[[');await pause(150);
 assert.equal(await run("document.querySelectorAll('.cm-tooltip-autocomplete li').length"),3,'opens on [[');
 await win.webContents.insertText('Sl');await pause(150);
 assert.equal(await run("document.querySelectorAll('.cm-tooltip-autocomplete li').length"),2,'filters while typing');
 for(const theme of ['dark','light']){
 await run(`document.documentElement.dataset.theme='${theme}'`);await pause(350);
 await win.webContents.capturePage();await pause(100);
 await fs.writeFile(path.join(root,'evidence',`wiki-completion-${theme}.png`),(await win.webContents.capturePage()).toPNG());
 }
 const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await pause(100);};
 await key('Down');await key('Enter');
 assert.equal(await run('liveEditor.getValue()'),'See [[Projects/Slate]]','keyboard commit');
 await run('liveEditor.undo()');assert.equal(await run('liveEditor.getValue()'),'See [[Sl','one-step undo');
 await run("liveEditor.setValue('');liveEditor.focus()");await win.webContents.insertText('[[');await pause(100);await key('Escape');
 assert.equal(await run("document.querySelector('.cm-tooltip-autocomplete')===null"),true,'escape');
 await run("settings.livePreview=false;setMode('edit');setText('See ');$('editor').focus();$('editor').setSelectionRange(4,4)");
 await win.webContents.insertText('[[Sl');await pause(100);
 assert.equal(await run("!document.getElementById('source-wiki-completions').hidden"),true,'source popup');
 assert.equal(await run("document.querySelectorAll('#source-wiki-completions [role=option]').length"),2);
 await key('Down');await key('Tab');assert.equal(await run("$('editor').value"),'See [[Projects/Slate]]','source keyboard commit');
 await run("document.execCommand('undo')");assert.equal(await run("$('editor').value"),'See [[Sl','source undo');
 await win.webContents.insertText('zzz');await pause(100);
 assert.equal(await run("document.getElementById('source-wiki-completions').hidden"),true,'no-match dismissal');
 await run("setText('[[Sl');$('editor').setSelectionRange(4,4);$('editor').dispatchEvent(new Event('input'))");
 await run("document.querySelectorAll('#source-wiki-completions [role=option]')[1].dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))");
 assert.equal(await run("$('editor').value"),'[[Projects/Slate]]','source click commit');
 assert.deepEqual(errors,[]);console.log('PASS: live/source trigger, filtering, keyboard acceptance, Escape, undo; dark/light screenshots');
 server?.kill();app.exit(0);
 }catch(error){console.error(error);server?.kill();app.exit(1);}
});
