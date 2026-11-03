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

function storedZip(entries) {
 const locals = [], centrals = []; let offset = 0;
 for (const [name, text] of entries) {
  const nameBytes = Buffer.from(name), data = Buffer.from(text);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  locals.push(local, nameBytes, data);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBytes); offset += local.length + nameBytes.length + data.length;
 }
 const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
 const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
 return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

test('clicking a document previews it in Slate instead of opening a save dialog', async () => {
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 const open = app.slice(app.indexOf('async function openAttachmentFile'), app.indexOf('async function renderFilePreview'));
 assert.match(open, /showView\('fileView'\)/);
 assert.match(open, /addTab\(path,'file'\)/);
 assert.doesNotMatch(open, /window\.open|download/);
 const run = setup();
 assert.equal(run(`previewKind('Photo.JPG','image/jpeg')`), 'image');
 assert.equal(run(`previewKind('Scan.heic','image/heic')`), 'none');
 assert.equal(run(`previewKind('Report.pdf','application/pdf')`), 'pdf');
 assert.equal(run(`previewKind('Book.xlsx','')`), 'office');
 assert.equal(run(`previewKind('Data.csv','text/csv')`), 'sheet');
 assert.deepEqual(JSON.parse(run(`JSON.stringify(parseDelimited('a,"b,c"\\n1,2',','))`)), [['a', 'b,c'], ['1', '2']]);
});

test('Office previews extract Word text and spreadsheet cells from the vault file', async () => {
 const run = setup();
 const docx = storedZip([['word/document.xml', '<w:p><w:t>Hello</w:t></w:p><w:p><w:t>World</w:t></w:p>']]);
 const docResult = await run(`officePreview('Report.docx', new Uint8Array([${[...docx].join(',')}]))`);
 assert.equal(docResult.kind, 'text'); assert.equal(docResult.text, 'Hello\nWorld');
 const xlsx = storedZip([
  ['xl/sharedStrings.xml', '<si><t>Name</t></si><si><t>Score</t></si>'],
  ['xl/worksheets/sheet1.xml', '<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c><v>42</v></c></row>'],
 ]);
 const sheetResult = await run(`officePreview('Book.xlsx', new Uint8Array([${[...xlsx].join(',')}]))`);
 assert.equal(sheetResult.kind, 'sheet'); assert.deepEqual(JSON.parse(JSON.stringify(sheetResult.rows)), [['Name', 'Score'], ['42']]);
});

test('files get an intelligent Lucide icon for their type in sidebar, tab and header', () => {
 const run = setup();
 for (const path of ['Photo.jpg', 'Photo.jpeg', 'Photo.JPG', 'Image.png', 'Anim.gif', 'Pic.webp', 'Scan.tiff']) assert.equal(run(`fileTypeIcon('${path}','file')`), 'image', path);
 for (const path of ['Note.md', 'Notes.txt', 'Letter.docx', 'Report.pdf', 'Manual.odt']) assert.equal(run(`fileTypeIcon('${path}','file')`), 'file-text', path);
 assert.equal(run(`fileTypeIcon('Note.md','note')`), 'file-text');
 for (const path of ['app.js', 'main.py', 'data.json', 'page.html', 'styles.css', 'query.sql', 'config.yaml']) assert.equal(run(`fileTypeIcon('${path}','file')`), 'code', path);
 assert.equal(run(`fileTypeIcon('Data.csv','file')`), 'table');
 assert.equal(run(`fileTypeIcon('Book.xlsx','file')`), 'table');
 assert.equal(run(`fileTypeIcon('Deck.pptx','file')`), 'presentation');
 assert.equal(run(`fileTypeIcon('Song.mp3','file')`), 'music');
 assert.equal(run(`fileTypeIcon('Clip.mp4','file')`), 'video');
 assert.equal(run(`fileTypeIcon('Bundle.zip','file')`), 'archive');
 assert.equal(run(`fileTypeIcon('Board.canvas','canvas')`), 'layout');
 assert.equal(run(`fileTypeIcon('Sketch.excalidraw','whiteboard')`), 'presentation');
 assert.equal(run(`previewKind('app.js','text/javascript')`), 'text');
});

test('preview header matches note headings and has no download or reveal actions', async () => {
 const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 const menus = await fs.readFile(new URL('../public/app-menus.js', import.meta.url), 'utf8');
 assert.match(html, /id="fileView" class="note-view file-view"/);
 assert.match(html, /class="document-heading"><h1 class="file-preview-heading"/);
 assert.doesNotMatch(html, /fileDownload|fileReveal|Download a copy/);
 assert.doesNotMatch(app, /downloadAttachment|fileDownload|fileReveal/);
 assert.match(menus, /Show in system explorer/);
});

test('frontend attachment list stays in sync with the vault list', async () => {
 const core = await fs.readFile(new URL('../core.mjs', import.meta.url), 'utf8');
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 const coreExts = [...core.match(/export const attachmentTypes = \{([\s\S]*?)\n\};/)[1].matchAll(/'(\.[a-z0-9]+)':/g)].map(m => m[1]);
 const appExts = [...app.match(/const attachmentExtensions = new Set\(\[([\s\S]*?)\]\);/)[1].matchAll(/'(\.[a-z0-9]+)'/g)].map(m => m[1]);
 assert.deepEqual([...appExts].sort(), [...coreExts].sort());
});

test('extension badge sits at the far right of the file row and is subdued', async () => {
 const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
 const rule = css.match(/\.file-extension\{([^}]*)\}/)?.[1] || '';
 assert.match(rule, /margin-left:\s*auto/);
 assert.match(rule, /color:\s*var\(--faint\)/);
 assert.match(rule, /font-size:\s*9px/);
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 assert.match(app, /class="file-extension"/);
});
