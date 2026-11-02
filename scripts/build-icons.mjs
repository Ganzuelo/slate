import * as lucide from 'lucide';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { buildEmojis } from './build-emojis.mjs';

// All app icon names resolve here to official Lucide geometry.
const registry = {
  'check-square': 'SquareCheckBig', 'panel-left': 'PanelLeft', 'panel-right': 'PanelRight',
  files: 'Files', folder: 'Folder', 'file-plus': 'FilePlus', 'folder-plus': 'FolderPlus',
  file: 'File', 'notebook-text': 'NotebookText', network: 'Network', 'graph-star': 'GraphStar', layout: 'LayoutDashboard', calendar: 'Calendar',
  stamp: 'Stamp', terminal: 'Terminal', settings: 'Settings', vault: 'Vault',
  search: 'Search', bookmark: 'Bookmark', hash: 'Hash', refresh: 'RefreshCw',
  fold: 'ListCollapse', chevrons: 'ChevronsUpDown', plus: 'Plus', minus: 'Minus',
  left: 'ChevronLeft', right: 'ChevronRight', down: 'ChevronDown', book: 'BookOpen',
  pencil: 'Pencil', more: 'Ellipsis', x: 'X', link: 'Link', links: 'Undo2',
  list: 'List', text: 'Type', maximize: 'Maximize', check: 'Check',
  'case-sensitive': 'CaseSensitive', repeat: 'Repeat',
  'priority-highest': 'Flame', 'priority-high': 'CircleAlert',
  'priority-medium': 'CircleAlert', 'priority-normal': 'CircleMinus', 'priority-low': 'CircleMinus', 'priority-lowest': 'CircleMinus',
  'arrow-up': 'ArrowUp', 'arrow-down': 'ArrowDown', enter: 'CornerDownLeft',
  clipboard: 'Clipboard', copy: 'Copy', 'folder-input': 'FolderInput',
  'folder-open': 'FolderOpen', 'folder-search': 'FolderSearch', history: 'History',
  trash: 'Trash2', pin: 'Pin', 'external-link': 'ExternalLink', bold: 'Bold',
  italic: 'Italic', strikethrough: 'Strikethrough', highlighter: 'Highlighter',
  code: 'Code', paragraph: 'Pilcrow', heading: 'Heading', 'list-ordered': 'ListOrdered',
  quote: 'Quote', table: 'Table', paperclip: 'Paperclip', undo: 'Undo2', redo: 'Redo2',
  scissors: 'Scissors', 'select-all': 'SquareDashed', smile: 'Smile',
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const icons = {};
const root = new URL('../', import.meta.url);
const canonical = (await fs.readdir(new URL('node_modules/lucide/dist/esm/icons/', root))).filter(name => name.endsWith('.mjs')).map(name => name.slice(0,-4)).sort();
const nodesByName = Object.fromEntries(await Promise.all(canonical.map(async name => [name, (await import(new URL('node_modules/lucide/dist/esm/icons/' + name + '.mjs', root))).default])));
const canonicalNodes = { ...nodesByName };
for (const [name, exported] of Object.entries(registry)) nodesByName[name] = lucide[exported];
function render(name, nodes) {
  if (!Array.isArray(nodes)) throw new Error(`Missing Lucide icon: ${name}`);
  const content = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="icon lucide" data-lucide="${name}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;
}
for (const [name, nodes] of Object.entries(nodesByName)) icons[name] = render(name,nodes);
// Existing application aliases (e.g. book → BookOpen) must not change the
// geometry of a user's canonical catalog choice (book → Book).
const overrides = Object.fromEntries(canonical.filter(name => nodesByName[name] !== canonicalNodes[name]).map(name => [name,render(name,canonicalNodes[name])]));
const license = await fs.readFile(new URL('node_modules/lucide/LICENSE', root), 'utf8');
await fs.mkdir(new URL('public/vendor/', root), { recursive: true });
await fs.writeFile(new URL('public/vendor/icons.js', root), `/*! Lucide — ISC license\n${license.replaceAll('*/', '* /')}*/\nwindow.SlateIcons = Object.freeze(${JSON.stringify(icons)});\nwindow.SlateIconNames = Object.freeze(${JSON.stringify(canonical)});\nwindow.SlateLucideOverrides = Object.freeze(${JSON.stringify(overrides)});\n`);
await buildEmojis();
await build({ entryPoints: [fileURLToPath(new URL('public/note-icons.js', root))], outfile: fileURLToPath(new URL('public/vendor/note-icons.js', root)), bundle: true, format: 'iife', globalName: 'SlateNoteIcons', target: ['chrome120'], legalComments: 'inline' });
// Native checkbox inputs use the same official Check geometry.
await fs.writeFile(new URL('public/vendor/check.svg', root), icons.check.replace('stroke="currentColor"', 'stroke="white"'));
await fs.writeFile(new URL('public/vendor/check-dark.svg', root), icons.check.replace('stroke="currentColor"', 'stroke="black"'));
await fs.writeFile(new URL('public/vendor/LICENSE.lucide.txt', root), license);
console.log(`Built ${Object.keys(icons).length} local Lucide icons.`);
