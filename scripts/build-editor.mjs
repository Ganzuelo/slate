import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ absWorkingDir: root, tsconfigRaw: {}, entryPoints: ['./public/live-editor.js'], outfile: './public/vendor/editor.js', bundle: true, minify: true, platform: 'browser', format: 'iife', target: ['chrome120'], legalComments: 'inline', metafile: true });
const packages = [...new Set(Object.keys(result.metafile.inputs).map(file => file.replaceAll('\\','/').match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
const notices = [];
for (const name of packages) {
  let license;
  for (const filename of ['LICENSE','LICENSE.md','LICENSE.txt','license','license.md']) {
    try { license = await fs.readFile(path.join(root,'node_modules',name,filename),'utf8'); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!license) throw new Error('A bundled dependency has no retained license notice: ' + name);
  notices.push(name + '\n' + license);
}
await fs.appendFile(path.join(root,'public','vendor','editor.js'), '\n/*! Bundled third-party license notices\n\n' + notices.join('\n\n---\n\n').replaceAll('*/','* /') + '\n*/\n');
console.log('Built local CodeMirror live editor: public/vendor/editor.js');
