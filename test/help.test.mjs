import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const read = file => fs.readFile(new URL('../public/' + file, import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(await read('help.js'), context);
vm.runInContext(await read('vendor/icons.js'), context);
const { topics, search } = context.window.SlateHelp;
const icons = context.window.SlateIcons;
const strings = topic => topic.blocks.flatMap(block => typeof block === 'string' ? [block] : Object.values(block).flat(2));

test('help topics have unique ids, grouped navigation, and registered Lucide icons', () => {
 const ids = topics.map(topic => topic.id);
 assert.equal(new Set(ids).size, ids.length);
 const groups = topics.map(topic => topic.group).filter((group, index, all) => group !== all[index - 1]);
 assert.equal(new Set(groups).size, groups.length, 'topics in a group must be adjacent');
 for (const topic of topics) {
  assert.ok(topic.title && topic.summary && topic.blocks.length, topic.id + ' needs content');
  assert.ok(icons[topic.icon], 'unregistered icon ' + topic.icon);
 }
 assert.ok(icons.lightbulb && icons['circle-question-mark'] && icons.search);
});

test('links between help topics resolve', () => {
 const ids = new Set(topics.map(topic => topic.id));
 for (const topic of topics) for (const text of strings(topic)) for (const [, target] of text.matchAll(/\]\(([a-z-]+)\)/g)) assert.ok(ids.has(target), topic.id + ' links to missing topic ' + target);
});

test('help covers every app feature area', () => {
 const ids = topics.map(topic => topic.id);
 for (const id of ['vaults', 'editing', 'links', 'daily-templates', 'files', 'search', 'tabs', 'icons', 'tasks', 'task-queries', 'dataview', 'graph', 'whiteboards', 'canvas', 'commands', 'appearance', 'settings', 'privacy']) assert.ok(ids.includes(id), 'missing topic ' + id);
});

test('the shortcut reference lists every command shortcut', async () => {
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 const commandKeys = [...app.matchAll(/,'((?:Ctrl|F\d)[^']*)'\]/g)].map(match => match[1].replace(/ /g, '+'));
 assert.ok(commandKeys.includes('F1') && commandKeys.includes('Ctrl+N'));
 const listed = topics.find(topic => topic.id === 'commands').blocks.find(block => block.keys).keys.map(([keys]) => keys);
 for (const keys of commandKeys) assert.ok(listed.includes(keys), 'shortcut reference is missing ' + keys);
});

test('help search matches titles and body text, requiring every term', () => {
 assert.equal(search('').length, topics.length);
 assert.ok(search('recurring').some(topic => topic.id === 'tasks'));
 assert.ok(search('EXCALIDRAW').some(topic => topic.id === 'whiteboards'));
 assert.deepEqual(Array.from(search('dataviewjs worker'), topic => topic.id), ['dataview']);
 assert.equal(search('zzzz-not-a-topic').length, 0);
});

test('help is reachable from the vault footer, F1, and the command palette', async () => {
 const html = await read('index.html');
 const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
 assert.match(html, /<button id="helpButton" data-icon="circle-question-mark"[^>]*aria-label="Help"><\/button><button id="settingsButton"/);
 assert.match(html, /<script src="\/help\.js" defer><\/script><script src="\/app\.js"/);
 assert.match(html, /<dialog id="helpDialog"/);
 assert.match(app, /\$\('helpButton'\)\.onclick=\(\)=>openHelp\(\)/);
 assert.match(app, /e\.key==='F1'/);
 assert.match(app, /\['Open help',\(\)=>openHelp\(\),'F1'\]/);
});
