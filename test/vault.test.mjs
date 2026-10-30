import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault, links, resolveLink, hash } from '../core.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = new Vault(root); await vault.init(); return vault;
}
test('nested Unicode notes persist and previous versions remain recoverable', async t => {
  const v = await fixture(t); const text = '# Café\r\n\r\nHello 🌱\r\n';
  const first = await v.save('Ideas/Café.md', text, null);
  assert.equal((await v.read('Ideas/Café.md')).content, text);
  await v.save('Ideas/Café.md', text + 'More', first.revision);
  const backups = await fs.readdir(path.join(v.root, '.slate-history'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(v.root, '.slate-history', backups[0]), 'utf8'), text);
  assert.equal((await v.list()).length, 1);
});
test('history and recovery folders from the previous app name are moved on open', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-legacy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.lattice-history')); await fs.writeFile(path.join(root, '.lattice-history', 'a.md'), 'old');
  await fs.mkdir(path.join(root, '.lattice-recovery')); await fs.mkdir(path.join(root, '.slate-recovery'));
  await new Vault(root).init();
  assert.equal(await fs.readFile(path.join(root, '.slate-history', 'a.md'), 'utf8'), 'old');
  await assert.rejects(fs.lstat(path.join(root, '.lattice-history')));
  await fs.lstat(path.join(root, '.lattice-recovery'));
});
test('stale and concurrent writers cannot overwrite a saved revision', async t => {
  const v = await fixture(t); const first = await v.save('Note.md', 'original', null);
  const results = await Promise.allSettled([v.save('Note.md', 'one', first.revision), v.save('Note.md', 'two', first.revision)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await v.read('Note.md')).content, 'one');
  await assert.rejects(v.save('Note.md', 'replacement', null), { status: 409 });
});
test('external modifications are detected', async t => {
  const v = await fixture(t); const first = await v.save('Note.md', 'original', null);
  await fs.writeFile(path.join(v.root, 'Note.md'), 'external');
  await assert.rejects(v.save('Note.md', 'draft', first.revision), { status: 409 });
  assert.equal((await v.read('Note.md')).content, 'external');
});
test('rejects traversal, drive, ADS, hidden paths, and Windows device names', async t => {
  const v = await fixture(t);
  for (const name of ['../escape.md','/absolute.md','C:/escape.md','C:escape.md','a\\b.md','//server/a.md','a/../b.md','.obsidian/file.md','a.md:payload','CON.md','a/NUL.md','note?.md','a./b.md','a//b.md','a\0.md']) {
    await assert.rejects(v.save(name, 'bad', null), undefined, name);
    await assert.rejects(v.read(name), undefined, name);
  }
});
test('junction parents are rejected for reads and creation and skipped during indexing', async t => {
  const v = await fixture(t); const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'Secret.md'), 'outside');
  await fs.symlink(outside, path.join(v.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(v.read('linked/Secret.md'), /Symbolic/);
  await assert.rejects(v.save('linked/New.md', 'bad', null), /Symbolic/);
  assert.deepEqual(await v.list(), []);
});
test('linked history directory cannot redirect backups', async t => {
  const v = await fixture(t); const first = await v.save('Note.md', 'original', null);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-history-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(v.root,'.slate-history'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(v.save('Note.md', 'changed', first.revision), /symbolic/);
  assert.equal((await v.read('Note.md')).content, 'original');
});
test('wiki links exclude code and resolve paths and ambiguous basenames', () => {
  assert.deepEqual(links('[[One|alias]] [[Two#heading]] `[[Not]]`\n```\n[[Code]]\n```'), ['One','Two']);
  const notes = [{path:'One.md'}, {path:'Folder/Two.md'}, {path:'Other/Two.md'}];
  assert.equal(resolveLink('One','Folder/From.md',notes),'One.md');
  assert.equal(resolveLink('Two','Folder/From.md',notes),'Folder/Two.md');
  assert.equal(resolveLink('Two','Root.md',notes),null);
  assert.equal(hash('same'),hash('same'));
});

test('rename updates resolved links and outgoing relative links, retaining aliases and code', async t => {
  const v = await fixture(t);
  const source = await v.save('Folder/Old.md', '# Old\n[[Neighbor#Section|near]]', null);
  await v.save('Folder/Neighbor.md', '# Neighbor', null);
  await v.save('Index.md', '[[Folder/Old#Heading|label]] ![[Folder/Old]] `[[Folder/Old]]`\n```\n[[Folder/Old]]\n```', null);
  const result = await v.rename('Folder/Old.md', 'Moved/New.md', source.revision);
  assert.equal(result.path, 'Moved/New.md'); assert.equal(result.updatedLinks, 3);
  assert.equal((await v.read(result.path)).content, '# Old\n[[Folder/Neighbor#Section|near]]');
  assert.equal((await v.read('Index.md')).content, '[[Moved/New#Heading|label]] ![[Moved/New]] `[[Folder/Old]]`\n```\n[[Folder/Old]]\n```');
  await assert.rejects(v.read('Folder/Old.md'), { code: 'ENOENT' });
  const manifest = JSON.parse(await fs.readFile(path.join(v.root, result.recoveryPath, 'manifest.json'), 'utf8'));
  assert.equal(manifest.notes.length, 2);
  assert.equal((await v.read('Moved/New.md')).revision, result.revision);
});

test('rename with link updates disabled moves the note and leaves every link unchanged', async t => {
  const v = await fixture(t);
  const source = await v.save('Folder/Old.md', '# Old\nSee [[Folder/Old]] itself', null);
  await v.save('Index.md', 'Link to [[Folder/Old]]', null);
  const result = await v.rename('Folder/Old.md', 'Moved/New.md', source.revision, false);
  assert.equal(result.path, 'Moved/New.md'); assert.equal(result.updatedLinks, 0);
  assert.equal((await v.read('Index.md')).content, 'Link to [[Folder/Old]]');
  assert.equal((await v.read('Moved/New.md')).content, '# Old\nSee [[Folder/Old]] itself');
});

test('rename rejects stale revisions and occupied destinations without changing notes', async t => {
  const v = await fixture(t), source = await v.save('Old.md', 'old', null);
  await v.save('Existing.md', 'existing', null);
  await assert.rejects(v.rename('Old.md', 'New.md', 'stale'), { status: 409 });
  await assert.rejects(v.rename('Old.md', 'Existing.md', source.revision), { status: 409 });
  assert.equal((await v.read('Old.md')).content, 'old'); assert.equal((await v.read('Existing.md')).content, 'existing');
});

test('rename rolls back completed link updates when a later write fails', async t => {
  const v = await fixture(t), source = await v.save('Old.md', '# Original', null);
  await v.save('A.md', '[[Old]]', null); await v.save('B.md', '[[Old]]', null);
  const replace = v.replace.bind(v); let failed = false;
  v.replace = async (...args) => { if (args[0] === 'B.md' && !failed) { failed = true; throw new Error('simulated write failure'); } return replace(...args); };
  await assert.rejects(v.rename('Old.md', 'New.md', source.revision), /Recovery:/);
  assert.equal((await v.read('A.md')).content, '[[Old]]'); assert.equal((await v.read('B.md')).content, '[[Old]]');
  assert.equal((await v.read('Old.md')).content, '# Original'); await assert.rejects(v.read('New.md'), { code: 'ENOENT' });
  assert.equal((await fs.readdir(path.join(v.root,'.slate-recovery'))).length, 1);
});

test('trash retains recoverable contents and refuses stale changes', async t => {
  const v = await fixture(t), first = await v.save('Folder/Note.md', 'keep this', null);
  await assert.rejects(v.trash(first.path, 'stale'), { status: 409 });
  const result = await v.trash(first.path, first.revision);
  assert.equal(result.trashed, true); assert.equal(await fs.readFile(path.join(v.root,result.recoveryPath,'0.md'),'utf8'), 'keep this');
  await assert.rejects(v.read(first.path), { code: 'ENOENT' }); assert.deepEqual(await v.list(), []);
});

test('folder creation and metadata inventory work without executing frontmatter', async t => {
  const v = await fixture(t); await v.folder('Empty/Nested');
  await v.save('Metadata.md', '---\ntitle: "Working title"\ntags: [one, two]\naliases:\n  - Alternate\n---\n# Heading\n#inline/tag `#ignored`', null);
  const notes = await v.list(); assert.equal(notes[0].title, 'Working title'); assert.deepEqual(notes[0].tags, ['inline/tag','one','two']); assert.deepEqual(notes[0].frontmatter.aliases, ['Alternate']);
  assert.deepEqual((await v.inventory()).folders, ['Empty','Empty/Nested']);
  await assert.rejects(v.folder('../outside')); await assert.rejects(v.folder('CON')); await assert.rejects(v.folder('.obsidian/plugins'));
});

test('attachment import validates types, refuses overwrite and protects reads', async t => {
  const v = await fixture(t), png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
  const result = await v.attachment('Assets/pixel.png', png.toString('base64')); assert.equal(result.mime, 'image/png');
  assert.deepEqual((await v.readAttachment(result.path)).bytes, png); assert.equal((await v.inventory()).attachments.length, 1);
  await assert.rejects(v.attachment(result.path, png.toString('base64')), { status: 409 });
  await assert.rejects(v.attachment('Assets/active.svg', Buffer.from('<svg/>').toString('base64')));
  await assert.rejects(v.attachment('Assets/false.png', Buffer.from('<script/>').toString('base64')), /does not match/);
  await assert.rejects(v.readAttachment('../pixel.png')); await assert.rejects(v.readAttachment('Note.md'));
  assert.equal((await v.list()).length, 0);
});

test('canvas saves validate graph shape, preserve revisions and remain distinct from notes', async t => {
  const v = await fixture(t), content = JSON.stringify({ nodes: [{id:'one',type:'text',x:0,y:0,width:200,height:100,text:'Hello'}], edges:[] });
  const first = await v.save('Boards/Plan.canvas', content, null, 'canvas');
  assert.equal((await v.read(first.path,'canvas')).content,content);
  await assert.rejects(v.read(first.path));
  assert.equal((await v.inventory()).canvases[0].path, first.path);
  await assert.rejects(v.save(first.path,content,'stale','canvas'), {status:409});
  await assert.rejects(v.save('Bad.canvas','{}',null,'canvas'), /nodes and edges/);
  await assert.rejects(v.save('Bad.canvas',JSON.stringify({nodes:[],edges:[{id:'e',fromNode:'missing',toNode:'missing'}]}),null,'canvas'), /existing nodes/);
});

test('canvas rename and trash preserve revisions and recovery copies', async t => {
  const v = await fixture(t), content = JSON.stringify({nodes:[],edges:[]});
  const first = await v.save('Old.canvas',content,null,'canvas');
  await assert.rejects(v.rename(first.path,'New.canvas','stale'), {status:409});
  await v.save('Occupied.canvas',content,null,'canvas');
  await assert.rejects(v.rename(first.path,'Occupied.canvas',first.revision), {status:409});
  await assert.rejects(v.rename(first.path,'New.md',first.revision));
  const moved = await v.rename(first.path,'Boards/New.canvas',first.revision);
  assert.equal(moved.updatedLinks,0); assert.equal(moved.revision,first.revision);
  assert.equal((await v.read(moved.path,'canvas')).content,content);
  await assert.rejects(v.read(first.path,'canvas'), {code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(v.root,moved.recoveryPath,'0.canvas'),'utf8'),content);
  await assert.rejects(v.trash(moved.path,'stale'), {status:409});
  const trashed = await v.trash(moved.path,moved.revision);
  assert.equal(await fs.readFile(path.join(v.root,trashed.recoveryPath,'0.canvas'),'utf8'),content);
  await assert.rejects(v.read(moved.path,'canvas'), {code:'ENOENT'});
});

test('recovery lists and previews snapshots and restore requires an expected revision', async t => {
  const v = await fixture(t), original = await v.save('Note.md','recover me',null);
  assert.deepEqual(await v.recoveries(), {entries:[],warnings:[]});
  const trashed = await v.trash(original.path,original.revision), id = trashed.recoveryPath.split('/')[1];
  const records = await v.recoveries(); assert.equal(records.entries[0].id,id); assert.equal(records.entries[0].operation,'trash'); assert.deepEqual(records.entries[0].files,[{path:'Note.md',revision:original.revision}]);
  assert.equal((await v.recoveryRead(id,'Note.md')).content,'recover me');
  await assert.rejects(v.restore(id,'Note.md',undefined),/explicit expected revision/);
  const restored = await v.restore(id,'Note.md',null); assert.equal(restored.revision,original.revision);
  await assert.rejects(v.restore(id,'Note.md',null),{status:409});
  const changed = await v.save('Note.md','newer contents',restored.revision);
  await assert.rejects(v.restore(id,'Note.md',restored.revision),{status:409});
  await v.restore(id,'Note.md',changed.revision); assert.equal((await v.read('Note.md')).content,'recover me');
  const history = await fs.readdir(path.join(v.root,'.slate-history')); assert.ok(history.some(x => x.includes(hash('newer contents'))));
});

test('recovery rejects path escapes, tampered snapshots and linked snapshot files', async t => {
  const v = await fixture(t), first = await v.save('Note.md','original',null), trashed = await v.trash(first.path,first.revision), id = trashed.recoveryPath.split('/')[1];
  await assert.rejects(v.recoveryRead('../outside','Note.md'),/identifier/);
  await assert.rejects(v.recoveryRead(id,'../Note.md'),/selected file/);
  const snapshot = path.join(v.root,trashed.recoveryPath,'0.md'); await fs.writeFile(snapshot,'tampered');
  await assert.rejects(v.restore(id,'Note.md',null),/integrity/); await assert.rejects(v.read('Note.md'),{code:'ENOENT'});
  await fs.unlink(snapshot); const outside = await fs.mkdtemp(path.join(os.tmpdir(),'slate-snapshot-')); t.after(() => fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,snapshot,process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(v.recoveryRead(id,'Note.md'),/Invalid recovery snapshot/);
});

test('canvas recovery restores its original file format', async t => {
  const v = await fixture(t), content = JSON.stringify({nodes:[],edges:[]}), original = await v.save('Plan.canvas',content,null,'canvas'), trashed = await v.trash(original.path,original.revision);
  await v.restore(trashed.recoveryPath.split('/')[1],original.path,null);
  assert.equal((await v.read(original.path,'canvas')).content,content);
});
