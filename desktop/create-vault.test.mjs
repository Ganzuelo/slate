import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const source = await fs.readFile(new URL('./main.mjs', import.meta.url), 'utf8');
const bridge = source.slice(source.indexOf('function registerBridge()'), source.indexOf('function secureWindow()'));

test('creating a vault requires a trusted gesture, respects cancellation, and never overwrites an existing folder', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-create-vault-'));
 t.after(() => fs.rm(root, { recursive: true, force: true }));
 const handlers = new Map(), opened = [];
 let result = { canceled: true }, trusted = true;
 const context = vm.createContext({ fs, path, Date, window: {}, lastGesture: Date.now(), changingVault: false,
  activeServer: { vault: path.join(root, 'Current') },
  senderServer() { if (!trusted) throw new Error('Untrusted desktop request.'); return context.activeServer; },
  ipcMain: { handle: (name, action) => handlers.set(name, action) },
  dialog: { showOpenDialog: async () => result },
  switchVault: async folder => { opened.push(folder); return { changed: true }; },
 });
 vm.runInContext(bridge + '\nregisterBridge();', context);
 const choose = () => handlers.get('slate:choose-vault-location')({});
 const create = (name = 'New vault') => handlers.get('slate:create-vault')({}, name);
 assert.equal(await choose(), null);
 await assert.rejects(create(), /Choose a location/);
 assert.equal(opened.length, 0);
 const destination = path.join(root, 'New vault');
 result = { canceled: false, filePaths: [root] };
 trusted = false;
 await assert.rejects(create(), /Untrusted/);
 trusted = true;
 context.lastGesture = 0;
 await assert.rejects(create(), /menu or keyboard action/);
 context.lastGesture = Date.now();
 assert.equal((await choose()).path, await fs.realpath(root));
 for (const name of ['../escape', '..', '.', 'CON', 'NUL.txt', 'a/b', 'a\\b', 'trailing.', ' leading', '', 'a'.repeat(121)]) await assert.rejects(create(name), /valid vault name/);
 assert.equal((await create()).changed, true);
 assert.equal((await fs.stat(destination)).isDirectory(), true);
 assert.deepEqual(opened, [destination]);
 await fs.writeFile(path.join(destination, 'Keep.md'), 'Keep my notes');
 await assert.rejects(create(), /Choose a location/);
 await choose();
 await assert.rejects(create(), /already exists/);
 const originalServer = context.activeServer;
 context.activeServer = { vault: path.join(root, 'Another vault') };
 await assert.rejects(create('Another new vault'), /Choose a location/);
 context.activeServer = originalServer;
 assert.equal(await fs.readFile(path.join(destination, 'Keep.md'), 'utf8'), 'Keep my notes');
 assert.equal(opened.length, 1);
 assert.equal(context.changingVault, false);
});
