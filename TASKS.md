# Tasks in Slate

Slate's tasks are Markdown checkboxes in your notes. The Tasks view and fenced `tasks` queries read those same notes. Completing or editing a query result changes its source note; opening the source jumps to the task's line. Unsaved editor changes are included in queries.

## Everyday use

- Open **Tasks** in the left ribbon. **All tasks** includes completed tasks; Today, Upcoming and Overdue show incomplete work.
- Create a task with **New task**. Choose its source note, priority, start/scheduled/due dates and repeat rule. If a global task filter is set, new tasks include it automatically.
- Click a task's pencil to edit it. The command palette also has **Edit task at cursor**. Editing keeps its list prefix, checkbox state, created/done dates, block ID and comments.
- Use **Ctrl+Enter** to complete or reopen the task under the cursor. Editor changes use normal undo and autosave. Changes from another note's query result use revision-checked saves; save any unsaved draft of that source note first.
- Click a checkbox in reading view or live preview to complete it. Live-preview task query blocks show results when the cursor is outside the block. **Edit query** reveals the Markdown source.

Use `- [/] Task` or `-[/] Task` for work in progress. Its **In progress** badge sits to the left of the due date and also appears without a date. The task options menu can mark an incomplete task as in progress or open. Completing it removes the badge.

## Dates and priorities

The file format follows Obsidian Tasks' emoji metadata: `📅` due, `⏳` scheduled, `🛫` start, `➕` created, `✅` done; priorities `🔺`, `⏫`, `🔼`, no marker, `🔽`, `⏬`. These are file content; Slate uses local Lucide icons in its controls.

Completion adds today's done date. Reopening removes it. Recurrence inserts an incomplete next occurrence **above** the completed one, advances due/scheduled/start dates together, refreshes an existing created date, and removes the old block ID. Dates are calculated using due, scheduled, then start as the reference. Overdue repeats advance from the original date; add `when done` to advance from the completion date.

Supported repeat rules:

- `every day`, `every 3 days`, `every week`, `every 2 weeks`, `every month`, `every year` (and other positive intervals up to 1000).
- `every weekday`, `every Friday`, `every week on Tuesday, Friday` (any full weekday names).
- `every month on the last`, `every month on the 1st`, `every 2 months on the 31st`.
- Any of these followed by `when done`.

Simple monthly/yearly intervals clamp nonexistent dates, e.g. January 31 → February 28. An explicit `on the 31st` skips months without that day. Unsupported rules and invalid dates produce errors without changing the task. The dialog requires at least one work date for a repeat rule.

## Query example

Put this in any note:

````markdown
```tasks
not done
due before tomorrow
group by filename
sort by due
sort by priority
hide created date
```
````

Supported instructions:

| Purpose | Syntax |
| --- | --- |
| Completion | `done`, `not done` |
| Dates | `due today`, `scheduled before tomorrow`, `starts on or before today`, `done after yesterday` |
| Relative dates | `due before in 7 days`, `created after 2 weeks ago` |
| Any work date | `happens today` (matches start, scheduled or due) |
| Missing/invalid dates | `no due date`, `has scheduled date`, `due date is invalid` |
| Text | `path includes Work/`, `filename includes Meeting`, `heading includes Next`, `description does not include draft` |
| Tags | `tags include #work`, `tags does not include #personal` |
| Priority | `priority high`, `priority is above medium`, `priority below normal` |
| Recurrence | `is recurring`, `is not recurring` |
| Boolean filters | `(due today) OR (scheduled today)`, `NOT (tags include #waiting)`, nested parenthesized `AND`/`OR`/`NOT` |
| Sort | `sort by due reverse`, multiple sort lines |
| Group | `group by filename`, multiple group lines |
| Limit | `limit 20` |
| Display | `hide due date`, `hide scheduled date`, `hide start date`, `hide created date`, `hide done date`, `hide priority`, `hide recurrence rule`, `hide tags`, `hide backlinks`, `hide edit button`, `hide task count` |
| Explain | `explain` lists the accepted query instructions |

Sorting supports dates, priority, path, filename, heading, description and status. Grouping supports dates, priority, path, filename, heading, folder and status. Explicit sorts take precedence, followed by completion, due date, priority, source path and line. Start-date filters include tasks without a start date, matching Obsidian Tasks. Blank lines and `#` comment lines are ignored. Unknown instructions fail the query with a visible error instead of returning an unfiltered list.

## Compatibility boundary and references

This is an original native implementation inspired by the public Obsidian Tasks docs and source. It does not load the plugin. It implements the workflows above, rather than claiming complete plugin compatibility.

Remaining differences include configurable status types/cycles (custom checkbox characters are preserved but only `x`/`X` is treated as completed), dependency handling, urgency scoring, Dataview-format fields, JavaScript/regex filters, richer natural-language dates, arbitrary recurrence expressions, subtasks in query results, nested group headings, query presets and global query configuration. `explain` echoes accepted instructions instead of reproducing the plugin's detailed explanation engine. Hide directives for absent toolbar/postpone controls are accepted for compatibility.

Research references, reviewed 2026-10-29:

- [Repository overview and source](https://github.com/obsidian-tasks-group/obsidian-tasks)
- [Dates](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Getting%20Started/Dates.md)
- [Recurrence documentation](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Getting%20Started/Recurring%20Tasks.md) and [recurrence implementation](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/Task/Recurrence.ts)
- [Filters](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Queries/Filters.md), [sorting](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Queries/Sorting.md), [grouping](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Queries/Grouping.md), and [status types](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Getting%20Started/Statuses/Status%20Types.md)
