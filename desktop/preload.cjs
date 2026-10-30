const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slateDesktop', Object.freeze({
  isDesktop: true,
  setTheme: theme => ipcRenderer.invoke('slate:set-theme', theme),
  selectVault: () => ipcRenderer.invoke('slate:select-vault'),
  getVault: () => ipcRenderer.invoke('slate:get-vault'),
  listVaults: () => ipcRenderer.invoke('slate:list-vaults'),
  openVault: path => ipcRenderer.invoke('slate:open-vault', path),
  forgetVault: path => ipcRenderer.invoke('slate:forget-vault', path),
  writeClipboard: text => ipcRenderer.invoke('slate:clipboard-write', text),
  readClipboard: () => ipcRenderer.invoke('slate:clipboard-read'),
  revealPath: (path, kind) => ipcRenderer.invoke('slate:reveal-path', path, kind),
  loadWorkspace: () => ipcRenderer.invoke('slate:load-workspace'),
  saveWorkspace: state => ipcRenderer.invoke('slate:save-workspace', state),
  minimize: () => ipcRenderer.invoke('slate:window', 'minimize'),
  toggleMaximize: () => ipcRenderer.invoke('slate:window', 'maximize'),
  close: () => ipcRenderer.invoke('slate:window', 'close'),
}));
