import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

const source = await fs.readFile(new URL('../public/live-editor.js', import.meta.url), 'utf8');
const context = vm.createContext({ Decoration, WidgetType, taskBlocks: () => [] });
vm.runInContext(source.slice(source.indexOf('class ExternalLinkWidget '), source.indexOf('class CodeLabelWidget ')) + source.slice(source.indexOf('function liveDecorations('), source.indexOf('function taskBlocks(')), context);

test('external link icons track edits in live preview without changing note text', () => {
  let state = EditorState.create();
  const icons = (focused = true, code = false) => {
    const fences = new Map([[1, { code, fence: false }]]);
    const set = context.liveDecorations({ state, hasFocus: focused, visibleRanges: [{ from: 0, to: state.doc.length }] }, fences, null, () => '<svg></svg>');
    const result = [];
    for (let cursor = set.iter(); cursor.value; cursor.next()) if (cursor.value.spec.widget?.constructor.name === 'ExternalLinkWidget') result.push(cursor.from);
    return result;
  };
  const text = '[Site](https://example.com)';
  for (const char of text) {
    state = state.update({ changes: { from: state.doc.length, insert: char }, selection: { anchor: state.doc.length + 1 } }).state;
    assert.equal(icons().length, char === ')' ? 1 : 0);
  }
  assert.deepEqual(icons(false), [text.length]);
  assert.deepEqual(icons(true, true), []);
  assert.equal(state.doc.toString(), text);
  for (const doc of ['[Site](http://example.com)', '[Site](HTTPS://example.com)']) {
    state = EditorState.create({ doc });
    assert.deepEqual(icons(), [doc.length]);
  }
  for (const doc of ['[Note](Note.md)', '`[Site](https://example.com)`', '![Image](https://example.com/image.png)', '[bad](javascript:alert)', '[Site](https://example.com']) {
    state = EditorState.create({ doc });
    assert.deepEqual(icons(), [], doc);
  }
});
