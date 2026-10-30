import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readClipboardText, writeClipboardText } from './plain-text-clipboard.mjs';

test('clipboard bridge awaits Electron async reads and writes and returns only bounded plain text', async () => {
 let stored='QA text';
 const clipboard={async readText(){await Promise.resolve();return stored;},async writeText(text){await Promise.resolve();stored=text;}};
 assert.equal(await readClipboardText(clipboard),'QA text');
 await writeClipboardText(clipboard,'New QA text');assert.equal(stored,'New QA text');
 await assert.rejects(writeClipboardText(clipboard,{html:'<script>'}),/plain text/);
 assert.equal(stored,'New QA text');
 stored='x'.repeat(4*1024*1024+1);await assert.rejects(readClipboardText(clipboard),/4 MiB/);
 await assert.rejects(writeClipboardText(clipboard,stored),/4 MiB/);
});
