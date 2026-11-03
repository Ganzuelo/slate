// Render Sonner-style toasts in Electron against a disposable vault and capture both themes to evidence/.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-toasts-'));
  await fs.writeFile(path.join(vault,'Welcome.md'),'# Welcome\n\nToast verification.');
  server=spawn('node',[path.resolve(__dirname,'../server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'toast-verification'}});
  const errors=[];win.webContents.on('console-message',(event,level,message)=>{if(level>=3)errors.push(message);});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  const shot=async file=>fs.writeFile(file,Buffer.from((await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const run=code=>win.webContents.executeJavaScript(code,true).catch(error=>{throw new Error(error.message+" in: "+code.slice(0,120));});
  const until=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  await until('!!current && !!window.SlateToast');
  assert.equal(await run("document.getElementById('message')"),null,'the note banner is removed');
  // Hidden windows throttle transitions; turn them off so assertions and screenshots see final states.
  await run("(()=>{const sheet=new CSSStyleSheet();sheet.replaceSync('.toast,.toast>*{transition:none!important}');document.adoptedStyleSheets=[...document.adoptedStyleSheets,sheet];})()");
  const settle=()=>pause(250);
  const out=path.resolve(__dirname,'../evidence');await fs.mkdir(out,{recursive:true});
  for(const theme of ['dark','light']){
   await run(`settings.theme='${theme}';applySettings();SlateToast.dismissWhere(()=>true)`);await pause(300);
   await run(`message('Workspace could not be saved. Your draft is kept.',{duration:0,action:{label:'Retry',onClick(){}}});message('This task moved or changed. Refresh and try again.',{...taskMovedAlert(),duration:0});message('Vault index refreshed. Open tabs retain their drafts.',{type:'success',duration:0})`);
   await settle();
   assert.equal(await run("document.querySelector('.toaster').matches(':popover-open')"),true);
   assert.equal(await run("document.querySelectorAll('.toast.mounted').length"),3);
   assert.deepEqual(await run("[...document.querySelectorAll('.toast')].map(t=>getComputedStyle(t.children[1]).opacity)"),['1','0','0'],'only the front toast shows content when collapsed');
   await shot(path.join(out,`toasts-${theme}-collapsed.png`));
   await run("document.querySelector('.toaster').dispatchEvent(new PointerEvent('pointerenter'))");await settle();
   assert.deepEqual(await run("[...document.querySelectorAll('.toast')].map(t=>getComputedStyle(t.children[1]).opacity+getComputedStyle(t).transform)"),Array(3).fill('1matrix(1, 0, 0, 1, 0, 0)'),'hover expands the stack');
   await shot(path.join(out,`toasts-${theme}-expanded.png`));
   await run("document.querySelector('.toaster').dispatchEvent(new PointerEvent('pointerleave'))");
  }
  // Toasts stay above modal dialogs.
  await run("openSettings('general');message('Shown above settings',{type:'info',duration:0})");await settle();
  await shot(path.join(out,'toasts-over-dialog.png'));
  assert.deepEqual(errors,[]);
  console.log('Toast verification passed.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{server?.kill();if(vault)await fs.rm(vault,{recursive:true,force:true});app.quit();}
});
