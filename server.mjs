import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Vault, resolveLink } from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const whiteboardAssets = JSON.parse(await fs.readFile(path.join(here, 'public/vendor/whiteboard/manifest.json'), 'utf8'));
const args = process.argv.slice(2);
const vaultArg = args.indexOf('--vault');
const portArg = args.indexOf('--port');
const vault = new Vault(vaultArg >= 0 ? args[vaultArg + 1] : path.join(here, 'sample-vault'));
await vault.init();
const token = randomBytes(32).toString('hex');
const styleNonce = randomBytes(24).toString('base64');
let origin;
const server = http.createServer(async (req, res) => {
  const headers = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${styleNonce}'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
  const send = (status, data, type = 'application/json') => { res.writeHead(status, { ...headers, 'Content-Type': type + '; charset=utf-8' }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
  try {
    if (req.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid host.' });
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const provided = Buffer.from(req.headers['x-slate-token'] || '');
      const expected = Buffer.from(token);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return send(403, { error: 'Open the launch URL printed in the terminal.' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Invalid origin.' });
      if (req.method === 'GET' && url.pathname === '/api/notes') {
        const notes = await vault.list();
        return send(200, { vault: path.basename(vault.root), ...await vault.inventory(), notes: notes.map(n => ({ ...n, resolved: n.links.map(target => ({ target, path: resolveLink(target, n.path, notes) })) })) });
      }
      if (req.method === 'GET' && url.pathname === '/api/note') return send(200, await vault.read(url.searchParams.get('path')));
      if (req.method === 'GET' && url.pathname === '/api/icons') return send(200, await vault.icons());
      if (req.method === 'GET' && url.pathname === '/api/whiteboard') return send(200, await vault.read(url.searchParams.get('path'), 'whiteboard'));
      if (req.method === 'GET' && url.pathname === '/api/canvas') return send(200, await vault.read(url.searchParams.get('path'), 'canvas'));
      if (req.method === 'GET' && url.pathname === '/api/recovery') {
        if (url.searchParams.has('id')) { const {kind,...snapshot} = await vault.recoveryRead(url.searchParams.get('id'),url.searchParams.get('path')); return send(200,snapshot); }
        return send(200,await vault.recoveries());
      }
      if (req.method === 'GET' && url.pathname === '/api/attachment') {
        const attachment = await vault.readAttachment(url.searchParams.get('path'));
        res.writeHead(200, { ...headers, 'Content-Type': attachment.mime, 'Content-Length': attachment.bytes.length, 'Content-Disposition': attachment.mime === 'application/pdf' ? 'attachment; filename="document.pdf"' : 'inline' });
        return res.end(attachment.bytes);
      }
      if (req.method === 'PUT' && ['/api/note','/api/rename','/api/trash','/api/folder','/api/attachment','/api/canvas','/api/whiteboard','/api/restore','/api/icons'].includes(url.pathname)) {
        if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return send(403, { error: 'Invalid write request.' });
        const chunks = []; let bytes = 0;
        const limit = (url.pathname === '/api/attachment' ? 24 : url.pathname === '/api/note' ? 10 : 5) * 1024 * 1024;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) { send(413, { error: 'Request too large.' }); return; } chunks.push(chunk); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) return send(400, { error: 'Expected an object.' });
        if (url.pathname === '/api/icons') return send(200, await vault.saveIcons(data.config, data.revision));
        if (url.pathname === '/api/rename') return send(200, await vault.rename(data.path, data.newPath, data.revision, data.updateLinks !== false));
        if (url.pathname === '/api/trash') return send(200, await vault.trash(data.path, data.revision));
        if (url.pathname === '/api/folder') return send(200, await vault.folder(data.path));
        if (url.pathname === '/api/attachment') return send(200, await vault.attachment(data.path, data.base64));
        if (url.pathname === '/api/whiteboard') return send(200, await vault.save(data.path, data.content, data.revision, 'whiteboard'));
        if (url.pathname === '/api/canvas') return send(200, await vault.save(data.path, data.content, data.revision, 'canvas'));
        if (url.pathname === '/api/restore') return send(200, await vault.restore(data.id,data.path,data.expectedRevision));
        return send(200, await vault.save(data.path, data.content, data.revision, 'note', data.baseContent));
      }
      return send(404, { error: 'Unknown operation.' });
    }
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed.' });
    const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/tasks.js': ['tasks.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/live-editor.js': ['live-editor.js', 'text/javascript'], '/editor.css': ['editor.css', 'text/css'], '/vendor/editor.js': ['vendor/editor.js', 'text/javascript'] };
    assets['/vendor/icons.js'] = ['vendor/icons.js', 'text/javascript'];
    assets['/vendor/note-icons.js'] = ['vendor/note-icons.js', 'text/javascript'];
    assets['/icon-picker.js'] = ['icon-picker.js', 'text/javascript'];
    assets['/note-icons.css'] = ['note-icons.css', 'text/css'];
    assets['/vendor/check.svg'] = ['vendor/check.svg', 'image/svg+xml'];
    assets['/vendor/check-dark.svg'] = ['vendor/check-dark.svg', 'image/svg+xml'];
    assets['/appearance.js'] = ['appearance.js', 'text/javascript'];
    assets['/context-menu.css'] = ['context-menu.css', 'text/css'];
    assets['/context-menu.js'] = ['context-menu.js', 'text/javascript'];
    assets['/app-menus.js'] = ['app-menus.js', 'text/javascript'];
    assets['/controls.css'] = ['controls.css', 'text/css'];
    assets['/wiki-links.js'] = ['wiki-links.js', 'text/javascript'];
    assets['/controls.js'] = ['controls.js', 'text/javascript'];
    assets['/tooltips.js'] = ['tooltips.js', 'text/javascript'];
    assets['/ribbon.js'] = ['ribbon.js', 'text/javascript'];
    assets['/graph-layout.js'] = ['graph-layout.js', 'text/javascript'];
    assets['/graph-view.js'] = ['graph-view.js', 'text/javascript'];
    assets['/extras.css'] = ['extras.css', 'text/css'];
    assets['/whiteboard.css'] = ['whiteboard.css', 'text/css'];
    const boardAsset = whiteboardAssets[url.pathname];
    if (boardAsset) {
      const bytes = await fs.readFile(path.join(here, 'public', boardAsset.file));
      res.writeHead(200, { ...headers, 'Content-Type': boardAsset.type }); return res.end(bytes);
    }
    const asset = assets[url.pathname];
    if (!asset) return send(404, { error: 'Not found.' });
    let content = await fs.readFile(path.join(here, 'public', asset[0]), 'utf8');
    if (asset[0] === 'index.html') content = content.replace('</head>', `<meta name="style-nonce" content="${styleNonce}"></head>`);
    send(200, content, asset[1]);
  } catch (e) { send(e.status || (e.code === 'ENOENT' ? 404 : 400), { error: e.message }); }
});
server.listen(portArg >= 0 ? Number(args[portArg + 1]) : 0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Slate\nVault: ${vault.root}\nOpen: ${origin}/#${token}\nKeep this terminal running. Ctrl+C stops the app.`);
  if (args.includes('--open') && process.platform === 'win32') {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `${origin}/#${token}`], { detached: true, stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log('Open the launch URL above in your browser.')); browser.unref();
  }
});
