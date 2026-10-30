import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../public/controls.js', import.meta.url), 'utf8');

// Exercise the form contract and keyboard handling without a browser dependency.
function fixture() {
  let document;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.listeners = {}; this.scrollHeight = 120; this.isConnected = true; }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    before(child) { this.parent.append(child); }
    replaceChildren() { this.children.forEach(child => { child.isConnected = false; }); this.children = []; }
    setAttribute(name, value) { this.attrs[name] = value; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    insertAdjacentHTML() {}
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    dispatchEvent(event) { this.listeners[event.type]?.forEach(handler => handler(event)); return true; }
    showPopover() { this.dispatchEvent({ type: 'beforetoggle', newState: 'open' }); this.open = true; }
    hidePopover() { this.dispatchEvent({ type: 'beforetoggle', newState: 'closed' }); this.open = false; }
    matches() { return this.open; }
    focus() { if (this.isConnected) document.activeElement = this; }
    click() { this.onclick?.(); }
    scrollIntoView() {}
    contains(target) { return target === this || this.children.some(child => child.contains?.(target)); }
    getBoundingClientRect() { return { left: 100, top: 100, bottom: 136, width: 160, height: 122 }; }
    get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.text = value; }
  }
  document = { activeElement: null, createElement: tag => new Element(tag), addEventListener() {}, removeEventListener() {} };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener() {}, removeEventListener() {} };
  const root = new Element('div'), select = new Element('select'); root.append(select);
  select.labels = []; select.value = 'normal';
  select.options = [['normal', 'Normal'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([value, textContent]) => ({ value, textContent, get selected() { return select.value === value; } }));
  Object.defineProperty(select, 'selectedOptions', { get: () => select.options.filter(option => option.selected) });
  root.querySelectorAll = () => [select];
  vm.runInNewContext(source, { window, document, HTMLElement: Element, Event, Date, queueMicrotask });
  const enhance = () => window.SlateSelect.enhance(root, () => ''); enhance();
  const wrapper = root.children.at(-1), trigger = wrapper.children[1], list = wrapper.children[2];
  function key(key, target = document.activeElement) { const event = { key, preventDefault() { this.prevented = true; }, stopPropagation() {} }; (list.contains(target) ? list : trigger).onkeydown(event); return event; }
  return { select, trigger, list, document, enhance, key };
}

test('select commits the original form value once and restores trigger focus', () => {
  const { select, trigger, list, document } = fixture();
  let changes = 0, inputs = 0;
  select.addEventListener('change', () => changes++); select.addEventListener('input', () => inputs++);
  trigger.click(); list.children[1].click();
  assert.equal(select.value, 'high'); assert.equal(trigger.children[0].textContent, 'High');
  assert.equal(list.children[1].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, trigger); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(changes, 1); assert.equal(inputs, 1);
  trigger.click(); list.children[1].click(); assert.equal(changes, 1);
});

test('arrows skip disabled options; Escape cancels and Tab permits normal focus traversal', () => {
  const { select, trigger, list, document, key } = fixture();
  select.options[1].disabled = true;
  trigger.focus(); key('ArrowDown'); key('ArrowDown');
  assert.equal(document.activeElement.textContent, 'Medium');
  key('End'); assert.equal(document.activeElement.textContent, 'Low');
  key('Home'); assert.equal(document.activeElement.textContent, 'Normal');
  key('Escape'); assert.equal(select.value, 'normal'); assert.equal(document.activeElement, trigger);
  assert.equal(key('Escape').prevented, undefined);
  trigger.click(); const tab = key('Tab');
  assert.equal(tab.prevented, undefined); assert.equal(list.open, false); assert.equal(document.activeElement, trigger);
});

test('typeahead opens the list and focuses a connected option before committing', () => {
  const { select, trigger, document, key } = fixture();
  trigger.focus(); key('m');
  assert.equal(document.activeElement.textContent, 'Medium'); assert.equal(document.activeElement.isConnected, true);
  key('Enter'); assert.equal(select.value, 'medium');
});

test('re-enhancement syncs programmatic resets without duplicating controls', () => {
  const { select, trigger, enhance } = fixture();
  select.value = 'high'; enhance(); assert.equal(trigger.children[0].textContent, 'High');
  select.value = 'normal'; enhance(); assert.equal(trigger.children[0].textContent, 'Normal');
  select.disabled = true; enhance(); assert.equal(trigger.disabled, true);
  trigger.click(); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});
