import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'vendor/dataview/src');
const aliases = Object.fromEntries(['api','data-import','data-index','data-model','expression','query','util','settings'].map(name => [name,path.join(src,name)]));
aliases['data-index/index'] = path.join(root,'public/dataview-index-shim.js');
const result = await build({absWorkingDir:root, entryPoints:['public/dataview-worker.js'],outfile:'public/vendor/dataview-worker.js',bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome120',alias:aliases,metafile:true,tsconfigRaw:{compilerOptions:{useDefineForClassFields:false}}});
const notices = [await fs.readFile(path.join(root,'vendor/dataview/LICENSE.txt'),'utf8')];
for(const name of [...new Set(Object.keys(result.metafile.inputs).map(file=>file.replaceAll('\\','/').match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort()) {
 let license;
 for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT.txt','license','license.md'])try{license=await fs.readFile(path.join(root,'node_modules',name,file),'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!license)throw new Error('Missing license for '+name);
 notices.push(name+'\n'+license);
}
await fs.appendFile(path.join(root,'public/vendor/dataview-worker.js'),'\n/*! Bundled third-party license notices\n'+notices.join('\n---\n').replaceAll('*/','* /')+'\n*/\n');
// Keep only the upstream modules actually bundled, avoiding the plugin runtime.
await fs.writeFile(path.join(root,'vendor/dataview/modules.json'),JSON.stringify(Object.keys(result.metafile.inputs).filter(file=>file.startsWith('vendor/dataview/')).sort(),null,2)+'\n');
console.log('Built local Dataview worker');
