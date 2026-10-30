/* Original native task support. No plugin code is loaded or evaluated. */
(function (root) {
  'use strict';
  const fields = { '📅': 'due', '⏳': 'scheduled', '🛫': 'start', '➕': 'created', '✅': 'done' };
  const priorities = { '🔺': 'highest', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest' };
  const priorityOrder = ['highest', 'high', 'medium', 'normal', 'low', 'lowest'];
  const taskPattern = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([^\]])(\])(?:[ \t]+(.*)|[ \t]*)$/;
  const datesPattern = /(📅|⏳|🛫|➕|✅)\uFE0F?[ \t]*(\d{4}-\d{2}-\d{2})(?![\d-])/gu;
  const dateKeys = ['due', 'scheduled', 'start', 'created', 'done'];
  function today() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function requireDate(value) { if (!validDate(value)) throw new Error('Expected a valid date in YYYY-MM-DD format.'); return value; }
  function dateNumber(value) { return Date.parse(requireDate(value) + 'T12:00:00Z'); }
  function addDays(value, count) { return new Date(dateNumber(value) + count * 86400000).toISOString().slice(0, 10); }
  function advance(value, count, unit) {
    const d = new Date(dateNumber(value));
    if (unit === 'day' || unit === 'week') return addDays(value, count * (unit === 'week' ? 7 : 1));
    const day = d.getUTCDate(); d.setUTCDate(1);
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + count); else d.setUTCFullYear(d.getUTCFullYear() + count);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
  }
  // Transform visible prose only; metadata in inline-code spans stays literal.
  function outsideCode(text, transform) {
    const code = /(`+)[\s\S]*?\1|<!--[\s\S]*?(?:-->|$)/g; let output = '', start = 0;
    for (const match of text.matchAll(code)) { output += transform(text.slice(start, match.index)) + match[0]; start = match.index + match[0].length; }
    return output + transform(text.slice(start));
  }
  function proseOnly(text) { return outsideCode(text, part => part).replace(/(`+)[\s\S]*?\1/g, ''); }
  function recurrenceOf(prose) {
    const marker = prose.indexOf('🔁'); if (marker < 0) return null;
    const tail = prose.slice(marker + '🔁'.length).replace(/^\uFE0F?\s*/, '');
    const end = tail.search(/📅|⏳|🛫|➕|✅|🔺|⏫|🔼|🔽|⏬|(?:^|\s)#[\p{L}\p{N}_/]|\s\^[\w-]+(?:\s|$)/u);
    return (end < 0 ? tail : tail.slice(0, end)).trim() || null;
  }
  function stripMetadata(text) {
    return outsideCode(text, part => part.replace(datesPattern, '').replace(/(?:🔺|⏫|🔼|🔽|⏬)\uFE0F?/gu, '').replace(/🔁\uFE0F?\s*[^📅⏳🛫➕✅🔺⏫🔼🔽⏬#^]*/gu, '')).replace(/[ \t]{2,}/g, ' ').trim();
  }
  function parseTasks(notes) {
    const tasks = [];
    for (const note of Array.isArray(notes) ? notes : []) {
      if (!note || typeof note.content !== 'string' || typeof note.path !== 'string') continue;
      const lines = note.content.split(/\r?\n/); let fence = null, frontmatter = false, comment = false, heading = '';
      for (let index = 0; index < lines.length; index++) {
        const raw = lines[index];
        if (index === 0 && /^\uFEFF?---\s*$/.test(raw)) { frontmatter = true; continue; }
        if (frontmatter) { if (/^(?:---|\.\.\.)\s*$/.test(raw)) frontmatter = false; continue; }
        if (fence) {
          const closing = raw.match(/^\s*(?:>\s*)*(`{3,}|~{3,})\s*$/);
          if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
          continue;
        }
        let visible = '', cursor = 0;
        while (cursor < raw.length) {
          if (comment) { const end = raw.indexOf('-->', cursor); if (end < 0) { cursor = raw.length; break; } comment = false; cursor = end + 3; }
          else { const begin = raw.indexOf('<!--', cursor); if (begin < 0) { visible += raw.slice(cursor); break; } visible += raw.slice(cursor, begin); comment = true; cursor = begin + 4; }
        }
        const fenced = visible.match(/^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/);
        if (fenced) {
          if (!fence) fence = { char: fenced[1][0], length: fenced[1].length };
          else if (fenced[1][0] === fence.char && fenced[1].length >= fence.length && !fenced[2].trim()) fence = null;
          continue;
        }
        if (fence) continue;
        const header = visible.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/); if (header) heading = header[1];
        const match = visible.match(taskPattern); if (!match) continue;
        const description = match[4] || '', prose = proseOnly(description);
        const task = { path: note.path, line: index + 1, raw, text: stripMetadata(description), status: match[2], completed: /x/i.test(match[2]), due: null, scheduled: null, start: null, created: null, done: null, priority: 'normal', recurrence: recurrenceOf(prose), tags: [], invalidDates: [] };
        task.heading = heading;
        task.filename = note.path.split('/').pop().replace(/\.md$/i, '');
        for (const date of prose.matchAll(datesPattern)) { const key = fields[date[1]]; task[key] = date[2]; if (!validDate(date[2])) task.invalidDates.push(key); }
        for (const symbol of Object.keys(priorities)) if (prose.includes(symbol)) { task.priority = priorities[symbol]; break; }
        task.tags = [...new Set([...prose.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map(m => '#' + m[1]))];
        tasks.push(task);
      }
    }
    return tasks;
  }
  function relativeDate(value, base) {
    const lower = value.toLowerCase();
    if (lower === 'today') return base;
    if (lower === 'tomorrow') return addDays(base, 1);
    if (lower === 'yesterday') return addDays(base, -1);
    const offset = lower.match(/^(?:in )?([+-]?\d+) (day|week)s?( ago)?$/);
    if (offset) return addDays(base, Number(offset[1]) * (offset[2] === 'week' ? 7 : 1) * (offset[3] ? -1 : 1));
    return validDate(value) ? value : null;
  }
  function query(tasks, instructions, todayISO) {
    const errors = [], predicates = [], sorts = [], grouping = [], hidden = []; let limit = Infinity, explain = false;
    const base = todayISO || today();
    if (!validDate(base)) return { tasks: [], groups: [], errors: ['Invalid reference date.'], hidden };
    const source = String(instructions || '').trim().replace(/^```tasks\s*\n/i, '').replace(/\n```\s*$/, '');
    const lines = source.split(/\r?\n/);
    const fail = (i, line) => errors.push('Line ' + (i + 1) + ': Unsupported task instruction: ' + line);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim(); if (!line || /^#/.test(line)) continue;
      const lower = line.toLowerCase(); let match;
      if (lower === 'explain') { explain = true; continue; }
      if (line.startsWith('(') || /^NOT\s/i.test(line)) {
        try { predicates.push(booleanFilter(line,base)); } catch(e) { errors.push('Line '+(i+1)+': '+e.message); } continue;
      }
      if (lower === 'done' || lower === 'not done') { predicates.push(t => lower === 'done' ? t.completed : !t.completed); continue; }
      if ((match = lower.match(/^(no|has) (due|scheduled|start|created|done) date$/))) { const [,kind,key] = match; predicates.push(t => kind === 'no' ? !t[key] : Boolean(t[key])); continue; }
      if ((match = lower.match(/^(due|scheduled|starts?|created|done|happens)(?: (on or before|on or after|before|after|on))? (today|tomorrow|yesterday|\d{4}-\d{2}-\d{2}|(?:in )?[+-]?\d+ (?:day|week)s?(?: ago)?)$/))) {
        let [,key,op,value] = match; if (key === 'starts') key = 'start'; op = op || 'on'; const target = relativeDate(value, base);
        if (!target) { errors.push('Line ' + (i + 1) + ': Invalid date: ' + value); continue; }
        predicates.push(t => { const matches = d => validDate(d) && (op === 'before' ? d < target : op === 'after' ? d > target : op === 'on or before' ? d <= target : op === 'on or after' ? d >= target : d === target); return key === 'happens' ? [t.start,t.scheduled,t.due].some(matches) : key === 'start' && !t.start ? true : matches(t[key]); }); continue;
      }
      if ((match = lower.match(/^(due|scheduled|start|created|done) date is invalid$/))) { const key = match[1]; predicates.push(t => Boolean(t[key]) && !validDate(t[key])); continue; }
      if ((match = line.match(/^(path|filename|heading|description|tags?) (includes?|does not include) (.+)$/i))) {
        const key = match[1].toLowerCase(), exclude = match[2].toLowerCase() === 'does not include';
        const value = match[3].replace(/^"(.*)"$/, '$1').toLowerCase();
        predicates.push(t => { const found = key.startsWith('tag') ? t.tags.some(tag => tag.toLowerCase().includes(value.startsWith('#') ? value : '#' + value)) : String(key === 'description' ? t.text : t[key] || '').toLowerCase().includes(value); return exclude ? !found : found; }); continue;
      }
      if ((match = lower.match(/^priority (?:is )?(?:(above|below) )?(highest|high|medium|normal|none|low|lowest)$/))) {
        const relation = match[1], level = priorityOrder.indexOf(match[2] === 'none' ? 'normal' : match[2]);
        predicates.push(t => { const p = priorityOrder.indexOf(t.priority); return relation === 'above' ? p < level : relation === 'below' ? p > level : p === level; }); continue;
      }
      if (lower === 'is recurring' || lower === 'is not recurring') { predicates.push(t => lower === 'is recurring' ? Boolean(t.recurrence) : !t.recurrence); continue; }
      if ((match = lower.match(/^sort by (due|scheduled|start|created|done|priority|path|filename|heading|description|status)(?: (reverse))?$/))) { sorts.push({ key: match[1], reverse: Boolean(match[2]) }); continue; }
      if ((match = lower.match(/^group by (path|filename|heading|status|due|scheduled|start|created|done|priority|folder)$/))) { grouping.push(match[1]); continue; }
      if ((match = lower.match(/^limit(?: to)? (\d+)(?: tasks?)?$/))) { const parsed = Number(match[1]); if (parsed > 100000) errors.push('Line ' + (i + 1) + ': Task limit exceeds 100000.'); else limit = Math.min(limit, parsed); continue; }
      if ((match = lower.match(/^hide (due date|scheduled date|start date|created date|done date|priority|recurrence rule|tags|backlinks|task count|edit button|postpone button|toolbar)$/))) { hidden.push(match[1]); continue; }
      fail(i, line);
    }
    // Fail closed: an unsupported filter must not accidentally broaden a query.
    if (errors.length) return { tasks: [], groups: [], errors, hidden };
    let result = (Array.isArray(tasks) ? tasks : []).filter(t => predicates.every(fn => fn(t)));
    const dateCompare = (a,b) => { const rank = value => !value ? 2 : validDate(value) ? 1 : 0; return rank(a) - rank(b) || String(a || '').localeCompare(String(b || '')); };
    const compare = (a,b,key) => dateKeys.includes(key) ? dateCompare(a[key],b[key]) : key === 'priority' ? priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) : key === 'status' ? Number(a.completed) - Number(b.completed) : String(key === 'description' ? a.text : a[key]).localeCompare(String(key === 'description' ? b.text : b[key]));
    result.sort((a,b) => { for (const sort of [...sorts,{key:'status'},{key:'due'},{key:'priority'}]) { const order = compare(a,b,sort.key); if (order) return sort.reverse ? -order : order; } return a.path.localeCompare(b.path) || a.line - b.line; });
    result = result.slice(0, limit);
    const groups = [];
    if (grouping.length) {
      const buckets = new Map();
      for (const task of result) { const names = grouping.map(key => key === 'status' ? task.completed ? 'Done' : 'Todo' : dateKeys.includes(key) ? task[key] || 'No ' + key + ' date' : key === 'folder' ? task.path.includes('/') ? task.path.slice(0, task.path.lastIndexOf('/')) : '(root)' : task[key] || '(none)'); const name = names.join(' / '); if (!buckets.has(name)) buckets.set(name, []); buckets.get(name).push(task); }
      for (const [name, grouped] of [...buckets].sort(([a],[b]) => a.localeCompare(b))) groups.push({ name, tasks: grouped });
    }
    return { tasks: result, groups, errors, hidden, explanation: explain ? lines.filter(line => line.trim() && !/^\s*#/.test(line) && line.trim() !== 'explain').join('\n') || 'All tasks' : '' };
  }
  function booleanFilter(expression,base,depth=0) {
    if(depth>30)throw new Error('Boolean filter is too deeply nested.');
    let text=expression.trim(),level=0,outer=true;
    for(let i=0;i<text.length;i++){if(text[i]==='(')level++;if(text[i]===')')level--;if(level<0)throw new Error('Unbalanced filter parentheses.');if(level===0&&i<text.length-1)outer=false;}
    if(level!==0)throw new Error('Unbalanced filter parentheses.');
    if(text[0]==='('&&outer)return booleanFilter(text.slice(1,-1),base,depth+1);
    for(const op of ['OR','AND']){level=0;for(let i=0;i<text.length;i++){if(text[i]==='(')level++;if(text[i]===')')level--;const token=' '+op+' ';if(level===0&&text.slice(i,i+token.length).toUpperCase()===token){const left=booleanFilter(text.slice(0,i),base,depth+1),right=booleanFilter(text.slice(i+token.length),base,depth+1);return t=>op==='OR'?left(t)||right(t):left(t)&&right(t);}}}
    if(/^NOT\s/i.test(text)){const inner=booleanFilter(text.slice(4),base,depth+1);return t=>!inner(t);}
    if(text.startsWith('('))throw new Error('Expected AND or OR between filter groups.');
    if(!text||/^(sort|group|limit|hide|explain|#)/i.test(text))throw new Error('Expected a task filter.');
    const check=query([],text,base);if(check.errors.length)throw new Error(check.errors.join(' '));
    return t=>query([t],text,base).tasks.length>0;
  }
  function nextOccurrence(ruleText, reference, base) {
    const whenDone = / when done$/i.test(ruleText);
    const rule = ruleText.toLowerCase().replace(/ when done$/i, '').trim();
    const anchor = whenDone ? base : reference || base;
    let match = rule.match(/^every (?:([1-9]\d*) )?(day|week|month|year)s?$/);
    if (match) { const count = Number(match[1] || 1); if (count > 1000) throw new Error('Recurrence interval exceeds 1000.'); return advance(anchor, count, match[2]); }
    const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    match = rule.match(/^every (?:(?:week on )?((?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:,\s*(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))*)|weekday)$/);
    if (match) {
      const days = match[1] ? match[1].split(/,\s*/).map(day => weekdays.indexOf(day)) : [1,2,3,4,5];
      for (let i = 1; i <= 7; i++) { const next = addDays(anchor, i); if (days.includes(new Date(dateNumber(next)).getUTCDay())) return next; }
    }
    match = rule.match(/^every (?:([1-9]\d*) )?months? on the (last|\d{1,2}(?:st|nd|rd|th))$/);
    if (match) {
      const count = Number(match[1] || 1), day = match[2] === 'last' ? null : parseInt(match[2],10);
      if (count > 1000 || (day !== null && (day < 1 || day > 31))) throw new Error('Invalid monthly recurrence.');
      const d = new Date(dateNumber(anchor)); d.setUTCDate(1);
      // An explicit day skips months where that day does not exist.
      for (let i = 0; i < 4800; i++) {
        const last = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
        d.setUTCDate(day === null ? last : Math.min(day,last));
        const next = d.toISOString().slice(0,10);
        if ((day === null || day <= last) && next > anchor) return next;
        d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+count);
      }
    }
    throw new Error('Unsupported recurrence rule: ' + ruleText + '. Supported: every N days/weeks/months/years, every weekday, every Friday, every week on Tuesday, Friday, and every month on the last/1st (optionally when done).');
  }
  function editTask(task, values) {
    const match = task.raw.match(taskPattern); if (!match) throw new Error('Task source line is required.');
    let text = String(values.text || '').trim(); if (!text || /[\r\n]/.test(text)) throw new Error('Enter a task on one line.');
    for(const token of (match[4]||'').matchAll(/(`+)[\s\S]*?\1|<!--[\s\S]*?(?:-->|$)/g))if(token[0].startsWith('<!--')&&!text.includes(token[0]))text+=' '+token[0];
    const suffix = text.match(/(?:\s+\^[\w-]+)?\s*<!--[\s\S]*$|\s+\^[\w-]+\s*$/);
    if (suffix) text = text.slice(0,suffix.index).trimEnd();
    let line = match[1] + match[2] + '] ' + text;
    const priority = values.priority || 'normal';
    if (!priorityOrder.includes(priority)) throw new Error('Invalid priority.');
    const symbol = Object.keys(priorities).find(key => priorities[key] === priority);
    if (symbol) line += ' ' + symbol;
    if (values.recurrence) {
      if (!values.due && !values.scheduled && !values.start) throw new Error('A recurring task needs a due, scheduled or start date.');
      nextOccurrence(values.recurrence, values.due || values.scheduled || values.start, today());
      line += ' 🔁 ' + values.recurrence.trim();
    }
    for (const [marker,key] of Object.entries(fields)) { const value = Object.hasOwn(values,key) ? values[key] : task[key]; if (value) line += ' ' + marker + ' ' + requireDate(value); }
    // The editor keeps literal comments and block IDs in the description; put metadata before them.
    if (suffix) line += suffix[0];
    return line;
  }
  function applyTaskChange(content, task, result) {
    const eol = content.includes('\r\n') ? '\r\n' : '\n', lines = content.split(/\r?\n/);
    if (lines[task.line-1] !== task.raw) throw new Error('This task moved or changed. Refresh and try again.');
    lines.splice(task.line-1, 1, ...(result.nextLine ? [result.nextLine, result.completedLine] : [result.completedLine]));
    return lines.join(eol);
  }
  function complete(task, todayISO, completed) {
    const base = requireDate(todayISO || today());
    if (!task || typeof task.raw !== 'string') throw new Error('Task source line is required.');
    const match = task.raw.match(taskPattern); if (!match) throw new Error('Task source line is no longer a Markdown checkbox.');
    const wasDone = /x/i.test(match[2]); const markDone = completed === undefined ? !wasDone : Boolean(completed);
    if (wasDone === markDone) return { completedLine: task.raw, warnings: [] };
    const removeDone = line => outsideCode(line, part => part.replace(/[ \t]*✅\uFE0F?[ \t]*\d{4}-\d{2}-\d{2}/gu, '')).trimEnd();
    let line = removeDone(task.raw).replace(taskPattern, (_, prefix, status, closing, text) => prefix + (markDone ? 'x' : ' ') + closing + (text ? ' ' + text : ''));
    if (!markDone) return { completedLine: line, warnings: [] };
    // Keep completion metadata outside trailing comments and before a block ID.
    let commentIndex = -1;
    for (const token of line.matchAll(/(`+)[\s\S]*?\1|<!--/g)) if (token[0] === '<!--') { commentIndex = token.index; break; }
    const commentTail = commentIndex >= 0 ? line.slice(commentIndex) : '';
    if (commentIndex >= 0) line = line.slice(0, commentIndex).trimEnd();
    const block = line.match(/[ \t]+\^[\w-]+[ \t]*$/);
    if (block) line = line.slice(0, block.index).trimEnd() + ' ✅ ' + base + block[0]; else line += ' ✅ ' + base;
    if (commentTail) line += ' ' + commentTail;
    let nextLine;
    if (task.recurrence) {
      if ((task.invalidDates || []).some(key => ['due','scheduled','start'].includes(key))) throw new Error('Fix invalid task dates before completing a recurring task.');
      const reference = task.due || task.scheduled || task.start;
      let shift = null;
      const next = nextOccurrence(task.recurrence, reference, base);
      if (reference) { requireDate(reference); shift = Math.round((dateNumber(next) - dateNumber(reference)) / 86400000); }
      nextLine = removeDone(task.raw).replace(taskPattern, (_, prefix, status, closing, text) => prefix + ' ' + closing + (text ? ' ' + text : ''));
      // IDs identify one occurrence only. The next recurrence gets no old block ID.
      nextLine = outsideCode(nextLine,part=>part.replace(/[ \t]+\^[\w-]+(?=[ \t]*$)/g,''));
      nextLine = outsideCode(nextLine, part => part.replace(datesPattern, (full, symbol, date) => fields[symbol] === 'created' ? symbol + ' ' + base : ['due','scheduled','start'].includes(fields[symbol]) && shift !== null ? symbol + ' ' + addDays(date, shift) : full));
    }
    return { completedLine: line, ...(nextLine ? { nextLine } : {}), warnings: [] };
  }
  function completionEdits(task, completed, todayISO) {
    const result = complete(task, todayISO, completed);
    const edits = [{ line: task.line, oldLine: task.raw, newLine: result.completedLine }];
    if (result.nextLine) edits.push({ insertBeforeLine: task.line, text: result.nextLine });
    return edits;
  }
  root.SlateTasks = Object.freeze({ parseTasks, query, complete, completionEdits, applyTaskChange, editTask, nextOccurrence, today });
})(globalThis);
