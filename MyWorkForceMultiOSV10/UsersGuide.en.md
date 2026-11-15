# User's guide

MyWorkForce keeps projects and issues in one workspace. The menu bar is the window title. The left side picks a screen and the right side edits the selected issue.

## Start

The first screen chooses a database. **This computer** uses a SQLite file. **Server database** connects to MySQL, MariaDB, SQL Server, or PostgreSQL. This installation is personal, so the data service listens only on `127.0.0.1:1481`. An administration app will open the same database later.

A password set on the People screen is required the next time you enter. A workspace left in the browser can be imported from the start screen.

## Tutorial and examples

The tabs on the start screen move between the tutorial, the user guide, the query language, the examples and the database.

**Start the tutorial** opens the shop example and follows the coach in the corner. The order is Home, the board, the backlog, a query, the roadmap, knowledge, the work calendar, reports and this guide. The last step closes the coach.

There are more than twenty examples, mixing software, business and service projects. The sentence on each card says what that workspace is about. Choosing a card replaces the workspace with that example. If projects already exist, it asks first. When the workspace has a password, type it on the start screen before opening an example.

**Choose an example** on Home returns to the same list. **Tutorial** starts the coach again.

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

**Choose an example** on Home returns to the example list on the start screen. **Empty workspace** clears the projects.

## Issues

Create one with the Issue button or Ctrl+N. Set the type, summary, description, priority, assignee, epic, sprint and points. A sub-task needs its parent issue open first.

On the issue screen, edit the summary. The description is Markdown, and Preview shows the result. In a comment, `@name` notifies that person. A work log accepts `90`, `1h 30m`, `1.5h` or `2d`. A day is 8 hours, so `2d` is 960 minutes.

The right side changes status, resolution, assignee, points, estimates, the due date, labels, components, fix versions and custom fields. Watchers and attachments are there too. An attachment must be 700KB or smaller.

On the issue list, click a column to sort. Select several rows to change their status or assignee together. Ctrl+K finds an issue by key or summary. J and K move through the issues on screen, and Enter opens the selected one.

## Planning

The scrum board shows only the active sprint. Drag a card to another column to change its status. A progress column with a limit gets a red border when the limit is passed.

Drag from the backlog into a sprint. Start a future sprint, then complete it from the board. Unfinished issues go to the backlog or to another sprint.

The roadmap shows how much of each epic is done. Releases mark a version shipped, and components group issues.

## Review

The dashboard adds and removes gadgets. Reports cover burndown, velocity, cumulative flow, created versus resolved, pies, time and the sprint. If any issue has points, an issue without points counts as zero. If none have points, each issue counts as one.

Filters store the WQL from the issue screen under a name. Health lists a sub-task with no parent, a done issue with no resolution, an unassigned sprint issue, a breached time limit and a blocked issue.

A service project has queues. Notifications tell watchers about assignments, comments and status changes.

Knowledge is organized in spaces. A space holds a page tree and news posts. A page can contain child pages. A news post stands alone. The body is Markdown. Labels find a page, and comments hold the discussion. Each save keeps the earlier version so it can be restored. Watching a page sends a notification when it changes. When the author restricts a page, only that person can see it.

## Documents

The Documents screen starts a meeting note, decision, specification, requirements list, test report, release note, retrospective, status report, design brief, incident report, procedure, handover, weekly report, or proposal from a form. The deliverable form is where a person registers something they made.

Only the author edits a document. Until it is shared, only the author sees it. Sharing with the project lets people who open that project read it. Sharing with everyone lets anyone in the workspace read it. An issue key keeps the document next to that issue.

## Settings

Change the project name, description and lead, allow any status from the board, or archive the project. An archived project allows browsing and administration only.

Add statuses and transitions under Workflow. A status that issues still use cannot be removed. Fields and automation rules are added here too. A rule runs when an issue is created or moved to a status, and then assigns, sets a priority, adds a label or adds a watcher.

Text size and custom colours are here as well. KO / EN and the sun icon on the toolbar switch language and theme.

## Shortcuts

Only Ctrl combinations work while typing. Press G, then a letter, to change screens. The same list opens from Help, Shortcuts.

| Key | Action |
| --- | --- |
| Ctrl+Shift+N | New project |
| Ctrl+O | Open |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save as |
| Ctrl+P | Print |
| Ctrl+Shift+H | Start page |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Shift+Z | Redo |
| Ctrl+F | Find |
| / | Focus search |
| Enter | Run the search, or open the selected issue |
| Ctrl+K | Go to an issue |
| Ctrl+1 | Project home |
| Ctrl+2 | Board |
| Ctrl+3 | Backlog |
| Ctrl+4 | Roadmap |
| Ctrl+5 | Issues |
| Ctrl+6 | Dashboard |
| Ctrl+7 | Reports |
| Ctrl+8 | Knowledge |
| Ctrl+9 | Documents |
| Ctrl+0 | Work calendar |
| G then H, B, A, I | Project home, board, backlog, issues |
| J | Next issue |
| K | Previous issue |
| Esc | Close a dialog or leave the issue |
| Ctrl+N | New issue |
| C | New issue |
| Ctrl+D | Clone |
| Delete | Delete |
| Ctrl+Shift+T | Sub-task |
| Ctrl+Shift+M | Comments |
| Ctrl+Enter | Add the comment |
| Ctrl+Shift+P | New sprint |
| Ctrl+Shift+1 | Left panel |
| Ctrl+Shift+2 | Right panel |
| Ctrl+Shift+L | Language |
| Ctrl+Shift+B | Change the theme |
| Ctrl+, | Settings |
| F1 | User guide |
| ? | Shortcuts |
| Ctrl+Shift+A | About |

Undo keeps 40 workspace changes. Language and theme are not undone.
