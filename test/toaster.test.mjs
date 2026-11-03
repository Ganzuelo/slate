import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/toaster.js', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');

function element(tag) {
 const el = {tag, children: [], parent: null, dataset: {}, attributes: {}, style: {setProperty() {}, removeProperty() {}}, listeners: {}, textContent: '', innerHTML: '', offsetHeight: 40,
  classList: {set: new Set(), add(...n) {n.forEach(x => this.set.add(x));}, remove(...n) {n.forEach(x => this.set.delete(x));}, toggle(n, on) {on ? this.set.add(n) : this.set.delete(n);}, contains(n) {return this.set.has(n);}},
  append(...items) {for (const item of items) {item.parent = this; this.children.push(item);}},
  prepend(item) {item.parent = this; this.children.unshift(item);},
  remove() {if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);},
  setAttribute(name, value) {this.attributes[name] = String(value);},
  addEventListener(type, fn) {this.listeners[type] = fn;},
  contains(node) {for (let n = node; n; n = n.parent) if (n === this) return true; return false;},
  querySelector(selector) {const cls = selector.replace(/^\./, ''); const walk = n => {for (const c of n.children) {if (c.tag === selector || c.className === cls) return c; const hit = walk(c); if (hit) return hit;} return null;}; return walk(this);},
  matches() {return false;}, setPointerCapture() {}, focus() {},
 };
 return el;
}
function setup() {
 const body = element('body');
 const timers = [];
 const context = vm.createContext({
  document: {body, activeElement: null, createElement: element, getElementById: () => null},
  window: {SlateIcons: {x: '<svg>x</svg>', 'circle-x': '<svg>err</svg>', 'circle-check': '<svg>ok</svg>', info: '<svg>i</svg>', 'triangle-alert': '<svg>w</svg>'}},
  setTimeout: (fn, ms) => {timers.push({fn, ms}); return timers.length;}, clearTimeout() {}, Date,
 });
 vm.runInContext(source, context);
 const toast = context.window.SlateToast;
 const list = () => body.children[0]?.children[0]?.children || [];
 return {toast, body, list, timers};
}
const text = el => el.children.find(c => c.className === 'toast-body').children.map(c => c.textContent);

test('shows typed toasts newest first with icon, text, close button and live-region role', () => {
 const {toast, list} = setup();
 toast.error('Save failed', {description: 'Your draft is kept.'});
 toast.success('Snapshot restored.');
 const [first, second] = list();
 assert.equal(first.dataset.type, 'success'); assert.equal(first.attributes.role, 'status');
 assert.equal(second.dataset.type, 'error'); assert.equal(second.attributes.role, 'alert');
 assert.deepEqual(text(second), ['Save failed', 'Your draft is kept.']);
 assert.equal(second.children[0].innerHTML, '<svg>err</svg>');
 const close = second.children.find(c => c.className === 'toast-close');
 assert.equal(close.attributes['aria-label'], 'Dismiss notification');
 close.onclick();
 assert.deepEqual([...toast.list().map(t => t.title)], ['Snapshot restored.']);
});

test('action buttons dismiss the toast and run their handler', () => {
 const {toast, list} = setup();
 let ran = 0;
 toast.warning('This task moved or changed.', {action: {label: 'Refresh', onClick: () => ran++}});
 const action = list()[0].children.find(c => c.className === 'toast-action');
 assert.equal(action.textContent, 'Refresh');
 action.onclick();
 assert.equal(ran, 1); assert.equal(toast.list().length, 0);
});

test('a toast with an id replaces its earlier version and can be dismissed by id', () => {
 const {toast} = setup();
 toast.error('Disk full. Your draft is kept.', {id: 'save:A.md'});
 toast.error('Offline. Your draft is kept.', {id: 'save:A.md'});
 assert.deepEqual([...toast.list().map(t => t.title)], ['Offline. Your draft is kept.']);
 toast.dismiss('save:A.md');
 assert.equal(toast.list().length, 0);
});

test('repeats refresh instead of stacking, timers follow severity, and only three stay visible', () => {
 const {toast, list, timers} = setup();
 toast.error('Offline'); toast.error('Offline');
 assert.equal(toast.list().length, 1);
 toast.success('Done'); toast.info('Note'); toast.warning('Careful');
 assert.deepEqual(list().map(el => el.classList.contains('collapsed')), [false, false, false, true]);
 assert.deepEqual(timers.slice(-3).map(t => t.ms), [4000, 4000, 6000]);
 assert.equal(timers[0].ms, 8000);
 toast.dismissWhere(t => t.type === 'error' || t.type === 'warning');
 assert.deepEqual([...toast.list().map(t => t.type)], ['info', 'success']);
 assert.equal(toast.show(''), null);
});

test('the note banner is gone and message() routes alerts through the toaster', () => {
 assert.doesNotMatch(html, /id="message"/);
 assert.match(html, /<script src="\/toaster.js" defer><\/script>/);
 const shown = [], cleared = [];
 const context = vm.createContext({window: {SlateToast: {show: o => shown.push(o), dismissWhere: fn => cleared.push(fn)}}});
 vm.runInContext(appSource.match(/let lastMessage='';\r?\nfunction message[\s\S]*?\r?\n}\r?\n/)[0], context);
 vm.runInContext("message('Boom');message('Careful','warning');message('Saved',{type:'success',action:{label:'Undo'}});message();", context);
 assert.deepEqual(shown.map(o => [o.title, o.type, o.action?.label]), [['Boom', 'error', undefined], ['Careful', 'warning', undefined], ['Saved', 'success', 'Undo']]);
 // An empty message must not dismiss unread errors.
 assert.equal(cleared.length, 0); assert.equal(vm.runInContext('lastMessage', context), '');
});
