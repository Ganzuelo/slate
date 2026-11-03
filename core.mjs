import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { IconStore } from './icon-store.mjs';
import { validateWhiteboard } from './whiteboard.mjs';
import { mergeNote } from './note-merge.mjs';

export const hash = text => createHash('sha256').update(text).digest('hex');
const conflict = message => Object.assign(new Error(message), { status: 409 });
// File formats Obsidian recognises (help.obsidian.md Accepted file formats):
// Markdown, Bases and Canvas are handled as editable vault files elsewhere.
// Images: avif bmp gif jpeg jpg png webp (svg is excluded: it can carry script)
// Audio: 3gp flac m4a mp3 oga ogg opus wav webm
// Video: mkv mov mp4 ogv webm
// Documents: pdf
// Slate additionally stores typical office / data documents so they can be
// kept in the vault, shown in the explorer and downloaded or previewed.
export const attachmentTypes = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.3gp': 'audio/3gpp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.webm': 'video/webm',
  '.pdf': 'application/pdf', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.txt': 'text/plain', '.rtf': 'application/rtf',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript', '.jsx': 'text/javascript', '.css': 'text/css', '.scss': 'text/x-scss', '.less': 'text/x-less', '.py': 'text/x-python', '.rb': 'text/x-ruby', '.go': 'text/x-go', '.rs': 'text/x-rust', '.java': 'text/x-java', '.c': 'text/x-c', '.h': 'text/x-c', '.cpp': 'text/x-c++', '.hpp': 'text/x-c++', '.cs': 'text/x-csharp', '.php': 'text/x-php', '.sh': 'application/x-sh', '.yml': 'application/yaml', '.yaml': 'application/yaml', '.toml': 'application/toml', '.ini': 'text/plain', '.log': 'text/plain', '.sql': 'text/x-sql', '.vue': 'text/x-vue', '.svelte': 'text/x-svelte', '.lua': 'text/x-lua', '.r': 'text/x-r', '.psd': 'image/vnd.adobe.photoshop', '.ai': 'application/illustrator', '.eps': 'application/postscript', '.aac': 'audio/aac', '.aiff': 'audio/aiff', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.ics': 'text/calendar', '.vcf': 'text/vcard',
  '.epub': 'application/epub+zip', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.rar': 'application/vnd.rar', '.tar': 'application/x-tar', '.gz': 'application/gzip', '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html', '.htm': 'text/html', '.base': 'text/yaml', '.pages': 'application/vnd.apple.pages', '.numbers': 'application/vnd.apple.numbers', '.key': 'application/vnd.apple.keynote',
};
export class Vault {
  constructor(root) { this.root = path.resolve(root); this.queue = Promise.resolve(); }
  async init() {
    this.root = await fs.realpath(this.root);
    // One-time move of history and recovery folders written under the app's previous name.
    for (const folder of ['history', 'recovery']) {
      const legacy = path.join(this.root, '.lattice-' + folder), current = path.join(this.root, '.slate-' + folder);
      const exists = file => fs.lstat(file).then(stat => stat, () => null);
      const old = await exists(legacy);
      if (old && old.isDirectory() && !(await exists(current))) await fs.rename(legacy, current).catch(() => {});
    }
  }
  async file(name, creating = false, kind = 'note') {
    if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.includes('\0') || (kind === 'note' && !name.toLowerCase().endsWith('.md')) || (kind === 'canvas' && !name.toLowerCase().endsWith('.canvas')) || (kind === 'whiteboard' && !name.toLowerCase().endsWith('.excalidraw')) || (kind === 'attachment' && !attachmentTypes[path.extname(name).toLowerCase()])) throw new Error('Use a supported relative vault path.');
    const parts = name.split('/');
    if (parts.some(p => !p || p.startsWith('.') || /[<>"|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Invalid note path.');
    let current = this.root;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error('Symbolic links and junctions are not supported.');
        if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('Parent is not a folder.');
        if (i === parts.length - 1 && !(kind === 'folder' ? stat.isDirectory() : stat.isFile())) throw new Error(kind === 'folder' ? 'Not a folder.' : 'Not a file.');
      } catch (e) {
        if (e.code !== 'ENOENT' || !creating) throw e;
        if (i < parts.length - 1 || kind === 'folder') await fs.mkdir(current);
      }
    }
    const relative = path.relative(this.root, current);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes vault.');
    return current;
  }
  async read(name, kind = 'note') {
    const file = await this.file(name, false, kind);
    const stat = await fs.stat(file);
    if (stat.size > 4 * 1024 * 1024) throw new Error('Note exceeds 4 MiB limit.');
    const content = await fs.readFile(file, 'utf8');
    return { path: name, content, revision: hash(content), ctime: stat.birthtimeMs, mtime: stat.mtimeMs, size: stat.size };
  }
  async list() {
    const notes = [];
    let bytes = 0;
    const walk = async (dir, prefix = '', depth = 0) => {
      if (depth > 32) throw new Error('Vault exceeds 32 folder levels.');
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const name = prefix + entry.name;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + '/', depth + 1);
        else if (entry.isFile() && /\.md$/i.test(name)) {
          if (notes.length >= 10000) throw new Error('This prototype supports up to 10,000 notes.');
          try { const note = await this.read(name); bytes += Buffer.byteLength(note.content); if (bytes > 32 * 1024 * 1024) throw new Error('Vault exceeds the 32 MiB index limit.'); notes.push({ ...note, ...metadata(note.content, name), links: links(note.content) }); }
          catch (e) { notes.push({ path: name, content: '', links: [], error: e.message }); }
          if (bytes > 32 * 1024 * 1024) throw new Error('Vault exceeds the 32 MiB index limit.');
        }
      }
    };
    await walk(this.root);
    return notes.sort((a, b) => a.path.localeCompare(b.path));
  }
  save(name, content, revision, kind = 'note', baseContent) {
    const run = async () => {
      if (typeof content !== 'string' || Buffer.byteLength(content) > 4 * 1024 * 1024) throw new Error('Note exceeds 4 MiB limit.');
      if (kind === 'canvas') validateCanvas(content);
      if (kind === 'whiteboard') validateWhiteboard(content);
      const file = await this.file(name, true, kind);
      let current = null;
      try { current = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if ((current === null ? null : hash(current)) !== revision) {
        if (kind === 'note' && current !== null && typeof baseContent === 'string' && Buffer.byteLength(baseContent) <= 4 * 1024 * 1024 && hash(baseContent) === revision) {
          // Automatic merging is best effort for overlapping replacements. Both
          // complete inputs remain available through File recovery.
          await this.recovery([{path:name,content:current,revision:hash(current)}], 'conflict');
          await this.recovery([{path:name,content,revision:hash(content)}], 'conflict');
          content = mergeNote(baseContent, content, current);
          revision = hash(current);
        } else {
          const e = new Error('This note changed on disk. Your draft is preserved. Reload the note or save your draft as a new note.'); e.status = 409; throw e;
        }
      }
      if (Buffer.byteLength(content) > 4 * 1024 * 1024) throw new Error('Note exceeds 4 MiB limit.');
      if (current !== null) {
        const backupDir = path.join(this.root, '.slate-history');
        try { if ((await fs.lstat(backupDir)).isSymbolicLink()) throw new Error('History folder cannot be a symbolic link.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(path.join(backupDir, hash(name) + '-' + hash(current) + '.md'), current, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      }
      if (current === null) await fs.writeFile(file, content, { flag: 'wx' });
      else {
        const temp = file + '.' + randomUUID() + '.tmp';
        try {
          const handle = await fs.open(temp, 'wx');
          try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
          if (hash(await fs.readFile(file, 'utf8')) !== revision) { const e = new Error('This note changed during save. Draft kept.'); e.status = 409; throw e; }
          await this.file(name, false, kind); await fs.rename(temp, file);
        }
        finally { await fs.unlink(temp).catch(() => {}); }
      }
      return { path: name, revision: hash(content), ...(kind === 'note' ? {content} : {}) };
    };
    const pending = this.queue.then(run); this.queue = pending.catch(() => {}); return pending;
  }
  enqueue(run) { const pending = this.queue.then(run); this.queue = pending.catch(() => {}); return pending; }
  icons() { return new IconStore(this.root).read(); }
  saveIcons(config, revision) { return this.enqueue(() => new IconStore(this.root).write(config, revision)); }
  async inventory() {
    const folders = [], attachments = [], canvases = [], whiteboards = [];
    const walk = async (dir, prefix = '', depth = 0) => {
      if (depth > 32) throw new Error('Vault exceeds 32 folder levels.');
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const name = prefix + entry.name;
        if (entry.isDirectory()) { await this.file(name, false, 'folder'); folders.push(name); await walk(path.join(dir, entry.name), name + '/', depth + 1); }
        else if (entry.isFile() && /\.canvas$/i.test(name)) { const canvas = await this.read(name, 'canvas'); canvases.push({ path: name, revision: canvas.revision }); }
        else if (entry.isFile() && /\.excalidraw$/i.test(name)) { const board = await this.read(name, 'whiteboard'); whiteboards.push({ path: name, revision: board.revision }); }
        else if (entry.isFile() && attachmentTypes[path.extname(name).toLowerCase()]) { const stat = await fs.stat(await this.file(name, false, 'attachment')); attachments.push({ path: name, mime: attachmentTypes[path.extname(name).toLowerCase()], size: stat.size }); }
        if (folders.length + attachments.length + canvases.length + whiteboards.length > 20000) throw new Error('Vault inventory exceeds 20,000 items.');
      }
    };
    await walk(this.root); return { whiteboards: whiteboards.sort((a,b) => a.path.localeCompare(b.path)), folders: folders.sort(), attachments: attachments.sort((a,b) => a.path.localeCompare(b.path)), canvases: canvases.sort((a,b) => a.path.localeCompare(b.path)) };
  }
  folder(name) { return this.enqueue(async () => { await this.file(name, true, 'folder'); return { path: name, created: true }; }); }
  async recovery(records, operation) {
    const base = path.join(this.root, '.slate-recovery');
    try { const stat = await fs.lstat(base); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Recovery folder must be a real directory.'); } catch (e) { if (e.code !== 'ENOENT') throw e; await fs.mkdir(base); }
    const id = operation + '-' + randomUUID(), directory = path.join(base, id);
    await fs.mkdir(directory);
    const snapshotName = (note, index) => `${index}${/\.excalidraw$/i.test(note.path) ? '.excalidraw' : /\.canvas$/i.test(note.path) ? '.canvas' : '.md'}`;
    for (let i = 0; i < records.length; i++) await fs.writeFile(path.join(directory, snapshotName(records[i], i)), records[i].content, { flag: 'wx' });
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ operation, created: new Date().toISOString(), notes: records.map((n,i) => ({ path: n.path, revision: n.revision, snapshot: snapshotName(n,i) })) }, null, 2), { flag: 'wx' });
    return `.slate-recovery/${id}`;
  }
  async replace(name, content, revision) {
    const file = await this.file(name), temp = file + '.' + randomUUID() + '.tmp';
    try {
      const handle = await fs.open(temp, 'wx'); try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
      if ((await this.read(name)).revision !== revision) throw conflict('A note changed during the operation. Recovery snapshots were retained.');
      await this.file(name); await fs.rename(temp, file);
    } finally { await fs.unlink(temp).catch(() => {}); }
  }
  rename(name, newName, revision, updateLinks = true) {
    return this.enqueue(async () => {
      if (typeof name === 'string' && /\.excalidraw$/i.test(name)) return this.renameCanvas(name, newName, revision, 'whiteboard');
      if (typeof name === 'string' && /\.canvas$/i.test(name)) return this.renameCanvas(name, newName, revision);
      const original = await this.read(name);
      if (original.revision !== revision) throw conflict('This note changed on disk. Reload before renaming.');
      if (name === newName) return { path: name, revision, updatedLinks: 0 };
      if (name.toLowerCase() === newName.toLowerCase()) throw new Error('Case-only renames require an intermediate name.');
      const destination = await this.file(newName, true);
      try { await fs.lstat(destination); throw conflict('A file already exists at the destination.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const notes = await this.list();
      if (updateLinks && notes.some(n => n.error)) throw new Error('Every note must be readable before a rename can update links.');
      let updatedLinks = 0;
      const changes = [];
      for (const note of updateLinks ? notes : notes.filter(n => n.path === name)) {
        const content = !updateLinks ? note.content : rewriteWikiLinks(note.content, target => {
          const resolved = resolveLink(target, note.path, notes);
          if (resolved !== name && !(note.path === name && resolved)) return null;
          updatedLinks++; return (resolved === name ? newName : resolved).replace(/\.md$/i, '');
        });
        if (content !== note.content || note.path === name) changes.push({ ...note, next: content });
      }
      const recoveryPath = await this.recovery(changes, 'rename');
      const written = []; let destinationWritten = false, rollbackIcons = null;
      const moved = changes.find(n => n.path === name);
      try {
        for (const note of changes) if ((await this.read(note.path)).revision !== note.revision) throw conflict('A linked note changed. Rename cancelled.');
        await fs.writeFile(destination, moved.next, { flag: 'wx' }); destinationWritten = true;
        for (const note of changes) if (note.path !== name) { await this.replace(note.path, note.next, note.revision); written.push(note); }
        if ((await this.read(name)).revision !== revision) throw conflict('The source note changed. Rename cancelled.');
        rollbackIcons = await new IconStore(this.root).move(name, newName);
        await fs.unlink(await this.file(name));
        return { path: newName, revision: hash(moved.next), updatedLinks, recoveryPath };
      } catch (e) {
        let rollbackFailed = false;
        if (rollbackIcons) try { await rollbackIcons(); } catch { rollbackFailed = true; }
        for (const note of written.reverse()) try { await this.replace(note.path, note.content, hash(note.next)); } catch { rollbackFailed = true; }
        if (destinationWritten) try { if ((await this.read(newName)).revision === hash(moved.next)) await fs.unlink(await this.file(newName)); else rollbackFailed = true; } catch { rollbackFailed = true; }
        e.message += ` Recovery: ${recoveryPath}.${rollbackFailed ? ' Some changed files could not be rolled back automatically.' : ''}`; throw e;
      }
    });
  }
  async renameCanvas(name, newName, revision, kind = 'canvas') {
    const original = await this.read(name, kind);
    if (original.revision !== revision) throw conflict('This canvas changed on disk. Reload before renaming.');
    if (kind === 'canvas') validateCanvas(original.content); else validateWhiteboard(original.content);
    if (name === newName) return { path: name, revision, updatedLinks: 0 };
    if (typeof newName === 'string' && name.toLowerCase() === newName.toLowerCase()) throw new Error('Case-only renames require an intermediate name.');
    const destination = await this.file(newName, true, kind);
    try { await fs.lstat(destination); throw conflict('A file already exists at the destination.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const recoveryPath = await this.recovery([original], 'rename'); let written = false, rollbackIcons = null;
    try {
      await fs.writeFile(destination, original.content, { flag: 'wx' }); written = true;
      if ((await this.read(name, kind)).revision !== revision) throw conflict('The source canvas changed. Rename cancelled.');
      rollbackIcons = await new IconStore(this.root).move(name, newName);
      await fs.unlink(await this.file(name, false, kind));
      return { path: newName, revision, updatedLinks: 0, recoveryPath };
    } catch (e) {
      if (rollbackIcons) try { await rollbackIcons(); } catch { e.message += ' Icon settings rollback failed.'; }
      if (written) try { if ((await this.read(newName, kind)).revision === revision) await fs.unlink(await this.file(newName, false, kind)); } catch { /* Preserve externally changed files and recovery snapshots. */ }
      e.message += ` Recovery: ${recoveryPath}.`; throw e;
    }
  }
  trash(name, revision) {
    return this.enqueue(async () => {
      const kind = typeof name === 'string' && /\.excalidraw$/i.test(name) ? 'whiteboard' : typeof name === 'string' && /\.canvas$/i.test(name) ? 'canvas' : 'note';
      const note = await this.read(name, kind);
      if (note.revision !== revision) throw conflict('This note changed on disk. Reload before moving to trash.');
      const recoveryPath = await this.recovery([note], 'trash');
      if ((await this.read(name, kind)).revision !== revision) throw conflict('This note changed during trash. Its recovery copy was retained.');
      await fs.unlink(await this.file(name, false, kind)); return { path: name, trashed: true, recoveryPath };
    });
  }
  attachment(name, base64) {
    return this.enqueue(async () => {
      if (typeof base64 !== 'string' || base64.length > 48 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('Invalid attachment data or attachment exceeds 16 MiB.');
      const bytes = Buffer.from(base64, 'base64');
      if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('Attachment must be between 1 byte and 32 MiB.');
      const file = await this.file(name, true, 'attachment'), mime = attachmentTypes[path.extname(name).toLowerCase()];
      if (!validAttachment(bytes, mime)) throw new Error('Attachment content does not match its file type.');
      try { await fs.writeFile(file, bytes, { flag: 'wx' }); } catch (e) { if (e.code === 'EEXIST') throw conflict('An attachment already exists at that path.'); throw e; }
      return { path: name, mime, size: bytes.length };
    });
  }
  async readAttachment(name) {
    const file = await this.file(name, false, 'attachment'), stat = await fs.stat(file);
    if (stat.size > 32 * 1024 * 1024) throw new Error('Attachment exceeds 32 MiB.');
    const bytes = await fs.readFile(file), mime = attachmentTypes[path.extname(name).toLowerCase()];
    if (!validAttachment(bytes, mime)) throw new Error('Attachment content does not match its file type.');
    return { bytes, mime };
  }
  async recoveryDirectory(id) {
    if (typeof id !== 'string' || !/^(rename|trash|conflict)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('Invalid recovery identifier.');
    let current = this.root;
    for (const segment of ['.slate-recovery', id]) {
      current = path.join(current, segment);
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Recovery folders must be real directories.');
    }
    return current;
  }
  async recoveryManifest(id) {
    const directory = await this.recoveryDirectory(id), filename = path.join(directory, 'manifest.json');
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Invalid recovery manifest.');
    const value = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!value || !['rename','trash','conflict'].includes(value.operation) || !id.startsWith(value.operation + '-') || typeof value.created !== 'string' || value.created.length > 100 || !Array.isArray(value.notes) || value.notes.length > 10000) throw new Error('Invalid recovery manifest.');
    const paths = new Set();
    for (const note of value.notes) {
      if (!note || typeof note.path !== 'string' || paths.has(note.path) || typeof note.revision !== 'string' || !/^[0-9a-f]{64}$/.test(note.revision) || typeof note.snapshot !== 'string' || !/^\d+\.(md|canvas|excalidraw)$/.test(note.snapshot)) throw new Error('Invalid recovery record.');
      paths.add(note.path);
    }
    return { directory, value };
  }
  async recoveries() {
    const entries = [], warnings = [], base = path.join(this.root, '.slate-recovery');
    try { const stat = await fs.lstat(base); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Recovery folder must be a real directory.'); } catch (e) { if (e.code === 'ENOENT') return { entries, warnings }; throw e; }
    const children = await fs.readdir(base, { withFileTypes: true });
    if (children.length > 2000) throw new Error('Recovery inventory exceeds 2,000 operations. Archive older recovery folders before browsing.');
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      try {
        const {value} = await this.recoveryManifest(child.name);
        entries.push({ id: child.name, operation: value.operation, created: value.created, files: value.notes.map(note => ({path:note.path,revision:note.revision})) });
      } catch { warnings.push(`Recovery operation ${child.name.slice(0,100)} could not be read.`); }
    }
    entries.sort((a,b) => b.created.localeCompare(a.created)); return { entries, warnings };
  }
  async recoveryRead(id, name) {
    const {directory,value} = await this.recoveryManifest(id), record = value.notes.find(note => note.path === name);
    if (!record) throw new Error('The selected file is not in this recovery operation.');
    const filename = path.join(directory,record.snapshot), stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('Invalid recovery snapshot.');
    const content = await fs.readFile(filename,'utf8');
    if (hash(content) !== record.revision) throw new Error('Recovery snapshot integrity check failed.');
    return {id,path:name,content,revision:record.revision,kind:record.snapshot.endsWith('.excalidraw') ? 'whiteboard' : record.snapshot.endsWith('.canvas') ? 'canvas' : 'note'};
  }
  async restore(id, name, expectedRevision) {
    if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !/^[0-9a-f]{64}$/.test(expectedRevision))) throw new Error('An explicit expected revision or null is required for restore.');
    const snapshot = await this.recoveryRead(id,name);
    return this.save(name,snapshot.content,expectedRevision,snapshot.kind);
  }
}
function validateCanvas(content) {
  let value; try { value = JSON.parse(content); } catch { throw new Error('Canvas must contain valid JSON.'); }
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 10000 || value.edges.length > 20000) throw new Error('Canvas needs nodes and edges arrays within supported limits.');
  const ids = new Set();
  for (const node of value.nodes) {
    if (!node || typeof node.id !== 'string' || ids.has(node.id) || !['text','file','link','group'].includes(node.type) || !['x','y','width','height'].every(k => Number.isFinite(node[k])) || node.width <= 0 || node.height <= 0) throw new Error('Invalid or duplicate canvas node.');
    ids.add(node.id);
  }
  const edges = new Set();
  for (const edge of value.edges) { if (!edge || typeof edge.id !== 'string' || edges.has(edge.id) || !ids.has(edge.fromNode) || !ids.has(edge.toNode)) throw new Error('Canvas edge must connect existing nodes and have a unique id.'); edges.add(edge.id); }
}
function validAttachment(bytes, mime) {
  if (mime === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216;
  if (mime === 'image/gif') return /^GIF8[79]a$/.test(bytes.subarray(0,6).toString());
  if (mime === 'image/webp') return bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (mime === 'image/avif') return bytes.length >= 12 && bytes.subarray(4,8).toString() === 'ftyp' && ['avif','avis','mif1','mif2','msf1'].includes(bytes.subarray(8,12).toString());
  if (mime === 'image/bmp') return bytes.subarray(0,2).toString() === 'BM';
  if (mime === 'image/x-icon') return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes[3] === 0;
  if (mime === 'image/tiff') return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a);
  if (mime === 'application/pdf') return bytes.subarray(0,5).toString() === '%PDF-';
  return Object.values(attachmentTypes).includes(mime) && bytes.length > 0;
}
export function metadata(content, name) {
  const frontmatter = Object.create(null), tags = new Set();
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (match) {
    let listKey = null;
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([\w-]+):\s*(.*?)\s*$/);
      if (field) { const [,key,raw] = field; listKey = raw ? null : key; frontmatter[key] = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1,-1).split(',').map(x => x.trim().replace(/^['"]|['"]$/g,'' )).filter(Boolean) : raw.replace(/^['"]|['"]$/g,''); }
      else if (listKey && /^\s+-\s+/.test(line)) { if (!Array.isArray(frontmatter[listKey])) frontmatter[listKey] = []; frontmatter[listKey].push(line.replace(/^\s+-\s+/,'').replace(/^['"]|['"]$/g,'')); }
    }
  }
  for (const value of [frontmatter.tags, frontmatter.tag].flat().filter(x => typeof x === 'string')) for (const tag of value.split(/[\s,]+/)) if (tag) tags.add(tag.replace(/^#/,''));
  const body = match ? content.slice(match[0].length) : content;
  for (const tag of body.replace(/```[\s\S]*?```|`[^`\n]*`/g,'').matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) tags.add(tag[1]);
  return { title: typeof frontmatter.title === 'string' && frontmatter.title ? frontmatter.title : body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.posix.basename(name).replace(/\.md$/i,''), tags: [...tags].sort(), frontmatter };
}
function rewriteWikiLinks(text, resolve) {
  return text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[\[([^\]\n]+)\]\]/g, (match, inner) => {
    if (inner === undefined) return match;
    const target = inner.split('|')[0].split('#')[0].trim(), replacement = resolve(target);
    if (!replacement) return match;
    const suffix = inner.slice(inner.indexOf(target) + target.length);
    return `${match.startsWith('!') ? '!' : ''}[[${replacement}${suffix}]]`;
  });
}
export function links(text) {
  const withoutCode = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, '');
  return [...withoutCode.matchAll(/!?\[\[([^\]\n]+)\]\]/g)].map(m => m[1].split('|')[0].split('#')[0].trim()).filter(Boolean);
}
export function resolveLink(target, from, notes) {
  const clean = target.replace(/\.md$/i, '');
  const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean)) + '.md';
  const exact = [clean + '.md', relative];
  for (const candidate of exact) { const found = notes.find(n => n.path.toLowerCase() === candidate.toLowerCase()); if (found) return found.path; }
  const candidates = notes.filter(n => path.posix.basename(n.path, '.md').toLowerCase() === clean.toLowerCase());
  return candidates.length === 1 ? candidates[0].path : null;
}
