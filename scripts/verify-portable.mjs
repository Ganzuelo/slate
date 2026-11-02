// Runs the real portable launcher twice, using only disposable profile/vault data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
const source = path.resolve(process.argv[2] || path.join(project, 'dist', `Slate-${version}-portable-x64.exe`));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-portable-check-'));
const executable = path.join(root, 'Slate.exe');
await fs.copyFile(source, executable);
let child, socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await check().catch(() => null);
    if (result) return result;
    await pause(150);
  }
  throw new Error('Timed out: ' + label);
}
async function launch() {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, SLATE_NODE_EXEC: path.join(root, 'no-system-node.exe') };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(executable, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: 'ignore' });
  child.on('error', error => console.error(error.message));
  const page = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    return (await response.json()).find(target => target.type === 'page' && target.url.startsWith('http://127.0.0.1:'));
  }, 'packaged Slate window');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await once(socket, 'open');
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); request.resolve(message); }
  });
  const run = async expression => {
    const response = await new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('CDP evaluation timed out')); }, 20000);
      pending.set(requestId, { resolve, timer });
      socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (response.error || response.result?.exceptionDetails) throw new Error(JSON.stringify(response.error || response.result.exceptionDetails));
    return response.result.result.value;
  };
  await until(() => run('!!window.slateDesktop && !!current && !!liveEditor'), 'app initialization');
  return run;
}
async function close(run) {
  const exited = once(child, 'exit');
  await run('window.slateDesktop.close(); true');
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Portable launcher did not exit')), 15000).unref())]);
  socket.close(); socket = null; child = null;
}
try {
  let run = await launch();
  const vault = path.join(root, 'Slate Data', 'Vault');
  const actualVault = await run('(async()=> (await window.slateDesktop.getVault()).path)()');
  assert.equal(actualVault.toLowerCase(), vault.toLowerCase());
  assert.equal(await run('window.slateDesktop.isDesktop'), true);
  assert.equal(await run("(async()=>{await createNote('Portable smoke.md','# Packaged app');await openNote('Portable smoke.md');replaceEditorText('# Saved from portable EXE');return await save();})()"), true);
  assert.equal(await fs.readFile(path.join(vault, 'Portable smoke.md'), 'utf8'), '# Saved from portable EXE');
  await close(run);
  run = await launch();
  assert.equal(await run("(async()=>{await openNote('Portable smoke.md');return getText();})()"), '# Saved from portable EXE');
  await close(run);
  console.log('PASS: real portable EXE launches without system Node, creates a persistent sidecar profile/vault, saves notes, exits, and preserves notes on relaunch.');
} finally {
  socket?.close();
  if (child && child.exitCode === null) {
    // Limit cleanup to the process tree spawned by this verification.
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await once(killer, 'exit');
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
