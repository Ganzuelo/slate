// Runtime dependency of upstream's resolver; the Obsidian FullIndex is replaced
// by Slate's read-only adapter in dataview-engine.js.
export const PathFilters = { markdown: path => /\.md$/i.test(path), csv: path => /\.csv$/i.test(path) };
