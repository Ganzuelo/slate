// Exercise real pointer and keyboard input in Electron against a disposable vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-ribbon-'));
  await fs.writeFile(path.join(vault,'Welcome.md'),'Ribbon verification.');
  server=spawn('node',[path.resolve(__dirname,'../server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'ribbon-verification'}});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  const send=(method,params)=>win.webContents.debugger.sendCommand(method,params);
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const run=code=>win.webContents.executeJavaScript(code,true);
  const until=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  const order=()=>run("[...document.querySelector('.ribbon-tools').children].map(button=>button.id)");
  const point=id=>run(`(()=>{const r=$('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const mouse=(type,p,extra={})=>send('Input.dispatchMouseEvent',{type,...p,...extra});
  const key=(key,code,modifiers=0)=>send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});
  await until('!!current && !!ribbonLayout');
  const defaults=await order();
  const start=await point('switcherButton'),end=await point('commandsButton');
  await mouse('mouseMoved',start);
  await mouse('mousePressed',start,{button:'left',buttons:1,clickCount:1});
  for(let i=1;i<=12;i++)await mouse('mouseMoved',{x:start.x,y:start.y+(end.y+20-start.y)*i/12},{button:'left',buttons:1});
  await mouse('mouseReleased',{x:end.x,y:end.y+20},{button:'left',clickCount:1});
  const dragged=[...defaults.slice(1),defaults[0]];
  assert.deepEqual(await order(),dragged);
  assert.equal(await run("$('paletteDialog').open"),false,'drag does not activate the quick switcher');
  assert.deepEqual(await run('settings.ribbonOrder'),dragged);
  await pause(450);await win.reload();await until('!!current && !!ribbonLayout');
  assert.deepEqual(await order(),dragged,'order survives reload');
  await run("$('switcherButton').focus()");
  await key('ArrowUp','ArrowUp',1);
  assert.equal((await order()).at(-2),'switcherButton');
  assert.equal(await run('document.activeElement.id'),'switcherButton');
  await key('F10','F10',8);
  assert.equal(await run("document.querySelector('[role=menu]').getAttribute('aria-label')"),'Toolbar: Quick switcher');
  await key('End','End');await key('Enter','Enter');
  assert.deepEqual(await order(),defaults,'keyboard menu can reset the order');
  // Cancel a real drag without persisting the temporary arrangement.
  const from=await point('graphButton'),to=await point('commandsButton');
  await mouse('mousePressed',from,{button:'left',buttons:1,clickCount:1});
  await mouse('mouseMoved',to,{button:'left',buttons:1});
  assert.notDeepEqual(await order(),defaults);
  await key('Escape','Escape');
  await mouse('mouseReleased',to,{button:'left',clickCount:1});
  assert.deepEqual(await order(),defaults);
  assert.deepEqual(await run('settings.ribbonOrder'),defaults);
  const click=await point('switcherButton');
  await mouse('mousePressed',click,{button:'left',buttons:1,clickCount:1});
  await mouse('mouseReleased',click,{button:'left',clickCount:1});
  assert.equal(await run("$('paletteDialog').open"),true,'normal clicks still activate the action');
  await run("$('paletteDialog').close()");
  for(const theme of ['dark','light']){
   await run(`settings.theme='${theme}';applySettings();document.documentElement.dataset.keyboardNavigation='true';$('graphButton').focus()`);
   await key('F10','F10',8);
   await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await pause(250);
   await fs.writeFile(path.resolve(__dirname,'../evidence/ribbon-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   await key('Escape','Escape');
  }
  console.log('Verified pointer reorder, no accidental activation, persistence, keyboard movement, context-menu reset, Escape cancel, normal clicks, and both themes.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{
  if(win)win.destroy();
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  if(vault&&path.dirname(vault)===os.tmpdir()&&path.basename(vault).startsWith('slate-ribbon-'))await fs.rm(vault,{recursive:true,force:true});
  app.exit(process.exitCode||0);
 }
});
