// Captures the README hero screenshot (docs/screenshots/editor.png) from a disposable showcase vault.
// Run with: electron scripts/capture-readme.cjs  (clear ELECTRON_RUN_AS_NODE first if your environment sets it)
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let server,win,temp;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const notes={
 'Projects/Garden redesign.md':`Turning the back corner into a small **kitchen garden** before spring. Inspiration lives in [[Ideas/Planting notes|planting notes]]; costs are tracked on the [[Projects/Budget|budget]] page.

## Plan

1. Clear the old shed foundation
2. Build two raised beds, *1.2 m × 2.4 m*
3. Run a drip line from the rain barrel

## This week

- [x] Measure the sun path across the yard
- [ ] Order cedar boards 📅 2026-11-02 ⏫
- [ ] Ask Sam about borrowing the post-hole digger

> Plant what you'll actually eat. Start small, then expand.

## Bed layout

\`\`\`
north  | tomatoes · basil · peppers |
south  | lettuce · radish · chard   |
\`\`\`

See also [[Journal/2026-10-30]] for today's progress.
`,
 'Projects/Budget.md':'# Budget\n\nMaterials for [[Projects/Garden redesign]].\n\n- Cedar boards\n- Soil and compost\n- Drip irrigation kit\n',
 'Projects/Reading list.md':'# Reading list\n\n- [ ] The Well-Tempered Garden\n- [x] A Pattern Language\n',
 'Ideas/Planting notes.md':'# Planting notes\n\nCompanion planting ideas for the [[Projects/Garden redesign]].\n',
 'Ideas/Slate roadmap.md':'# Slate roadmap\n\nIdeas for the next version.\n',
 'Journal/2026-10-30.md':'# 2026-10-30\n\nMeasured the sun path for the [[Projects/Garden redesign]]. Full sun until 3 pm.\n',
 'Journal/2026-10-29.md':'# 2026-10-29\n\nFinished [[Projects/Reading list|A Pattern Language]].\n',
 'Welcome.md':'# Welcome\n\nStart with [[Projects/Garden redesign]].\n'
};
const icons={version:2,recent:[],entries:{
 'Projects':{icon:'folder-kanban',color:'blue'},
 'Ideas':{icon:'lightbulb',color:'yellow'},
 'Journal':{icon:'notebook-pen',color:'green'},
 'Projects/Garden redesign.md':{icon:'sprout',color:'green'},
 'Projects/Budget.md':{icon:'piggy-bank',color:'pink'},
 'Welcome.md':{icon:'house',color:''}
}};
app.whenReady().then(async()=>{
 try{
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'slate-readme-'));
  const vault=path.join(temp,'Notes');
  for(const [file,text] of Object.entries(notes)){await fs.mkdir(path.dirname(path.join(vault,file)),{recursive:true});await fs.writeFile(path.join(vault,file),text);}
  await fs.writeFile(path.join(vault,'.slate-icons.json'),JSON.stringify(icons,null,2)+'\n');
  server=spawn(process.env.SLATE_NODE_EXEC||'node',[path.join(root,'server.mjs'),'--vault',vault],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',data=>{out+=data;const match=out.match(/Open: (http[^\s]+)/);if(match)resolve(match[1]);});server.on('error',reject);});
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'readme-capture'}});
  const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
  await win.loadURL(url);
  const run=code=>win.webContents.executeJavaScript(code,true);
  for(let i=0;i<100;i++){if(await run("typeof current!=='undefined' && !!current"))break;await pause(50);}
  await run("document.documentElement.dataset.theme='dark'");
  for(const note of ['Welcome.md','Journal/2026-10-30.md','Projects/Garden redesign.md']){await run(`openNote(${JSON.stringify(note)})`);await pause(250);}
  await run("setRightPanel('backlinks');document.activeElement?.blur()");
  await pause(800);
  await win.webContents.capturePage();await pause(150);
  const out=path.join(root,'docs','screenshots','editor.png');
  await fs.writeFile(out,(await win.webContents.capturePage()).toPNG());
  if(errors.length)console.error('Renderer errors:\n'+errors.join('\n'));
  console.log('Wrote '+out);
  server?.kill();await fs.rm(temp,{recursive:true,force:true});app.exit(errors.length?1:0);
 }catch(error){console.error(error);server?.kill();if(temp)await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});app.exit(1);}
});
