// Exercise the help dialog with real pointer and keyboard input in Electron against a disposable vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-help-'));
  await fs.writeFile(path.join(vault,'Welcome.md'),'Help verification.');
  server=spawn('node',[path.resolve(__dirname,'../server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'help-verification'}});
  const errors=[];win.webContents.on('console-message',(event,level,message)=>{if(level>=3)errors.push(message);});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  const send=(method,params)=>win.webContents.debugger.sendCommand(method,params);
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=code=>win.webContents.executeJavaScript(code,true);
  const until=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  const point=selector=>run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:"nearest"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const click=async selector=>{const p=await point(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
  const key=(key,code=key,modifiers=0)=>send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:{F1:112,Escape:27,ArrowDown:40,ArrowUp:38,End:35,Home:36}[key]||0});
  const type=async text=>{for(const char of text)await send('Input.dispatchKeyEvent',{type:'char',text:char});};
  const heading=()=>run("$('helpContent').querySelector('h2').textContent");
  await until('!!current && !!window.SlateHelp && !!document.querySelector("#helpButton svg")');
  await pause(200);
  // The help button sits immediately left of Settings in the vault footer.
  assert.deepEqual(await run("[...document.querySelector('.vault-footer').children].map(el=>el.id)"),['vaultNameButton','helpButton','settingsButton']);
  await click('#helpButton');
  assert.equal(await run("$('helpDialog').open"),true);
  assert.equal(await heading(),'Welcome to Slate');
  assert.equal(await run("document.activeElement.dataset.help"),'welcome','focus starts on the current topic');
  // Arrow keys move through topics.
  await key('ArrowDown');
  assert.equal(await heading(),'Vaults');
  assert.equal(await run("document.activeElement.dataset.help"),'vaults');
  await key('End');
  assert.equal(await heading(),'Privacy and your data');
  // Search narrows the topic list.
  await run("$('helpSearch').focus()");
  await type('excalidraw');
  assert.ok((await run("[...$('helpNav').querySelectorAll('[data-help]')].map(b=>b.dataset.help)")).includes('whiteboards'));
  await click('[data-help="whiteboards"]');
  assert.equal(await heading(),'Whiteboards');
  // Topic links and the pager navigate.
  await run("$('helpSearch').value='';$('helpSearch').oninput()");
  await click('[data-help="welcome"]');
  await click('.help-link');
  assert.equal(await heading(),'Links and backlinks');
  await click('.help-next');
  assert.equal(await heading(),'Daily notes and templates');
  assert.equal(await run("document.activeElement.id"),'helpTopicTitle');
  await key('Escape');
  assert.equal(await run("$('helpDialog').open"),false);
  // F1 reopens on the last topic.
  await run("document.body.focus()");
  await key('F1');
  assert.equal(await run("$('helpDialog').open"),true,'F1 opens help');
  assert.equal(await heading(),'Daily notes and templates');
  await fs.mkdir(path.resolve(__dirname,'../evidence'),{recursive:true});
  for(const [theme,topic] of [['dark','tasks'],['light','commands']]){
   await run(`settings.theme='${theme}';applySettings();document.documentElement.dataset.keyboardNavigation='true';`);
   await click(`[data-help="${topic}"]`);
   await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await pause(250);
   await fs.writeFile(path.resolve(__dirname,'../evidence/help-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await click('#closeHelp');
  assert.equal(await run("$('helpDialog').open"),false);
  assert.deepEqual(errors,[]);
  console.log('Verified footer placement, click and F1 opening, arrow-key navigation, search, topic links, pager focus, Escape and close button, and both themes.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{
  if(win)win.destroy();
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  if(vault&&path.dirname(vault)===os.tmpdir()&&path.basename(vault).startsWith('slate-help-'))await fs.rm(vault,{recursive:true,force:true});
  app.exit(process.exitCode||0);
 }
});
