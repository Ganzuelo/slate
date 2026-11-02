import { EditorState, EditorSelection, Compartment, StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, drawSelection, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { syntaxHighlighting, indentUnit, syntaxTree } from '@codemirror/language';
import { tags as t, tagHighlighter, highlightCode } from '@lezer/highlight';
import { autocompletion, acceptCompletion } from '@codemirror/autocomplete';
import { mergeNote } from '../note-merge.mjs';

window.SlateNoteMerge = mergeNote;

// Token classes are colored by theme tokens in editor.css, so links and code
// stay legible in both light and dark themes. CodeMirror's defaultHighlightStyle
// hard-codes colors meant for light backgrounds (URLs render near-black on dark).
const slateHighlighter = tagHighlighter([
  { tag: [t.link, t.url], class: 'tok-link' },
  { tag: t.heading, class: 'tok-heading' },
  { tag: t.emphasis, class: 'tok-emphasis' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.strikethrough, class: 'tok-strike' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], class: 'tok-meta' },
  { tag: t.monospace, class: 'tok-monospace' },
  { tag: t.labelName, class: 'tok-label' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: [t.controlKeyword, t.moduleKeyword], class: 'tok-control' },
  { tag: [t.keyword, t.self, t.null, t.bool], class: 'tok-keyword' },
  { tag: [t.string, t.attributeValue, t.special(t.string)], class: 'tok-string' },
  { tag: [t.regexp, t.escape], class: 'tok-regexp' },
  { tag: [t.number, t.unit], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: [t.constant(t.variableName), t.atom, t.color], class: 'tok-constant' },
  { tag: [t.variableName, t.propertyName], class: 'tok-variable' },
  { tag: t.tagName, class: 'tok-tag' },
  { tag: t.attributeName, class: 'tok-attribute' },
  { tag: t.angleBracket, class: 'tok-bracket' },
  { tag: t.invalid, class: 'tok-invalid' },
]);

const codeLanguage = (() => {
  const js = javascript().language, jsx = javascript({ jsx: true }).language;
  const ts = javascript({ typescript: true }).language, tsx = javascript({ jsx: true, typescript: true }).language;
  const style = css().language, markup = html().language;
  const languages = { js, javascript: js, mjs: js, cjs: js, json: js, jsonc: js, jsx, ts, typescript: ts, mts: ts, cts: ts, tsx, css: style, html: markup, htm: markup, svg: markup, xml: markup };
  return info => languages[String(info || '').trim().split(/\s+/)[0].toLowerCase()] || null;
})();

function highlight(code, info) {
  const language = codeLanguage(info);
  if (!language) return null;
  const fragment = document.createDocumentFragment();
  highlightCode(String(code), language.parser.parse(String(code)), slateHighlighter, (text, classes) => {
    if (!classes) { fragment.append(text); return; }
    const span = document.createElement('span'); span.className = classes; span.textContent = text; fragment.append(span);
  }, () => fragment.append('\n'));
  return fragment;
}

function wikiCompletions(options) {
  return context => {
    const { state, pos } = context, links = window.SlateWikiLinks;
    if (!links || !state.selection.main.empty || state.selection.ranges.length !== 1) return null;
    const text = state.doc.toString(), range = links.context(text, pos);
    if (!range) return null;
    const matches = links.suggestions(options.getNotes?.() || [], range.query, options.getCurrentPath?.());
    return { from: range.from, to: pos, filter: false, options: matches.map(item => ({
      label: item.label, detail: item.path,
      apply(view, completion, from, to) {
        const change = links.replacement(view.state.doc.toString(), { from, to }, item.target);
        view.dispatch({ changes: change, selection: { anchor: change.from + change.insert.length }, userEvent: 'input.complete', scrollIntoView: true });
      },
    })) };
  };
}
class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const span = document.createElement('span'); span.className = 'cm-slate-bullet'; span.textContent = '•'; return span; }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, at, line, onToggleTask) { super(); this.checked = checked; this.at = at; this.line = line; this.onToggleTask = onToggleTask; }
  eq(other) { return this.checked === other.checked && this.at === other.at && this.line === other.line && this.onToggleTask === other.onToggleTask; }
  toDOM(view) {
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = this.checked; input.className = 'cm-slate-task';
    input.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Complete task');
    input.addEventListener('change', () => {
      if (this.onToggleTask) { input.checked = this.checked; this.onToggleTask(this.line); }
      else view.dispatch({ changes: { from: this.at, to: this.at + 1, insert: input.checked ? 'x' : ' ' } });
    });
    return input;
  }
  ignoreEvent() { return true; }
}

class TaskControlsWidget extends WidgetType {
  constructor(line, raw, icon, onMetadata) { super(); Object.assign(this, {line, raw, icon, onMetadata}); }
  eq(other) { return this.line === other.line && this.raw === other.raw && this.icon === other.icon && this.onMetadata === other.onMetadata; }
  toDOM() {
    const task = window.SlateTasks?.parseTasks([{path: '', content: this.raw}])[0];
    const span = document.createElement('span'); span.className = 'task-inline-controls'; span.contentEditable = 'false';
    for (const kind of ['due', 'priority']) {
      const button = document.createElement('button'); button.type = 'button';
      const label = kind === 'due' ? (task?.due ? 'Due ' + task.due : 'Assign due date') : 'Urgency: ' + ({highest:'Urgent',normal:'None'}[task?.priority] || task?.priority || 'None');
      button.setAttribute('aria-label', label); button.dataset.tooltip = label;
      button.innerHTML = this.icon(kind === 'due' ? 'calendar-days' : 'priority-' + (task?.priority || 'normal'));
      if (kind === 'priority') { button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false'); }
      if (kind === 'due' && task?.due) { const value = document.createElement('span'); value.textContent = task.due; button.append(value); }
      button.onmousedown = event => event.preventDefault();
      button.onclick = event => { event.preventDefault(); this.onMetadata(this.line, this.raw, kind, event); };
      span.append(button);
    }
    return span;
  }
  ignoreEvent() { return true; }
}

// Add the description separator in the same undoable typing transaction.
function taskSpacing(tr) {
  if (!tr.isUserEvent('input.type') || !tr.docChanged || !tr.newSelection.main.empty || tr.newSelection.ranges.length !== 1) return tr;
  const pos = tr.newSelection.main.head, line = tr.newDoc.lineAt(pos);
  if (pos !== line.to || !/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)[ xX]\]$/.test(line.text)) return tr;
  if (fenceContexts(tr.newDoc).get(line.number)?.code) return tr;
  let closed = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => { if (toB === pos && inserted.toString().endsWith(']')) closed = true; });
  return closed ? [tr, {changes:{from:pos,insert:' '},selection:{anchor:pos+1},sequential:true}] : tr;
}

class ExternalLinkWidget extends WidgetType {
  constructor(icon) { super(); this.icon = icon; }
  eq(other) { return this.icon === other.icon; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'external-link-icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = this.icon('external-link');
    return span;
  }
}

async function writeClipboard(text) {
  if (window.slateDesktop?.writeClipboard) return window.slateDesktop.writeClipboard(text);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  throw new Error('Clipboard is unavailable');
}

function codeBlockText(doc, start) {
  const lines = [];
  for (let index = start + 1; index <= doc.lines; index++) {
    const text = doc.line(index).text;
    if (/^\s*(```|~~~)/.test(text)) break;
    lines.push(text);
  }
  return lines.join('\n');
}

function codeCopyButton(view, icon, start) {
  const button = document.createElement('button');
  const label = text => { button.setAttribute('aria-label', text); button.dataset.tooltip = text; };
  button.type = 'button'; button.className = 'code-copy cm-slate-code-copy'; button.innerHTML = icon('copy'); label('Copy code');
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', async () => {
    try { await writeClipboard(codeBlockText(view.state.doc, start)); }
    catch { label('Copy failed'); return; }
    button.innerHTML = icon('check'); label('Copied');
    clearTimeout(button.resetTimer);
    button.resetTimer = setTimeout(() => { button.innerHTML = icon('copy'); label('Copy code'); }, 1500);
  });
  return button;
}

class CodeLabelWidget extends WidgetType {
  constructor(lang, icon, start) { super(); this.lang = lang; this.icon = icon; this.start = start; }
  eq(other) { return this.lang === other.lang && this.icon === other.icon && this.start === other.start; }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-slate-code-header';
    if (this.lang) {
      const span = document.createElement('span');
      span.className = 'cm-slate-code-lang';
      span.textContent = this.lang;
      wrap.append(span);
    }
    if (this.icon) wrap.append(codeCopyButton(view, this.icon, this.start));
    return wrap;
  }
  ignoreEvent(event) { return !!event.target?.closest?.('.code-copy'); }
}

class CodeCopyWidget extends WidgetType {
  constructor(icon, start) { super(); this.icon = icon; this.start = start; }
  eq(other) { return this.icon === other.icon && this.start === other.start; }
  toDOM(view) { return codeCopyButton(view, this.icon, this.start); }
  ignoreEvent() { return true; }
}

function fenceContexts(doc) {
  let inCode = false, start = 0;
  const contexts = new Map();
  for (let index = 1; index <= doc.lines; index++) {
    const fence = doc.line(index).text.match(/^\s*(?:```|~~~)\s*([^\s`~]*)/);
    if (fence) {
      if (inCode) { contexts.set(index, { code: true, fence: 'end' }); contexts.get(start).closed = true; inCode = false; }
      else { contexts.set(index, { code: true, fence: 'start', lang: fence[1], closed: false }); start = index; inCode = true; }
    } else contexts.set(index, { code: inCode, fence: false });
  }
  return contexts;
}

function codeFenceTab(state) {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return null;
  const line = state.doc.lineAt(state.selection.main.head);
  const fences = fenceContexts(state.doc);
  const code = fences.get(line.number);
  if (!code || code.fence !== 'start') return null;
  if (line.number === state.doc.lines) {
    const marker = line.text.match(/^\s*(`{3,}|~{3,})/)[1];
    const indent = line.text.match(/^\s*/)[0];
    return { changes: { from: line.to, insert: '\n\n' + indent + marker }, selection: { anchor: line.to + 1 } };
  }
  const next = state.doc.line(line.number + 1);
  if (fences.get(next.number)?.fence === 'end') return { changes: { from: line.to, insert: '\n' }, selection: { anchor: line.to + 1 } };
  return { selection: { anchor: next.from } };
}

function enterCodeFence(view) {
  const next = codeFenceTab(view.state);
  if (!next) return false;
  view.dispatch({ ...next, scrollIntoView: true, userEvent: next.changes ? 'input' : 'select' });
  return true;
}

function liveDecorations(view, fenceState, onToggleTask, icon, onMetadata) {
  const decorations = [], visited = new Set(), selected = [];
  const queries=taskBlocks(view.state).filter(b=>!view.state.selection.ranges.some(r=>r.from<=b.to&&r.to>=b.from));
  if (view.hasFocus) for (const range of view.state.selection.ranges) selected.push([view.state.doc.lineAt(range.from).number, view.state.doc.lineAt(range.to).number]);
  const addMark = (from, to, className, attributes) => { if (to > from) decorations.push(Decoration.mark({ class: className, ...(attributes ? { attributes } : {}) }).range(from, to)); };
  const hide = (from, to) => { if (to > from) decorations.push(Decoration.replace({}).range(from, to)); };
  for (const visible of view.visibleRanges) {
    let pos = view.state.doc.lineAt(visible.from).from;
    while (pos <= visible.to) {
      const line = view.state.doc.lineAt(pos);
      if (!visited.has(line.number)) {
        visited.add(line.number);
        const active = selected.some(([from, to]) => line.number >= from && line.number <= to);
        const text = line.text, code = fenceState.get(line.number);
        if(queries.some(b=>line.number>=b.line&&line.number<=b.end)){if(line.to===view.state.doc.length)break;pos=line.to+1;continue;}
        if (code.code) {
          const collapsed = !!(code.fence && !active);
          decorations.push(Decoration.line({ class: 'cm-slate-code-line' + (code.fence ? ' cm-slate-code-fence cm-slate-code-' + code.fence : '') + (collapsed ? ' cm-slate-code-collapsed' : '') }).range(line.from));
          if (code.fence === 'start' && !active && (code.lang || code.closed)) decorations.push(Decoration.replace({ widget: new CodeLabelWidget(code.lang || '', code.closed ? icon : null, line.number) }).range(line.from, line.to));
          else if (code.fence && !active) hide(line.from, line.to);
          if (code.fence === 'start' && icon && code.closed && active) decorations.push(Decoration.widget({ widget: new CodeCopyWidget(icon, line.number), side: -1 }).range(line.to));
        } else {
          const heading = text.match(/^(#{1,6})\s+/);
          if (heading) {
            decorations.push(Decoration.line({ class: 'cm-slate-heading cm-slate-h' + heading[1].length }).range(line.from));
            if (!active) hide(line.from, line.from + heading[0].length);
            else addMark(line.from, line.from + heading[1].length, 'cm-slate-marker');
          }
          const task = text.match(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([^\]])\](?:[ \t]+|$)/);
          const bullet = text.match(/^(\s*)([-*+])\s/);
          const quote = text.match(/^(\s*>\s?)+/);
          // Keep the checkbox visible while typing its description, including an
          // empty task just entered as "- [ ]". Reveal source only when editing
          // or selecting the marker itself.
          const markerFrom = line.from + text.match(/^\s*/)[0].length;
          const markerTo = task ? line.from + task[0].length : markerFrom;
          const editingMarker = task && view.hasFocus && view.state.selection.ranges.some(range => range.empty ? range.from >= markerFrom && range.from < markerTo : range.from < markerTo && range.to > markerFrom);
          if (task && !editingMarker) decorations.push(Decoration.replace({ widget: new CheckboxWidget(task[2].toLowerCase() === 'x', line.from + task[1].length, line.number, onToggleTask) }).range(markerFrom, markerTo));
          else if (bullet && !active) decorations.push(Decoration.replace({ widget: new BulletWidget() }).range(line.from + bullet[1].length, line.from + bullet[1].length + 1));
          if (task && icon && onMetadata) {
            decorations.push(Decoration.widget({widget:new TaskControlsWidget(line.number, text, icon, onMetadata),side:1}).range(line.to));
            // Source metadata stays editable when the caret enters it.
            const metadata = /(`+)[\s\S]*?\1|<!--[\s\S]*?(?:-->|$)|(?:📅\uFE0F?[ \t]*\d{4}-\d{2}-\d{2}|[🔺⏫🔼🔽⏬]\uFE0F?)/gu;
            for (const match of text.matchAll(metadata)) {
              if (match[0].startsWith('`') || match[0].startsWith('<!--')) continue;
              const from = line.from + match.index, to = from + match[0].length;
              if (!view.hasFocus || !view.state.selection.ranges.some(r => r.empty ? r.from > from && r.from < to : r.from < to && r.to > from)) hide(from,to);
            }
          }
          if (quote) {
            decorations.push(Decoration.line({ class: 'cm-slate-quote-line' }).range(line.from));
            if (!active && !task) hide(line.from, line.from + quote[0].length);
          }
          const inlineCode = [];
          for (const match of text.matchAll(/`([^`]+)`/g)) {
            const from = line.from + match.index, to = from + match[0].length; inlineCode.push([from, to]);
            if(globalThis.window?.SlateDataview?.enabled?.()&&/^\$?=/.test(match[1])&&!view.state.selection.ranges.some(r=>r.from<=to&&r.to>=from))continue;
            addMark(from, to, 'cm-slate-inline-code');
            if (!active) { hide(from, from + 1); hide(to - 1, to); }
          }
          const isCode = (from, to) => inlineCode.some(([start, end]) => from < end && to > start);
          for (const match of text.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
            const from = line.from + match.index, to = from + match[0].length;
            if (isCode(from, to)) continue;
            const embedded = match[0].startsWith('!'), prefix = embedded ? 3 : 2;
            const separator = match[1].indexOf('|');
            const target = (separator >= 0 ? match[1].slice(0, separator) : match[1]).trim();
            addMark(from, to, 'cm-slate-wikilink', { 'data-wiki': target });
            if (!active) { hide(from, from + prefix + (separator >= 0 ? separator + 1 : 0)); hide(to - 2, to); }
            else { addMark(from, from + prefix, 'cm-slate-marker'); addMark(to - 2, to, 'cm-slate-marker'); }
          }
          for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
            const from = line.from + match.index, to = from + match[0].length;
            if (isCode(from, to)) continue;
            addMark(from, to, 'cm-slate-link');
            if (!active) { hide(from, from + 1); hide(from + match[1].length + 1, to); }
            if (icon && /^https?:\/\//i.test(match[2]) && text[match.index - 1] !== '!') decorations.push(Decoration.widget({ widget: new ExternalLinkWidget(icon), side: 1 }).range(to));
          }
          for (const [pattern, className, count] of [[/\*\*([^*]+)\*\*/g,'cm-slate-strong',2],[/(?<!\*)\*([^*]+)\*(?!\*)/g,'cm-slate-emphasis',1],[/(?<![\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu,'cm-slate-strong',2],[/(?<![\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu,'cm-slate-emphasis',1],[/~~([^~]+)~~/g,'cm-slate-strike',2],[/==([^=]+)==/g,'cm-slate-highlight',2]]) {
            for (const match of text.matchAll(pattern)) {
              const from = line.from + match.index, to = from + match[0].length;
              if (isCode(from, to)) continue;
              addMark(from, to, className);
              if (!active) { hide(from, from + count); hide(to - count, to); }
              else { addMark(from, from + count, 'cm-slate-marker'); addMark(to - count, to, 'cm-slate-marker'); }
            }
          }
        }
      }
      if (line.to === view.state.doc.length) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(decorations, true);
}

function taskBlocks(state) {
  const blocks=[];let fence=null;
  for(let n=1;n<=state.doc.lines;n++){
    const line=state.doc.line(n),match=line.text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if(!match)continue;
    if(!fence){fence={from:line.from,line:n,char:match[1][0],length:match[1].length,kind:match[2].trim()};continue;}
    if(match[1][0]===fence.char&&match[1].length>=fence.length&&!match[2].trim()){
      if(fence.kind==='tasks'||globalThis.window?.SlateDataview?.enabled?.()&&/^(dataview|dataviewjs)$/.test(fence.kind))blocks.push({...fence,to:line.to,end:n,query:state.doc.sliceString(state.doc.line(fence.line).to+1,line.from).trimEnd()});
      fence=null;
    }
  }
  return blocks;
}
class TaskQueryWidget extends WidgetType {
  constructor(html,from,options){super();this.html=html;this.from=from;this.options=options;}
  eq(other){return this.html===other.html&&this.from===other.from;}
  toDOM(view){const el=document.createElement('div');el.className='task-query cm-task-query';el.innerHTML=this.html;el.addEventListener('click',e=>this.options.onTaskClick?.(e));const edit=document.createElement('button');edit.type='button';edit.className='task-query-source';edit.textContent='Edit query';edit.onclick=()=>{view.dispatch({selection:{anchor:this.from},scrollIntoView:true});view.focus();};el.append(edit);return el;}
  ignoreEvent(){return true;}
}
const refreshTaskQueries=StateEffect.define();
class DataviewWidget extends WidgetType {
  constructor(source,kind,from,content,options){super();Object.assign(this,{source,kind,from,content,options});}
  eq(){return false;}
  toDOM(view){
    const inline=this.kind.startsWith('inline'),el=document.createElement(inline?'span':'div');el.className=inline?'dataview-inline':'dataview-query';
    const result=document.createElement(inline?'span':'div');el.append(result);
    el.addEventListener('click',event=>this.options.onDataviewClick?.(event));
    this.options.renderDataview?.(result,this.source,this.kind,this.content,()=>view.requestMeasure());
    if(!inline){const edit=document.createElement('button');edit.type='button';edit.className='task-query-source';edit.textContent='Edit query';edit.onclick=event=>{event.stopPropagation();view.dispatch({selection:{anchor:this.from},scrollIntoView:true});view.focus();};el.append(edit);}
    return el;
  }
  destroy(dom){const result=dom.firstChild;if(result)result.dataviewRender=null;}
  ignoreEvent(){return true;}
}
// Block decorations belong to a state field, so image height participates in
// CodeMirror's layout even when the source line is outside the viewport.
class ImageWidget extends WidgetType {
  constructor(asset, load) { super(); this.asset=asset; this.load=load; }
  eq(other) { return this.asset.path===other.asset.path && this.load===other.load; }
  toDOM(view) {
    const wrap=document.createElement('span'), img=document.createElement('img');
    wrap.className='cm-slate-image'; img.className='note-image'; img.alt=this.asset.path;
    wrap.append(img); let disposed=false; wrap.dispose=()=>{disposed=true;};
    const failed=()=>{if(!disposed){wrap.classList.add('is-unavailable');wrap.textContent='Image unavailable: '+this.asset.path;view.requestMeasure();}};
    img.onload=()=>view.requestMeasure();
    img.onerror=failed;
    this.load(this.asset).then(url=>{if(!disposed){img.src=url;view.requestMeasure();}},failed);
    return wrap;
  }
  destroy(dom) { dom.dispose?.(); }
}
function imageEmbeds(state, options) {
  const result=[], fences=fenceContexts(state.doc), tree=syntaxTree(state);
  for(let n=1;n<=state.doc.lines;n++) {
    const line=state.doc.line(n);if(fences.get(n)?.code)continue;
    for(const match of line.text.matchAll(/!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(([^)\n]+)\)/g)) {
      const from=line.from+match.index,to=from+match[0].length;
      let node=tree.resolveInner(from,1), literal=false;
      for(;node;node=node.parent)if(/^(InlineCode|FencedCode|CodeBlock)$/.test(node.name))literal=true;
      if(literal)continue;
      const asset=options.resolveAttachment?.(match[1] ? match[1].split('|')[0] : match[3]);
      if(!asset?.mime.startsWith('image/'))continue;
      const standalone=line.text.trim()===match[0];
      const active=state.selection.ranges.some(r=>r.from<=line.to&&r.to>=line.from);
      result.push({from,to,line,asset,standalone,active});
    }
  }
  return result;
}
function imagePreview(options) {
  const build=state=>Decoration.set(imageEmbeds(state,options).map(embed=>{
    const widget=new ImageWidget(embed.asset,options.loadAttachment);
    return embed.standalone&&!embed.active
      ? Decoration.replace({widget,block:true}).range(embed.line.from,embed.line.to)
      : embed.standalone
        ? Decoration.widget({widget,block:true,side:1}).range(embed.line.to)
        : Decoration.widget({widget,side:1}).range(embed.to);
  }),true);
  return StateField.define({create:build,update(value,tr){return tr.docChanged||tr.selection||tr.effects.some(e=>e.is(refreshTaskQueries))?build(tr.state):value;},provide:field=>EditorView.decorations.from(field)});
}
function queryPreview(options){
  const build=state=>{
    const ranges=[];
    for(const block of taskBlocks(state)){
      if(state.selection.ranges.some(r=>r.from<=block.to&&r.to>=block.from))continue;
      if(block.kind!=='tasks'){
        ranges.push(Decoration.replace({widget:new DataviewWidget(block.query,block.kind,block.from,state.doc.toString(),options),block:true}).range(block.from,block.to));continue;
      }
      const el=document.createElement('div');options.renderTaskQuery?.(el,block.query,state.doc.toString());
      ranges.push(Decoration.replace({widget:new TaskQueryWidget(el.innerHTML,block.from,options),block:true}).range(block.from,block.to));
    }
    if(globalThis.window?.SlateDataview?.enabled?.()){
      const fences=fenceContexts(state.doc);
      for(let n=1;n<=state.doc.lines;n++){
        const line=state.doc.line(n);if(fences.get(n)?.code)continue;
        for(const match of line.text.matchAll(/(?<!`)(`+)(\$?=\s*[^`]+)\1(?!`)/g)){
          const from=line.from+match.index,to=from+match[0].length;
          if(state.selection.ranges.some(r=>r.from<=to&&r.to>=from))continue;
          const js=match[2].startsWith('$=');ranges.push(Decoration.replace({widget:new DataviewWidget(match[2].slice(js?2:1).trim(),js?'inlinejs':'inline',from,state.doc.toString(),options)}).range(from,to));
        }
      }
    }
    return Decoration.set(ranges,true);
  };
  return StateField.define({create:build,update(value,tr){return tr.docChanged||tr.selection||tr.effects.some(e=>e.is(refreshTaskQueries))?build(tr.state):value;},provide:field=>EditorView.decorations.from(field)});
}
function createLivePreview(onToggleTask, icon, onMetadata) { return ViewPlugin.fromClass(class {
  constructor(view) { this.fences = fenceContexts(view.state.doc); this.decorations = liveDecorations(view, this.fences, onToggleTask, icon, onMetadata); }
  update(update) {
    if (update.docChanged) this.fences = fenceContexts(update.state.doc);
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged || update.transactions?.some(tr=>tr.effects.some(effect=>effect.is(refreshTaskQueries)))) this.decorations = liveDecorations(update.view, this.fences, onToggleTask, icon, onMetadata);
  }
}, { decorations: value => value.decorations }); }

function mount(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('An editor container is required.');
  const previewMode = new Compartment();
  const lineNumberMode = new Compartment(), tabSizeMode = new Compartment(), indentMode = new Compartment(), tabKeyMode = new Compartment();
  const livePreview = [createLivePreview(options.onToggleTask, options.icon, options.onTaskMetadata),queryPreview(options),imagePreview(options)];
  let mode = 'live', setting = false;
  const nonce = document.querySelector('meta[name="style-nonce"]')?.content || '';
  let view;
  function wrap(marker) {
    const selection = view.state.selection.main;
    view.dispatch({ changes: [{ from: selection.from, insert: marker }, { from: selection.to, insert: marker }], selection: EditorSelection.range(selection.from + marker.length, selection.to + marker.length) });
    return true;
  }
  const extensions = [
    EditorState.transactionFilter.of(taskSpacing),
    EditorView.lineWrapping, drawSelection(), history(), markdown({ base: markdownLanguage, codeLanguages: codeLanguage }), syntaxHighlighting(slateHighlighter),
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'true', autocapitalize: 'sentences' }),
    ...(nonce ? [EditorView.cspNonce.of(nonce)] : []),
    previewMode.of(livePreview),
    lineNumberMode.of(options.lineNumbers ? lineNumbers() : []),
    tabSizeMode.of(EditorState.tabSize.of(Math.max(2, Math.min(8, Number(options.tabSize) || 4)))),
    indentMode.of(indentUnit.of(options.useTab === false ? '    ' : '\t')),
    tabKeyMode.of(keymap.of([{ key: 'Tab', run: enterCodeFence }, indentWithTab])),
    autocompletion({ override: [wikiCompletions(options)], activateOnTypingDelay: 0, interactionDelay: 0, icons: false, maxRenderedOptions: 50, tooltipClass: () => 'slate-wiki-completions' }),
    keymap.of([{ key: 'Tab', run: acceptCompletion }]),
    keymap.of([{ key: 'Mod-s', run: () => { options.onSave?.(); return true; } }, {key:'Mod-Enter',run:view=>{options.onToggleTask?.(view.state.doc.lineAt(view.state.selection.main.head).number);return true;}}, { key: 'Mod-b', run: () => wrap('**') }, { key: 'Mod-i', run: () => wrap('*') }, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of(update => { if (update.docChanged && !setting) options.onChange?.(update.state.doc.toString()); }),
    EditorView.domEventHandlers({ drop(event) { return !!event.dataTransfer?.files.length; }, mousedown(event) {
      const target = event.target.closest?.('[data-wiki]');
      if (target && (event.ctrlKey || event.metaKey)) { event.preventDefault(); options.onFollowLink?.(target.getAttribute('data-wiki')); return true; }
      return false;
    } }),
    EditorView.theme({ '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: 'var(--editor-font-size, var(--font-size, 16px))' }, '.cm-content': { fontFamily: 'var(--editor-font, var(--text-font, "Segoe UI", sans-serif))', lineHeight: '1.6', caretColor: 'var(--text)' }, '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' }, '&.cm-focused': { outline: 'none' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--text-selection)' } }),
  ];
  const state = value => EditorState.create({ doc: value, extensions });
  view = new EditorView({ parent: container, state: state(options.value || '') });
  container.classList.add('slate-editor-host');
  const instance = {
    getValue: () => view.state.doc.toString(),
    getSelection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    refreshTasks: () => view.dispatch({effects:refreshTaskQueries.of(null)}),
    syncValue(value) {
      const previous=view.state.doc.toString();value=String(value);
      if(previous===value)return;
      let from=0, oldEnd=previous.length, newEnd=value.length;
      while(from<oldEnd&&from<newEnd&&previous[from]===value[from])from++;
      while(oldEnd>from&&newEnd>from&&previous[oldEnd-1]===value[newEnd-1]){oldEnd--;newEnd--;}
      setting=true;
      try{view.dispatch({changes:{from,to:oldEnd,insert:value.slice(from,newEnd)}});}
      finally{setting=false;}
    },
    setValue(value) {
      if (String(value) === view.state.doc.toString()) return;
      setting = true;
      try { view.setState(state(String(value))); if (mode === 'source') view.dispatch({ effects: previewMode.reconfigure([]) }); }
      finally { setting = false; }
    },
    focus: () => view.focus(),
    replaceRange(from, to, text, anchor = from + text.length, head = anchor) {
      view.dispatch({ changes: { from, to, insert: text }, selection: EditorSelection.range(anchor, head), scrollIntoView: true });
      view.focus();
    },
    undo: () => { view.focus(); return undo(view); },
    redo: () => { view.focus(); return redo(view); },
    canUndo: () => undoDepth(view.state) > 0,
    canRedo: () => redoDepth(view.state) > 0,
    setSelection(from, to = from) {
      from = Math.max(0, Math.min(Number(from) || 0, view.state.doc.length)); to = Math.max(0, Math.min(Number(to) || 0, view.state.doc.length));
      view.dispatch({ selection: EditorSelection.range(from, to), scrollIntoView: true }); view.focus();
    },
    setMode(next) {
      mode = next === 'source' ? 'source' : 'live';
      container.classList.toggle('is-source-mode', mode === 'source');
      view.dispatch({ effects: previewMode.reconfigure(mode === 'live' ? livePreview : []) });
    },
    setEditorOptions(next = {}) {
      const effects = [];
      if ('lineNumbers' in next) effects.push(lineNumberMode.reconfigure(next.lineNumbers ? lineNumbers() : []));
      if ('tabSize' in next) effects.push(tabSizeMode.reconfigure(EditorState.tabSize.of(Math.max(2, Math.min(8, Number(next.tabSize) || 4)))));
      if ('useTab' in next) effects.push(indentMode.reconfigure(indentUnit.of(next.useTab === false ? '    ' : '\t')));
      if (effects.length) view.dispatch({ effects });
    },
    destroy: () => { view.destroy(); container.classList.remove('slate-editor-host'); },
  };
  return instance;
}

window.SlateEditor = Object.freeze({ mount, highlight, engine: 'CodeMirror 6' });
window.dispatchEvent(new Event('slate-editor-ready'));
