# User's guide

MyWorkForce keeps projects and issues in one workspace. The menu bar is the window title. The left side picks a screen and the right side edits the selected issue.

## Start

Press **Sign in** at the top of the start page to open the sign-in window. After a fresh install, sign in with the administrator account to set up people, teams and the database. People in one company each use their own account and share the same projects and documents. The store is a SQLite file on this computer, or MySQL, MariaDB, SQL Server, or PostgreSQL. Choose it under **Database** in Settings. That store holds every project in the company. Connecting creates the tables it needs and brings the schema up to date. A database missing on the server can be created, and the administrator checks the tables or gets an SQL script for a DBA on the **Schema** card. The installed program starts the data service itself. The data service listens on port `1481` for the company network, and the workspace stays closed until someone signs in.

On the People screen you can enter and change a person's name, title, team, phone, email, and photo. Those personal details are encrypted in the store. A password set on the People screen is required the next time you enter. A workspace left in the browser can be imported from the start screen.

**Talk** on the toolbar, or Talk in Help, opens MyWorkForce Talk. Its menus and buttons use colored icons. The left toolbar is icons only, and each icon shows its name when the pointer rests on it. Notices, people, invite, your details, and work also open the related screen in the main window. A notice opens its page there. Those icons open notices, talks, people, invites, and your details on the right. A person's name sits beside a round photo, and each person without a photo has their own picture. Pressing that row opens the person's details. After a personal talk is open, Invite adds more people to that talk. It shows the person details entered in the main app. You can change your own details there, and an administrator can change anyone's. Sign in with the same account to speak with one person, or choose two or more people for a group talk. Files travel in that talk. Work notices collect in each person's own Notices room, and **Confirm** is pressed by that person. Signing in on one program signs the other in with the same account, and signing out of one signs the other out. The installer adds both MyWorkForce and MyWorkForce Talk. Under **This computer** in Settings, choose to start MyWorkForce and Talk together at boot, and automatic sign-in. They stay one program: one notification-area icon, and closing either window closes the other. The account and password for automatic sign-in stay on this computer.

**Mail** in Settings sends through a server outside this company. The host is an external address such as `smtp.example.com`. Port 587 is STARTTLS and port 465 is SSL. The password stays on this server. **Send a test** checks that a message arrives, and later notices leave through that server.

## Company, teams, projects and pages

MyWorkForce holds one company. The company works in **teams**, teams run **projects**, and what people should know is kept in **pages**.

- **Teams**: people who work together. Open **Company → Teams** in the navigation to see the team cards; a card opens the team's projects, team pages and members. The administrator creates and deletes teams; the administrator and team leads rename a team and change its members. A team that still has projects cannot be deleted, and a deleted team's pages move to the company space.
- **Projects**: made inside a team. Any member may start a project in their team, and whoever starts it becomes its lead. A project can be moved to another team in its settings.
- **Management methods**: each project chooses how it is run. Turn on what you need from Issue list, Kanban, Scrum, Roadmap, Releases and Service queues, and **This project** in the navigation shows only those screens. Kanban and the issue list are methods like the others; at least one stays on.
- **People & access**: each project lists its people with **View** (read only), **Edit** (create and change issues and pages) or **Lead** (manage people, access and settings). The main lead is always a lead. For now only the administrator deletes a project, and the program asks first; a project with sub-projects needs them moved or deleted before.
- **Pages**: the place to share information and documents. The **Company** space is for everyone, a **team** space for its members, a **project** space for that project's people. A single page can be restricted further. The space picker on the Pages screen groups the spaces by company, team and project.

Pages are written like documents. **Edit** shows a large title and a formatting bar (headings 1-3, bold, italic, strikethrough, code, lists, quote, code block, divider, link, table, table of contents, child page list, image, file), and the text looks as it will be read. It is kept as Markdown; the button at the right end of the bar opens the Markdown source. Put **child pages** under a page to split it into chapters and sections; the path above the title leads back up.

Accounts: on the **Users** screen the administrator sets the **ID** and the **password** when creating or editing a person. A password given by the administrator is temporary: at the first sign-in the person must choose their own before anything else opens. The first administrator password after installing works the same way. Passwords have at least 6 characters and can be changed any time under **File → Change password**.

Settings are shown as cards in groups: **General** (start page, appearance), **This computer and sign-in**, **Data** (database and schema) and **Notifications** (mail).

## Tutorial and examples

The start screen opens the tutorial, the user guide, the query language and the examples. The database is in Settings.

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

The search box and the category menus at the top of each screen show only the matching items. The choices depend on the screen: type, status, assignee, form, role, and so on.

The dashboard adds and removes gadgets. Reports cover burndown, velocity, cumulative flow, created versus resolved, pies, time and the sprint. If any issue has points, an issue without points counts as zero. If none have points, each issue counts as one.

Filters store the WQL from the issue screen under a name. Health lists a sub-task with no parent, a done issue with no resolution, an unassigned sprint issue, a breached time limit and a blocked issue.

A service project has queues. Notifications tell watchers about assignments, comments and status changes.

Knowledge is organized in spaces. A space holds a page tree and news posts. A page can contain child pages. A news post stands alone. The body is Markdown. Labels find a page, and comments hold the discussion. Each save keeps the earlier version so it can be restored. Watching a page sends a notification when it changes. When the author restricts a page, only that person can see it.

A page can hold images and files. An image appears in the article. A file appears as a link with its name. Clicking the image or the file link downloads that file, and the right-click menu has Download as well. Export writes HTML, Word, PDF, or Markdown. Clicking a link to another site asks whether to open it in the browser.

## Documents

The Documents screen starts a meeting note, decision, specification, requirements list, test report, release note, retrospective, status report, design brief, incident report, procedure, handover, weekly report, or proposal from a form. The deliverable form is where a person registers something they made.

Only the author edits a document. Until it is shared, only the author sees it. Sharing with the project lets people who open that project read it. Sharing with everyone lets anyone in the workspace read it. An issue key keeps the document next to that issue. A document takes images and files too, and exports as HTML, Word, PDF, or Markdown.

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
