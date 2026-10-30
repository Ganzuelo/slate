import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/vendor/whiteboard');
// This directory contains generated assets only; remove obsolete hashed chunks.
if(path.dirname(out)!==path.join(root,'public/vendor'))throw new Error('Unexpected output directory');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out, { recursive: true });
let localFontPatchCount=0;
const localFonts={name:'local-excalidraw-fonts',setup(build){
 build.onLoad({filter:/@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/].*\.js$/},async args=>{
  let contents=await fs.readFile(args.path,'utf8');
  // 0.18.1 always appends a CDN fallback, even when ASSET_PATH is configured.
  contents=contents.replace(/return (\w+)\.push\(new URL\(\w+,\w+\.ASSETS_FALLBACK_URL\)\),\1/g,(_,list)=>{localFontPatchCount++;return 'return '+list;});
  return {contents,loader:'js'};
 });
}};
const result = await build({ absWorkingDir: root, entryPoints: { whiteboard: 'public/whiteboard-entry.jsx' }, outdir: out, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['chrome120'], minify: true, legalComments: 'inline', metafile: true, conditions: ['production'], plugins:[localFonts], define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': 'false' }, loader: { '.woff2': 'file' }, assetNames: 'fonts/[name]-[hash]' });
if(localFontPatchCount!==1)throw new Error('Excalidraw font patch needs review after dependency change.');
await fs.cp(path.join(root,'node_modules/@excalidraw/excalidraw/dist/prod/fonts'), path.join(out,'fonts'), { recursive: true });
const packages = new Set();
for (const file of Object.keys(result.metafile.inputs)) {
  const normalized = file.replaceAll('\\','/');
  const match = normalized.match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//);
  if (match) packages.add(match[1]);
}
const notices=[], missing=[];
for (const pkg of [...packages].sort()) {
  const directory=path.join(root,pkg), entries=await fs.readdir(directory);
  const licenses=entries.filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  if(!licenses.length) {
    const fallback=path.join(root,'scripts/licenses',pkg.includes('@radix-ui/')?'radix-ui.txt':pkg.split('/').pop()+'.txt');
    try { notices.push(pkg+'\n'+await fs.readFile(fallback,'utf8')); } catch { missing.push(pkg); } continue;
  }
  for(const name of licenses) {const filename=path.join(directory,name);if((await fs.stat(filename)).isFile())notices.push(pkg+'/'+name+'\n'+await fs.readFile(filename,'utf8'));}
}
if(missing.length)throw new Error('Missing licenses: '+missing.join(', '));
notices.push(await fs.readFile(path.join(root,'scripts/licenses/FONTS.txt'),'utf8'));
notices.push('Liberation fonts\n'+await fs.readFile(path.join(root,'scripts/licenses/liberation.txt'),'utf8'));
notices.push(await fs.readFile(path.join(root,'scripts/licenses/liberation-exception.txt'),'utf8'));
notices.push('Excalifont font metadata and license\n'+await fs.readFile(path.join(root,'scripts/licenses/font-Excalifont.txt'),'utf8'));
await fs.writeFile(path.join(out,'LICENSES.txt'),notices.join('\n\n---\n\n'));
const manifest={};
async function walk(directory) {
 for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
  const filename=path.join(directory,entry.name);
  if(entry.isDirectory()){await walk(filename);continue;}
  const relative=path.relative(path.join(root,'public'),filename).replaceAll('\\','/');
  const type={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.txt':'text/plain'}[path.extname(entry.name)];
  if(type)manifest['/'+relative]={file:relative,type};
 }
}
await walk(out);
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Built local Excalidraw whiteboard with '+packages.size+' dependency license notices.');
