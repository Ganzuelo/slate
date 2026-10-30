import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function setup() {
  const props = new Map(), bodyClasses = new Map();
  const media = { matches: false, addEventListener() {} };
  const root = { dataset: {}, style: { setProperty: (name, value) => props.set(name, value) }, classList: { add() {} } };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { toggle() {}, add() {} } });
    return elements.get(id);
  };
  const context = vm.createContext({
    window: { matchMedia: () => media, addEventListener() {} },
    document: {
      documentElement: root,
      body: { classList: { toggle: (name, on) => bodyClasses.set(name, on) } },
      getElementById: element,
      addEventListener() {},
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { hash: '' }, sessionStorage: { getItem() { return ''; } },
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return { props, bodyClasses, run };
}

test('appearance settings resolve font stacks, clamps, and interface visibility', () => {
  const f = setup();
  f.run(`settings.interfaceFont='Georgia, "Times New Roman"';settings.monospaceFont='';settings.font='Segoe UI';settings.fontSize=99;settings.tabSize=99;settings.showRibbon=false;settings.showViewHeader=false;applySettings();`);
  assert.match(f.props.get('--ui-font'), /Georgia/);
  assert.match(f.props.get('--ui-font'), /'Times New Roman'/);
  assert.match(f.props.get('--code-font'), /Consolas/);
  assert.equal(f.props.get('--font-size'), '30px');
  assert.equal(f.run('settings.tabSize'), 8);
  assert.equal(f.bodyClasses.get('ribbon-hidden'), true);
  assert.equal(f.bodyClasses.get('view-header-hidden'), true);
  f.run(`settings.monospaceFont='Monospace';settings.showRibbon=true;applySettings();`);
  assert.match(f.props.get('--code-font'), /monospace/);
  assert.equal(f.bodyClasses.get('ribbon-hidden'), false);
});

test('font stacks reject CSS injection characters', () => {
  const f = setup();
  f.run(`settings.interfaceFont='Evil"; } body { color: red';applySettings();`);
  assert.doesNotMatch(f.props.get('--ui-font'), /[;{}]/);
});

test('Excalidraw core plugin toggle hides creation and the ribbon button', () => {
  const f = setup();
  assert.equal(f.run('excalidrawEnabled()'), true);
  assert.ok(f.run(`JSON.stringify(commands().map(c=>c.label))`).includes('Create new whiteboard'));
  f.run(`settings.excalidrawEnabled=false;applySettings();`);
  assert.equal(f.run('excalidrawEnabled()'), false);
  assert.equal(f.run(`document.getElementById('whiteboardButton').hidden`), true);
  assert.ok(!f.run(`JSON.stringify(commands().map(c=>c.label))`).includes('Create new whiteboard'));
  f.run(`settings.excalidrawEnabled=true;applySettings();`);
  assert.equal(f.run(`document.getElementById('whiteboardButton').hidden`), false);
  assert.ok(f.run(`JSON.stringify(commands().map(c=>c.label))`).includes('Create new whiteboard'));
});

test('daily date format and folder helpers follow Obsidian-style modes', () => {
  const f = setup();
  assert.equal(f.run(`formatDailyDate(new Date(2026,0,5),'YYYY-MM-DD')`), '2026-01-05');
  assert.equal(f.run(`formatDailyDate(new Date(2026,11,25),'DD/MM/YYYY')`), '25/12/2026');
  f.run(`settings.newFileLocation='root';settings.newFolder='Ideas';`);
  assert.equal(f.run('newNoteFolder()'), '');
  f.run(`settings.newFileLocation='folder';`);
  assert.equal(f.run('newNoteFolder()'), 'Ideas');
  f.run(`settings.newFileLocation=null;settings.newFolder='';settings.attachmentFolder='Attachments';settings.attachmentLocation=null;`);
  assert.equal(f.run('attachmentFolderFor()'), 'Attachments');
});
