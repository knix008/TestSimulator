# User's guide

MyWorkForce keeps projects and issues in one workspace. The menu bar is the window title. The left side picks a screen and the right side edits the selected issue.

## Files

| Menu | What it does |
| --- | --- |
| New project | Creates a software, business or service project. The key is 2–10 characters and starts with a capital letter. |
| Open | Opens a `.mwf` or JSON workspace. |
| Save | Writes the current path. If there is no path, it asks for one. |
| Save as | Writes a new file. |
| Export Markdown | Saves the issue list as a table. |
| Export CSV | Saves the same list for a spreadsheet. |
| Export this project | Saves one project and the people related to it. |

On the web, Save downloads a file and Open uses the file picker. Dropping a file on the window opens it too. Work is also kept on this device automatically.

**Load the example** on Home replaces the workspace with the shop and the support desk. **Empty workspace** clears the projects.

## Issues

Create one with the Issue button or Ctrl+N. Set the type, summary, description, priority, assignee, epic, sprint and points. A sub-task needs its parent issue open first.

On the issue screen, edit the summary. The description is Markdown, and Preview shows the result. In a comment, `@name` notifies that person. A work log accepts `90`, `1h 30m`, `1.5h` or `2d`. A day is 8 hours, so `2d` is 960 minutes.

The right side changes status, resolution, assignee, points, estimates, the due date, labels, components, fix versions and custom fields. Watchers and attachments are there too. An attachment must be 700KB or smaller.

On the issue list, click a column to sort. Select several rows to change their status or assignee together. Ctrl+K finds an issue by key or summary.

## Planning

The scrum board shows only the active sprint. Drag a card to another column to change its status. A progress column with a limit gets a red border when the limit is passed.

Drag from the backlog into a sprint. Start a future sprint, then complete it from the board. Unfinished issues go to the backlog or to another sprint.

The roadmap shows how much of each epic is done. Releases mark a version shipped, and components group issues.

## Review

The dashboard adds and removes gadgets. Reports cover burndown, velocity, cumulative flow, created versus resolved, pies, time and the sprint. If any issue has points, an issue without points counts as zero. If none have points, each issue counts as one.

Filters store the WQL from the issue screen under a name. Health lists a sub-task with no parent, a done issue with no resolution, an unassigned sprint issue, a breached time limit and a blocked issue.

A service project has queues. Notifications tell watchers about assignments, comments and status changes.

## Settings

Change the project name, description and lead, allow any status from the board, or archive the project. An archived project allows browsing and administration only.

Add statuses and transitions under Workflow. A status that issues still use cannot be removed. Fields and automation rules are added here too. A rule runs when an issue is created or moved to a status, and then assigns, sets a priority, adds a label or adds a watcher.

Text size and custom colours are here as well. KO / EN and the sun icon on the toolbar switch language and theme.

## Shortcuts

| Key | Action |
| --- | --- |
| Ctrl+K | Go to an issue |
| Ctrl+N | New issue |
| Ctrl+S | Save |
| Ctrl+O | Open |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+P | Print |
| Enter | Run the search |
| Esc | Close a dialog |

Undo keeps 40 workspace changes. Language and theme are not undone.
