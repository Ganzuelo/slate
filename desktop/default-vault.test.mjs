import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultVault } from './default-vault.mjs';

test('packaged starter vault persists outside resources and is never overwritten on relaunch', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-default-vault-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'resources'), userData = path.join(root, 'Slate Data');
  await fs.mkdir(path.join(appRoot, 'sample-vault'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'sample-vault', 'Welcome.md'), 'Bundled example');
  assert.equal(await defaultVault(appRoot, userData, false), path.join(appRoot, 'sample-vault'));
  const vault = await defaultVault(appRoot, userData, true);
  assert.equal(vault, path.join(userData, 'Vault'));
  assert.equal(await fs.readFile(path.join(vault, 'Welcome.md'), 'utf8'), 'Bundled example');
  await fs.writeFile(path.join(vault, 'Welcome.md'), 'User edits');
  await fs.writeFile(path.join(vault, 'New note.md'), 'New content');
  assert.equal(await defaultVault(appRoot, userData, true), vault);
  assert.equal(await fs.readFile(path.join(vault, 'Welcome.md'), 'utf8'), 'User edits');
  assert.equal(await fs.readFile(path.join(vault, 'New note.md'), 'utf8'), 'New content');
});
