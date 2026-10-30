/* Graph screen modeled on Obsidian's graph view: a pixel camera, live forces,
   and the Filters / Groups / Display / Forces panel. Physics stays in graph-layout.js. */
(() => {
 const layout = () => window.SlateGraphLayout;
 const groupColors = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2'];
 const options = {
  query: '',
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  depth: 1,
  neighborLinks: false,
  outgoing: true,
  incoming: true,
  showArrows: false,
  textFade: 0,
  nodeSize: 1,
  lineThickness: 1,
  center: 0.519,
  repel: 10,
  link: 1,
  distance: 250,
  groups: []
 };

 function sliderStrength(slider, floor = 0.01) {
  const clamped = Math.min(1, Math.max(0, slider));
  return (Math.pow(floor, 1 - clamped) - floor) / (1 - floor);
 }
 function repelCharge(slider) {
  const cubed = slider * slider * slider;
  return Math.abs(cubed) < 1 ? -1 : -cubed;
 }
 function forceOptions() {
  return {
   centerStrength: sliderStrength(options.center),
   linkStrength: sliderStrength(options.link),
   linkDistance: options.distance,
   charge: repelCharge(options.repel)
  };
 }
 function matches(node, query) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  let ok = true;
  const rest = text.replace(/(?:^|\s)(path|file|tag):(?:"([^"]+)"|(\S+))/g, (_, kind, quoted, word) => {
   const value = (quoted || word || '').replace(/^#/, '');
   if (kind === 'tag') ok = ok && ((node.tags || []).some(tag => tag.toLowerCase().includes(value)) || (node.type === 'tag' && node.label.toLowerCase().includes(value)));
   else ok = ok && (node.id + ' ' + node.label).toLowerCase().includes(value);
   return ' ';
  }).trim();
  if (!ok) return false;
  if (!rest) return true;
  const hay = (node.label + ' ' + node.id + ' ' + (node.tags || []).map(tag => '#' + tag).join(' ')).toLowerCase();
  return rest.split(/\s+/).every(word => hay.includes(word));
 }

 function collect(input, settings = options) {
  const notes = input.notes || [];
  const attachments = input.attachments || [];
  const noteIds = new Set(notes.map(note => note.path));
  const attachmentByName = new Map();
  for (const file of attachments) {
   attachmentByName.set(file.path, file.path);
   attachmentByName.set(file.path.split('/').pop(), file.path);
  }
  const nodes = new Map();
  const directed = [];
  const add = (id, node) => { if (!nodes.has(id)) nodes.set(id, node); return nodes.get(id); };
  const link = (source, target) => { if (source && target && source !== target) directed.push([source, target]); };
  for (const note of notes) {
   add(note.path, { id: note.path, label: note.path.split('/').pop().replace(/\.md$/i, ''), type: 'file', tags: note.tags || [] });
  }
  for (const note of notes) {
   for (const edge of note.resolved || []) {
    if (edge.path && noteIds.has(edge.path)) link(note.path, edge.path);
    else if (settings.showAttachments && edge.path && attachmentByName.has(edge.path)) link(note.path, 'attachment:' + attachmentByName.get(edge.path));
    else if (settings.showAttachments && !edge.path && attachmentByName.has(edge.target)) link(note.path, 'attachment:' + attachmentByName.get(edge.target));
    else if (!edge.path && !settings.hideUnresolved && edge.target) {
     const id = 'unresolved:' + edge.target;
     add(id, { id, label: edge.target, type: 'unresolved', tags: [], target: edge.target });
     link(note.path, id);
    }
   }
   if (settings.showTags) for (const tag of note.tags || []) {
    const id = 'tag:' + tag;
    add(id, { id, label: tag, type: 'tag', tags: [tag] });
    link(note.path, id);
   }
  }
  if (settings.showAttachments) for (const file of attachments) {
   const id = 'attachment:' + file.path;
   add(id, { id, label: file.path.split('/').pop(), type: 'attachment', tags: [] });
  }
  let ids = [...nodes.keys()];
  let edges = directed.filter(([source, target]) => nodes.has(source) && nodes.has(target));
  if (input.local) {
   const center = input.current;
   if (!center || !nodes.has(center)) return { items: [], links: [], directed: [], key: 'local-empty' };
   const outgoing = new Map(), incoming = new Map();
   for (const [source, target] of edges) {
    if (!outgoing.has(source)) outgoing.set(source, []);
    if (!incoming.has(target)) incoming.set(target, []);
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
   }
   const included = new Set([center]);
   const kept = new Set();
   const remember = (source, target) => kept.add(source < target ? source + '\0' + target : target + '\0' + source);
   for (let depth = 0; depth < settings.depth; depth++) {
    const found = [];
    for (const id of included) {
     if (nodes.get(id).type === 'tag') continue;
     if (settings.outgoing) for (const next of outgoing.get(id) || []) if (!included.has(next)) found.push([id, next]);
     if (settings.incoming) for (const prev of incoming.get(id) || []) if (!included.has(prev)) found.push([prev, id]);
    }
    for (const [source, target] of found) { included.add(source); included.add(target); remember(source, target); }
   }
   if (settings.neighborLinks) for (const [source, target] of edges) if (included.has(source) && included.has(target)) remember(source, target);
   ids = [...included];
   edges = edges.filter(([source, target]) => kept.has(source < target ? source + '\0' + target : target + '\0' + source));
  }
  if (settings.query.trim()) {
   const allowed = new Set(ids.filter(id => matches(nodes.get(id), settings.query)));
   ids = ids.filter(id => allowed.has(id));
   edges = edges.filter(([source, target]) => allowed.has(source) && allowed.has(target));
  }
  if (!settings.showOrphans && !input.local) {
   const degree = new Map(ids.map(id => [id, 0]));
   for (const [source, target] of edges) if (degree.has(source) && degree.has(target) && source !== target) {
    degree.set(source, degree.get(source) + 1);
    degree.set(target, degree.get(target) + 1);
   }
   const kept = new Set(ids.filter(id => degree.get(id) > 0));
   ids = ids.filter(id => kept.has(id));
   edges = edges.filter(([source, target]) => kept.has(source) && kept.has(target));
  }
  const items = ids.map(id => nodes.get(id));
  const index = new Map(items.map((node, position) => [node.id, position]));
  const links = [];
  const seen = new Set();
  for (const [source, target] of edges) {
   const a = index.get(source), b = index.get(target);
   if (a == null || b == null || a === b) continue;
   const key = a < b ? a + ':' + b : b + ':' + a;
   if (seen.has(key)) continue;
   seen.add(key);
   links.push([a, b]);
  }
  const key = JSON.stringify([input.local, input.current, settings.query, settings.showTags, settings.showAttachments, settings.hideUnresolved, settings.showOrphans, settings.depth, settings.neighborLinks, settings.outgoing, settings.incoming, items.map(node => node.id), links]);
  return { items, links, directed: edges, key };
 }

 let model = null;
 let directed = [];
 let key = '';
 let fitted = false;
 let scale = 1;
 let panX = 0;
 let panY = 0;
 let highlight = null;
 let dragging = null;
 let panning = null;
 let frame = 0;
 let source = { notes: [], attachments: [], current: null, local: false, onOpen: () => {} };
 let canvas;
 let controls;
 let localSection;
 let built = false;

 function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
 }
 function colorsOf() {
  return {
   node: cssColor('--muted'),
   focused: cssColor('--accent'),
   line: cssColor('--border'),
   text: cssColor('--text'),
   tag: cssColor('--graph-tag'),
   attachment: cssColor('--graph-attachment'),
   unresolved: cssColor('--faint'),
   bg: cssColor('--bg'),
   highlight: cssColor('--accent')
  };
 }
 function groupColor(node) {
  for (const group of options.groups) if (group.query.trim() && matches(node, group.query)) return group.color;
  return null;
 }
 function nodeColor(node, palette, active) {
  return groupColor(node.item) || (active ? palette.focused : node.item.type === 'tag' ? palette.tag : node.item.type === 'attachment' ? palette.attachment : node.item.type === 'unresolved' ? palette.unresolved : node.item.id === source.current ? palette.focused : palette.node);
 }
 function related(id) {
  const ids = new Set([id]);
  for (const [sourceId, targetId] of directed) if (sourceId === id || targetId === id) { ids.add(sourceId); ids.add(targetId); }
  return ids;
 }
 function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  if (!fitted && rect.width > 2 && model?.nodes.length) fit();
  else draw();
 }
 function fit() {
  if (!model?.nodes.length || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const box = layout().bounds(model.nodes, 120);
  scale = Math.min(8, Math.max(0.05, Math.min(rect.width / box.width, rect.height / box.height)));
  panX = rect.width / 2 - (box.x + box.width / 2) * scale;
  panY = rect.height / 2 - (box.y + box.height / 2) * scale;
  fitted = true;
  draw();
 }
 function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left - panX) / scale, y: (event.clientY - rect.top - panY) / scale };
 }
 function hit(point) {
  const nodeScale = Math.sqrt(1 / scale);
  let found = null;
  let best = Infinity;
  for (const node of model?.nodes || []) {
   const radius = layout().nodeRadius(node.degree) * options.nodeSize * nodeScale + 4 / scale;
   const distance = Math.hypot(node.x - point.x, node.y - point.y);
   if (distance <= radius && distance < best) { best = distance; found = node; }
  }
  return found;
 }
 function draw() {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  const palette = colorsOf();
  const nodeScale = Math.sqrt(1 / Math.max(scale, 0.001));
  const textAlpha = Math.min(1, Math.max(0, Math.log2(scale) + 1 - options.textFade));
  const focus = highlight ? related(highlight.id) : null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.bg;
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(panX, panY);
  context.scale(scale, scale);
  context.lineWidth = Math.max(0.4, options.lineThickness) / scale;
  context.lineCap = 'round';
  const byId = model?.byId || new Map();
  for (const [sourceId, targetId] of directed) {
   const a = byId.get(sourceId), b = byId.get(targetId);
   if (!a || !b) continue;
   const dim = focus && !focus.has(sourceId) && !focus.has(targetId);
   context.globalAlpha = dim ? 0.12 : 0.85;
   context.strokeStyle = focus && focus.has(sourceId) && focus.has(targetId) ? palette.highlight : palette.line;
   context.beginPath();
   context.moveTo(a.x, a.y);
   context.lineTo(b.x, b.y);
   context.stroke();
   if (options.showArrows && scale >= 1) {
    const radius = layout().nodeRadius(b.degree) * options.nodeSize * nodeScale;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    const tipX = b.x - ux * (radius + 2), tipY = b.y - uy * (radius + 2);
    const size = 7 / scale;
    context.fillStyle = context.strokeStyle;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - ux * size - uy * size * 0.45, tipY - uy * size + ux * size * 0.45);
    context.lineTo(tipX - ux * size + uy * size * 0.45, tipY - uy * size - ux * size * 0.45);
    context.closePath();
    context.fill();
   }
  }
  for (const node of model?.nodes || []) {
   const dim = focus && !focus.has(node.id);
   const radius = layout().nodeRadius(node.degree) * options.nodeSize * nodeScale;
   context.globalAlpha = dim ? 0.15 : node.item.type === 'unresolved' ? 0.55 : 1;
   context.fillStyle = nodeColor(node, palette, focus?.has(node.id) && highlight?.id === node.id);
   context.beginPath();
   context.arc(node.x, node.y, radius, 0, Math.PI * 2);
   context.fill();
   const labelAlpha = Math.max(textAlpha, focus?.has(node.id) ? 1 : 0);
   if (labelAlpha > 0.02) {
    context.globalAlpha = dim ? labelAlpha * 0.2 : labelAlpha;
    context.fillStyle = palette.text;
    context.font = `${Math.max(10, 12 * nodeScale)}px "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText(node.item.label || node.id, node.x, node.y + radius + 4);
   }
  }
  context.restore();
  if (source.local && !source.current) {
   context.globalAlpha = 1;
   context.fillStyle = palette.text;
   context.font = '14px "Segoe UI", sans-serif';
   context.textAlign = 'center';
   context.textBaseline = 'middle';
   context.fillText('Open a note to see its local graph.', width / 2, height / 2);
  }
 }
 function pump() {
  if (frame) return;
  const loop = () => {
   const physics = forceOptions();
   const moving = !!dragging || (!!model && model.alpha > Math.max(model.alphaTarget, layout().alphaMin) + 1e-4);
   if (model && (dragging || model.alpha > layout().alphaMin)) layout().step(model, physics);
   draw();
   frame = moving ? requestAnimationFrame(loop) : 0;
  };
  frame = requestAnimationFrame(loop);
 }
 function reheat() {
  if (!model) return;
  model.alpha = Math.max(model.alpha, 0.3);
  model.alphaTarget = 0;
  pump();
 }
 function syncGraph() {
  const spec = collect(source, options);
  if (!model) model = layout().create();
  if (spec.key === key) { draw(); return; }
  key = spec.key;
  directed = spec.directed;
  const fresh = !model.nodes.length;
  layout().sync(model, spec.items, spec.links);
  if (fresh && model.nodes.length) { fitted = false; fit(); }
  if (model.alpha > layout().alphaMin) pump();
  else draw();
 }
 function iconButton(name, label, action) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'graph-icon-button';
  el.innerHTML = window.icon(name);
  el.setAttribute('aria-label', label);
  el.dataset.tooltip = label;
  el.onclick = action;
  return el;
 }
 function section(title) {
  const block = document.createElement('section');
  block.className = 'graph-control-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const body = document.createElement('div');
  block.append(heading, body);
  return { block, body };
 }
 function toggle(label, title, checked, onChange) {
  const row = document.createElement('label');
  row.className = 'graph-toggle';
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', label);
  if (title) row.dataset.tooltip = title;
  input.onchange = () => onChange(input.checked);
  row.append(text, input);
  return row;
 }
 function slider(label, min, max, step, value, onChange) {
  const row = document.createElement('label');
  row.className = 'graph-slider';
  const text = document.createElement('span');
  const name = document.createElement('span');
  name.textContent = label;
  const output = document.createElement('output');
  output.textContent = String(value);
  text.append(name, output);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute('aria-label', label);
  input.oninput = () => { output.textContent = input.value; onChange(Number(input.value)); };
  row.append(text, input);
  return row;
 }
 function renderGroups(body) {
  body.replaceChildren();
  options.groups.forEach((group, index) => {
   const row = document.createElement('div');
   row.className = 'graph-group';
   const color = document.createElement('input');
   color.type = 'color';
   color.value = group.color;
   color.setAttribute('aria-label', 'Group color');
   color.oninput = () => { group.color = color.value; draw(); };
   const query = document.createElement('input');
   query.type = 'text';
   query.placeholder = 'Enter query…';
   query.value = group.query;
   query.setAttribute('aria-label', 'Group query');
   query.oninput = () => { group.query = query.value; draw(); };
   const remove = iconButton('x', 'Delete group', () => { options.groups.splice(index, 1); renderGroups(body); draw(); });
   row.append(color, query, remove);
   body.append(row);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'graph-new-group';
  add.textContent = 'New group';
  add.onclick = () => { options.groups.push({ query: '', color: groupColors[options.groups.length % groupColors.length] }); renderGroups(body); };
  body.append(add);
 }
 function buildControls() {
  controls.replaceChildren();
  controls.classList.toggle('is-close', false);
  const bar = document.createElement('div');
  bar.className = 'graph-control-bar';
  const collapse = iconButton('x', 'Close graph settings', () => { controls.classList.add('is-close'); draw(); });
  collapse.classList.add('mod-close');
  const reset = iconButton('rotate-ccw', 'Reset view', () => fit());
  reset.classList.add('mod-reset');
  const open = iconButton('sliders-horizontal', 'Open graph settings', () => controls.classList.remove('is-close'));
  open.classList.add('mod-open');
  bar.append(reset, collapse, open);
  const filters = section('Filters');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search files…';
  search.setAttribute('aria-label', 'Search files');
  search.value = options.query;
  search.oninput = () => { options.query = search.value; syncGraph(); };
  filters.body.append(search);
  localSection = document.createElement('div');
  localSection.append(
   slider('Depth', 1, 5, 1, options.depth, value => { options.depth = value; syncGraph(); }),
   toggle('Outgoing links', 'Show links to other files', options.outgoing, value => { options.outgoing = value; syncGraph(); }),
   toggle('Incoming links', 'Show links from other files', options.incoming, value => { options.incoming = value; syncGraph(); }),
   toggle('Neighbor links', 'Show links between neighbors', options.neighborLinks, value => { options.neighborLinks = value; syncGraph(); })
  );
  localSection.hidden = !source.local;
  filters.body.append(
   localSection,
   toggle('Tags', 'Tags are linked to the files that contain them', options.showTags, value => { options.showTags = value; syncGraph(); }),
   toggle('Attachments', 'Show files that are not notes', options.showAttachments, value => { options.showAttachments = value; syncGraph(); }),
   toggle('Existing files only', 'Hide links to notes that have not been created', options.hideUnresolved, value => { options.hideUnresolved = value; syncGraph(); }),
   toggle('Orphans', 'Show files that are not linked to any other file', options.showOrphans, value => { options.showOrphans = value; syncGraph(); })
  );
  filters.body.lastElementChild.classList.add('graph-orphans');
  const groups = section('Groups');
  renderGroups(groups.body);
  const display = section('Display');
  const animate = document.createElement('button');
  animate.type = 'button';
  animate.className = 'graph-animate';
  animate.textContent = 'Animate';
  animate.onclick = () => { if (!model) return; layout().replay(model); model.alphaTarget = 0; pump(); };
  display.body.append(
   toggle('Arrows', 'Show arrows when zoomed in', options.showArrows, value => { options.showArrows = value; draw(); }),
   slider('Text fade threshold', -3, 3, 0.1, options.textFade, value => { options.textFade = value; draw(); }),
   slider('Node size', 0.1, 5, 0.1, options.nodeSize, value => { options.nodeSize = value; draw(); }),
   slider('Link thickness', 0.1, 5, 0.1, options.lineThickness, value => { options.lineThickness = value; draw(); }),
   animate
  );
  const forces = section('Forces');
  forces.body.append(
   slider('Center force', 0, 1, 0.01, options.center, value => { options.center = value; reheat(); }),
   slider('Repel force', 0, 20, 0.1, options.repel, value => { options.repel = value; reheat(); }),
   slider('Link force', 0, 1, 0.01, options.link, value => { options.link = value; reheat(); }),
   slider('Link distance', 30, 500, 1, options.distance, value => { options.distance = value; reheat(); })
  );
  controls.append(bar, filters.block, groups.block, display.block, forces.block);
 }
 function bindCanvas() {
  canvas.addEventListener('wheel', event => {
   event.preventDefault();
   const rect = canvas.getBoundingClientRect();
   const mouseX = event.clientX - rect.left, mouseY = event.clientY - rect.top;
   const worldX = (mouseX - panX) / scale, worldY = (mouseY - panY) / scale;
   scale = Math.min(8, Math.max(0.05, scale * (event.deltaY > 0 ? 0.9 : 1.1)));
   panX = mouseX - worldX * scale;
   panY = mouseY - worldY * scale;
   draw();
  }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
   const point = worldPoint(event);
   const node = hit(point);
   canvas.setPointerCapture(event.pointerId);
   if (node) {
    dragging = { node, moved: false, x: event.clientX, y: event.clientY };
    node.fx = node.x; node.fy = node.y;
    if (model) { model.alpha = Math.max(model.alpha, 0.3); model.alphaTarget = 0.3; }
    pump();
   } else panning = { x: event.clientX, y: event.clientY, panX, panY };
  });
  canvas.addEventListener('pointermove', event => {
   if (dragging) {
    if ((event.clientX - dragging.x) ** 2 + (event.clientY - dragging.y) ** 2 > 25) dragging.moved = true;
    const point = worldPoint(event);
    dragging.node.fx = point.x;
    dragging.node.fy = point.y;
    return;
   }
   if (panning) {
    panX = panning.panX + event.clientX - panning.x;
    panY = panning.panY + event.clientY - panning.y;
    draw();
    return;
   }
   const next = hit(worldPoint(event));
   if (next?.id !== highlight?.id) { highlight = next; draw(); }
  });
  const release = event => {
   if (dragging) {
    const node = dragging.node;
    const moved = dragging.moved;
    node.fx = null; node.fy = null;
    dragging = null;
    if (model) model.alphaTarget = 0;
    pump();
    if (!moved && node.item.type !== 'attachment') source.onOpen(node.item);
   }
   panning = null;
   if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!dragging) { highlight = null; draw(); } });
  new ResizeObserver(resize).observe(canvas);
 }
 function ensure() {
  if (built) return;
  canvas = document.getElementById('graphCanvas');
  controls = document.getElementById('graphControls');
  if (!canvas || !controls) return;
  buildControls();
  bindCanvas();
  resize();
  built = true;
 }
 function render(input) {
  ensure();
  const localChanged = source.local !== !!input.local;
  source = input;
  if (localSection) localSection.hidden = !source.local;
  controls?.querySelector('.graph-orphans')?.toggleAttribute('hidden', !!source.local);
  if (localChanged) key = '';
  syncGraph();
 }

 window.SlateGraphView = { render, collect, sliderStrength, repelCharge };
})();
