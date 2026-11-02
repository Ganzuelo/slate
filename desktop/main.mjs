import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } from 'electron';
import fs from 'node:fs/promises';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { launchServer, localOrigin, isExternalHttp } from './server-process.mjs';
import { resolveVaultItem } from './vault-path.mjs';
import { readClipboardText, writeClipboardText } from './plain-text-clipboard.mjs';
import { knownVaults, rememberVault, findKnownVault, forgetVault, transitionVault } from './vault-registry.mjs';
import { defaultVault } from './default-vault.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.setName('Slate');
const portableDirectory = app.isPackaged && process.env.PORTABLE_EXECUTABLE_DIR;
const userData = portableDirectory ? path.join(portableDirectory, 'Slate Data') : path.join(app.getPath('appData'), 'Slate');
const legacyUserData = path.join(app.getPath('appData'), 'Lattice Notes');
if (!portableDirectory && !existsSync(userData) && existsSync(legacyUserData)) { try { renameSync(legacyUserData, userData); } catch {} }
app.setPath('userData', userData);
let window, activeServer, changingVault = false, quitting = false, lastGesture = 0;
const servers = new Map();
const settingsFile = path.join(app.getPath('userData'), 'desktop.json');

async function switchVault(folder) {
  const previous = activeServer;
  await transitionVault(previous, folder, {
    start: startVault,
    navigate: url => window.loadURL(url),
    remember: async next => {
      activeServer = next;
      await writeJson(settingsFile, rememberVault(await readJson(settingsFile, {}), next.vault));
    },
    retire: async server => { servers.delete(server.origin); await server.stop(); },
  });
  return { changed: previous !== activeServer, vault: activeServer.vault };
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.unlink(temp).catch(() => {}); }
}
function workspaceFile(server) {
  const key = createHash('sha256').update(server.vault.toLowerCase()).digest('hex');
  return path.join(app.getPath('userData'), 'workspaces', key + '.json');
}
function senderServer(event) {
  const frame = event.senderFrame;
  const origin = frame && localOrigin(frame.url);
  if (!window || window.isDestroyed() || event.sender !== window.webContents || frame !== window.webContents.mainFrame || !servers.has(origin)) throw new Error('Untrusted desktop request.');
  return servers.get(origin);
}
async function startVault(vault) {
  const executable = (!app.isPackaged && process.env.SLATE_NODE_EXEC) || process.execPath;
  const server = await launchServer({ appRoot, vaultPath: vault, executable, runAsNode: executable === process.execPath });
  servers.set(server.origin, server);
  server.child.once('exit', () => {
    servers.delete(server.origin);
    if (!quitting && server === activeServer && window && !window.isDestroyed()) dialog.showMessageBox(window, { type: 'error', title: 'Vault server stopped', message: 'The local vault server stopped. Restart Slate to reopen this workspace.' }).catch(() => {});
  });
  return server;
}

function registerBridge() {
  const recentGesture = () => { if (Date.now() - lastGesture > 5000) throw new Error('Use a menu or keyboard action to access the clipboard or explorer.'); };
  ipcMain.handle('slate:clipboard-write', (event, text) => {
    senderServer(event); recentGesture();
    return writeClipboardText(clipboard, text);
  });
  ipcMain.handle('slate:clipboard-read', event => {
    senderServer(event); recentGesture();
    return readClipboardText(clipboard);
  });
  ipcMain.handle('slate:reveal-path', async (event, name, kind) => {
    const server = senderServer(event); recentGesture();
    const file = await resolveVaultItem(server.vault, name, kind);
    shell.showItemInFolder(file);
  });
  ipcMain.handle('slate:get-vault', event => { const server = senderServer(event); return { path: server.vault, name: path.basename(server.vault) }; });
  ipcMain.handle('slate:list-vaults', async event => {
    const server = senderServer(event);
    return knownVaults(await readJson(settingsFile, {}), server.vault);
  });
  ipcMain.handle('slate:open-vault', async (event, folder) => {
    senderServer(event); recentGesture();
    if (changingVault) throw new Error('A vault change is already in progress.');
    changingVault = true;
    try {
      const vault = findKnownVault(await readJson(settingsFile, {}), activeServer.vault, folder);
      return await switchVault(vault.path);
    } finally { changingVault = false; }
  });
  ipcMain.handle('slate:forget-vault', async (event, folder) => {
    senderServer(event); recentGesture();
    if (changingVault) throw new Error('A vault change is already in progress.');
    changingVault = true;
    try {
      const settings = forgetVault(await readJson(settingsFile, {}), activeServer.vault, folder);
      await writeJson(settingsFile, settings);
      return knownVaults(settings, activeServer.vault);
    } finally { changingVault = false; }
  });
  ipcMain.handle('slate:load-workspace', event => readJson(workspaceFile(senderServer(event))));
  ipcMain.handle('slate:set-theme', (event, theme) => {
    senderServer(event);
    if (theme !== 'light' && theme !== 'dark') throw new Error('Unknown color scheme.');
    const light = theme === 'light';
    window.setTitleBarOverlay({ color: light ? '#f6f6f6' : '#262626', symbolColor: light ? '#5c5c5c' : '#b3b3b3' });
    window.setBackgroundColor(light ? '#ffffff' : '#1e1e1e');
  });
  ipcMain.handle('slate:save-workspace', async (event, state) => {
    const server = senderServer(event);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Workspace must be an object.');
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw new Error('Workspace state exceeds 2 MiB.');
    await writeJson(workspaceFile(server), JSON.parse(json));
  });
  ipcMain.handle('slate:select-vault', async event => {
    senderServer(event); recentGesture();
    if (changingVault) return { changed: false };
    changingVault = true;
    try {
      const result = await dialog.showOpenDialog(window, { title: 'Open folder as vault', defaultPath: activeServer.vault, properties: ['openDirectory'] });
      if (result.canceled || !result.filePaths.length) return { changed: false };
      return await switchVault(result.filePaths[0]);
    } finally { changingVault = false; }
  });
  ipcMain.handle('slate:window', (event, operation) => {
    senderServer(event);
    if (operation === 'minimize') window.minimize();
    else if (operation === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (operation === 'close') window.close();
    else throw new Error('Unknown window operation.');
  });
}

function secureWindow() {
  const contents = window.webContents;
  contents.on('before-mouse-event', (_event, input) => { if (input.type === 'mouseDown') lastGesture = Date.now(); });
  contents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown') lastGesture = Date.now(); });
  const external = url => {
    if (isExternalHttp(url) && Date.now() - lastGesture < 1500) shell.openExternal(url).catch(() => {});
  };
  contents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  contents.on('will-navigate', (event, url) => { if (!servers.has(localOrigin(url))) { event.preventDefault(); external(url); } });
  contents.on('will-frame-navigate', (event, details) => {
    const url = details?.url || event.url;
    if (url && !servers.has(localOrigin(url))) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'question', title: 'Unsaved changes', message: 'This note has unsaved changes.', detail: 'Discard the changes and leave this note?', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, noLink: true });
    if (choice === 1) event.preventDefault();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    const args = process.argv.slice(2), vaultIndex = args.indexOf('--vault');
    const settings = await readJson(settingsFile, {});
    const starterVault = await defaultVault(appRoot, userData, app.isPackaged);
    let vault = vaultIndex >= 0 ? args[vaultIndex + 1] : settings.vault || starterVault;
    try { activeServer = await startVault(vault); }
    catch (error) {
      if (vaultIndex >= 0) throw error;
      activeServer = await startVault(starterVault);
      dialog.showErrorBox('Previous vault unavailable', 'Slate opened the sample vault because the previous folder could not be opened.');
    }
    await writeJson(settingsFile, rememberVault(settings, activeServer.vault));
    const isolated = session.fromPartition('persist:slate-workspace');
    isolated.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, callback) => {
      const origin = localOrigin(details.url);
      const localBlob = details.url.startsWith('blob:') && servers.has(localOrigin(details.url.slice(5)));
      callback({ cancel: !servers.has(origin) && !localBlob && !details.url.startsWith('devtools:') });
    });
    window = new BrowserWindow({
      width: 1440, height: 920, minWidth: 760, minHeight: 520, show: false,
      title: 'Slate', backgroundColor: '#1e1e1e',
      icon: path.join(appRoot, 'desktop', 'assets', process.platform === 'win32' ? 'slate.ico' : 'slate.png'),
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#262626', symbolColor: '#b3b3b3', height: 38 },
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(appRoot, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, session: isolated, spellcheck: true, navigateOnDragDrop: false },
    });
    Menu.setApplicationMenu(null);
    secureWindow(); registerBridge();
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; app.quit(); });
    await window.loadURL(activeServer.url);
  }).catch(error => { dialog.showErrorBox('Slate could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; for (const server of servers.values()) server.child.kill(); });
}
