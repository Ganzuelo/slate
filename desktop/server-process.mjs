import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function localOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\d+$/.test(url.port) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export function isExternalHttp(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export async function launchServer({ appRoot, vaultPath, executable = process.execPath, runAsNode = false, timeoutMs = 15000 }) {
  const vault = await fs.realpath(vaultPath);
  if (!(await fs.stat(vault)).isDirectory()) throw new Error('The selected vault must be a folder.');
  const child = spawn(executable, [path.join(appRoot, 'server.mjs'), '--vault', vault], {
    cwd: appRoot,
    env: { ...process.env, ...(runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  };
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '', errors = '';
      const timer = setTimeout(() => reject(new Error('The vault server did not become ready in time.')), timeoutMs);
      child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4096); });
      child.stdout.on('data', chunk => {
        output = (output + chunk).slice(-4096);
        const match = output.match(/Open: (http:\/\/127\.0\.0\.1:\d+\/#([a-f0-9]{64}))/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`The vault server exited (${code}). ${errors}`)); });
    });
    return { child, url, origin: localOrigin(url), vault, stop };
  } catch (error) { await stop(); throw error; }
}
