# Desktop runtime

## Portable Windows build

`npm run build:portable` builds `dist/Slate-0.1.0-portable-x64.exe` using electron-builder's portable target, plus a `.sha256` checksum. The build never publishes or uploads artifacts. It packages the pinned Electron runtime, application files, starter notes, local assets, and license notices. An explicit staging allowlist includes only the server's `diff-match-patch` runtime dependency; development tools and real vaults are excluded. Application resources are unpacked so the child vault server can use Electron's built-in Node runtime without requiring Node.js on the user's machine.

The portable launcher extracts resources into Windows temporary storage. `PORTABLE_EXECUTABLE_DIR` anchors **`Slate Data` beside the original EXE**, containing the desktop profile, workspace state, and a persistent starter `Vault`. The starter notes are copied only when that vault is first created; relaunches and upgrades do not replace user edits. Move the EXE and `Slate Data` together to retain settings. References to vaults elsewhere remain absolute paths and may need to be reopened on another machine. The containing folder must be writable. Moving just the EXE leaves the data in the old folder.

The current artifact is unsigned and requests ordinary user privileges. Signing requires a publisher certificate before distributing a signed release. The portable target does not install shortcuts, register file associations, or add an uninstaller. Build-tool downloads happen at build time; the packaged app keeps runtime resources local.

After building, run `npm run verify:portable` on Windows. It copies the real EXE into a disposable folder, launches it with a deliberately invalid system-Node override, checks its sidecar vault, creates and saves a note through the app, then restarts and verifies persistence. It uses a temporary DevTools port for automation and removes its test data afterward. You can pass another artifact path to `node scripts/verify-portable.mjs path/to/Slate.exe`.

## Development launch

`npm start` or `Start Slate.cmd` launches Slate in a dedicated Electron window. `npm run browser` keeps the standalone browser mode available.

The launcher looks for Electron under this project's `node_modules/electron` first. This workspace has its own patched Electron 44.10.0 runtime installed, and the project pins that exact version. For development when the local binary is missing, the launcher can fall back to the already installed runtime at `../relay/node_modules/electron`. It reads that runtime's existing `path.txt` without changing Relay or downloading software. This is a development launch arrangement, not a packaged distributable.

On this Windows workspace the newly acquired local runtime required an inherited read/execute entry for `ALL APPLICATION PACKAGES` on `node_modules/electron/dist` so Chromium's sandboxed processes could read the runtime. That narrowly scoped entry was added without changing existing ACL entries, granting write access, changing user-data permissions, or disabling Electron's sandbox.

The desktop main process starts the local vault server as a child, receives its random authenticated loopback URL, and loads it into a sandboxed window with Node integration disabled. The per-launch server is stopped when the desktop app quits. Renderer requests are restricted to the app's active loopback origins; remote navigation and child windows are blocked. Explicit HTTP(S) links with a recent user input can be opened in the operating system's default browser.

The preload exposes only `window.slateDesktop`: `isDesktop`, `selectVault`, `getVault`, `loadWorkspace`, `saveWorkspace`, `minimize`, `toggleMaximize`, and `close`. IPC calls validate the requesting window, main frame, and local origin. No arbitrary file access, shell commands, or general IPC bridge is exposed.

Context menus additionally use `writeClipboard`, `readClipboard`, and `revealPath`. Clipboard access is limited to 4 MiB of plain text and requires a recent input gesture. Explorer reveal accepts only notes, canvases, or real folders in the active vault, using the same traversal and symlink checks as vault reads. These actions validate the sender and require a recent gesture; they do not provide arbitrary shell execution or file opening.

The vault-name footer opens an upward menu of known vaults and a Manage vaults dialog. Settings sits to its right. The manager can open another folder, switch vaults, reveal the current folder, and remove inactive entries without deleting files. `%APPDATA%\Slate\desktop.json` remembers the current folder and known vault paths, migrating the previous single-vault setting on launch. `listVaults`, `openVault`, and `forgetVault` use validated IPC senders; writes and switching require a recent input gesture. Only known paths may be opened directly; other folders require the native picker.

Switching saves the workspace before navigation, starts a new server, and retains the previous server until navigation succeeds. A missing folder or canceled navigation leaves the current server running. Per-vault workspace JSON lives in `%APPDATA%\Slate\workspaces`, keyed by a path hash. Workspace state is limited to 2 MiB per save. Existing `.obsidian` files are not changed. A native confirmation protects renderer buffers that request `beforeunload` prevention.

The native Windows titlebar buttons use the top-right 138 pixels of a 38-pixel title bar. The renderer reserves this space at the outer right edge of the full-width `.titlebar`, makes its background draggable with `-webkit-app-region: drag`, and sets buttons and the scrollable document tabs to `no-drag`. The sidebar toggle and modes share the left part of this row; the right sidebar toggle sits immediately before the native controls. Content panes start on the row below.

`node --test desktop/server-process.test.mjs` checks the URL policies and actual local child-server startup, authenticated read, and shutdown. Native-window appearance and picker/close interaction require a computer-use visual pass.
