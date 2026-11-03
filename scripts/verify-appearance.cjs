// End-to-end verification in Chromium/Electron, against a disposable local vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanup() {
 if(server && server.exitCode === null) { server.kill(); await new Promise(resolve=>server.once('exit',resolve)); }
 if(vault && path.dirname(vault) === path.join(root,'evidence') && path.basename(vault).startsWith('appearance-vault-')) await fs.rm(vault,{recursive:true,force:true});
}
app.whenReady().then(async()=>{
 try {
  vault=await fs.mkdtemp(path.join(root,'evidence','appearance-vault-'));
  await fs.mkdir(path.join(vault,'Projects'));
  await fs.writeFile(path.join(vault,'Alpha.md'),'---\nicon: star\niconColor: "#dfad60"\n---\n# Alpha\n\nSee [[Projects/Beta]] and :lucide-heart:.\n\n`:lucide-heart:`\n');
  await fs.writeFile(path.join(vault,'Projects','Beta.md'),'# Beta\n- [x] Completed task\n');
  server=spawn('node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server launch timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'appearance-verification'}});
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('Renderer:',event.message);}});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){console.error('Failed renderer check:',code);throw error;}};
  for(let i=0;i<60;i++){if(await run('!!current && !!liveEditor && !!vaultIcons'))break;await pause(50);}


  assert.equal(await run('current?.path'),'Alpha.md',await run("lastMessage"));
  await run("openSettings('appearance')");
  assert.equal(await run("document.querySelectorAll('[data-settings] svg').length"),9,'menu icons render');
  assert.equal(await run("document.querySelectorAll('.accent-preset').length"),9);
  const neutral=await run("getComputedStyle(document.querySelector('[data-settings=appearance]')).backgroundColor");
  await run("document.querySelector('[aria-label=\"Green accent\"]').click()");
  assert.equal(await run('settings.accentColor'),'#16a34a');
  assert.equal(await run("JSON.parse(localStorage.getItem('settings')).accentColor"),'#16a34a');
  assert.equal(await run("getComputedStyle(document.querySelector('[data-settings=appearance]')).backgroundColor"),neutral,'neutral selection stays neutral');
  await run("$('accentColorHex').value='invalid';$('accentColorHex').dispatchEvent(new Event('change'))");
  assert.match(await run("$('accentColorError').textContent"),/hex color/);assert.equal(await run('settings.accentColor'),'#16a34a');
  await run("$('accentColorHex').value='#0891b2';$('accentColorHex').dispatchEvent(new Event('change'))");
  for(const theme of ['dark','light']) {
   await run("(()=>{const select=document.querySelector('[aria-label=\"Base color scheme\"]');select.value='"+theme+"';select.dispatchEvent(new Event('change'));})()");
   assert.equal(await run('document.documentElement.dataset.theme'),theme);
   assert.equal(await run("getComputedStyle(document.documentElement).getPropertyValue('--accent-solid').trim()"),'#0891b2');
   await run("document.querySelector('[aria-label=\"Blue accent\"]').focus()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
   await pause(100);assert.equal(await run('getComputedStyle(document.activeElement).outlineStyle'),'solid');
   await win.webContents.capturePage();await pause(150);await fs.writeFile(path.join(root,'evidence','appearance-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await run("$('accentColorPicker').value='#ffff00';$('accentColorPicker').dispatchEvent(new Event('input'))");
  assert.equal(await run('settings.accentColor'),'#ffff00');assert.equal(await run("document.documentElement.style.getPropertyValue('--accent-on')"),'#000000');
  await run("$('closeSettings').click();openIconPicker('Projects/Beta.md')");
  assert.equal(await run("getComputedStyle($('iconApply')).backgroundColor"),'rgb(255, 255, 0)','primary actions use accent');
  assert.equal(await run("getComputedStyle($('iconApply')).color"),'rgb(0, 0, 0)','primary action text contrast');
  await run("$('iconCancel').click();openNote('@tasks','tasks')");
  assert.equal(await run("getComputedStyle(document.querySelector('.task-check[aria-checked=true]')).backgroundColor"),'rgb(255, 255, 0)','task check accent');
  assert.equal(await run("getComputedStyle(document.querySelector('.task-check[aria-checked=true]')).color"),'rgb(0, 0, 0)','task check contrast');
  await run("openNote('Projects/Beta.md');setMode('edit')");
  await pause(100);
  const checkStyle=await run("getComputedStyle(document.querySelector('.cm-slate-task:checked')).backgroundImage");assert.match(checkStyle,/check-dark.svg/,'live checkbox uses readable tick');
  assert.equal((await win.webContents.executeJavaScript("fetch('/vendor/check-dark.svg').then(r=>r.status)")),200);
  const accentHex=await run("document.documentElement.style.getPropertyValue('--link')");
  const accentRgb='rgb('+accentHex.slice(1).match(/../g).map(value=>parseInt(value,16)).join(', ')+')';
  await run("openNote('Alpha.md');setMode('preview')");
  assert.equal(await run("getComputedStyle(document.querySelector('#preview .wiki')).color"),accentRgb,'reading links use readable accent');
  await run("openNote('@graph','graph')");
  assert.equal(await run("getComputedStyle(document.querySelector('#graph .current')).fill"),accentRgb,'graph accent');
  const board=JSON.stringify({nodes:[{id:'a',type:'text',text:'A',x:0,y:0,width:200,height:160},{id:'b',type:'text',text:'B',x:300,y:200,width:200,height:160}],edges:[{id:'e',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left'}]});
  await run(`(async()=>{await api('canvas',{path:'Test.canvas',content:${JSON.stringify(board)},revision:null});await refresh();await openNote('Test.canvas','canvas');})()`);
  assert.equal(await run("getComputedStyle(document.querySelector('#canvasEdges path')).stroke"),accentRgb,'canvas connections use accent');
  await run("openSettings('appearance');$('accentColorHex').value='#0891b2';$('accentColorHex').dispatchEvent(new Event('change'));$('closeSettings').click()");
  win.reload();await pause(350);assert.equal(await run('settings.accentColor'),'#0891b2','accent persists after reload');
  await run("openSettings('appearance');document.querySelector('.accent-reset').click()");
  assert.equal(await run('settings.accentColor'),'#7f56d9');assert.equal(await run("document.querySelector('.accent-reset').disabled"),true);
  await run("$('closeSettings').click()");
  assert.deepEqual(errors,[]);console.log('PASS: settings menu icons, accent presets/custom/hex/reset, invalid input, light/dark screenshots, neutral selection/focus, task/primary contrast, persistence.');
  await cleanup();app.exit(0);
 }catch(error){console.error(error);await cleanup();app.exit(1);}
});
