# MyWorkForce User's Guide

MyWorkForce keeps a company's work in one place. **Projects** and **issues** plan and track what has to be done (boards, backlog, sprints, roadmap, timeline), and **pages** in **workspaces** hold what people need to know, written together. Everyone in the company signs in with their own account and sees the same data. A companion chat program, **MyWorkForce Talk**, comes with it.

Read the chapters in order from the contents on the left, or jump to the one you need. **Find** at the top searches the guide, **한국어 / English** switches the language, and **Print** puts it on paper or into a PDF.

## Getting started

### Installing and running

The installer puts **MyWorkForce** and **MyWorkForce Talk** in the Start menu. The program starts its own data service (port `1481` inside the company), so there is nothing else to run. In a web browser, open the address your administrator gives you.

### Signing in

**Sign in** at the top of the start page, or **Sign in** on the **Start** card, opens the sign-in window. Enter your account and password.

- **Close** (×) on the sign-in window closes it, and the start page stays usable. The guides, the tutorial document, the background, the language and About need no sign-in.
- Real work, such as opening a project or a page or starting the tutorial, always needs a sign-in; the sign-in window opens again then.
- A password set by the administrator is temporary: change it at the first sign-in before anything else opens. Passwords have at least 6 characters; change yours any time under **File → Change password**.
- A fresh install has the administrator account `admin`, which chooses a new password at the first sign-in.

### The start page

| Part | What it does |
| --- | --- |
| Top row | **Show the start page at launch**, **Start page settings** (which cards and the welcome window), **Auto arrange** (lay the cards out without gaps) |
| Program card | Name and version, **User guide**, **Tutorial document**, the **Help** menu, **Start the tutorial** |
| Start | Tutorial, documents, examples, Enter (or Sign in), welcome window, shortcuts, language, About |
| Projects | The projects you take part in; click one to go in |
| Examples | 30 software, business and service examples; a card replaces the workspace with that example |
| Background | 24 animated backgrounds, speed, random at start, change automatically |

Drag a card by its handle and resize it from its bottom-right corner. The background can be changed without signing in.

## The window

| Part | Contents |
| --- | --- |
| Menu bar | Start, File, Edit, View, Issue, Plan, Help, Admin; it is also the title bar, and at its right end (left of Minimize) are the buttons that show and hide the left and right panels |
| Toolbar | Project picker, search box, **magnifier** (search everything), Go to (Ctrl+K), new issue, notifications, Talk, who is signed in, sign out, language, theme, About |
| Left navigation | Sections: **Company** (teams, projects, documents, work calendar, plan), **Workspaces** (workspaces with their page trees, new workspace), **My work** (my teams, my projects), **This project** (the open project's screens), **Administrator menu**. Click a section title to fold it; folded sections stay folded next time |
| Centre | The chosen screen |
| Right panel | Details and properties of the chosen issue, page or workspace, in sections like the left panel; click a section title to fold it, and folded sections stay folded next time |
| Status bar | Issue count, project type, who is signed in, database |

Hover a toolbar icon to see its name and shortcut. Ctrl+Shift+1 and Ctrl+Shift+2 fold the left and right panels.

## Company, teams and projects

MyWorkForce holds one company. The company has **teams**, and teams run **projects**.

### Teams

**Company → Teams** shows a card per team; open one to see its projects, team pages and members. Administrators create and delete teams; administrators and team leads rename them and change members. A team with projects cannot be deleted.

### Creating and opening projects

**New project** (Ctrl+Shift+N) asks for a name, a key (2–10 characters starting with a capital letter), a type (software, business, service) and a team. Whoever creates it leads it. A row in **Projects** or a project card on a team page opens with **Open** or a **double-click**.

### How a project is run

Each project picks its methods: issue list, kanban, scrum, roadmap, releases, service queues. Only the screens of the chosen methods appear under **This project**. The roadmap method brings the **Timeline** too.

### People and access

Each project gives people **View** (read only), **Edit** (create and change issues and pages) or **Lead** (people, access and settings). Only administrators delete projects.

## Issues

### Creating

Use **+** on the toolbar or Ctrl+N. Set the type, summary, description, priority, assignee, epic, sprint and points. Sub-tasks are made from an open parent issue.

### The issue screen

Edit the summary in place; the description is Markdown. The tabs are **Description, Comments, Work log, History, Links**. `@name` in a comment notifies that person. Log work as `90`, `1h 30m`, `1.5h` or `2d` (a day is 8 hours).

The right panel changes status, resolution, assignee, reporter, epic, sprint, points, estimate, **start**, **due**, labels, components, fix versions and custom fields; watchers and attachments (700KB a file) are there too.

### Links and dependencies

The **Links** tab connects issues: **blocks**, **relates to**, **duplicates**, **clones**. "A blocks B" means B waits for A.

- While an earlier issue is still open, the issue shows **Waiting for** in red at the top, and its board card shows a lock.
- Links that would make issues wait for each other (A blocks B and B blocks A) are refused.

### Lists and bulk changes

On **Issues**, click a column heading to sort, and select several issues to change status or assignee at once. The search box and filters (type, status, priority, assignee) narrow the list; the query box accepts WQL (see the WQL chapter). CSV import is here too.

## Boards and backlog

### Boards

A scrum board shows the active sprint; a kanban board shows every issue. Drag a card to another column to change its status; a column over its limit gets a red border. **Double-click a card** to open its issue. The picker at the top splits the board into lanes by assignee, epic or priority.

### Backlog and sprints

Drag issues from the backlog into a sprint, then **Start** a planned sprint. **Complete** sends unfinished issues to the backlog or the next sprint. Backlog rows open with a double-click too; the right panel narrows the backlog to one epic.

## Roadmap and timeline

### Roadmap

Each epic shows how much of its work is done.

### Timeline

The project's issues as bars on a time axis, grouped under their epics (issues without an epic come last).

- A bar runs from the issue's **start** to its **due** date. Without dates it is estimated from its sprint, or a week from when it was made, and drawn dashed.
- **Drag a bar** to move its dates; **drag an end** to change its length.
- Hover a bar to see a dot on its right; **drag the dot onto another bar** to make that issue wait for this one.
- Arrows are dependencies. When an earlier issue ends after the next one should start, the **arrow turns red** and a warning shows at the top.
- At the top choose **Days / Weeks / Months**, **Today**, and **Undated issues too**. Click a name to open the issue.

## Workspaces and pages

What people need to know goes on **pages** in **workspaces**. The company workspace is for everyone, a team workspace for its members, a project workspace for that project's people.

### Making a workspace

**Company → Workspaces** in the left navigation lists every workspace you can see. The arrow before **Workspaces** folds the list, and the arrow before each workspace folds its page tree. **New workspace** at the bottom (or **+** on the Workspaces row) shows a name box: type a name and press Enter (Esc cancels); the key is chosen for you.

Click a workspace to open its home in the centre (description, page search, pages, recently updated) and its **Workspace properties** in the right panel. There you change the name, the description and **Who sees it** (the whole company, one team or one project), see the key, creator, page count and last change, restore or delete pages in the **Trash**, and **Delete the workspace**. Its creator and administrators change these. **Delete the workspace** removes every page in it (the trash too), and says how many first; it cannot be undone.

### The right-click menu and deleting

**Right-click a page** in the left navigation or a child page list for Open, New child page, Make a copy, Export as HTML and **Move to the trash**. **Right-click a workspace** for Open, New page, Properties and **Delete the workspace**. The trash button at the right of a page's path line deletes it too. Delete appears only for people allowed to do it (anyone who may edit the page; a workspace's creator and administrators).

A page moved to the trash takes its child pages with it, and they come back together. The trash is in the workspace properties (right panel), where pages are restored or deleted for good.

### New pages and templates

**+** on a workspace row makes a page; **+** on a page row makes a child page under it. A new page starts in the **Templates** window:

- Forty templates in eight groups (meetings, product, engineering, operations & IT, project management, people & HR, sales/marketing/customers, general work): meeting notes, retrospective, PRD, technical design, incident postmortem, runbook, project plan, risk register, onboarding, OKRs, campaign plan, FAQ, how-to guide, weekly report and more.
- Click a template to preview it; **Create from this template** or a double-click opens the filled-in page. **Blank page** starts with a title only.

### Writing

A page opens **ready to write**. Changes **save by themselves** ("Saved" shows under the editor); **Save** or Ctrl+S saves at once, and moving to another page saves first. **Preview** shows the page as readers see it, with live issue lists and highlighted mentions.

The formatting bar has undo, body text, headings 1–3, bold, italic, strikethrough, code, bulleted and numbered lists, quote, code block, divider, link, table, table of contents, child page list, **insert issues**, **mention someone**, image and file. The button at the far right edits the Markdown source directly.

### Issues inside pages

**Insert issues** → **One issue** with a key (e.g. `PAY-12`) puts that issue in as a chip with its status. **Query list** with a project and WQL (e.g. `status != done`) puts in a table of the matching issues. Both are live every time the page is read, and a click opens the issue. In the text they are `[[issue:PAY-12]]` and `[[issues:PAY | status != done]]`.

### Mentions

Type `@` in the page or a comment to get a list of people; pick one with the arrows and Enter to insert `@name` and notify them. Only people who can see the page are told.

### The page panel

The right panel shows the page: workspace, kind, creator, last update, views, versions, labels, status (draft, review, published), parent page, like and watch, access and sharing (restriction, editors, readers, public link), export (HTML, Word, PDF, Markdown), copy, trash, and **Earlier versions**.

### Versions and comparison

Every save keeps the earlier text as a version (one person's automatic saves within ten minutes count as one). **Compare** on a version shows what changed: removed lines red, added lines green; choose the two versions at the top. **Restore** goes back to a version.

## Comments, files and writing together

### Comments and replies

Write under **Comments** and post with **Comment** or Ctrl+Enter. Each comment can have **replies**; writers edit or delete their own.

### Inline comments

Select text in a page to get a **Comment** button. Such a comment is tied to that passage, which is highlighted in yellow. Click the highlight to reach the comment, or the comment's quote to reach the passage. **Resolve** removes the highlight when the discussion is over; **Reopen** brings it back.

### Files

Drop files on a page's **Files** area, or use **Add files** to add several at once. Each file may be up to 700KB; larger ones are named and skipped. The image and file buttons on the formatting bar put files into the text.

### Writing together

When several people open the same page they write it **together**. "Writing with …" shows beside the path, and other people's changes appear on your screen within about a second. Changes to different lines are all kept; when two people change the same line at once, both versions stay so they can be tidied. The caret stays where you are typing.

## Search everything

The **magnifier** on the toolbar (Ctrl+Shift+F) opens **Search everything**: projects, issues, workspaces, pages, documents, comments, files, people and teams in one search, grouped by kind.

- **All** shows five of each kind; the other tabs show the whole kind. Matching words are highlighted.
- Several words find only what contains them all. Nothing you may not see is shown.
- Click a result to go there; files can be downloaded straight away.
- Words in the toolbar search box plus Enter open the same search; WQL such as `status = done` opens the issue list.

## Notifications and Talk

### Notifications

The bell on the toolbar shows how many notifications are unread. **Notifications** lists project notices (assignment, comments, status changes, watched pages) and company notices (mentions, changes to company and team pages). Click one to open its issue or page; **Mark all read** clears them. **Notification settings** below choose what each project, page, document and issue sends.

### MyWorkForce Talk

**Talk** on the toolbar opens MyWorkForce Talk: chat with one person or a group and send files. The icon column on the left is notices, talks, people, invite, my details, language, the work program, password and sign out.

- Work notices pile up in each person's own **Notices** room. Each starts with what happened, such as "You were mentioned" or "Page comment"; click it to open the issue or page in the main window (pages open ready to write).
- In messages, `@` brings up the list of people, and `@name` stands out.
- Signing in on one side signs in the other with the same account; signing out of one signs out of both.

## Documents

The **Documents** screen makes documents from forms: meeting notes, decisions, specifications, requirements, test reports, release notes, retrospectives, status reports, designs, incident reports, procedures, handovers, weekly reports and proposals. Only the writer edits a document; share it with **Only me**, **Project** or **Everyone**. An issue key ties it to that issue; export as HTML, Word, PDF or Markdown.

## Reviewing the work

- **Dashboard**: add or remove gadgets (my issues, activity, sprint, distribution, created and resolved).
- **Reports**: burndown, velocity, cumulative flow, created and resolved, distribution, time, sprint, control chart, epic burndown.
- **Filters**: keep the issue query under a name.
- **Health**: sub-tasks without a parent, done without a resolution, overdue and blocked issues.
- **Queues**: a service project's requests with their time limits (SLA).

## WQL

WQL is the query language for choosing issues. **You do not have to learn it.** For most work the search box and filters on each screen, and Search everything, are enough. WQL helps with complex conditions, saved filters and queues, and issue lists inside pages.

| Example | Meaning |
| --- | --- |
| `status != done` | Issues not finished |
| `assignee = currentUser()` | Issues assigned to me |
| `type = bug AND priority = highest` | The most urgent bugs |
| `text ~ "refund"` | Issues whose summary or description mentions "refund" |
| `status != done ORDER BY due ASC` | Open issues by due date |

The full grammar is in **Help → WQL guide**.

## The File menu

| Menu | What it does |
| --- | --- |
| New project | A software, business or service project |
| Open | A `.mwf` or JSON workspace; dropping one on the window opens it too |
| Save, Save as | Keep the workspace in a file (on the web: a download) |
| Export Markdown, CSV | The issue list as a table |
| Export this project | One project and its people |
| Print | Print the screen |
| Change password, Sign out | Your account |

## Settings and administration

### Accounts and people

Administrators create people on **Users** and set their account and a temporary password. Name, title, team, phone, email and photo are kept encrypted. Turning **Active** off stops a person from signing in.

### Settings

Settings come as grouped cards: **General** (start page, background, look, font, theme), **This computer and sign-in** (start MyWorkForce and Talk with the computer, automatic sign-in), **Data** (database and schema) and **Notifications** (mail server).

- **Database**: SQLite on this computer, or MySQL, MariaDB, SQL Server or PostgreSQL. Connecting creates the tables and brings the schema up to date; administrators see the tables and get SQL for a DBA on the **Schema** card.
- **Mail**: a mail server outside the company (587 for STARTTLS, 465 for SSL); **Send a test** checks it.

### Project settings

Name, description, lead, methods, archive, workflow (statuses and transitions), custom fields and automation rules (set the assignee, priority, labels or watchers when an issue is created or moves). A status still in use cannot be deleted.

## Shortcuts

In text boxes only Ctrl combinations work. The full list is also under **Help → Shortcuts** (?).

| Keys | Action |
| --- | --- |
| Ctrl+Shift+N | New project |
| Ctrl+N, C | New issue |
| Ctrl+O, Ctrl+S, Ctrl+Shift+S | Open, Save (the page when one is being written), Save as |
| Ctrl+Z, Ctrl+Y | Undo, Redo |
| Ctrl+F, / | Toolbar search box |
| Ctrl+Shift+F | Search everything |
| Ctrl+K | Go to an issue |
| Ctrl+1 … Ctrl+7 | Project home, board, backlog, roadmap, issues, dashboard, reports |
| Ctrl+9 | Documents |
| G then H, B, A, I | Project home, board, backlog, issues |
| J, K, Enter | Next issue, previous issue, open the chosen issue |
| Ctrl+D, Delete | Clone, delete an issue |
| Ctrl+Shift+T | Sub-task |
| Ctrl+Enter | Post a comment or reply |
| Ctrl+Shift+P | New sprint |
| Ctrl+Shift+1, Ctrl+Shift+2 | Left, right panel |
| Ctrl+Shift+L, Ctrl+Shift+B | Language, theme |
| Ctrl+, | Settings |
| F1, ?, Ctrl+Shift+A | User guide, shortcuts, About |
| Esc | Close a window, leave an issue |

Undo covers the last 40 changes to the workspace; language and theme are not undone.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| The sign-in window keeps opening | Work such as projects and pages needs a sign-in. To stay on the start page, close the sign-in window |
| "Someone else saved first" | Someone saved the same data first and the latest was reopened; repeat your last change |
| A page shows "Saving…" for a long time | Check the connection to the data service; the page saves by itself when it is back |
| An issue table shows "Not available" | You do not take part in that project, or the query has a mistake |
| A file will not go in | Each file may be up to 700KB |
| The data service did not answer | Restart the installed program; on the web, ask the administrator for the server address |
