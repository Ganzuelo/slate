# Native Tasks support

The user selected Obsidian core plus Tasks behavior implemented directly in Slate, with no community plugin loader. `public/tasks.js` is original application code; no Tasks plugin source was copied, bundled, installed, or evaluated.

## Researched contract

The upstream project's [introduction](https://publish.obsidian.md/tasks/) describes vault-wide task collection, date metadata, recurrence, query results, and source-file updates when toggling a task. The native feature uses that workflow as its target.

The official [date documentation](https://raw.githubusercontent.com/obsidian-tasks-group/obsidian-tasks/main/docs/Getting%20Started/Dates.md) defines `YYYY-MM-DD` metadata using 📅 due, ⏳ scheduled, 🛫 start, ➕ created, and ✅ done. Native parsing preserves these fields. Invalid calendar dates remain visible as invalid metadata and do not match ordinary date filters. The upstream start-date filter also includes undated tasks; the native start filter follows that behavior.

The official [priority documentation](https://raw.githubusercontent.com/obsidian-tasks-group/obsidian-tasks/main/docs/Getting%20Started/Priority.md) establishes highest 🔺, high ⏫, medium 🔼, unmarked normal, low 🔽, and lowest ⏬ in that order. The native engine uses this ordering for filters and sorting.

The project's [query examples](https://publish.obsidian.md/tasks/Queries/Examples) and [filter reference](https://publish.obsidian.md/tasks/Queries/Filters) establish the basic line-oriented query shape. Native queries combine supported filter lines using AND. `before` and `after` are exclusive; `on or before` and `on or after` are inclusive. Unknown instructions report errors and return no results, avoiding accidental widening of a saved query.

The official [recurrence documentation](https://raw.githubusercontent.com/obsidian-tasks-group/obsidian-tasks/main/docs/Getting%20Started/Recurring%20Tasks.md) establishes interval recurrence, completion-based anchoring via `when done`, due/scheduled/start reference-date preference, preservation of relative date distances, and month-end clamping for simple monthly rules. The native implementation supports `every [N] day/week/month/year[s]`, optionally ending in `when done`. Completion returns the completed occurrence and one new unchecked occurrence. Due, scheduled, and start dates move by the same number of days calculated from the reference date; an existing created date becomes the completion day in the new occurrence. Month/year changes clamp to a valid day. The engine rejects unsupported recurrence syntax before returning edits.

The official [sorting reference](https://publish.obsidian.md/tasks/Queries/Sorting) supports multiple criteria and missing-date ordering. Native date sorting places invalid dates first, valid dates in chronological order, and missing dates last. The native fallback is path and source line; it does **not** reproduce the upstream implicit urgency/status sorting.

The official [grouping reference](https://publish.obsidian.md/tasks/Queries/Grouping) supports named groups. Native grouping covers path, folder, status, due, and priority. Due headings are ISO strings or `No due date`, without the upstream localized weekday formatting. [Layout directives](https://publish.obsidian.md/tasks/Queries/Layout) are returned separately as presentation metadata so they do not alter task selection.

## Browser API

Load `/tasks.js` before the application script. It exposes a frozen `globalThis.SlateTasks`, also available as `window.SlateTasks` in a browser. The module has no DOM or network dependencies.

```javascript
const tasks = SlateTasks.parseTasks(notes);
const result = SlateTasks.query(tasks, 'not done\ndue before tomorrow\nsort by due', '2026-10-28');
const changed = SlateTasks.complete(task, '2026-10-28', true);
```

- `parseTasks([{path, content}])` returns source-preserving task records: `path`, one-based `line`, exact `raw`, metadata-free `text`, checkbox-symbol `status`, boolean `completed`, nullable date fields, string `priority`, nullable raw `recurrence`, `tags`, and `invalidDates`.
- `query(tasks, queryString, todayISO?)` returns `{tasks, groups, errors, hidden}`. `groups` contains `{name, tasks}` records only when grouping is requested.
- `complete(task, todayISO?, completed?)` returns `{completedLine, nextLine?, warnings: []}`. Omitting `completed` toggles the checkbox. Repeating an explicit already-applied state returns the original line without generating another occurrence. Completing adds the done date; uncompleting removes it. The method throws on malformed source, invalid reference dates, or unsupported recurrence.
- `completionEdits(task, completed, todayISO?)` returns an array beginning with `{line, oldLine, newLine}` and optionally `{insertAfterLine, text}`. The host must compare `oldLine` with the current file and apply changes using its disk-revision checks. This helper chooses the next occurrence **after** the completed one; upstream's default placement is before. A host may use `complete()` directly to choose its own insertion order.
- `today()` returns the local calendar date, avoiding UTC day-boundary drift.

The parser accepts unordered and ordered checkbox lists, nesting and blockquote prefixes, CRLF input, and custom single-character checkbox symbols. It considers only `x`/`X` completed. It skips frontmatter, fenced-code examples, and HTML comments; emoji metadata inside inline code remains literal. Raw HTML and task text are not evaluated.

## Supported query subset

```text
done
not done
due today
due before tomorrow
due after 2026-10-28
due on or before today
no due date
has scheduled date
start on 2026-10-28
created after yesterday
done before today
due date is invalid
path includes Projects/
description includes review
tags include #work
tags does not include #personal
priority high
priority is above medium
is recurring
is not recurring
sort by due
sort by priority reverse
group by path
group by status
group by due
group by folder
group by priority
limit 10
limit to 10 tasks
hide due date
hide priority
hide recurrence rule
hide tags
hide backlinks
hide task count
hide edit button
```

Each line above is an independent supported instruction, not one useful combined query. Date filter/sort fields are due, scheduled, start, created, and done. Sorting also supports path, description and status. Several common hide-button/toolbar directives are recognized as presentation metadata. A fenced `tasks` block wrapper can be passed to `query()` directly or stripped by the host renderer.

## Deliberate limits and verification

This is a bounded native Tasks subset, not full Tasks-plugin parity. It does not evaluate JavaScript queries, regular-expression filters, boolean-expression groups, arbitrary natural-language dates, urgency, dependency graphs, custom-status configuration, Dataview task metadata, custom field functions, presets, global filters, notification/reminder behavior, or complex recurrence rules such as weekdays and ordinal month dates. Unsupported query instructions fail explicitly; unsupported recurrence completion is blocked with an actionable error. Presentation fields in `hidden` must be applied by the host renderer.

Ten tests in `test/tasks.test.mjs` cover parsing and source positions, excluded examples/comments, inline-code metadata, dates and filter boundaries, string/tag/priority filtering, multi-key sorting/limits, unknown-instruction rejection without code execution, grouping, completion/uncompletion, source indentation, recurring date shifts, month/leap-year clamping, and unsupported recurrence rejection. These fixtures verify the native contract; they are not an original-plugin runtime comparison.
