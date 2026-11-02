import DiffMatchPatch from 'diff-match-patch';

// Merge independent edits exactly, then use Obsidian Sync's diff-match-patch
// approach for overlapping edits. Keep both texts if patches cannot be applied.
export function mergeNote(base, local, remote) {
  const exact = mergeIndependent(base, local, remote);
  if (exact !== null) return exact;
  const diff = new DiffMatchPatch();
  const [merged, applied] = diff.patch_apply(diff.patch_make(base, local), remote);
  return applied.every(Boolean) ? merged : local + '\n\n' + remote;
}

function mergeIndependent(base, local, remote) {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  const diff = new DiffMatchPatch();
  const edits = text => {
    const result = []; let offset = 0, edit = null;
    for (const [kind, value] of diff.diff_main(base, text)) {
      if (kind === 0) { if (edit) result.push(edit); edit = null; offset += value.length; }
      else {
        edit ||= { from: offset, to: offset, text: '' };
        if (kind === -1) { offset += value.length; edit.to = offset; }
        else edit.text += value;
      }
    }
    if (edit) result.push(edit);
    return result;
  };
  const combined = edits(remote);
  for (const edit of edits(local)) {
    let duplicate = false;
    for (const other of combined) {
      if (edit.from === other.from && edit.to === other.to && edit.text === other.text) { duplicate = true; break; }
      if (edit.from === edit.to && other.from === other.to && edit.from === other.from) {
        other.text += edit.text; duplicate = true; break;
      }
      if (edit.from < other.to && edit.to > other.from ||
          edit.from === edit.to && edit.from > other.from && edit.from < other.to ||
          other.from === other.to && other.from > edit.from && other.from < edit.to) return null;
    }
    if (!duplicate) combined.push(edit);
  }
  combined.sort((a, b) => a.from - b.from || a.to - b.to);
  let result = '', offset = 0;
  for (const edit of combined) { result += base.slice(offset, edit.from) + edit.text; offset = edit.to; }
  return result + base.slice(offset);
}
