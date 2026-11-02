// Exercise task typing and metadata controls in a disposable vault.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let server,win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  const vault=await fs.mkdtemp(path.join(os.tmpdir(),'slate-tasks-'));
  await fs.writeFile(path.join(vault,'Welcome.md'),'# Tasks\n');
  server=spawn('node',[path.resolve(__dirname,'../server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match)resolve(match[1]);});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'task-controls-verification'}});
  const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message);});
  await win.loadURL(url);
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const run=code=>win.webContents.executeJavaScript(code,true);
  const until=async code=>{for(let i=0;i<80;i++){if(await run(code))return;await pause(50);}throw new Error('Timed out: '+code);};
  const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await pause(80);};
  await until('!!current && !!liveEditor');
  await run("settings.autoSave=false;liveEditor.setValue('');liveEditor.focus()");
  for(const char of '- [ ]')await win.webContents.insertText(char);
  assert.equal(await run('getText()'),'- [ ] ');assert.equal(await run('liveEditor.getSelection().from'),6);
  await pause(80);
  assert.equal(await run("document.querySelector('.cm-cursor').getBoundingClientRect().left>document.querySelector('.cm-slate-task').getBoundingClientRect().right&&document.querySelector('.cm-cursor').getBoundingClientRect().left<document.querySelector('.task-inline-controls').getBoundingClientRect().left"),true,'caret appears between the checkbox and task controls');
  await win.webContents.insertText('Plan release');await pause(80);
  assert.equal(await run('getText()'),'- [ ] Plan release');
  assert.equal(await run("document.querySelectorAll('.task-inline-controls button').length"),2);
  await run("document.querySelector('.task-inline-controls button').click()");
  assert.equal(await run("document.querySelectorAll('.ui-calendar:popover-open').length"),1);
  // Pointerdown must not destroy the popup before the same trigger toggles it.
  await run("document.querySelector('.task-inline-controls button').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('.task-inline-controls button').click()");
  assert.equal(await run("document.querySelectorAll('.ui-calendar').length"),0,'second click closes the calendar');
  await run("document.querySelector('.task-inline-controls button').click()");
  assert.equal(await run("document.querySelectorAll('.ui-calendar').length"),1,'third click opens only one calendar');
  const selectedDate=await run("document.querySelector('.ui-calendar-day:not(.outside)').dataset.date");
  await run("document.querySelector('.ui-calendar-day:not(.outside)').click()");await pause(100);
  assert.ok((await run('getText()')).includes(selectedDate),'day selection immediately saves the date');
  assert.equal(await run("document.querySelectorAll('.ui-calendar').length"),0);
  await run("document.querySelector('.task-inline-controls button[aria-haspopup]').click()");
  assert.equal(await run("document.querySelectorAll('.context-menu [role=menuitemradio]').length"),6);
  await run("[...document.querySelectorAll('.context-menu button')].find(el=>el.textContent==='High').click()");await pause(100);
  assert.match(await run('getText()'),/⏫/);
  assert.equal(await run("!!document.querySelector('.task-inline-controls [data-lucide=priority-high]')"),true);
  for(const theme of ['dark','light']){
   await run(`document.documentElement.dataset.theme='${theme}'`);
   await run("document.querySelector('.task-inline-controls button[aria-haspopup]').focus();document.querySelector('.task-inline-controls button[aria-haspopup]').click()");
   await pause(150);assert.equal(await run("document.querySelectorAll('.context-menu [role=menuitemradio]').length"),6);
   await win.webContents.capturePage();await pause(100);
   await fs.writeFile(path.resolve(__dirname,`../evidence/task-urgency-${theme}.png`),(await win.webContents.capturePage()).toPNG());
   await key('Escape');
   assert.equal(await run("document.activeElement.matches('.task-inline-controls button[aria-haspopup]')"),true);
   await run("document.querySelector('.task-inline-controls button').click()");await pause(100);
   assert.equal(await run("document.querySelectorAll('.ui-calendar:popover-open').length"),1);
   await win.webContents.capturePage();await pause(100);
   await fs.writeFile(path.resolve(__dirname,`../evidence/task-date-${theme}.png`),(await win.webContents.capturePage()).toPNG());
   await key('Escape');await pause(100);
   assert.equal(await run("document.activeElement.matches('.task-inline-controls button')"),true);
  }
  await run('liveEditor.undo()');await pause(60);assert.ok(!(await run('getText()')).includes('⏫'),'urgency has editor undo');
  await run('liveEditor.redo()');await pause(60);assert.ok((await run('getText()')).includes('⏫'));
  await run("document.querySelector('.task-inline-controls button').click()");await pause(100);
  await run("document.querySelector('.ui-calendar-footer button[aria-label=\"Remove date\"]').click()");
  assert.ok(!(await run('getText()')).includes('📅'),'clearing the calendar removes the date');
  await run('liveEditor.undo()');await pause(60);assert.ok((await run('getText()')).includes('📅'));
  await run("setMode('preview')");assert.equal(await run("$('preview').querySelectorAll('[data-task-property]').length"),2);
  await run("settings.livePreview=false;setMode('edit');setText('');$('editor').focus()");
  for(const char of '- [ ]')await win.webContents.insertText(char);
  assert.equal(await run("$('editor').value"),'- [ ] ');
  assert.equal(await run("$('editor').selectionStart"),6);
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await run("$('taskDialog').open"),true,'Ctrl+T opens New task');
  assert.equal(await run("document.activeElement.id"),'taskText');
  await run("$('taskText').value='Captured from shortcut';$('taskForm').requestSubmit()");
  await until("!$('taskDialog').open");
  assert.ok((await run('getText()')).includes('Captured from shortcut'),'shortcut dialog creates the task');
  await run("settings.livePreview=true;setMode('edit');liveEditor.setValue('- [ ] **Keep formatting** 🔺');liveEditor.setSelection(27);liveEditor.focus()");
  for(const theme of ['dark','light']){
   await run(`document.documentElement.dataset.theme='${theme}'`);
   for(const [level,label] of [['low','Low'],['highest','Urgent'],['medium','Medium'],['high','High']]){
   await run("document.querySelector('.task-inline-controls button[aria-haspopup]').click()");
   await run(`[...document.querySelectorAll('.context-menu button')].find(el=>el.textContent==='${label}').click()`);await pause(80);
   assert.equal(await run(`!!document.querySelector('.task-inline-controls [data-lucide=priority-${level}]')`),true);
   assert.equal(await run("/[🔺⏫🔼🔽⏬]/u.test(document.querySelector('.cm-content').textContent)"),false,'urgency changes must not expose legacy markers');
   assert.equal(await run("document.querySelectorAll('.cm-slate-task').length"),1,'task retains its checkbox');
   assert.equal(await run("SlateTasks.parseTasks([{path:current.path,content:getText()}])[0].text"),'**Keep formatting**','urgency preserves Markdown formatting');
   assert.equal(await run("document.activeElement.matches('.task-inline-controls button[aria-haspopup]')"),true,'focus stays on the updated control');
   }
  }
  for(const live of [true,false]){
   await run(`settings.livePreview=${live};setMode('edit');setText('- [  ');if(settings.livePreview){liveEditor.setSelection(4);}else{$('editor').focus();$('editor').setSelectionRange(4,4);}`);
   await win.webContents.insertText(']');await pause(80);
   assert.equal(await run('getText()'),'- [ ] ');
   assert.equal(await run("settings.livePreview?liveEditor.getSelection().from:$('editor').selectionStart"),6,'caret skips an existing space');
   await win.webContents.insertText('Ready');
   assert.equal(await run('getText()'),'- [ ] Ready','typing starts in the task description');
  }
  await run("settings.livePreview=true;setMode('edit');setText('- [ ] Calendar');liveEditor.setSelection(6);window.calendarSelections=[];SlateCalendar.toggle(document.querySelector('.task-inline-controls button'),{value:'2024-02-29',icon,onSelect:value=>calendarSelections.push(value)})");
  assert.equal(await run('document.activeElement.dataset.date'),'2024-02-29');
  await key('Right');assert.equal(await run('document.activeElement.dataset.date'),'2024-03-01','arrows cross a leap-month boundary');
  await key('Enter');assert.equal(await run('calendarSelections[0]'),'2024-03-01');
  await run("SlateCalendar.toggle(document.querySelector('.task-inline-controls button'),{value:'2024-01-31',icon,onSelect:value=>calendarSelections.push(value)})");
  await key('PageDown');assert.equal(await run('document.activeElement.dataset.date'),'2024-02-29','month navigation clamps to leap day');
  await key('PageDown');assert.equal(await run('document.activeElement.dataset.date'),'2024-03-29');
  await key('Escape');assert.equal(await run("document.querySelector('.ui-calendar')===null"),true);
  await run("document.querySelector('.task-inline-controls button').click();document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  assert.equal(await run("document.querySelector('.ui-calendar')===null"),true,'outside click dismisses');
  await run("document.querySelector('.task-inline-controls button').click();setText('Task removed')");await pause(50);
  assert.equal(await run("document.querySelector('.ui-calendar')===null"),true,'removing the trigger dismisses the calendar');
  assert.deepEqual(errors,[]);
  console.log('PASS: live/source task spacing, anchored calendar and urgency, Ctrl+T task capture, keyboard dismissal/focus, undo/redo, reading controls, dark/light screenshots');
  server.kill();app.exit(0);
 }catch(error){console.error(error);server?.kill();app.exit(1);}
});
