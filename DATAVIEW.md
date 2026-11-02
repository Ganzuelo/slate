# Dataview in Slate

Slate bundles the original [Dataview](https://github.com/blacksmithgu/obsidian-dataview)
DQL parser, expression functions, and execution engine locally. No Obsidian plugin
installation is needed. Dataview is enabled by default and can be disabled in
**Settings → Dataview**.

Queries render in reading view, split preview, and live preview. In live preview,
place the cursor inside a query or click **Edit query** to edit its source. Inline
expressions reveal their source when the cursor enters them.

## Metadata and DQL

YAML frontmatter supports typed numbers, booleans, dates, lists, and nested
objects. Dataview inline fields such as `Rating:: 8`, `[rating:: 8]`, and
`(rating:: 8)` are indexed with the upstream field parser. File metadata includes
paths, names, folders, tags, aliases, links, lists, tasks, sizes, and filesystem
creation/modification times. Code fences are excluded from body metadata.

For a book note:

```markdown
---
tags: [book]
rating: 8
read: true
---
Genre:: Fantasy
- [ ] Read the sequel
```

Use a query in another note:

~~~markdown
```dataview
TABLE rating AS Rating, genre AS Genre
FROM #book
WHERE read
SORT rating DESC
```
~~~

`LIST`, `TABLE`, `TASK`, `WHERE`, `SORT`, `GROUP BY`, `FLATTEN`, `LIMIT`,
`WITHOUT ID`, folder/tag/link sources, source combinations, and upstream DQL
functions are supported. `CALENDAR` queries display a chronological date/file
table. Inline expressions use backticks: `` `= this.file.name` ``.

Result links open notes. Task result checkboxes use Slate's existing task update
flow, including raw-line/revision checks and recurring task behavior. Tasks in
unsaved notes retain the app's existing draft protections.

Results refresh as notes are edited or the vault is refreshed. Open drafts take
precedence over saved contents. Use Slate's Refresh action after external edits.

## DataviewJS

Enable **Settings → Dataview → JavaScript queries** for `dataviewjs` blocks and
inline `` `$= dv.current().file.name` `` expressions. This preference is off by
default. Both `dv` and `dataview` refer to the query API.

~~~markdown
```dataviewjs
for (const group of dv.pages('#book').groupBy(p => p.genre)) {
  dv.header(3, group.key);
  dv.table(['Book', 'Rating'],
    group.rows.sort(p => p.rating, 'desc').map(p => [p.file.link, p.rating]));
}
```
~~~

Available API:

- `pages`, `pagePaths`, `page`, `current`; upstream DataArray operations including
  `where`, `map`, `sort`, `groupBy`, field projection, and `array`.
- `array`, `isArray`, `isDataArray`, `fileLink`, `sectionLink`, `blockLink`, `date`,
  `duration`, `parse`, `literal`, `clone`, `compare`, `equal`, `func`, `luxon`,
  `evaluate`, and `tryEvaluate`.
- `list`, `table`, `taskList`, `header`, `paragraph`, `span`, restricted text-only
  `el`, and `execute` for rendering DQL from JavaScript. Async/await is supported.

Each query runs in a disposable worker with a five-second limit. Workers receive
a snapshot of note data, never Slate's API token, Electron bridge, or file handles.
Worker CSP denies network requests, imported scripts, and child workers. Output
is rebuilt using an HTML element/attribute allowlist before entering the UI.

## Compatibility limits

This is built-in Dataview support, not an Obsidian plugin host. Obsidian `app`
APIs, arbitrary DOM/HTML rendering, `dv.container`, `dv.view`, `dv.io`, CSV sources,
and the full plugin API are unavailable. Section/block result links currently
open the containing note. Calendar output is a date table rather than Obsidian's
calendar widget. File starred state currently reports false.

The engine is upstream Dataview 0.5.70; Slate supplies the Markdown cache and vault
adapter. Obsidian's full Markdown metadata cache is not embedded, so elaborate
list continuations, callout nesting, and plugin-specific metadata may differ.
Malformed YAML is reported with its file path instead of producing guessed data.

## Development

Run `npm run build:dataview` after changing the engine/worker, and
`npm run build:editor` after changing live-preview integration. Generated bundles
include retained dependency licenses. Validate with `node --test` and
`npx electron scripts/verify-dataview.cjs` (unset `ELECTRON_RUN_AS_NODE` when running
the Electron harness from a Node-hosted agent).
