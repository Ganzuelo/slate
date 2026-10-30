/* Force-directed note graph.
   The cooled state follows the same forces as Obsidian's graph worker fallback:
   x/y centering, degree-scaled links, Barnes-Hut repulsion, and a collision radius.
   Positions persist across updates; a structural change reheats instead of starting over. */
(() => {
 const defaults = {
  charge: -1000,
  theta: 0.9,
  distanceMin: 1,
  linkDistance: 250,
  linkStrength: 1,
  centerStrength: 0.1,
  collideRadius: 60,
  collideStrength: 0.5,
  velocityDecay: 0.6,
  alphaMin: 0.001,
  alphaDecay: 1 - Math.pow(0.001, 1 / 300)
 };

 function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
 }
 function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
   state = state + 0x6D2B79F5 | 0;
   let t = Math.imul(state ^ state >>> 15, 1 | state);
   t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
   return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
 }
 function jiggle(node) {
  const band = (node.index % 7) - 3;
  return (band || 1) * 1e-6;
 }

 function create() {
  return { nodes: [], byId: new Map(), edges: [], springs: [], neighbors: new Map(), edgeKey: '', alpha: 1, alphaTarget: 0 };
 }

 function place(state, added) {
  if (!added.length) return;
  let reach = 0;
  for (const node of state.nodes) if (node.placed) reach = Math.max(reach, node.x * node.x + node.y * node.y);
  const margin = Math.sqrt(reach);
  const area = 60 * added.length * 60;
  const ring = Math.sqrt(area / Math.PI + margin * margin) - margin;
  const jitter = Math.sqrt(area);
  const random = mulberry32(hashString(added.map(node => node.id).join('\0')));
  for (const node of added) {
   let sx = 0, sy = 0, count = 0;
   for (const id of state.neighbors.get(node.id) || []) {
    const other = state.byId.get(id);
    if (other?.placed) { sx += other.x; sy += other.y; count++; }
   }
   if (count) {
    node.x = sx / count + (random() - 0.5) * jitter;
    node.y = sy / count + (random() - 0.5) * jitter;
   } else {
    const angle = random() * Math.PI * 2, radius = margin + Math.sqrt(random()) * ring;
    node.x = radius * Math.cos(angle);
    node.y = radius * Math.sin(angle);
   }
   node.vx = 0; node.vy = 0; node.placed = true;
  }
 }

 function sync(state, items, links) {
  const incoming = new Map();
  items.forEach((item, index) => incoming.set(item.path ?? item.id ?? String(index), item));
  const kept = [];
  let removed = false;
  for (const node of state.nodes) {
   if (incoming.has(node.id)) kept.push(node);
   else removed = true;
  }
  const byId = new Map(kept.map(node => [node.id, node]));
  const added = [];
  for (const [id, item] of incoming) {
   const existing = byId.get(id);
   if (existing) { existing.item = item; continue; }
   const node = { id, item, index: 0, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, degree: 0, placed: false };
   byId.set(id, node);
   added.push(node);
  }
  const ids = [...incoming.keys()];
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const seen = new Set();
  const edges = [];
  const neighbors = new Map(ids.map(id => [id, []]));
  for (const [a, b] of links) {
   if (a === b || a < 0 || b < 0 || a >= ids.length || b >= ids.length) continue;
   const key = a < b ? a + ':' + b : b + ':' + a;
   if (seen.has(key)) continue;
   seen.add(key);
   const source = byId.get(ids[a]), target = byId.get(ids[b]);
   edges.push({ a: source, b: target });
   neighbors.get(source.id).push(target.id);
   neighbors.get(target.id).push(source.id);
  }
  const edgeKey = [...seen].sort().join('|');
  const changed = removed || added.length > 0 || edgeKey !== state.edgeKey;
  state.nodes = ids.map(id => byId.get(id));
  state.nodes.forEach((node, index) => { node.index = index; node.degree = neighbors.get(node.id).length; });
  state.byId = byId;
  state.edges = edges;
  state.neighbors = neighbors;
  state.edgeKey = edgeKey;
  place(state, added);
  state.springs = edges.map(edge => ({
   a: edge.a,
   b: edge.b,
   bias: edge.a.degree / (edge.a.degree + edge.b.degree),
   strength: 1 / Math.min(edge.a.degree, edge.b.degree)
  }));
  if (changed) state.alpha = kept.length ? Math.max(state.alpha, 0.3) : 1;
  return changed;
 }

 function insert(cell, node, depth) {
  if (!cell.data && !cell.children) { cell.data = node; return; }
  if (depth > 24) {
   cell.next = cell.next || [];
   cell.next.push(node);
   return;
  }
  if (!cell.children) {
   const midX = (cell.x0 + cell.x1) / 2, midY = (cell.y0 + cell.y1) / 2;
   cell.children = [null, null, null, null];
   const previous = cell.data;
   cell.data = null;
   insert(child(cell, previous, midX, midY), previous, depth + 1);
  }
  const midX = (cell.x0 + cell.x1) / 2, midY = (cell.y0 + cell.y1) / 2;
  insert(child(cell, node, midX, midY), node, depth + 1);
 }
 function child(cell, node, midX, midY) {
  const index = (node.x >= midX ? 1 : 0) + (node.y >= midY ? 2 : 0);
  const x0 = index & 1 ? midX : cell.x0, y0 = index & 2 ? midY : cell.y0;
  const x1 = index & 1 ? cell.x1 : midX, y1 = index & 2 ? cell.y1 : midY;
  return cell.children[index] || (cell.children[index] = { x0, y0, x1, y1, data: null, children: null, value: 0, cx: 0, cy: 0, maxR: 0 });
 }
 function accumulate(cell, chargeOf) {
  if (!cell) return;
  if (cell.children) {
   let weight = 0, cx = 0, cy = 0, value = 0, maxR = 0;
   for (const childCell of cell.children) {
    if (!childCell) continue;
    accumulate(childCell, chargeOf);
    const mass = Math.abs(childCell.value);
    value += childCell.value;
    weight += mass;
    cx += mass * childCell.cx;
    cy += mass * childCell.cy;
    maxR = Math.max(maxR, childCell.maxR);
   }
   cell.value = value;
   cell.cx = weight ? cx / weight : 0;
   cell.cy = weight ? cy / weight : 0;
   cell.maxR = maxR;
   return;
  }
  let value = 0, node = cell.data;
  const extra = cell.next || [];
  if (node) value += chargeOf(node);
  for (const other of extra) value += chargeOf(other);
  cell.value = value;
  cell.cx = node ? node.x : 0;
  cell.cy = node ? node.y : 0;
  cell.maxR = node ? node.radius : 0;
 }
 function buildTree(nodes, chargeOf) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const node of nodes) {
   x0 = Math.min(x0, node.x); y0 = Math.min(y0, node.y);
   x1 = Math.max(x1, node.x); y1 = Math.max(y1, node.y);
  }
  const span = Math.max(x1 - x0, y1 - y0, 1);
  const root = { x0, y0, x1: x0 + span, y1: y0 + span, data: null, children: null, value: 0, cx: 0, cy: 0, maxR: 0 };
  for (const node of nodes) insert(root, node, 0);
  accumulate(root, chargeOf);
  return root;
 }
 function repel(cell, node, alpha, theta2, min2) {
  if (!cell?.value || cell.data === node && !cell.children) return;
  let dx = cell.cx - node.x, dy = cell.cy - node.y, d2 = dx * dx + dy * dy;
  const width = cell.x1 - cell.x0;
  if (!cell.children || width * width / theta2 < d2) {
   if (cell.data === node) return;
   if (!d2) { dx = jiggle(node); dy = jiggle(node) * 1.3; d2 = dx * dx + dy * dy; }
   if (d2 < min2) d2 = Math.sqrt(min2 * d2);
   const scale = cell.value * alpha / d2;
   node.vx += dx * scale;
   node.vy += dy * scale;
   return;
  }
  for (const childCell of cell.children) repel(childCell, node, alpha, theta2, min2);
 }
 function collide(nodes, alpha, radius, strength) {
  const tree = buildTree(nodes, () => 0);
  const limit = radius * 2;
  function visit(cell, node, xi, yi) {
   if (!cell) return;
   const reach = limit;
   if (xi + reach < cell.x0 || xi - reach > cell.x1 || yi + reach < cell.y0 || yi - reach > cell.y1) return;
   const other = cell.data;
   if (other && other !== node && other.index > node.index) {
    let x = xi - other.x - other.vx, y = yi - other.y - other.vy;
    let d2 = x * x + y * y;
    if (d2 < limit * limit) {
     if (!d2) { x = jiggle(node); y = jiggle(other); d2 = x * x + y * y; }
     const dist = Math.sqrt(d2);
     const push = (limit - dist) / dist * alpha * strength;
     x *= push; y *= push;
     node.vx += x * 0.5; node.vy += y * 0.5;
     other.vx -= x * 0.5; other.vy -= y * 0.5;
    }
   }
   if (cell.children) for (const childCell of cell.children) visit(childCell, node, xi, yi);
  }
  for (const node of nodes) visit(tree, node, node.x + node.vx, node.y + node.vy);
 }

 function step(state, options) {
  const o = { ...defaults, ...options };
  if (!state.nodes.length) { state.alpha = o.alphaMin; return; }
  state.alpha += (state.alphaTarget - state.alpha) * o.alphaDecay;
  const alpha = state.alpha;
  for (const node of state.nodes) {
   node.vx += (0 - node.x) * o.centerStrength * alpha;
   node.vy += (0 - node.y) * o.centerStrength * alpha;
  }
  for (const spring of state.springs) {
   let x = spring.b.x + spring.b.vx - spring.a.x - spring.a.vx;
   let y = spring.b.y + spring.b.vy - spring.a.y - spring.a.vy;
   if (!x && !y) x = jiggle(spring.a);
   const dist = Math.hypot(x, y) || 1e-6;
   const scale = (dist - o.linkDistance) / dist * alpha * o.linkStrength * spring.strength;
   x *= scale; y *= scale;
   spring.b.vx -= x * spring.bias; spring.b.vy -= y * spring.bias;
   spring.a.vx += x * (1 - spring.bias); spring.a.vy += y * (1 - spring.bias);
  }
  if (state.nodes.length > 1) {
   const tree = buildTree(state.nodes, () => o.charge);
   const theta2 = o.theta * o.theta, min2 = o.distanceMin * o.distanceMin;
   for (const node of state.nodes) repel(tree, node, alpha, theta2, min2);
   collide(state.nodes, alpha, o.collideRadius, o.collideStrength);
  }
  for (const node of state.nodes) {
   if (node.fx == null) node.x += node.vx *= o.velocityDecay;
   else { node.x = node.fx; node.vx = 0; }
   if (node.fy == null) node.y += node.vy *= o.velocityDecay;
   else { node.y = node.fy; node.vy = 0; }
  }
 }
 function settle(state, options) {
  const o = { ...defaults, ...options };
  let guard = 0;
  while (state.alpha > state.alphaTarget && state.alpha > o.alphaMin && guard++ < 500) step(state, o);
 }

 function replay(state) {
  for (const node of state.nodes) { node.placed = false; node.vx = 0; node.vy = 0; node.fx = null; node.fy = null; }
  place(state, state.nodes);
  state.alpha = 1;
  state.alphaTarget = 0;
 }

 function layout(items, links, options) {
  const state = create();
  sync(state, items, links);
  settle(state, options);
  return {
   nodes: state.nodes.map(node => ({ ...node.item, x: node.x, y: node.y, degree: node.degree })),
   edges: state.edges.map(edge => [edge.a.index, edge.b.index])
  };
 }
 function bounds(nodes, padding = 0) {
  if (!nodes.length) return { x: -padding, y: -padding, width: 2 * padding || 1, height: 2 * padding || 1 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const node of nodes) { x0 = Math.min(x0, node.x); y0 = Math.min(y0, node.y); x1 = Math.max(x1, node.x); y1 = Math.max(y1, node.y); }
  return { x: x0 - padding, y: y0 - padding, width: x1 - x0 + 2 * padding, height: y1 - y0 + 2 * padding };
 }
 function nodeRadius(degree) {
  return Math.max(8, Math.min(3 * Math.sqrt(degree + 1), 30));
 }

 window.SlateGraphLayout = { layout, bounds, create, sync, step, settle, replay, nodeRadius, alphaMin: defaults.alphaMin };
})();
