import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');

const viewActions = html.match(/<div class="view-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
const buttons = [...viewActions.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);

test('open note header has one combined read/write toggle, not separate mode buttons', () => {
  assert.equal(buttons.length, 3, 'bookmark, mode toggle, and more only');
  assert.ok(!viewActions.includes('id="editButton"'), 'separate write button removed');
  assert.ok(!viewActions.includes('id="previewButton"'), 'separate reading button removed');
  assert.ok(viewActions.includes('id="viewModeButton"'), 'combined toggle present');
  assert.match(app, /\$\('viewModeButton'\)\.onclick=\(\)=>setMode\(mode==='edit'\?'preview':'edit'\)/);
  // The toggle swaps its icon, tooltip, and label to name the view it opens.
  assert.match(app, /viewModeButton[\s\S]{0,300}icon\(editing\?'book':'pencil'\)/);
  assert.match(app, /viewModeButton[\s\S]{0,300}dataset\.tooltip=editing\?'Reading view \(Ctrl\+E\)':'Editing view \(Ctrl\+E\)'/);
});

test('bookmarked notes show a filled bookmark icon', () => {
  assert.match(css, /#bookmarkButton\.active\s+\.icon\{[^}]*fill:currentColor/);
});

test('open note header tooltips prefer below', () => {
  assert.equal(buttons.length, 3);
  for (const button of buttons) assert.ok(button.includes('data-tooltip-side="bottom"'), button);
});
