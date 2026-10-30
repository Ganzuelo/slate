import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(await fs.readFile(new URL('../public/graph-view.js', import.meta.url), 'utf8'), context);
const { collect, sliderStrength, repelCharge } = context.window.SlateGraphView;

const settings = {
 query: '',
 showTags: false,
 showAttachments: false,
 hideUnresolved: false,
 showOrphans: true,
 depth: 1,
 neighborLinks: false,
 outgoing: true,
 incoming: true
};

test('force sliders use the same curves as the graph controls', () => {
 assert.equal(sliderStrength(0), 0);
 assert.equal(sliderStrength(1), 1);
 assert.ok(Math.abs(sliderStrength(0.519) - 0.1) < 0.01, sliderStrength(0.519));
 assert.equal(repelCharge(10), -1000);
 assert.equal(repelCharge(0), -1);
});

test('collects notes, drops orphans, and keeps unresolved links optional', () => {
 const notes = [
  { path: 'A.md', tags: ['topic'], resolved: [{ target: 'B', path: 'B.md' }, { target: 'Missing' }] },
  { path: 'B.md', tags: [], resolved: [] },
  { path: 'Alone.md', tags: [], resolved: [] }
 ];
 const shown = collect({ notes }, { ...settings, showOrphans: false });
 assert.deepEqual(JSON.parse(JSON.stringify(shown.items.map(item => item.id))), ['A.md', 'B.md', 'unresolved:Missing']);
 assert.deepEqual(JSON.parse(JSON.stringify(shown.links)), [[0, 1], [0, 2]]);
 const filesOnly = collect({ notes }, { ...settings, showOrphans: false, hideUnresolved: true });
 assert.deepEqual(JSON.parse(JSON.stringify(filesOnly.items.map(item => item.id))), ['A.md', 'B.md']);
});

test('local graph stops at the chosen depth and does not walk through tags', () => {
 const notes = [
  { path: 'A.md', tags: ['shared'], resolved: [{ target: 'B', path: 'B.md' }] },
  { path: 'B.md', tags: ['shared'], resolved: [{ target: 'C', path: 'C.md' }] },
  { path: 'C.md', tags: [], resolved: [] },
  { path: 'D.md', tags: ['shared'], resolved: [] }
 ];
 const local = collect({ notes, local: true, current: 'A.md' }, { ...settings, showTags: true, depth: 1 });
 assert.deepEqual(JSON.parse(JSON.stringify(local.items.map(item => item.id).sort())), ['A.md', 'B.md', 'tag:shared']);
 const deeper = collect({ notes, local: true, current: 'A.md' }, { ...settings, depth: 2 });
 assert.ok(deeper.items.some(item => item.id === 'C.md'));
});

test('the graph screen builds its canvas and cools a layout', async () => {
 const elements = new Map();
 function element(tag) {
  const node = {
   tag, children: [], className: '', hidden: false, textContent: '', innerHTML: '', value: '', type: '', dataset: {},
   classList: {
    add() {},
    remove() {},
    toggle(name, force) { node.className = force ? name : ''; }
   },
   setAttribute() {},
   toggleAttribute(name, on) { if (name === 'hidden') node.hidden = !!on; },
   append(...kids) { node.children.push(...kids); },
   replaceChildren(...kids) { node.children = [...kids]; },
   get lastElementChild() { return node.children.at(-1) || null; },
   querySelector() { return node.children.find(child => child?.className === 'graph-orphans') || null; },
   addEventListener() {},
   getContext() { return new Proxy({}, { get: () => () => {} }); },
   getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0 }; },
   hasPointerCapture() { return false; },
   setPointerCapture() {},
   releasePointerCapture() {}
  };
  return node;
 }
 const canvas = element('canvas');
 const controls = element('div');
 elements.set('graphCanvas', canvas);
 elements.set('graphControls', controls);
 const windowStub = {
  devicePixelRatio: 1,
  icon: () => '<svg></svg>',
  requestAnimationFrame(callback) { queueMicrotask(callback); return 1; },
  SlateGraphLayout: null
 };
 const documentStub = {
  documentElement: element('html'),
  getElementById: id => elements.get(id) || null,
  createElement: element
 };
 globalThis.ResizeObserver = class { observe() {} };
 globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
 const live = vm.createContext({ window: windowStub, document: documentStub, ResizeObserver: globalThis.ResizeObserver, getComputedStyle: globalThis.getComputedStyle, requestAnimationFrame: windowStub.requestAnimationFrame });
 vm.runInContext(await fs.readFile(new URL('../public/graph-layout.js', import.meta.url), 'utf8'), live);
 vm.runInContext(await fs.readFile(new URL('../public/graph-view.js', import.meta.url), 'utf8'), live);
 live.window.SlateGraphView.render({
  notes: [
   { path: 'A.md', tags: [], resolved: [{ target: 'B', path: 'B.md' }] },
   { path: 'B.md', tags: [], resolved: [] }
  ],
  attachments: [],
  current: 'A.md',
  local: false,
  onOpen() {}
 });
 await new Promise(resolve => setTimeout(resolve, 50));
 assert.equal(controls.children.length, 5);
 assert.equal(canvas.width, 800);
});
