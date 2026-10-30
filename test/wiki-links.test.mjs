import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { resolveLink } from '../core.mjs';

const window = {};
vm.runInNewContext(await fs.readFile(new URL('../public/wiki-links.js', import.meta.url), 'utf8'), { window });
const { context, suggestions, replacement } = window.SlateWikiLinks;
const plain = value => JSON.parse(JSON.stringify(value));
const notes = ['Current.md', 'Projects/Slate.md', 'Archive/Slate.md', 'Planning.md', 'Guide.md'].map(path => ({ path }));

test('wiki completion opens immediately and tracks spaces, Unicode, paths and embedded links', () => {
  for (const query of ['', 'Sl', 'Projects/Sl', 'a long title', '日本語']) {
    const text = 'See [[' + query;
    assert.deepEqual(plain(context(text, text.length)), { from: 6, to: text.length, query });
  }
  assert.equal(context('![[Sl', 5).query, 'Sl');
  assert.equal(context('[[Sl', 4, 3), null);
});

test('wiki completion ignores closed links, escapes, headings, aliases and code', () => {
  for (const text of ['[', '[[Guide]]', '\\[[Sl', '[[[Sl', '[[Guide|alias', '[[Guide#head', '`[[Sl', '``[[Sl', '```md\n[[Sl', '~~~\n[[Sl']) {
    assert.equal(context(text, text.length), null, text);
  }
  for (const text of ['`code` [[Sl', '```\ncode\n```\n[[Sl', '~~~\ncode\n~~~\n[[Sl']) assert.equal(context(text, text.length).query, 'Sl');
});

test('suggestions rank titles before paths and preserve duplicate note identities', () => {
  assert.deepEqual(plain(suggestions(notes, 'sl', 'Current.md')).map(n => n.path), ['Archive/Slate.md', 'Projects/Slate.md']);
  assert.deepEqual(plain(suggestions(notes, 'projects/', 'Current.md')).map(n => n.path), ['Projects/Slate.md']);
  assert.equal(suggestions(notes, 'missing', 'Current.md').length, 0);
  assert.equal(suggestions(notes, '', 'Current.md').length, 4);
  for (const item of suggestions(notes, '', 'Current.md')) assert.equal(resolveLink(item.target, 'Current.md', notes), item.path);
});

test('accepting a recommendation closes the link once and preserves surrounding content', () => {
  for (const [text, pos, expected] of [
    ['See [[Sl', 8, 'See [[Projects/Slate]]'],
    ['See [[Sl]] after', 8, 'See [[Projects/Slate]] after'],
    ['See [[Slate]] after', 8, 'See [[Projects/Slate]] after'],
    ['See [[Sl] after', 8, 'See [[Projects/Slate]] after'],
    ['See [[Slate#Heading|Alias]] after', 8, 'See [[Projects/Slate#Heading|Alias]] after'],
  ]) {
    const change = replacement(text, context(text, pos), 'Projects/Slate');
    assert.equal(text.slice(0, change.from) + change.insert + text.slice(change.to), expected);
  }
});
