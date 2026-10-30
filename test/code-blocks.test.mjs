import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState, EditorSelection } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

const source = await fs.readFile(new URL('../public/live-editor.js', import.meta.url), 'utf8');
const editorCss = await fs.readFile(new URL('../public/editor.css', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

const context = vm.createContext({
  window: {},
  navigator: {},
  Decoration,
  WidgetType,
  taskBlocks: () => [],
  CheckboxWidget: class CheckboxWidget {},
  BulletWidget: class BulletWidget {},
  ExternalLinkWidget: class ExternalLinkWidget {},
});
vm.runInContext(source.slice(source.indexOf('async function writeClipboard'), source.indexOf('function taskBlocks(')), context);

function decorations(doc, { from = 0, to = from, focus = false } = {}) {
  const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
  return context.liveDecorations(
    { state, hasFocus: focus, visibleRanges: [{ from: 0, to: state.doc.length }] },
    context.fenceContexts(state.doc),
    null,
    () => '<svg></svg>',
  );
}

function listed(doc, options) {
  const result = [];
  for (let cursor = decorations(doc, options).iter(); cursor.value; cursor.next()) {
    result.push({
      from: cursor.from,
      to: cursor.to,
      className: cursor.value.spec.class || '',
      widget: cursor.value.spec.widget || null,
      side: cursor.value.spec.side,
    });
  }
  return result;
}

test('codeBlockText copies fenced contents and stops at the closing fence', () => {
  const doc = EditorState.create({ doc: 'intro\n```js\nconst a = 1;\nconst b = 2;\n```\nafter' }).doc;
  assert.equal(context.codeBlockText(doc, 2), 'const a = 1;\nconst b = 2;');
  assert.equal(context.codeBlockText(EditorState.create({ doc: '~~~\nonly\n~~~' }).doc, 1), 'only');
  assert.equal(context.codeBlockText(EditorState.create({ doc: '```\n```' }).doc, 1), '');
  assert.equal(context.codeBlockText(EditorState.create({ doc: '```\nstill open' }).doc, 1), 'still open');
});

test('writeClipboard uses the desktop bridge before navigator.clipboard', async () => {
  const written = [];
  const previousDesktop = context.window.slateDesktop;
  const previousClipboard = context.navigator.clipboard;
  try {
    context.window.slateDesktop = { writeClipboard: async text => written.push(['desktop', text]) };
    context.navigator.clipboard = { writeText: async text => written.push(['browser', text]) };
    await context.writeClipboard('hello()');
    assert.deepEqual(written, [['desktop', 'hello()']]);
    delete context.window.slateDesktop;
    await context.writeClipboard('browser()');
    assert.deepEqual(written, [['desktop', 'hello()'], ['browser', 'browser()']]);
  } finally {
    context.window.slateDesktop = previousDesktop;
    context.navigator.clipboard = previousClipboard;
  }
});

test('copy button appears only after the closing fence and keeps the opening line as its source', () => {
  const open = listed('```js\nconst a = 1;');
  const openHeader = open.find(item => item.widget?.constructor.name === 'CodeLabelWidget');
  assert.equal(openHeader.widget.lang, 'js');
  assert.equal(openHeader.widget.icon, null);
  assert.equal(open.filter(item => item.widget?.constructor.name === 'CodeCopyWidget').length, 0);
  const doc = '```js\nconst a = 1;\n```';
  const header = listed(doc).find(item => item.widget?.constructor.name === 'CodeLabelWidget');
  assert.ok(header.widget.icon, 'closed blocks should render a copy button in the header');
  assert.equal(header.widget.start, 1);
  assert.equal(header.widget.lang, 'js');
  assert.equal(context.codeBlockText(EditorState.create({ doc }).doc, header.widget.start), 'const a = 1;');
  const end = listed(doc).find(item => item.className.includes('cm-slate-code-end'));
  assert.match(end.className, /cm-slate-code-collapsed/);
  const editing = listed(doc, { from: 0, focus: true }).find(item => item.className.includes('cm-slate-code-start'));
  assert.ok(!editing.className.includes('cm-slate-code-collapsed'));
  const copy = listed(doc, { from: 0, focus: true }).find(item => item.widget?.constructor.name === 'CodeCopyWidget');
  assert.ok(copy, 'editing a closed opening fence should keep a copy widget on that line');
  assert.equal(copy.widget.start, 1);
  assert.equal(copy.side, -1);
});

test('Tab on an opening fence jumps to the first code line and closes a new block', () => {
  function run(doc, from) {
    const state = EditorState.create({ doc, selection: { anchor: from ?? EditorState.create({ doc }).doc.line(1).to } });
    const next = context.codeFenceTab(state);
    assert.ok(next, doc);
    return state.update(next).state;
  }
  let state = run('```js');
  assert.equal(state.doc.toString(), '```js\n\n```');
  assert.equal(state.selection.main.head, state.doc.line(2).from);
  state = run('```js\nconst a = 1;\n```');
  assert.equal(state.doc.toString(), '```js\nconst a = 1;\n```');
  assert.equal(state.selection.main.head, state.doc.line(2).from);
  state = run('```js\n```');
  assert.equal(state.doc.toString(), '```js\n\n```');
  assert.equal(state.selection.main.head, state.doc.line(2).from);
  state = run('  ~~~\ncode');
  assert.equal(state.doc.toString(), '  ~~~\ncode');
  assert.equal(state.selection.main.head, state.doc.line(2).from);
  assert.equal(context.codeFenceTab(EditorState.create({ doc: 'hello' })), null);
  assert.equal(context.codeFenceTab(EditorState.create({ doc: '```js\ncode\n```', selection: { anchor: 8 } })), null);
});

test('closing fences collapse in CSS and reading-view copy uses the desktop clipboard helper', () => {
  assert.match(editorCss, /cm-slate-code-end\.cm-slate-code-collapsed\{[^}]*height:8px/);
  assert.match(editorCss, /cm-slate-code-start\+\.cm-slate-code-line:not\(\.cm-slate-code-end\)/);
  assert.match(editorCss, /cm-slate-code-start:has\(\.code-copy\)\{min-height:28px/);
  assert.doesNotMatch(editorCss, /cm-slate-code-header\{display:flex/);
  assert.match(appSource, /function copyCode[\s\S]*copyMenuText\(/);
  assert.doesNotMatch(source, /posAtDOM\(button\)/);
});
