import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [path.join(appRoot, 'node_modules', 'electron'), path.resolve(appRoot, '..', 'relay', 'node_modules', 'electron')];
let executable;
for (const folder of candidates) {
  const pathFile = path.join(folder, 'path.txt');
  if (!fs.existsSync(pathFile)) continue;
  const binary = fs.readFileSync(pathFile, 'utf8').trim();
  const resolved = path.resolve(folder, 'dist', binary);
  if (fs.existsSync(resolved)) { executable = resolved; break; }
}
if (!executable) {
  console.error('Electron is not installed for Slate. Run npm install in this folder, then npm start.');
  process.exitCode = 1;
} else {
  const env = { ...process.env, SLATE_NODE_EXEC: process.execPath };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [path.join(appRoot, 'desktop', 'main.mjs'), ...process.argv.slice(2)], { cwd: appRoot, env, stdio: 'inherit', windowsHide: false });
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code || 0; });
}
