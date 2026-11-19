# WQL

Work Query Language picks issues inside one project. An empty query returns every issue, ordered by rank. Writing conditions next to each other means AND.

```text
type = bug AND status != done
assignee = currentUser() sprint = openSprints()
```

## Fields

key, summary, description, text, comment, type, status, priority, resolution, assignee, reporter, label, component, version, sprint, epic, parent, points, created, updated, due, watcher, sla, project, rank. Korean names work as well. `text` searches the key, summary, description, environment and comments together.

Requirements and tests: `coverage` (failed, blocked, uncovered, notrun, partial, passed, other), `result` (pass, fail, blocked, notrun — a test case's last result), `suspect` (true / false), `category`, `verification`, `level`.

## Operators

`= != ~ !~ > >= < <=`, `IN`, `NOT IN`, `IS EMPTY`, `IS NOT EMPTY`, `NOT`, `AND`, `OR` and parentheses. `~` matches a part of the text.

Priority comparisons use the order from lowest to highest. `priority >= high` means high and highest.

A date is `2026-11-15` or a relative value such as `-7d`, `-2w`, `-1m`, `-1y`. A date with no time matches that local day.

## Functions

| Function | Meaning |
| --- | --- |
| `currentUser()` | The person using the app |
| `openSprints()` | Sprints that are active |
| `now()` | The current time |

`assignee is empty` is an issue with nobody assigned.

## Time limits

`sla = breached` is an open incident or service request past its limit. `sla = met` was closed in time. `sla = missed` was closed late.

## Order

End the query with `ORDER BY priority DESC, rank ASC`. A column header on the issue screen adds the same kind of order. If the query already has ORDER BY, the column header leaves it alone.
