import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

test('Markdown escapes HTML, isolates inline code, and rejects executable URL schemes', async () => {
  const elements = new Map();
  const element = () => ({value:'',children:[],classList:{toggle(){}},replaceChildren(){this.children=[];},append(x){this.children.push(x);},setAttribute(){},addEventListener(){}});
  const context = vm.createContext({ document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){}},location:{hash:''},sessionStorage:{getItem(){return '';}},window:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>({vault:'Test',notes:[]})}),console });
  vm.runInContext(await fs.readFile(new URL('../public/vendor/icons.js',import.meta.url),'utf8'),context);
  vm.runInContext(await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8'),context);
  const render = text => vm.runInContext('markdown(' + JSON.stringify(text) + ')',context);
  const html = render('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n[[X" onmouseover="alert(1)|hello]]');
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script')); assert.ok(!html.includes('href="javascript:'));
  assert.match(html,/&lt;script&gt;/); assert.match(html,/data-link="X&quot;/);
  assert.equal(render('`[[Code]]`'),'<p><code>[[Code]]</code></p>');
  assert.match(render('[safe](https://example.com)'),/rel="noopener noreferrer"/);
  for (const url of ['https://example.com', 'http://example.com', 'HTTPS://example.com']) {
    assert.match(render('[safe](' + url + ')'), /safe<span class="external-link-icon" aria-hidden="true"><svg[^>]*data-lucide="external-link"[^>]*>[\s\S]*<\/svg><\/span><\/a>/);
  }
  for (const text of ['[[Note]]', '[Note](Note.md)', '![Image](https://example.com/image.png)', '`[code](https://example.com)`', '```\n[code](https://example.com)\n```', '[bad](javascript:alert)']) {
    assert.ok(!render(text).includes('external-link-icon'), text);
  }
  assert.match(render('```\n<script>\n```'),/<pre><code>&lt;script&gt;<\/code><\/pre>/);
  assert.match(render('```js title=x\nconst a = 1;\n```'),/<pre data-lang="js"><code>const a = 1;<\/code><\/pre>/);
  assert.match(render('```js\nx\n```'),/<div class="code-block-header"><span>js<\/span><button type="button" class="code-copy" data-copy-code aria-label="Copy code" data-tooltip="Copy code"><span data-icon="copy"><\/span><\/button><\/div>/);
  assert.match(render('```"><img src=x>\nx\n```'),/<pre data-lang="&quot;&gt;&lt;img"><code>x<\/code><\/pre>/);
});

test('Link and code colors come from theme tokens defined for both themes', async () => {
  const style = await fs.readFile(new URL('../public/style.css',import.meta.url),'utf8');
  const editorCss = await fs.readFile(new URL('../public/editor.css',import.meta.url),'utf8');
  const editor = await fs.readFile(new URL('../public/live-editor.js',import.meta.url),'utf8');
  const app = await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const tokens = [...new Set([...editorCss.matchAll(/var\(--((?:syn|code)-[\w-]+)\)/g)].map(m => m[1]))];
  const dark = style.match(/:root\{color-scheme:dark;[^}]*\}/)[0], light = style.match(/html\[data-theme=light\]\{[^}]*\}/)[0];
  for (const token of [...tokens, 'link']) assert.match(dark, new RegExp('--' + token + ':'), 'dark theme defines --' + token);
  for (const token of tokens.filter(token => token !== 'code-font')) assert.match(light, new RegExp('--' + token + ':'), 'light theme defines --' + token);
  assert.match(light, /--link:/);
  assert.match(style, /#title,#title:focus,#title:focus-visible\{outline:none;box-shadow:none\}/);
  assert.match(style, /:not\(\.cm-content\):not\(\.cm-editor\):not\(#editor\):not\(#title\):focus-visible/);
  assert.match(editorCss, /\.cm-editor\.cm-focused/);
  assert.match(editorCss, /#editor:focus,#editor:focus-visible\{outline:none\}/);
  assert.doesNotMatch(editorCss, /html\[data-keyboard-navigation=true\][^{]*#editor:focus-visible\{outline:2px/);
  assert.match(app, /closest\?\.\('\.cm-editor,\.slate-editor-host,#editor,#title'\)/);
  assert.ok(!/syntaxHighlighting\(defaultHighlightStyle/.test(editor),'editor must not use the light-only default highlight colors');
});
