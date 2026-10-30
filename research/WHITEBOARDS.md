# Local Excalidraw whiteboards

Create a whiteboard with the easel button in the ribbon, **New whiteboard** in an explorer folder menu, or **Create new whiteboard** in the command palette. Files use `.excalidraw` and open as normal Slate tabs. Existing `.canvas` files keep their original card-based editor.

Whiteboards use Excalidraw's original interface: its toolbar, property panel, library, main menu, zoom and undo controls, dialogs, keyboard shortcuts, and clipboard operations (see the Embedded Excalidraw exception in [DESIGN.md](../DESIGN.md)). The main menu adds **Save to Slate**; Excalidraw's own theme toggle and save-to-file actions are hidden because Slate controls the theme and vault saves. Save with Ctrl+S or the main menu; the existing autosave preference also applies. Copy, move, rename, bookmark, trash, and recovery use Slate's file menus. To open an existing compatible drawing, place its `.excalidraw` file in the vault and refresh.

Whiteboards use revision-checked saves and the vault's 4 MiB per-file limit, including embedded images. The supported image formats are PNG, JPEG, GIF, WebP, and SVG, embedded as base64 data. Web Embed elements are saved with the scene so files stay portable, but Slate never loads their URLs; they appear as placeholders. Scene JSON remains portable. This first integration does not include multiplayer, online libraries, Mermaid/AI generation, or inline Markdown previews. Exact-path wiki links such as `[[Projects/Sketch.excalidraw]]` open a whiteboard; renaming a whiteboard does not rewrite these links. Undo history lasts for the mounted editor session; drawings and dirty drafts survive tab switches, but the undo stack does not.

## Build and verification

- `npm run build:whiteboard` generates the local React/Excalidraw bundle, CSS, font assets, asset allowlist, and `LICENSES.txt`. Generated output is checked in with the application assets. No network access is needed for rebuilding installed dependencies.
- `node --test` includes whiteboard validation, persistence, stale-write protection, rename/trash, and recovery tests.
- `electron scripts/verify-whiteboard.cjs` runs a hidden real Electron window against a disposable vault. It drives Excalidraw's own controls through drawing, text, undo/redo, save conflicts, copying/renaming, autosave/reload, tab switching, PNG export, and both themes, and checks for remote requests and renderer errors. Clear `ELECTRON_RUN_AS_NODE` when invoking from an environment that sets it.

Excalidraw 0.18.1 is pinned. Its build appends a CDN font fallback even when a local asset path is configured. Our build removes that fallback with a narrowly matched, counted patch; upgrading Excalidraw requires reviewing the patch. The server serves only manifest-listed generated assets, with local fonts allowed by CSP. React is loaded only when opening a whiteboard.

Dependency overrides update vulnerable transitive nanoid, lodash-es, and KaTeX versions. Bundled dependency and font notices are retained in `public/vendor/whiteboard/LICENSES.txt`. Missing package notices are retained under `scripts/licenses`; font metadata can be refreshed with `scripts/extract-font-notices.py` using fonttools and brotli.
