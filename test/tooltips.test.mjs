import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../public/tooltips.js', import.meta.url), 'utf8');

function fixture({ x = 300, y = 200, width = 32, height = 32, area = '', side } = {}) {
  const listeners = {}, timers = new Map();
  let sequence = 0, observer;
  class Element {
    constructor() { this.dataset = {}; this.attrs = {}; this.style = { setProperty(name, value) { this[name] = value; } }; this.isConnected = true; }
    append(child) { child.parent = this; this.child = child; }
    setAttribute(name, value) { this.attrs[name] = value; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    removeAttribute(name) { delete this.attrs[name]; }
    matches(selector) { return selector === ':focus-visible' || (selector === ':popover-open' && this.open); }
    contains(target) { return target === this; }
    closest(selector) {
      if (selector === '[data-tooltip]') return this.dataset.tooltip ? this : null;
      if (selector === area || (selector === 'dialog, :popover-open' && area === 'dialog')) return container;
      return null;
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    getBoundingClientRect() { return this.rect || { width: 160, height: 28 }; }
    showPopover() { this.open = true; }
    hidePopover() { this.open = false; }
  }
  const body = new Element(), container = new Element(), target = new Element();
  target.rect = { left: x, top: y, right: x + width, bottom: y + height, width, height };
  target.dataset.tooltip = 'Useful hint'; if (side) target.dataset.tooltipSide = side;
  const document = { body, createElement: () => new Element(), addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  vm.runInNewContext(source, { document, window, setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); }, MutationObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  const tip = body.child;
  const dispatch = (type, event = {}) => listeners[type]?.forEach(fn => fn({ target, ...event }));
  const flush = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  const show = () => { dispatch('focusin'); flush(); };
  return { target, container, tip, dispatch, flush, show, observer };
}

test('toolbar hints center horizontally and ribbon hints center vertically', () => {
  const toolbar = fixture({ area: '.titlebar' }); toolbar.show();
  assert.equal(toolbar.tip.dataset.side, 'bottom');
  assert.equal(parseFloat(toolbar.tip.style.left) + 80, 316);
  assert.equal(toolbar.tip.style.top, '240px');
  const ribbon = fixture({ x: 4, area: '.ribbon' }); ribbon.show();
  assert.equal(ribbon.tip.dataset.side, 'right');
  assert.equal(parseFloat(ribbon.tip.style.top) + 14, 216);
});

test('edge placements flip to a centered side that fits the viewport', () => {
  const top = fixture({ y: 4 }); top.show();
  assert.equal(top.tip.dataset.side, 'bottom');
  const right = fixture({ x: 760, side: 'right' }); right.show();
  assert.equal(right.tip.dataset.side, 'left');
  assert.equal(parseFloat(right.tip.style.top) + 14, 216);
  const corner = fixture({ x: 4, y: 4, area: '.titlebar' }); corner.show();
  assert.equal(corner.tip.dataset.side, 'right');
  assert.ok(parseFloat(corner.tip.style.left) >= 8);
});

test('keyboard hints preserve existing descriptions and dismiss on Escape', () => {
  const f = fixture(); f.target.setAttribute('aria-describedby', 'existing-help'); f.show();
  assert.equal(f.tip.getAttribute('role'), 'tooltip');
  assert.equal(f.target.getAttribute('aria-describedby'), 'existing-help slate-tooltip');
  assert.equal(f.tip.open, true);
  f.dispatch('keydown', { key: 'Escape' });
  assert.equal(f.tip.open, false);
  assert.equal(f.target.getAttribute('aria-describedby'), 'existing-help');
});

test('hover can reenter before opening and touch does not open a tooltip', () => {
  const f = fixture();
  f.dispatch('pointerover', { pointerType: 'touch' }); f.flush();
  assert.equal(f.tip.open, undefined);
  f.dispatch('pointerover'); f.dispatch('pointerout', { relatedTarget: null });
  f.dispatch('pointerover'); f.flush();
  assert.equal(f.tip.open, true);
  f.dispatch('pointerout', { relatedTarget: f.tip }); f.flush();
  assert.equal(f.tip.open, true);
  f.dispatch('pointerdown'); assert.equal(f.tip.open, false);
});

test('hints join modal surfaces and close when a dynamic trigger is removed', () => {
  const f = fixture({ area: 'dialog' }); f.show();
  assert.equal(f.tip.parent, f.container);
  f.target.isConnected = false; f.observer();
  assert.equal(f.tip.open, false);
  assert.equal(f.target.getAttribute('aria-describedby'), null);
});
