(function (root) {
  // Shared by the live editor and the plain-text source editor.
  function context(text, pos, end = pos) {
    if (pos !== end) return null;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const before = text.slice(lineStart, pos);
    const match = /(?<![\\\[])\[\[([^\[\]\n|#]*)$/.exec(before);
    if (!match) return null;
    const opening = lineStart + match.index;
    // Do not offer links inside fenced or inline code.
    let fence = null;
    for (const line of text.slice(0, lineStart).split('\n')) {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker && !fence) fence = marker;
      else if (marker && marker[0] === fence?.[0] && marker.length >= fence.length) fence = null;
    }
    if (fence || /^ {0,3}(`{3,}|~{3,})/.test(before)) return null;
    let ticks = null;
    for (const run of text.slice(lineStart, opening).matchAll(/`+/g)) {
      if (ticks === null) ticks = run[0].length;
      else if (ticks === run[0].length) ticks = null;
    }
    if (ticks !== null) return null;
    return { from: opening + 2, to: pos, query: match[1] };
  }

  function suggestions(notes, query, currentPath) {
    const search = query.trim().toLocaleLowerCase();
    return notes.filter(note => note.path !== currentPath && /\.md$/i.test(note.path))
      .map(note => {
        const target = note.path.replace(/\.md$/i, '');
        const label = target.split('/').pop();
        const name = label.toLocaleLowerCase(), path = target.toLocaleLowerCase();
        const rank = !search ? 0 : name === search ? 0 : name.startsWith(search) ? 1 : name.includes(search) ? 2 : path.includes(search) ? 3 : -1;
        return { label, target, path: note.path, rank };
      }).filter(note => note.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
  }

  function replacement(text, range, target) {
    // Replace an existing target suffix, retaining headings and aliases.
    const suffix = /^[^\[\]\n|#]*(?:#[^\[\]\n|]*)?(?:\|[^\[\]\n]*)?\]\]/.exec(text.slice(range.to));
    if (suffix) {
      const preserved = suffix[0].match(/[#|].*?(?=\]\]$)/)?.[0] || '';
      return { from: range.from, to: range.to + suffix[0].length, insert: target + preserved + ']]' };
    }
    return { from: range.from, to: range.to + (text[range.to] === ']' ? 1 : 0), insert: target + ']]' };
  }

  function mountSource(editor, options) {
    const panel = document.createElement('div');
    panel.className = 'slate-wiki-completions'; panel.id = 'source-wiki-completions';
    panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-label', 'Link to note'); panel.hidden = true;
    document.body.append(panel);
    editor.setAttribute('aria-autocomplete', 'list');
    let range = null, items = [], selected = 0;
    function close() {
      panel.hidden = true; range = null;
      editor.setAttribute('aria-expanded', 'false'); editor.removeAttribute('aria-controls'); editor.removeAttribute('aria-activedescendant');
    }
    function commit(index) {
      if (!range || !items[index]) return;
      const change = replacement(editor.value, range, items[index].target);
      close(); editor.focus();
      // Chromium's text insertion preserves the native textarea undo history.
      editor.setSelectionRange(change.from, change.to);
      if (!document.execCommand('insertText', false, change.insert)) {
        editor.setRangeText(change.insert, change.from, change.to, 'end');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
      close();
    }
    function render() {
      panel.replaceChildren();
      items.slice(0, 50).forEach((item, index) => {
        const row = document.createElement('div'); row.id = 'source-wiki-option-' + index;
        row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === selected));
        const name = document.createElement('span'), path = document.createElement('small');
        name.textContent = item.label; path.textContent = item.path; row.append(name, path);
        row.onmousedown = event => { event.preventDefault(); commit(index); };
        panel.append(row);
      });
      panel.hidden = false; editor.setAttribute('aria-expanded', 'true'); editor.setAttribute('aria-controls', panel.id);
      editor.setAttribute('aria-activedescendant', 'source-wiki-option-' + selected);
      panel.children[selected]?.scrollIntoView({ block: 'nearest' });
      // Measure the caret with a text mirror, including wrapping and scroll offsets.
      const mirror = document.createElement('div'), style = getComputedStyle(editor);
      for (const property of ['font', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'tabSize']) mirror.style[property] = style[property];
      const rect = editor.getBoundingClientRect();
      Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', width: rect.width + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
      mirror.textContent = editor.value.slice(0, editor.selectionStart);
      const caret = document.createElement('span'); caret.textContent = '\u200b'; mirror.append(caret); document.body.append(mirror);
      const x = rect.left + caret.offsetLeft - editor.scrollLeft, y = rect.top + caret.offsetTop - editor.scrollTop;
      mirror.remove();
      panel.style.left = Math.max(8, Math.min(x, window.innerWidth - panel.offsetWidth - 8)) + 'px';
      panel.style.top = Math.max(8, y + 24 + panel.offsetHeight > window.innerHeight ? y - panel.offsetHeight : y + 24) + 'px';
    }
    function update(event) {
      if (event?.isComposing || document.activeElement !== editor || editor.hidden) return close();
      range = context(editor.value, editor.selectionStart, editor.selectionEnd);
      items = range ? suggestions(options.getNotes(), range.query, options.getCurrentPath()).slice(0, 50) : [];
      selected = 0;
      if (!items.length) return close();
      render();
    }
    editor.addEventListener('input', update); editor.addEventListener('click', update); editor.addEventListener('blur', close);
    editor.addEventListener('keydown', event => {
      if (panel.hidden || event.isComposing) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Escape') return close();
        if (event.key === 'Enter' || event.key === 'Tab') return commit(selected);
        selected = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        render();
      } else if (event.key.startsWith('Arrow')) close();
    }, true);
    document.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return { close };
  }
  root.SlateWikiLinks = Object.freeze({ context, suggestions, replacement, mountSource });
})(window);
