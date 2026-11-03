// End-to-end verification in Chromium/Electron, against a disposable local vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let server,win,vault;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanup() {
 if(server && server.exitCode === null) { server.kill(); await new Promise(resolve=>server.once('exit',resolve)); }
 if(vault && path.dirname(vault) === path.join(root,'evidence') && path.basename(vault).startsWith('icon-vault-')) await fs.rm(vault,{recursive:true,force:true});
}
app.whenReady().then(async()=>{
 try {
  vault=await fs.mkdtemp(path.join(root,'evidence','icon-vault-'));
  await fs.mkdir(path.join(vault,'Projects'));
  await fs.writeFile(path.join(vault,'Alpha.md'),'---\nicon: star\niconColor: "#dfad60"\n---\n# Alpha\n\nSee [[Projects/Beta]] and :lucide-heart:.\n\n`:lucide-heart:`\n');
  await fs.writeFile(path.join(vault,'Projects','Beta.md'),'# Beta\n');
  server=spawn('node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Server launch timeout')),10000);server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'icons-verification'}});
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('Renderer:',event.message);}});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){console.error('Failed renderer check:',code);throw error;}};
  for(let i=0;i<60;i++){if(await run('!!current && !!liveEditor && !!vaultIcons'))break;await pause(50);}

  assert.equal(await run('current?.path'), 'Alpha.md', await run("lastMessage"));
  assert.equal(await run("document.querySelector('#title .note-icon')"),null,'no note-title decoration');
  assert.equal(await run("document.querySelector('[data-settings=icons]')"),null,'no Iconize settings');
  await run("openIconPicker('Projects/Beta.md','note');$('iconSearch').value='food';$('iconSearch').dispatchEvent(new Event('input'))");
  assert.ok(await run("document.querySelectorAll('#iconResults button').length")>20,'keyword search');
  assert.equal(await run("document.querySelectorAll('#iconResults button span').length"),0,'icon-only grid');
  assert.ok(await run("$('iconPickerDialog').getBoundingClientRect().height")<560,'compact modal');
  assert.equal(await run("$('iconColor').options.length"),10,'default and nine colors');
  for(const theme of ['dark','light']) {
   await run("document.documentElement.dataset.theme='"+theme+"';$('iconSearch').focus()");
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await pause(100);
   assert.equal(await run('getComputedStyle(document.activeElement).outlineStyle'),'solid','neutral keyboard focus');
   await win.webContents.capturePage();await pause(100);await fs.writeFile(path.join(root,'evidence','iconic-picker-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   await run("document.querySelector('#iconColorControl .ui-select-trigger').click();document.getAnimations().forEach(animation=>animation.finish())");await win.webContents.capturePage();await pause(150);
   assert.notEqual(await run("getComputedStyle(document.querySelector('#iconColorControl .ui-select-content')).backgroundColor"),'rgba(0, 0, 0, 0)','opaque color menu');
   assert.equal(await run("document.querySelectorAll('#iconColorControl .icon-color-glyph').length"),10,'color menu glyphs');
   await fs.writeFile(path.join(root,'evidence','iconic-colors-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   await run("document.querySelector('#iconColorControl .ui-select-content').hidePopover()");
  }
  await run("$('iconSearch').value='rocket';renderIconPicker();document.querySelector('[data-icon-name=rocket]').click();document.querySelector('#iconColorControl .ui-select-trigger').click();document.querySelector('#iconColorControl [data-value=blue]').click()");
  assert.equal(await run('iconPickerColor'),'blue');
  assert.equal(await run("assignedIcon('Projects/Beta.md')"),null,'selection remains staged');
  await run('submitIconPicker()');
  assert.equal(await run('current.path'),'Alpha.md','inactive file stays inactive');
  assert.equal(JSON.parse(await fs.readFile(path.join(vault,'.slate-icons.json'),'utf8')).entries['Projects/Beta.md'].color,'blue');
  await run("openNote('Projects/Beta.md')");
  assert.equal(await run("document.querySelector('.tab.active [data-lucide]').dataset.lucide"),'rocket');
  for(const theme of ['dark','light']) {
   await run("document.documentElement.dataset.theme='"+theme+"'");
   const colors=await run("[getComputedStyle(document.querySelector('.tab.active .note-icon svg')).color,getComputedStyle(document.documentElement).getPropertyValue('--icon-blue').trim()]");
   assert.notEqual(colors[0],'rgb(179, 179, 179)','named color renders');
  }
  await run("openIconPicker('Projects/Beta.md');selectIconPickerName('heart');$('iconCancel').click()");
  assert.equal(await run("assignedIcon('Projects/Beta.md').icon"),'rocket','cancel discards pending choice');
  await run("openIconPicker('Projects/Beta.md');selectIconPickerName('heart');(async()=>{const state=await api('icons');state.config.recent=['star'];await api('icons',state);await submitIconPicker();})()");
  assert.match(await run("$('iconPickerError').textContent"),/changed on disk/);
  assert.equal(await run("$('iconPickerDialog').open && iconPickerName==='heart'"),true,'conflict preserves choice');
  await run("$('iconCancel').click();openIconPicker('Projects/Beta.md');submitIconPicker('reset')");
  assert.equal(await run("assignedIcon('Projects/Beta.md')"),null,'reset clears assignment');
  await run("openIconPicker('Projects/Beta.md');selectIconPickerName('rocket');submitIconPicker()");
  await run("(async()=>{const n=await api('note?path=Projects%2FBeta.md');await api('rename',{path:n.path,newPath:'Projects/Gamma.md',revision:n.revision});await refresh();})()");
  assert.equal(await run("assignedIcon('Projects/Gamma.md').icon"),'rocket');
  win.reload();await pause(300);assert.equal(await run("assignedIcon('Projects/Gamma.md').icon"),'rocket','reload persistence');
  await run("openIconPicker('Projects/Gamma.md');$('iconModeEmoji').click();$('iconSearch').value='pizza';renderIconPicker()");
  assert.equal(await run("$('iconModeEmoji').getAttribute('aria-selected')"),'true');
  assert.equal(await run("document.querySelector('#iconResults [data-icon-name=\"emoji:1f355\"] .emoji-glyph').textContent"),'\u{1f355}');
  await run("document.querySelector('#iconResults [data-icon-name=\"emoji:1f355\"]').click()");
  assert.equal(await run("document.querySelector('#iconColorControl .ui-select-trigger').disabled"),true,'emoji keep native color');
  assert.equal(await run("assignedIcon('Projects/Gamma.md').icon"),'rocket','emoji choice is staged');
  for(const theme of ['dark','light']) {
   await run("document.documentElement.dataset.theme='"+theme+"';$('iconSearch').value='food';renderIconPicker();document.getAnimations().forEach(animation=>animation.finish())");
   await pause(150);await win.webContents.capturePage();await pause(150);await fs.writeFile(path.join(root,'evidence','iconic-emoji-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await run('submitIconPicker()');
  assert.equal(await run("assignedIcon('Projects/Gamma.md').icon"),'emoji:1f355');
  await run("openNote('Projects/Gamma.md')");
  assert.equal(await run("document.querySelector('.tab.active .note-emoji').textContent"),'\u{1f355}');
  assert.equal(await run("[...document.querySelectorAll('.file')].find(b=>b.dataset.tooltip==='Projects/Gamma.md').querySelector('.note-emoji').textContent"),'\u{1f355}');
  await run("bookmarkPath('Projects/Gamma.md');setSidebar('bookmarks')");
  assert.equal(await run("document.querySelector('#files .note-emoji').textContent"),'\u{1f355}');
  await run("openIconPicker('Projects/Gamma.md');$('iconModeIcons').click()");
  assert.equal(await run("document.querySelector('#iconColorControl .ui-select-trigger').disabled"),false);
  await run("$('iconCancel').click()");
  assert.equal(await run("assignedIcon('Projects/Gamma.md').icon"),'emoji:1f355','cancel retains emoji');
  await run("openIconPicker('Projects/Gamma.md');$('iconSearch').value='woman technologist medium skin tone';renderIconPicker()");
  assert.ok(await run("document.querySelectorAll('#iconResults button').length")>0,'joined/skin tone search');
  await run("document.querySelector('#iconResults button').click();submitIconPicker()");
  const sequence=await run("document.querySelector('.tab.active .note-emoji').textContent");assert.ok(sequence.includes('\u200d'),'joined emoji is preserved');
  await run("(async()=>{const n=await api('note?path=Projects%2FGamma.md');await api('rename',{path:n.path,newPath:'Projects/Emoji.md',revision:n.revision});await refresh();})()");
  win.reload();await pause(350);assert.equal(await run("SlateNoteIcons.emoji(assignedIcon('Projects/Emoji.md').icon).glyph"),sequence,'emoji survives move/reload');
  assert.deepEqual(errors,[]);console.log('PASS: compact Iconic-style picker, keyword search, nine colors, keyboard focus, staged save/cancel, reset, inactive targets, theme adaptation, conflicts, rename/reload persistence.');
  await cleanup();app.exit(0);
 }catch(error){console.error(error);await cleanup();app.exit(1);}
});
