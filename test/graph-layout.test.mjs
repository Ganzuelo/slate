import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(await fs.readFile(new URL('../public/graph-layout.js', import.meta.url), 'utf8'), context);
const { layout, bounds, create, sync, settle } = context.window.SlateGraphLayout;

// A vault shaped like a real one: a few daily-note hubs, some cross links and many orphans.
function vault(count) {
 const items = Array.from({ length: count }, (_, i) => ({ path: 'Note ' + i + '.md' })), links = [];
 for (let i = 4; i < count * .45; i++) links.push([i, i % 4]);
 for (let i = 4; i < count * .25; i += 3) links.push([i, 4 + (i * 7) % Math.floor(count * .25 - 4)]);
 return { items, links };
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const radius = n => Math.hypot(n.x, n.y);

test('large vaults spread out instead of piling against fixed edges', () => {
 const { items, links } = vault(300), { nodes } = layout(items, links);
 assert.equal(nodes.length, 300);
 assert.ok(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
 // The previous layout clamped to a box, stacking many notes on identical edge coordinates.
 const xs = new Set(nodes.map(n => Math.round(n.x))), ys = new Set(nodes.map(n => Math.round(n.y)));
 assert.ok(xs.size > 250 && ys.size > 250, `distinct positions x=${xs.size} y=${ys.size}`);
 let close = 0;
 for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (distance(nodes[i], nodes[j]) < 4) close++;
 assert.ok(close <= 3, close + ' overlapping pairs');
 const box = bounds(nodes);
 assert.ok(box.width < 20000 && box.height < 20000, JSON.stringify(box));
});

test('linked notes cluster in the middle with orphans around them', () => {
 const { items, links } = vault(200), { nodes } = layout(items, links);
 const linked = nodes.filter(n => n.degree > 0), orphans = nodes.filter(n => n.degree === 0);
 const mean = list => list.reduce((sum, n) => sum + radius(n), 0) / list.length;
 assert.ok(mean(orphans) > mean(linked), `orphans ${mean(orphans)} linked ${mean(linked)}`);
 // Linked notes sit close to their hub relative to the graph size.
 const hub = nodes[0], leaves = nodes.filter((n, i) => links.some(([a, b]) => a === i && b === 0));
 assert.ok(leaves.length > 10);
 const meanLeaf = leaves.reduce((sum, n) => sum + distance(n, hub), 0) / leaves.length;
 assert.ok(meanLeaf > 80 && meanLeaf < 900, 'mean leaf distance ' + meanLeaf);
});

test('layouts are deterministic, deduplicate links and ignore invalid ones', () => {
 const { items, links } = vault(60);
 assert.deepEqual(JSON.parse(JSON.stringify(layout(items, links))), JSON.parse(JSON.stringify(layout(items, links))));
 const result = layout(items.slice(0, 3), [[0, 1], [1, 0], [0, 1], [2, 2], [0, 9], [-1, 0]]);
 assert.deepEqual(JSON.parse(JSON.stringify(result.edges)), [[0, 1]]);
 assert.deepEqual(Array.from(result.nodes, n => n.degree), [1, 1, 0]);
 assert.deepEqual(layout([], []).nodes.length, 0);
 assert.ok(Number.isFinite(layout([{ path: 'One.md' }], []).nodes[0].x));
});

test('the same notes keep their places when the graph is refreshed', () => {
 const { items, links } = vault(80);
 const state = create();
 sync(state, items, links);
 settle(state);
 const before = state.nodes.map(n => [n.x, n.y]);
 assert.equal(sync(state, items, links), false);
 assert.deepEqual(state.nodes.map(n => [n.x, n.y]), before);
 items.push({ path: 'Note extra.md' });
 links.push([items.length - 1, 0]);
 assert.equal(sync(state, items, links), true);
 const shifted = state.nodes.filter(n => n.id !== 'Note extra.md').map(n => [n.x, n.y]);
 assert.deepEqual(shifted, before);
});

test('thousands of notes lay out quickly', () => {
 const { items, links } = vault(2000), start = performance.now(), { nodes } = layout(items, links);
 assert.ok(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
 assert.ok(performance.now() - start < 5000, 'layout took ' + Math.round(performance.now() - start) + 'ms');
});
