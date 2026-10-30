import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as model from '../public/note-icons.js';
import { Vault } from '../core.mjs';
const registry={star:'<svg/>',folder:'<svg/>',heart:'<svg/>'};
test('manual assignments ignore former frontmatter, inheritance and automatic rules',()=>{
 const config=model.validateConfig({version:1,entries:{Projects:{icon:'folder',inherit:true},'A.md':{icon:'star',color:'#abc'}},recent:[],rules:[{icon:'heart'}],options:{frontmatter:true}});
 assert.equal(config.version,2);assert.equal(model.resolve(config,'A.md','note',{icon:'heart'},registry).icon,'star');
 assert.equal(model.resolve(config,'Projects/Child.md','note',{icon:'heart'},registry),null);
 assert.ok(!('rules' in config));assert.ok(!('inherit' in config.entries.Projects));
});
test('standard named colors resolve to theme tokens and legacy assignments retain colors',()=>{
 assert.equal(model.palette.length,9);assert.equal(model.color('red'),'var(--icon-red)');assert.equal(model.color('pink'),'var(--icon-pink)');
 assert.equal(model.color('#abcdef'),'#abcdef');assert.equal(model.color('url(https://evil)'), '');
 const c=model.emptyConfig();c.entries['A.md']={icon:'star',color:'blue'};assert.equal(model.validateConfig(c).entries['A.md'].color,'blue');
 c.entries['A.md'].color='injected';assert.throws(()=>model.validateConfig(c),/Invalid icon/);
});
test('icon configuration rejects unsafe paths and invalid icon names',()=>{
 for(const name of ['../A.md','/absolute.md','C:/A.md','A/.hidden','NUL.md']){const c=model.emptyConfig();c.entries[name]={icon:'star'};assert.throws(()=>model.validateConfig(c),/Invalid icon/);}
 const c=model.emptyConfig();c.entries['A.md']={icon:'<svg onload=x>'};assert.throws(()=>model.validateConfig(c),/Invalid icon/);
 assert.deepEqual(model.suggestions('folder heart',['folder-heart','heart','folder']),['folder-heart']);
});
test('emoji search finds names, categories, pasted glyphs, flags, skin tones and joined sequences',()=>{
 assert.ok(model.emojis.length>3000);
 for(const query of ['pizza','food','thumbs up medium skin tone','woman technologist','flag united states']) {
  const results=model.emojiSuggestions(query);assert.ok(results.length,query);assert.ok(results.every(id=>model.emoji(id)),query);
 }
 assert.ok(model.emojiSuggestions('🍕').includes('emoji:1f355'));
 assert.ok(model.emojiSuggestions('thumbs up medium skin tone').some(id=>model.emoji(id).glyph==='👍🏽'));
 assert.ok(model.emojiSuggestions('woman technologist').some(id=>model.emoji(id).glyph==='👩‍💻'));
 assert.equal(model.emojiSuggestions('', ['emoji:1f355'])[0],'emoji:1f355');
});
test('emoji assignments preserve exact sequences, reject unknown IDs, and retain natural colors',()=>{
 const config=model.emptyConfig();config.entries['A.md']={icon:'emoji:1f469-200d-1f4bb',color:'blue'};
 const saved=model.validateConfig(config);assert.equal(saved.entries['A.md'].color,'');
 const resolved=model.resolve(saved,'A.md','note',null,{});assert.equal(model.emoji(resolved.icon).glyph,'👩‍💻');
 for(const invalid of ['emoji:<script>','emoji:41','emoji:1f600-41','emoji:not-real']) {
  config.entries['A.md'].icon=invalid;assert.throws(()=>model.validateConfig(config),/Invalid icon/);
 }
 config.entries={};config.recent=['emoji:41'];assert.throws(()=>model.validateConfig(config),/Invalid icon/);
});
async function vaultFixture(t) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'slate-icons-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const vault = new Vault(root); await vault.init(); return {vault,root};
}
test('vault icons persist independently, reject stale writes and follow note/canvas moves', async t => {
 const {vault,root} = await vaultFixture(t);
 const state = await vault.icons(); assert.equal(state.revision,null);
 const config = state.config; config.entries['A.md'] = {icon:'star',color:'#abc'}; config.entries['Plan.canvas']={icon:'heart'};
 const saved = await vault.saveIcons(config,null); assert.ok(saved.revision);
 assert.equal((await new Vault(root).icons()).config.entries['A.md'].icon,'star');
 await assert.rejects(vault.saveIcons(config,null),error=>error.status===409);
 const original = await vault.save('A.md','[[A]]',null);
 const moved = await vault.rename('A.md','Projects/B.md',original.revision);
 assert.equal(moved.path,'Projects/B.md'); assert.equal((await vault.icons()).config.entries['Projects/B.md'].icon,'star'); assert.ok(!(await vault.icons()).config.entries['A.md']);
 const canvas = await vault.save('Plan.canvas','{"nodes":[],"edges":[]}',null,'canvas');
 await vault.rename('Plan.canvas','Boards/Plan.canvas',canvas.revision);
 assert.equal((await vault.icons()).config.entries['Boards/Plan.canvas'].icon,'heart');
 await vault.trash(moved.path,moved.revision);
 assert.equal((await vault.icons()).config.entries[moved.path].icon,'star','retained for restore');
 const other = await vaultFixture(t); assert.deepEqual((await other.vault.icons()).config.entries,{});
});

test('malformed icon metadata is preserved and a rename rolls back without losing notes', async t => {
 const {vault,root} = await vaultFixture(t);
 const note = await vault.save('A.md','text',null);
 await fs.writeFile(path.join(root,'.slate-icons.json'),'{ broken');
 await assert.rejects(vault.icons());
 await assert.rejects(vault.rename('A.md','B.md',note.revision));
 assert.equal((await vault.read('A.md')).content,'text');
 await assert.rejects(fs.stat(path.join(root,'B.md')),error=>error.code==='ENOENT');
 assert.equal(await fs.readFile(path.join(root,'.slate-icons.json'),'utf8'),'{ broken');
});

