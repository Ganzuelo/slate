import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function setup() {
  const listeners = {}, nativeThemes = [];
  const media = { matches: false, addEventListener(type, fn) { listeners[type] = fn; } };
  const root = { dataset: {}, style: { setProperty() {} }, classList: { add() {} } };
  const elements = new Map();
  const context = vm.createContext({
    window: { matchMedia: () => media, addEventListener() {}, slateDesktop: { setTheme: async theme => nativeThemes.push(theme) } },
    document: { documentElement: root, body: { classList: { toggle() {} } }, getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); }, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { hash: '' }, sessionStorage: { getItem() { return ''; } },
  });
  vm.runInContext(source, context);
  vm.runInContext('setMode=()=>{};', context);
  const apply = theme => vm.runInContext(`settings.theme=${JSON.stringify(theme)};applySettings();`, context);
  const systemChangesTo = light => { media.matches = light; listeners.change(); };
  return { root, nativeThemes, apply, systemChangesTo };
}

test('explicit light and dark themes resolve consistently for app and native controls', () => {
  const f = setup();
  f.apply('light'); assert.equal(f.root.dataset.theme, 'light');
  f.systemChangesTo(false); assert.equal(f.root.dataset.theme, 'light');
  f.apply('dark'); assert.equal(f.root.dataset.theme, 'dark');
  f.systemChangesTo(true); assert.equal(f.root.dataset.theme, 'dark');
  assert.deepEqual(f.nativeThemes, ['light', 'dark']);
});

test('system mode responds immediately to OS changes without replacing the preference', () => {
  const f = setup(); f.apply('system');
  assert.equal(f.root.dataset.theme, 'dark');
  f.systemChangesTo(true); assert.equal(f.root.dataset.theme, 'light');
  f.systemChangesTo(false); assert.equal(f.root.dataset.theme, 'dark');
  assert.deepEqual(f.nativeThemes, ['dark', 'light', 'dark']);
});
