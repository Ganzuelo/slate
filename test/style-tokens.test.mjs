import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Colors may only be defined inside the :root (dark) and
// html[data-theme=light] token blocks. Every rule outside those blocks must
// reference a token, so light/dark themes can swap without hardcoded values.
const cssFiles = ['style.css', 'controls.css', 'context-menu.css', 'editor.css', 'extras.css', 'note-icons.css', 'whiteboard.css', 'help.css'];
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|:\s*(?:white|black)\b/;

function hardcodedColors(css) {
  const found = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const name = selector.trim();
    if (name === ':root' || name.startsWith('html[data-theme')) continue;
    for (const declaration of body.split(';')) {
      if (colorLiteral.test(declaration)) found.push(`${name} :: ${declaration.trim()}`);
    }
  }
  return found;
}

for (const file of cssFiles) {
  test(`${file} uses theme tokens outside token definitions`, async () => {
    const css = await fs.readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
    assert.deepEqual(hardcodedColors(css), []);
  });
}

test('both themes define the same semantic tokens', async () => {
  const css = await fs.readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  const tokens = block => new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  const dark = tokens(css.match(/:root\{([^}]*)\}/)[1]);
  const light = tokens(css.match(/html\[data-theme=light\]\{([^}]*)\}/)[1]);
  // Light only overrides color tokens; layout/font tokens stay shared.
  for (const token of light) assert.ok(dark.has(token), `light token ${token} has no dark counterpart`);
  for (const token of ['--destructive', '--banner-bg', '--banner-text', '--callout-bg', '--callout-border', '--callout-title', '--highlight-bg', '--toggle-off', '--toggle-knob', '--scrollbar', '--scrollbar-hover', '--shadow-sm', '--shadow-md', '--shadow-lg', '--backdrop', '--graph-tag', '--graph-attachment']) {
    assert.ok(dark.has(token) && light.has(token), `${token} must be defined in both themes`);
  }
});

test('editor and graph read colors from tokens without dark fallbacks', async () => {
  const editor = await fs.readFile(new URL('../public/live-editor.js', import.meta.url), 'utf8');
  const graph = await fs.readFile(new URL('../public/graph-view.js', import.meta.url), 'utf8');
  assert.ok(!/var\(--[\w-]+,\s*#/.test(editor), 'live editor must not fall back to a hardcoded color');
  assert.ok(!/\{\s*dark:\s*true\s*\}/.test(editor), 'CodeMirror theme must not hardcode dark mode');
  assert.ok(!/cssColor\('--[\w-]+',\s*'#/.test(graph), 'graph palette must not fall back to a hardcoded color');
  assert.ok(graph.includes("cssColor('--graph-tag')") && graph.includes("cssColor('--graph-attachment')"));
});
