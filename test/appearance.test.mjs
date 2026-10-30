import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const window={};
vm.runInNewContext(await fs.readFile(new URL('../public/appearance.js',import.meta.url),'utf8'),{window});
const appearance=window.SlateAppearance;
test('accents normalize supported hex formats and reject CSS/markup injection',()=>{
 assert.equal(appearance.normalize(' #ABC '),'#aabbcc');assert.equal(appearance.normalize('#12ABef'),'#12abef');
 for(const invalid of ['red','url(https://example.com)','</style>',null,42,'#12345','#12345678'])assert.equal(appearance.normalize(invalid),appearance.defaultColor);
});
test('accent links and button labels retain contrast in both themes including extreme custom colors',()=>{
 for(const theme of ['light','dark'])for(const color of [...appearance.presets.map(([,color])=>color),'#ffffff','#000000','#ffff00','#777777','#abcdef']) {
  const tokens=appearance.tokens(color,theme);
  assert.equal(tokens.solid,color);
  assert.ok(appearance.contrast(tokens.solid,tokens.on)>=4.5,color+' foreground');
  assert.ok(appearance.contrast(tokens.readable,theme==='light'?'#ffffff':'#1e1e1e')>=4.5,color+' '+theme+' link');
 }
});
test('applying an accent changes only accent tokens and uses a readable checkmark asset',()=>{
 const values=new Map([['--active','neutral-surface'],['--focus','neutral-focus']]);
 const root={dataset:{theme:'light'},style:{setProperty:(name,value)=>values.set(name,value)}};
 appearance.apply(root,'#ffff00');
 assert.equal(values.get('--accent-solid'),'#ffff00');assert.equal(values.get('--accent-on'),'#000000');
 assert.match(values.get('--accent-check'),/check-dark.svg/);
 assert.equal(values.get('--active'),'neutral-surface');assert.equal(values.get('--focus'),'neutral-focus');
 appearance.apply(root,'#000000');assert.match(values.get('--accent-check'),/\/check.svg/);
});
