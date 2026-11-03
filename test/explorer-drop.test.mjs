import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const sources = await Promise.all(['app-menus.js', 'app.js'].map(name => fs.readFile(new URL('../public/' + name, import.meta.url), 'utf8')));
function setup() {
 const elements = new Map();
 const element = () => ({children: [], dataset: {}, classList: {toggle() {}, add() {}, remove() {}}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];}, setAttribute() {}, querySelectorAll() {return [];}, close() {}, focus() {}});
 const context = vm.createContext({document: {getElementById(id) {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);}, createElement: element}, window: {addEventListener() {}}, location: {hash: ''}, sessionStorage: {getItem() {return '';}}, localStorage: {getItem() {}, setItem() {}}, clearTimeout, setTimeout, setInterval() {}});
 for (const source of sources) vm.runInContext(source.replace('init().catch(e=>message(e.message));', ''), context);
 const run = code => vm.runInContext(code, context);
 run(`icon=()=>'';schedulePersist=()=>{};renderTabs=()=>{};update=()=>{};var writes=[];api=async(route,data)=>{if(data.path.includes('?'))throw new Error('Invalid note path.');writes.push([route,data]);return {};};refresh=async()=>{};`);
 return run;
}
const file = (name, content = 'body') => ({name, size: content.length, text: async () => content, arrayBuffer: async () => new TextEncoder().encode(content).buffer});
const row = (className, data) => ({classList: {contains: name => className === name}, dataset: data, closest() {return this;}});

test('dropped files go into the folder row, a file row\'s folder, or the vault root', () => {
 const run = setup();
 run(`sidebar='files';`);
 {
  const dropFolder = run('dropFolder');
  assert.equal(dropFolder(row('folder', {path: 'Projects/Alpha'})), 'Projects/Alpha');
  assert.equal(dropFolder(row('file', {tooltip: 'Projects/Note.md'})), 'Projects');
  assert.equal(dropFolder(row('file', {tooltip: 'Root.md'})), '');
  assert.equal(dropFolder({closest: () => null}), '');
  run(`sidebar='search';`);
  assert.equal(dropFolder(row('folder', {path: 'Projects'})), '');
 }
});

test('imports notes, text, canvases and whiteboards without overwriting existing files', async () => {
 const run = setup();
 run(`sidebar='files';folders=['Inbox'];notes=[{path:'Inbox/Idea.md'},{path:'Inbox/Idea 1.md'}];canvases=[];whiteboards=[];attachments=[];closedFolders=new Set(['Inbox']);`);
 const imported = JSON.parse(JSON.stringify(await run('importDroppedFiles')([file('idea.md', '# Idea'), file('Notes.txt', 'plain'), file('Board.canvas', '{"nodes":[],"edges":[]}'), file('Sketch.excalidraw', '{}')], 'Inbox')));
 assert.deepEqual(imported, ['Inbox/idea 2.md', 'Inbox/Notes.md', 'Inbox/Board.canvas', 'Inbox/Sketch.excalidraw']);
 assert.deepEqual(JSON.parse(run('JSON.stringify(writes)')), [
  ['note', {path: 'Inbox/idea 2.md', content: '# Idea', revision: null}],
  ['note', {path: 'Inbox/Notes.md', content: 'plain', revision: null}],
  ['canvas', {path: 'Inbox/Board.canvas', content: '{"nodes":[],"edges":[]}', revision: null}],
  ['whiteboard', {path: 'Inbox/Sketch.excalidraw', content: '{}', revision: null}],
 ]);
 assert.equal(run(`closedFolders.has('Inbox')`), false);
});

test('reports unsupported, oversized and rejected files while importing the rest', async () => {
 const run = setup();
 run(`sidebar='files';folders=[];notes=[];canvases=[];whiteboards=[];attachments=[];`);
 const big = {name: 'Big.md', size: 5 * 1024 * 1024, text: async () => ''};
 const imported = JSON.parse(JSON.stringify(await run('importDroppedFiles')([file('photo.png'), file('README'), big, file('bad?.md'), file('Good.md')], '')));
 assert.deepEqual(imported, ['photo.png', 'Good.md']);
 const text = run(`$('message').textContent`);
 assert.match(text, /Big\.md: File exceeds 4 MiB\./);
 assert.match(text, /bad\?\.md: Invalid note path\./);
 assert.match(text, /Could not import README\. The file explorer accepts Markdown, text, canvas, whiteboard, image, audio, video, PDF and office documents/);
});

test('copies documents and media into the vault as attachments without overwriting', async () => {
 const run = setup();
 run(`sidebar='files';folders=['Inbox'];notes=[];canvases=[];whiteboards=[];attachments=[{path:'Inbox/Data.csv'}];closedFolders=new Set();`);
 const imported = JSON.parse(JSON.stringify(await run('importDroppedFiles')([file('Data.csv', 'a,b\n1,2'), file('Report.pdf', '%PDF-1.4 fake'), file('Book.xlsx', 'PK fake'), file('Song.mp3', 'ID3 fake'), file('Clip.mp4', 'mp4 fake')], 'Inbox')));
 assert.deepEqual(imported, ['Inbox/Data 1.csv', 'Inbox/Report.pdf', 'Inbox/Book.xlsx', 'Inbox/Song.mp3', 'Inbox/Clip.mp4']);
 const writes = JSON.parse(run('JSON.stringify(writes)'));
 assert.deepEqual(writes.map(([route, data]) => [route, data.path]), [['attachment', 'Inbox/Data 1.csv'], ['attachment', 'Inbox/Report.pdf'], ['attachment', 'Inbox/Book.xlsx'], ['attachment', 'Inbox/Song.mp3'], ['attachment', 'Inbox/Clip.mp4']]);
 assert.equal(Buffer.from(writes[0][1].base64, 'base64').toString(), 'a,b\n1,2');
 assert.equal(Buffer.from(writes[1][1].base64, 'base64').toString(), '%PDF-1.4 fake');
});

test('document files get a subdued extension label and notes do not', () => {
 const run = setup();
 assert.equal(run(`extensionLabel('Inbox/Report.pdf')`), 'PDF');
 assert.equal(run(`extensionLabel('Data.CSV')`), 'CSV');
 assert.equal(run(`extensionLabel('Book.xlsx')`), 'XLSX');
 assert.equal(run(`extensionLabel('Note.md')`), '');
 assert.equal(run(`fileType('Report.pdf')`), 'file');
 assert.equal(run(`fileType('Note.md')`), 'note');
 assert.equal(run(`displayName('Inbox/Report.pdf')`), 'Report');
});

test('extension badge sits at the far right of the file row and is subdued', async () => {
 const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
 const rule = css.match(/\.file-extension\{([^}]*)\}/)?.[1] || '';
 assert.match(rule, /margin-left:\s*auto/);
 assert.match(rule, /color:\s*var\(--faint\)/);
 assert.match(rule, /font-size:\s*10px/);
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 assert.match(app, /class="file-extension"/);
});
