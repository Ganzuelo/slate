import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { knownVaults, rememberVault, findKnownVault, forgetVault, transitionVault } from './vault-registry.mjs';

const first = path.resolve('test-vaults/First'), second = path.resolve('test-vaults/Second');

test('vault registry migrates the last vault, remembers both vaults, and preserves settings', () => {
  const settings = rememberVault({ vault: first, windowSize: 900 }, second);
  assert.equal(settings.vault, second); assert.equal(settings.windowSize, 900);
  assert.deepEqual(settings.vaults, [second, first]);
  assert.deepEqual(knownVaults(settings, second).map(item => item.current), [true, false]);
  assert.equal(findKnownVault(settings, second, first).path, first);
  assert.throws(() => findKnownVault(settings, second, path.resolve('Unknown')), /no longer in the list/);
  assert.throws(() => findKnownVault(settings, second, {}), /known vault/);
});

test('forget removes only an inactive registry entry and never the current vault', () => {
  const settings = rememberVault({ vault: first }, second);
  assert.throws(() => forgetVault(settings, second, second), /Switch to another/);
  const next = forgetVault(settings, second, first);
  assert.deepEqual(next.vaults, [second]); assert.equal(next.vault, second);
  assert.deepEqual(settings.vaults, [second, first]);
});

test('invalid registry entries are ignored and path aliases are deduplicated', () => {
  const settings = { vaults: [null, {}, '', 'relative', first, path.join(first, '.') ] };
  assert.equal(knownVaults(settings, first).length, 1);
  assert.equal(knownVaults({ vaults: {} }, first).length, 1);
});

test('cancelled navigation retires only the candidate server and leaves the original usable', async () => {
  const old = { vault: first }, next = { vault: second, url: 'next' }, retired = [];
  let remembered = false;
  await assert.rejects(transitionVault(old, second, {
    start: async () => next, navigate: async () => { throw new Error('Navigation cancelled'); },
    remember: async () => { remembered = true; }, retire: async server => retired.push(server),
  }), /cancelled/);
  assert.deepEqual(retired, [next]); assert.equal(remembered, false);
});

test('successful switch remembers the vault before retiring the original server', async () => {
  const old = { vault: first }, next = { vault: second, url: 'next' }, steps = [];
  const result = await transitionVault(old, second, {
    start: async () => { steps.push('start'); return next; },
    navigate: async () => steps.push('navigate'), remember: async () => steps.push('remember'),
    retire: async server => { assert.equal(server, old); steps.push('retire'); },
  });
  assert.equal(result, next); assert.deepEqual(steps, ['start', 'navigate', 'remember', 'retire']);
});

test('failed startup leaves the original server alone and reopening the current vault is a no-op', async () => {
  const old = { vault: first };
  const options = { start: async () => { throw new Error('Unavailable folder'); }, retire: async () => assert.fail('Must not retire original') };
  await assert.rejects(transitionVault(old, second, options), /Unavailable/);
  assert.equal(await transitionVault(old, first, options), old);
});
