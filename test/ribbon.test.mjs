import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(await fs.readFile(new URL('../public/ribbon.js', import.meta.url), 'utf8'), context);
const normalize = (order, defaults) => Array.from(context.window.SlateRibbon.normalize(order, defaults));

test('saved ribbon order preserves known buttons once and appends newly added actions', () => {
 assert.deepEqual(normalize(['tasks','files','tasks','removed'], ['files','graph','tasks','canvas']), ['tasks','files','graph','canvas']);
});

test('missing or malformed ribbon preferences restore the full default order', () => {
 for (const order of [undefined, null, {}, 'tasks', 42, []]) {
  assert.deepEqual(normalize(order, ['files','graph','tasks']), ['files','graph','tasks']);
 }
});
