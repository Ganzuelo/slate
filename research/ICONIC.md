# Native icon picker

Reference: the user's Iconic screenshot and [Iconic's published usage guide](https://github.com/gfxholo/iconic#changing-an-icon). The implemented scope is the compact file/folder picker, not all of Iconic's app customization or conditional rule system.

Right-click a file, folder, bookmark, or document tab and choose Change icon. Search the local Lucide grid, select an icon, choose a color from the bubble beside Search, then Save. Cancel discards pending changes. Reset restores the default icon and color. Search supports icon names, multiple words, and locally defined keywords including food, cooking, work, travel, and favorites. Hover or keyboard-focus an icon to see its name.

The palette contains Default, Red, Orange, Yellow, Green, Cyan, Blue, Purple, Pink, and Gray. Named colors use theme tokens and adapt when the light/dark theme changes. Older explicit assignments and hex colors remain readable; new color choices use the standard palette. No external assets or runtime downloads are used. Lucide dependency notices remain bundled.

The Icons/Emoji tabs switch between Lucide and 3,944 fully qualified Unicode emoji choices, including skin-tone variants, flags, and joined sequences. Search supports English names, categories, common aliases, and pasted emoji. Emoji keep their native colors; the color control is disabled for an emoji selection. Glyphs use system emoji fonts, so available artwork and support for newer sequences depend on the operating system. Tab buttons and other app controls still use Lucide.

Data source: [Unicode 17.0 emoji-test.txt](https://unicode.org/Public/17.0.0/emoji/emoji-test.txt), pinned locally in `research/unicode/emoji-test.txt`. `scripts/build-emojis.mjs`, called by `build:icons`, generates `public/emoji-data.js`; the browser model bundles this data for offline use. The Unicode License V3 is retained in `public/vendor/LICENSE.unicode.txt` and in the generated catalog/bundle. Assignments store validated `emoji:<codepoint-sequence>` IDs, preserving complete skin-tone/ZWJ/flag sequences without accepting arbitrary markup. Both Lucide and emoji choices share recent history.

The earlier Iconize-specific settings page, rules, inheritance, frontmatter integration, note-title decorations, and inline icon completion/rendering were removed. Existing Markdown content is preserved as text. Version 1 metadata is read as explicit assignments only and written in the simpler version 2 format on the next save. No automatic sources are active.

Assignments appear in the file explorer, bookmarks, search results, and document tabs. The vault's `.slate-icons.json` stores them with atomic writes and revision checks. Slate's rename/move operations carry assignments to the destination. The picker keeps its pending choice if a write conflicts with another process. An inactive target stays inactive.

The UI uses Slate's shared select/popover, tooltips, Lucide renderer, neutral selected surfaces, and visible neutral keyboard focus. The color menu supports arrows, Home/End, type-to-select, Enter/Space, Escape, outside click, and focus restoration. The icon grid supports arrow keys and Home/End; additional results load while scrolling.

Verification: `node --test`, `npm.cmd run build:icons`, `npm.cmd run build:editor`, and `node_modules\.bin\electron.cmd scripts/verify-note-icons.cjs`. The Electron check covers compact sizing, keyword search, all included colors, staging/save/cancel, reset, keyboard focus, inactive target protection, conflict handling, theme colors, and rename/reload persistence. Screenshots: `evidence/iconic-picker-{dark,light}.png` and `evidence/iconic-colors-{dark,light}.png`.

Emoji verification additionally covers name/category/glyph search, flags, skin-tone variants, joined sequences, invalid ID rejection, natural color handling, save/cancel, rendering in files/bookmarks/tabs, and persistence through move/reload. Emoji screenshots: `evidence/iconic-emoji-{dark,light}.png`.
