import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { emptyConfig, validateConfig } from './public/note-icons.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const conflict = () => Object.assign(new Error('Icon settings changed on disk. Refresh before trying again.'), { status: 409 });
export class IconStore {
  constructor(root) { this.root = root; this.file = path.join(root, '.slate-icons.json'); }
  async read() {
    try {
      const stat = await fs.lstat(this.file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Icon settings must be a regular local file.');
      if (stat.size > 4 * 1024 * 1024) throw new Error('Icon settings exceed 4 MiB.');
      const text = await fs.readFile(this.file, 'utf8');
      return { config: validateConfig(JSON.parse(text)), revision: digest(text) };
    } catch (error) { if (error.code === 'ENOENT') return { config: emptyConfig(), revision: null }; throw error; }
  }
  async write(config, revision) {
    const content = JSON.stringify(validateConfig(config), null, 2) + '\n';
    if (Buffer.byteLength(content) > 4 * 1024 * 1024) throw new Error('Icon settings exceed 4 MiB.');
    if ((await this.read()).revision !== revision) throw conflict();
    const temp = path.join(this.root, '.slate-icons-' + randomUUID() + '.tmp');
    try {
      const handle = await fs.open(temp, 'wx');
      try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
      if ((await this.read()).revision !== revision) throw conflict();
      await fs.rename(temp, this.file);
    } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return { config: validateConfig(config), revision: digest(content) };
  }
  async move(from, to) {
    const state = await this.read();
    if (!Object.hasOwn(state.config.entries, from)) return null;
    const previous = structuredClone(state.config);
    state.config.entries[to] = state.config.entries[from]; delete state.config.entries[from];
    const next = await this.write(state.config, state.revision);
    return () => this.write(previous, next.revision);
  }
}
