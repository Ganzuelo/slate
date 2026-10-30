import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { localOrigin, isExternalHttp, launchServer } from './server-process.mjs';

test('desktop origin and external URL policy reject non-loopback and executable schemes', () => {
  assert.equal(localOrigin('http://127.0.0.1:4321/#secret'), 'http://127.0.0.1:4321');
  for (const url of ['https://127.0.0.1:4321/', 'http://localhost:4321/', 'http://evil.example:4321/', 'file:///C:/note.md', 'http://user:pass@127.0.0.1:4321/', 'not a URL']) assert.equal(localOrigin(url), null);
  assert.equal(isExternalHttp('https://example.com/path'), true);
  for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'shell:AppsFolder', 'https://user:pass@example.com/']) assert.equal(isExternalHttp(url), false);
});

test('desktop child lifecycle starts authenticated local server and stops cleanly', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-desktop-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'Desktop.md'), '# Desktop');
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await launchServer({ appRoot, vaultPath: root });
  t.after(() => server.stop());
  const token = new URL(server.url).hash.slice(1);
  const response = await fetch(server.origin + '/api/notes', { headers: { 'X-Slate-Token': token } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).notes[0].path, 'Desktop.md');
  await server.stop();
  assert.notEqual(server.child.exitCode === null && server.child.signalCode === null, true);
});
