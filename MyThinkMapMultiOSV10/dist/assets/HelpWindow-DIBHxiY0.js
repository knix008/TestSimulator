import{r as E,u as A,a as d,j as s,D as R,I as D,t as w,o as P}from"./index-B9OqL3sS.js";const U=`# Getting started

My ThinkMap is a mind-mapping program: you start from a central topic and branch out. It works the same as a desktop app on Windows, macOS and Linux and in a web browser.

![Start page](images/start-page.png)

*The start page: new map, templates, open, import, the feature tour and recent files.*

## Your first map

1. Press **New map** on the start page, or \`Ctrl+N\`. A **central topic** appears with its text selected.
2. Type the subject and press \`Enter\` to confirm.
3. \`Tab\` (or \`Insert\`) adds a **subtopic** that you can type into right away.
4. To add a topic on the same level press \`Enter\` again — on a confirmed topic \`Enter\` makes a **sibling**.
5. Save with \`Ctrl+S\`. Maps are saved as \`.tmap\` files.

![A new map](images/main-window.png)

*A map with a few topics. The outline is at the left, the task pane at the right.*

## Feature tour

**Feature tour** on the start page opens a sample map that uses almost every feature — icons, tags, notes, task info, relationships, boundaries, callouts, floating topics. Change anything; \`Ctrl+Z\` undoes.

## Session

Close the program and open it again: the maps you had open come back, including new maps you never saved and unsaved changes. This can be turned off in [Settings](14-settings.md).

## More

- The parts of the window: [Screen layout](02-screen-layout.md)
- Working with topics: [Making and editing topics](03-topics.md)
- Every key: [Keyboard shortcuts](15-shortcuts.md)
`,O=`# Screen layout

![Main window](images/main-window.png)

*Menu bar, toolbar, tabs, sidebar (left), map canvas (centre), task pane (right), status bar.*

## Menu bar

At the top: the app icon and name, the **Start** button, and the File · Edit · Insert · Format · View · Tools · Help menus. On the desktop the menus open as system menus; drag the empty part to move the window, double-click it to maximise.

## Toolbar

![Toolbar](images/toolbar.png)

*From the left: file, undo, adding topics, topic content, layout and style, expand / collapse, zoom, views, panes.*

| Group | Buttons |
| --- | --- |
| File | New map, open, save, export, print |
| Topics | Sub, sibling and parent topic, callout, floating topic, relationship, boundary |
| Content | Icons, notes, links, task — they open that tab of the task pane (Format is its first tab) |
| Map | Layout picker, map style picker |
| View | Expand / collapse all, branch only, zoom, fit, map · outline · Gantt, presentation |

At the right end: theme (click for the next one, ▾ for the list), language (the flag), settings and about.

## Tabs

One tab per map. An unsaved map has an italic name and a ●. Drag tabs to reorder, middle-click to close, right-click for the tab menu.

## Sidebar

- **Outline** — the whole map as a tree. Click an entry to select that topic and bring it to the centre.
- **Find** — find and replace in topics and notes. → [Find and filter](10-find-filter.md)
- **Filter** — filter topics by priority, icon, tag, status or due date.

## Task pane

The **Format · Icons · Notes · Task · Links** of the selected topics, and the **Map** tab for the whole map. Drag the edge of the sidebar or the task pane to resize it; hide them with the two toolbar buttons or the View menu.

## Map canvas

Where the map is drawn. Drag empty space to move around, the wheel scrolls, \`Ctrl+wheel\` zooms. The **overview** at the bottom right shows the whole map small — click or drag in it to go there.

## Status bar

The latest message at the left; at the right the level of the selected topic, the number of topics, the filter state, the layout, the map style and the zoom. Click the layout or the style to change them.
`,N=`# Making and editing topics

## Kinds of topics

- **Central topic** — the subject of the map. One per map; it cannot be deleted.
- **Main topics** — the topics on the central topic. Each branch has its own colour.
- **Subtopics** — everything below them.
- **Floating topics** and **callouts** — see [Relationships, boundaries, callouts](08-relationships.md).

## With the keyboard

| Key | Does |
| --- | --- |
| \`Enter\` | Sibling below — on the central topic, a main topic |
| \`Shift+Enter\` | Sibling above |
| \`Tab\` / \`Insert\` | Subtopic |
| \`Ctrl+Shift+Insert\` | Parent topic — wraps the selected topic in a new one |
| \`Ctrl+Shift+Enter\` | Callout |
| \`Delete\` | Delete the topic and its subtopics |
| \`Ctrl+Delete\` | Delete the topic only — its subtopics stay in its place |

A new topic is ready to type into. Press \`Esc\` without typing and it goes away again.

## Editing the text

![Editing a topic](images/editing.png)

*A topic being edited. The box grows with the text as you type.*

- With a topic selected, **just start typing**: the text is replaced by what you type. Korean input methods work the same way.
- \`F2\` or a **double-click** edits the current text.
- While editing: \`Enter\` confirms · \`Shift+Enter\` breaks the line · \`Esc\` cancels · \`Tab\` confirms and adds a subtopic.

## Selecting and moving around

- Click to select; \`Ctrl\`- or \`Shift\`-click to select several.
- \`Shift\`- or \`Ctrl\`-drag on empty space selects the topics in the rectangle.
- The arrow keys move to the nearest topic on screen; the arrow toward a branch's growth goes to its subtopics, the opposite one to the parent. \`Home\` goes to the central topic.
- \`Alt+↑\` / \`Alt+↓\` reorder a topic among its siblings.

## Dragging

![Dragging](images/drag.png)

*While dragging, the drop place is shown.*

- Drop on the **middle** of a topic: it becomes its subtopic (dashed outline).
- Drop on its **upper or lower edge** (left / right in an org chart): sibling before or after (a line shows where).
- Drop on **empty space**: a floating topic. Floating topics can be dragged anywhere.
- A topic cannot go into its own branch.

## Folding

Hover a topic with subtopics to see a **−** button where its branch leaves. Click it to fold — the button then shows how many subtopics are hidden — and again to unfold. On the keyboard: \`Space\`. The View menu has **Expand all**, **Collapse all** and **Expand to level n**.

## Cut, copy, paste

\`Ctrl+X\` · \`Ctrl+C\` · \`Ctrl+V\` work on the selected topics with their branches. Copied topics paste into other programs as indented text, and lines of text copied elsewhere paste as topics (indentation gives the levels). A copied picture pastes as the selected topic's picture.

## Quick entry

**Insert › Quick entry** (\`Ctrl+Shift+Q\`) adds many topics at once: one per line, \`Tab\`-indented lines become subtopics of the line above.

![Quick entry](images/quick-entry.png)

## Undo

Every change is undone with \`Ctrl+Z\` and redone with \`Ctrl+Y\`. Each map keeps its own history; a run of changes such as dragging a slider counts as one step.
`,B=`# Layouts and map styles

## Layouts

Choose the shape of the whole map from **Tools › Layout**, the layout button on the toolbar, or the **Map** tab of the task pane.

| Layout | Shape |
| --- | --- |
| Map (both sides) | Branches spread to both sides of the central topic — the default |
| Right map · Left map | Branches to one side only |
| Org chart (down · up) | Top to bottom (or bottom to top); lists from the third level |
| Tree (right · left) | Downward, like an indented list |
| Timeline | Main topics in a row on an axis, their subtopics listed below |
| Fishbone | A spine running left from the head, main topics on bones above and below, subtopics as causes |

![Org chart](images/layout-org.png)

*The org chart layout.*

![Fishbone](images/layout-fishbone.png)

*The fishbone layout — for finding the causes of a problem.*

![Timeline](images/layout-timeline.png)

*The timeline layout — for schedules and roadmaps.*

## A different layout for one branch

Select a topic and choose right, left, down, up or a list under **Format › Subtopic layout** in the task pane: only that topic's subtopics are laid out differently — say, one branch of a map laid out like an org chart. **Automatic** follows the map's layout.

## Balancing the sides

On the map layout a new main topic goes to the emptier side. Drag a main topic to the other side to move it; **Tools › Balance both sides** puts the main topics right and left in turn.

## Map styles

![Map styles](images/map-pane.png)

*The Map tab: layout, map style, lines, spacing, numbering.*

A map style sets the background, topic boxes, lines and branch colours at once. **Follow app theme** (the default) uses the colours of the app theme. The others — Classic, Rainbow, Pastel, Midnight, Neon, Blueprint, Paper, Monochrome, Forest, Sunset, Ocean, Business, Candy, Graphite, Sketch — always look the same, whatever the app theme, and so do the pictures you export.

On top of the style, per map:

- **Line shape**: curve · straight · elbow · rounded elbow
- **Branch colours**: a colour per main topic or not
- **Background**: the map's background colour
- **Spacing**: across and down (50% – 250%)
- **Numbering**: \`1.\` \`1.1.\` or \`I.\` \`I.A.\` from the main topics

## Showing one branch

To concentrate on one branch of a big map, select its topic and press \`F4\` (View › Show this branch only). It moves to the centre and the rest is hidden. \`F4\` again, \`Esc\` or the note at the bottom brings the whole map back.
`,I=`# Formatting topics

Change how a topic looks on the **Format** tab of the task pane. With several topics selected they all change. Whatever is not set follows the [map style](04-layouts-styles.md).

![Format tab](images/format-pane.png)

*The Format tab: shape, colours, text, subtopic layout.*

## Shape

Rounded rectangle, rectangle, capsule, ellipse, underline, hexagon, diamond, circle or no border. The button with the dashed outline is the shape the style uses now; click a chosen shape again to go back to the style's.

## Colours

- **Fill** — the colour inside the box. **None** is transparent.
- **Text** — when not set, a readable colour is picked to match the fill.
- **Border** — colour and width (none, 1 – 6 px).
- **Line** — colour and width of the line into this topic and of its branch.

A colour button opens a palette. **Automatic** returns to the style's colour; the colour box at the right picks any colour.

## Text

Font, size, **bold** (\`Ctrl+B\`), *italic* (\`Ctrl+I\`), underline (\`Ctrl+U\`), strikethrough and alignment. Text longer than the **max width** wraps. Format › Larger / Smaller text changes the size by 2 px.

## Copying a format

**Copy format** remembers a topic's format; select other topics and **Paste format** makes them look the same. **Clear format** returns a topic to the style's defaults.
`,j=`# Icons, tags and task info

## Icons

![Icons tab](images/markers-pane.png)

*The Icons tab: priority, progress, flags, faces, arrows, symbols, tags.*

Pictures in front of a topic's text. Click one on the **Icons** tab of the task pane to add it, again to remove it.

- **Priority 1 – 9** — \`Ctrl+Shift+1\` … \`9\`, remove with \`Ctrl+Shift+0\`.
- **Progress** 0 · 25 · 50 · 75 · 100%.
- **Flags · faces · arrows** — one of each group per topic.
- **Symbols** — star, question, important, idea, check, info, warning, money, calendar, person … as many as you like.

## Tags

Tags are words shown as small labels under the topic. Type one and press \`Enter\` to add it; × on a label removes it. Tags used in the map or before are suggested below. Gather tagged topics with the [filter](10-find-filter.md).

## Task info

![Task tab](images/task-pane.png)

*The Task tab: start, due, duration, milestone, priority, progress, effort, resources.*

For topics that are things to do.

- **Start · due** — the dates show under the topic, like \`10/20 → 10/27\`. The calendar button sets today, + sets a week from the start.
- **Duration** — type the number of days and the due date follows.
- **Milestone** — a moment rather than a span; a diamond in the Gantt chart.
- **Progress** — in 5% steps; the icon shows the nearest step.
- **Effort** (hours) and **resources** (people or teams).

Topics with dates are bars in the [Gantt chart](09-outline-gantt.md). A CSV export turns the task list into an Excel table.
`,W=`# Notes, links, attachments, pictures

## Notes

![Notes tab](images/notes-pane.png)

*The Notes tab: write in Markdown, check with Preview.*

Longer text for a topic. \`Ctrl+T\` or the notes button opens the **Notes** tab. Markdown works: \`**bold**\`, \`- lists\`, \`[links](https://…)\`. A topic with notes shows a page badge; click it to open the notes. Notes are searched and exported (Word, HTML, Markdown, OPML …).

## Hyperlinks

\`Ctrl+K\` links a web address or a file path to the topic. Click the chain badge: a web address opens in the browser, a file in its default program. On the **Links** tab of the task pane:

- **Link a file…** — pick a file to link its path.
- **Link a topic** — pick another topic of the map; the link then jumps there.

## Attachments

![Links tab](images/links-pane.png)

*The Links tab: hyperlink, attachments, picture.*

**Add attachment…** links one or more files to the topic. The map keeps the paths; the list opens them, shows them in their folder or removes them. On the desktop you can also drop files from the file manager onto a topic.

## Pictures

A picture above the topic's text. **Insert picture…** picks a file; or copy a picture, select the topic and press \`Ctrl+V\` or **From clipboard**. Dropping a picture file on a topic works too. The width slider resizes it. The picture is stored inside the map file, so it still shows when the original is gone.
`,H=`# Relationships, boundaries, callouts, floating topics

![Relationships and boundaries](images/relationship.png)

*A relationship (dashed arrow), a named boundary and a callout.*

## Relationships

A curved arrow between any two topics, wherever they are in the map.

- Select two topics and press \`Ctrl+Shift+R\` (or the relationship button): they are joined at once.
- With one topic or none selected, a note asks you to click the topic to join. \`Esc\` cancels.
- **Relationship from here** in a topic's right-click menu does the same.

Click a relationship to select it: two **handles** appear; drag them to bend the curve. Its right-click menu sets the name, dashed or solid, arrows at both ends, reverses it, resets the curve, sets the colour or deletes it. \`Delete\` removes a selected relationship.

## Boundaries

A frame around a topic and its whole branch. Select the topic and press \`Ctrl+Shift+B\`; again to remove it. **Insert › Boundary (cloud)** draws a cloud. **Boundary name…** in the right-click menu puts a name on it.

## Callouts

A topic attached above another like a speech bubble (\`Ctrl+Shift+Enter\`), for remarks and warnings. Callouts can have subtopics too.

## Floating topics

Topics that belong to no branch and sit anywhere on the map.

- **Double-click empty space** on the canvas to make one there.
- **Drag a branch topic to empty space** to turn it into one.
- Drag a floating topic onto another topic to make it a subtopic again.
- Floating topics take subtopics, relationships and formats like any other.
`,G=`# Outline view and Gantt chart

The same map has three views: **map**, **outline** and **Gantt chart**. Switch with the three toolbar buttons or the View menu. A change in any view changes the same map.

## Outline view

![Outline view](images/outline-view.png)

*The outline view: an indented list with task columns.*

The map from top to bottom like a document's table of contents — handy for long texts and for putting things in order.

| Key | Does |
| --- | --- |
| \`Enter\` | New topic below |
| \`Tab\` / \`Shift+Tab\` | Indent (under the topic above) / outdent |
| \`Alt+↑\` / \`Alt+↓\` | Reorder |
| \`↑\` / \`↓\` | Row above / below |
| \`Ctrl+Space\` | Fold / unfold |
| \`Backspace\` on an empty topic | Delete it |

The columns at the right edit priority, progress, start, due and resources directly.

## Gantt chart

![Gantt chart](images/gantt-view.png)

*The Gantt chart: the task list at the left, bars on a calendar at the right.*

Topics with a start or due date are bars on a calendar. The branches above them are grey **summary bars** spanning all their tasks.

- **Drag** a bar to move it; drag its **left or right end** to change the start or due date.
- The darker part of a bar is the progress; green bars are done; a diamond is a milestone.
- The red line is today; **Today** scrolls it into view.
- The scale is **day · week · month**. **Show topics without dates** lists every topic.
- Double-click a bar to open the Task tab.
`,K=`# Find and filter

## Find and replace

![Find](images/find.png)

*The Find tab of the sidebar: the topics found and replacing.*

\`Ctrl+F\` opens the **Find** tab of the sidebar. The topics found are listed as you type; click one to select it and bring it to the centre.

- **Aa** match case, **ab** whole word, **.\\*** regular expression.
- **Search notes too** also searches the notes (topics found in their notes show a notes mark).
- **Select all** selects every topic found — handy to format or mark them all at once.
- **Replace all** replaces the text found in those topics. \`Ctrl+Z\` undoes it.

## Filter and map index

![Filter](images/filter.png)

*The Filter tab: the priorities, statuses, icons and tags used in the map, with counts.*

The **Filter** tab of the sidebar lists the priorities, icons and tags used in the map with their counts (the map index). Click an entry to add it to the filter, again to take it out.

- Entries of one group are "or", groups are "and".
- **Status**: in progress, done, overdue, due this week.
- The box at the top filters by text.
- **Dim the rest** fades the other topics, **Hide the rest** hides them (the path to a matching topic stays).
- **Select** selects the matching topics; **Clear filter** shows everything again. An active filter is shown in the status bar.
`,V="# Presentation\n\n![Presentation](images/presentation.png)\n\n*A presentation: the current branch stays sharp, the rest fades.*\n\n`F5` (View › Presentation) presents the map full screen.\n\n- The first slide is the whole map, then **one slide per main topic**, then the floating topics, and the whole map again at the end.\n- On each slide the view glides to that branch and the other topics fade.\n- `→` `Space` `PageDown` `Enter` or a click: next · `←` `PageUp`: previous · `Home` / `End`: first / last · `Esc`: end.\n- The bar at the bottom shows the slide's title and number.\n\nThe slides follow the order of the main topics; reorder them on the map with `Alt+↑` / `Alt+↓` or by dragging. Folded branches stay folded.\n",X=`# Saving, importing, exporting, printing

## Saving and opening

Maps are saved as **.tmap** files (JSON). Pictures, notes and formats all go into the one file.

- \`Ctrl+S\` saves, \`Ctrl+Shift+S\` saves as, File › Save all.
- \`Ctrl+O\` opens .tmap files and every format below. Recent files are in the File menu and on the start page.
- On the desktop, drop files on the window or double-click a .tmap file.
- When another program changes a map, it is read again as you come back to the window (you are asked if you changed it here).

## Importing

**File › Import** (or Open) reads the files of other mind-mapping programs.

| Format | What comes in |
| --- | --- |
| FreeMind / Freeplane \`.mm\` | Topics, notes, icons, folding, colours, links, clouds, arrows |
| XMind \`.xmind\` (2020 and later, XMind 8) | Topics, notes, markers, labels, links, pictures, floating topics, relationships |
| MindManager \`.mmap\` | Topics, notes, priority / progress / dates / resources, icons, tags, links, floating topics, relationships |
| OPML | Outline and notes |
| Markdown \`.md\` | Headings and lists become topics, other text becomes notes |
| Text \`.txt\` | One topic per line, indentation gives the levels |

The original file is never changed; saving an imported map makes a new .tmap file.

## Exporting

![Export](images/export.png)

*The export dialog: choose a format and its options.*

\`Ctrl+E\` (File › Export): pick the format and press **Export…** to choose where.

- **PNG · JPEG** — scale (1× – 4×), margin, a transparent background for PNG.
- **SVG** — a vector picture, sharp at any size.
- **PDF** — paper (A4, A3, A5, Letter, Legal or the map's size) and orientation.
- **Word** — the map picture first, then a heading outline with the notes.
- **HTML** — one web page with the map picture and a foldable outline.
- **Markdown · OPML · Text · FreeMind · XMind · CSV**.

**File › Copy map as picture** (\`Ctrl+Shift+C\`) puts the map on the clipboard to paste into documents and chats.

## Printing

![Print preview](images/print-preview.png)

*Print preview: paper, orientation and pages with the pages in view.*

\`Ctrl+P\` opens the print preview: paper, orientation, margin, **fit on one page** or **split over 2 · 4 · 6 · 9 pages** (a big map on several sheets to tape together), the title at the top, date and page number at the bottom, colour. The desktop app prints directly to the printer you choose; the web version opens the browser's print dialog.
`,z=`# Templates and samples

![Templates](images/templates.png)

*New from template: a real picture of each template.*

**File › New from template** or the template cards of the start page make a map with content to start from.

| Template | Content |
| --- | --- |
| Feature tour | A sample using every feature of the program |
| Blank map | One central topic |
| Brainstorming | Problem, ideas, pros and cons, next steps |
| Project plan | Phases with tasks, dates and owners — best seen in the Gantt chart |
| Meeting minutes | Attendees, agenda, decisions, action items |
| SWOT analysis | Strengths, weaknesses, opportunities, threats |
| Decision making | Options with pros and cons, and the criteria |
| Weekly plan | To-dos per day (timeline) |
| Fishbone | The causes of a problem, by category |
| Org chart | Teams and people (top-down) |
| Roadmap | Goals per quarter (timeline) |
| Book notes · Goals (OKR) · Study plan · Trip plan | Frequently used outlines |

Templates are made in the UI language (Korean / English). Templates with dates schedule them from today. The layout and style of a blank map are set in [Settings › Map](14-settings.md).

## Sample maps

**Help › Sample maps…**, **File › Sample maps…** or **Sample maps** on the start page show 16 finished maps on real subjects, with pictures. The one you pick opens in a new tab; the original never changes.

| Sample | Shows |
| --- | --- |
| Mobile app launch plan | Task dates, owners, milestones, a relationship — the Gantt chart |
| Marketing strategy (4P) | Both sides of a map, the Rainbow style, notes |
| Why customers leave | Fishbone, priorities |
| Company org chart | A three-level org chart, a named boundary |
| Product roadmap 2027 | Timeline, progress |
| Final exam study plan | Tree, due dates and progress |
| 5 days in Tokyo | Hyperlinks, a callout, icons |
| Website sitemap | Org chart, the Blueprint style |
| Blog post outline | An outline full of notes, the Paper style |
| My goals for 2027 | Goals by area with progress |
| Event checklist | To-dos by countdown, owners |
| Service architecture | Three relationships, a rectangular boundary |
| Book summary | Book club notes, the Sketch style |
| Startup idea (lean canvas) | Nine boxes, the Neon style |
| Project risk register | Priorities, flags, mitigations |
| Café name brainstorm | Floating topics and relationships |

## Sample files

\`samples/ko\` and \`samples/en\` in the project folder hold the 16 sample maps and 14 maps made from the templates as \`.tmap\` files; \`import/\` holds one of them saved as FreeMind, XMind, OPML and Markdown to try importing (\`npm run samples\` makes them again).
`,q=`# Settings and themes

\`Ctrl+,\` or the gear at the right end of the toolbar opens the settings — a window of its own on the desktop. Changes apply at once and are saved. **Restore defaults** resets everything but the language and the window layout.

![Settings](images/settings.png)

*Settings › General.*

## General

- **Language** — 한국어 / English; the flag on the toolbar switches too.
- **Show** — toolbar, status bar, sidebar, task pane; the widths of the sidebar and the task pane.
- **Editing** — spell check; new main topics to the emptier side.
- **Files and session** — reopen the maps that were open, ask to save when closing, read maps changed outside again, auto save (when leaving the window / a few seconds after the last change).

## Map

- **New maps** — layout, map style, topic font and base text size of a blank map.
- **Map view** — smooth camera moves, wheel zoom, dot grid, overview.

## Theme

![Themes](images/settings-theme.png)

*20 dark themes, 20 light themes and custom themes.*

Click a card to switch. The theme button on the toolbar goes to the next theme, ▾ shows the list. A **custom theme** starts as a copy of the current one; change its 15 colours. With the map style **Follow app theme**, maps follow the theme too.

## Start page

Whether the start page shows on every launch, and the scene, transparency and speeds of its moving background.

## Export and print

Defaults for exporting (scale, margin, transparent background) and printing (paper, orientation, margin, pages, header, footer, colour).

## Where settings are kept

| System | Folder |
| --- | --- |
| Windows | \`%APPDATA%\\My ThinkMap\` |
| macOS | \`~/Library/Application Support/My ThinkMap\` |
| Linux | \`~/.config/My ThinkMap\` |

\`session.json\` in that folder holds the settings, the open maps, unsaved maps and recent files.
`,Q="# Keyboard shortcuts\n\nAlso under Help › Keyboard shortcuts. On macOS use `⌘` instead of `Ctrl`.\n\n## Files\n\n| Key | Does |\n| --- | --- |\n| `Ctrl+N` | New map |\n| `Ctrl+O` | Open |\n| `Ctrl+S` / `Ctrl+Shift+S` | Save / save as |\n| `Ctrl+E` | Export |\n| `Ctrl+Shift+C` | Copy map as picture |\n| `Ctrl+P` | Print |\n| `Ctrl+W` | Close tab |\n| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |\n\n## Topics\n\n| Key | Does |\n| --- | --- |\n| `Enter` / `Shift+Enter` | Sibling (below / above) |\n| `Tab` / `Insert` | Subtopic |\n| `Ctrl+Shift+Insert` | Parent topic |\n| `Ctrl+Shift+Enter` | Callout |\n| `Ctrl+Shift+Q` | Quick entry |\n| `F2`, double-click, or just type | Edit |\n| `Delete` / `Ctrl+Delete` | Delete / delete topic only |\n| `Ctrl+X` `Ctrl+C` `Ctrl+V` | Cut · copy · paste |\n| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |\n| `Ctrl+A` | Select all |\n\n## Moving and viewing\n\n| Key | Does |\n| --- | --- |\n| `← ↑ → ↓` | Move between topics (`Shift`: add to the selection) |\n| `Alt+↑` / `Alt+↓` | Reorder |\n| `Home` | Central topic |\n| `Space` | Fold / unfold |\n| `F4` | Show this branch only |\n| `F5` | Presentation |\n| `F11` | Full screen |\n| `Ctrl+=` / `Ctrl+-` / `Ctrl+wheel` | Zoom in / out |\n| `Ctrl+0` / `Ctrl+1` | Fit map / actual size |\n\n## Content and format\n\n| Key | Does |\n| --- | --- |\n| `Ctrl+B` `Ctrl+I` `Ctrl+U` | Bold · italic · underline |\n| `Ctrl+Shift+1` … `9` / `0` | Priority / remove |\n| `Ctrl+T` | Notes |\n| `Ctrl+K` | Hyperlink |\n| `Ctrl+Shift+R` | Relationship |\n| `Ctrl+Shift+B` | Boundary |\n| `Ctrl+F` / `F3` | Find / find next |\n| `Ctrl+,` | Settings |\n| `F1` | Help |\n\n## Mouse\n\n| Action | Does |\n| --- | --- |\n| Drag empty space, middle-button drag | Move around |\n| `Shift` / `Ctrl` + drag empty space | Rectangle selection |\n| Drag a topic | Move it (onto a topic: subtopic · edge: sibling · empty space: floating) |\n| Double-click empty space | Floating topic |\n| Right-click | Topic, relationship and canvas menus |\n",Z=`# Web version and troubleshooting

## Web version

The same program runs in a browser. In the project folder run

\`\`\`
npm run web
\`\`\`

It builds the UI, starts a server on \`http://127.0.0.1:5202\` and opens the browser. The web version opens and saves **files on the computer the server runs on**, so the file dialog is the app's own, not the browser's.

To use it from other computers, start it with a token:

\`\`\`
node server/server.js --host 0.0.0.0 --port 8080 --token secret
\`\`\`

and open \`http://server:8080/?token=secret\`. Without a token anyone who reaches the server can read and write its files.

Differences in the web version:

- Settings, About and Keyboard shortcuts open as dialogs in the page; Help opens as a browser pop-up.
- Printing uses the browser's print dialog.
- Files dropped on the browser window are read and opened as new maps (they have no path, so saving asks for a name).

## Troubleshooting

**The map is not on screen.** Press \`Ctrl+0\` (fit map). Check the status bar for **Hide the rest** filtering or a branch view.

**Text is cut off.** Raise the topic's **max width** or break the line (\`Shift+Enter\`).

**I closed without saving.** With session restore on, unsaved maps come back on the next start.

**A file from another program looks different.** Importing brings over what this app also has (XMind summaries and partial boundaries are left out, for example). The original file is never changed.

**Printing does nothing (desktop).** Printing needs Edge or Chrome. Without one, export a PDF and print that.

**An error dialog appeared.** **Copy details** and report it. If the window is broken, **Reload** brings the open maps back from the session.
`,Y=`# 시작하기

My ThinkMap 은 생각을 중심 토픽에서 가지로 펼쳐 정리하는 마인드맵 프로그램입니다. Windows · macOS · Linux 데스크톱 앱과 웹 브라우저에서 똑같이 동작합니다.

![시작 화면](images/start-page.png)

*처음 실행하면 나오는 시작 화면. 새 맵, 템플릿, 열기, 가져오기, 기능 둘러보기와 최근 파일이 있습니다.*

## 첫 맵 만들기

1. 시작 화면에서 **새 맵**을 누르거나 \`Ctrl+N\` 을 누릅니다. 가운데에 **중심 토픽**이 생기고 글자가 선택되어 있습니다.
2. 주제를 입력하고 \`Enter\` 로 확정합니다.
3. \`Tab\` (또는 \`Insert\`)을 누르면 **하위 토픽**이 생기고 바로 입력할 수 있습니다.
4. 같은 수준에 토픽을 더하려면 \`Enter\` 를 한 번 더 누릅니다 — 확정된 토픽에서 \`Enter\` 는 **형제 토픽**을 만듭니다.
5. \`Ctrl+S\` 로 저장합니다. 맵은 \`.tmap\` 파일로 저장됩니다.

![새 맵](images/main-window.png)

*토픽 몇 개를 만든 맵. 왼쪽은 개요, 오른쪽은 작업 창입니다.*

## 기능 둘러보기

시작 화면의 **기능 둘러보기**는 이 프로그램의 거의 모든 기능 — 아이콘, 태그, 메모, 작업 정보, 관계선, 경계, 설명선, 플로팅 토픽 — 이 들어 있는 예제 맵을 엽니다. 마음대로 고쳐 보세요. 실수는 \`Ctrl+Z\` 로 되돌립니다.

## 세션 복원

프로그램을 닫았다 다시 열면 열려 있던 맵이 그대로 돌아옵니다. 저장하지 않은 새 맵과 수정 내용도 세션에 남아 있다가 복원됩니다. 이 동작은 [설정](14-settings.md)에서 끌 수 있습니다.

## 더 알아보기

- 화면의 각 부분: [화면 구성](02-screen-layout.md)
- 토픽 다루기: [토픽 만들기와 편집](03-topics.md)
- 모든 단축키: [단축키](15-shortcuts.md)
`,$=`# 화면 구성

![주 창](images/main-window.png)

*메뉴 막대, 도구 모음, 탭, 사이드바(왼쪽), 맵 캔버스(가운데), 작업 창(오른쪽), 상태 표시줄.*

## 메뉴 막대

맨 위에는 앱 아이콘과 이름, **시작** 버튼, 그리고 파일 · 편집 · 삽입 · 서식 · 보기 · 도구 · 도움말 메뉴가 있습니다. 데스크톱에서는 메뉴가 운영체제 메뉴로 열리고, 빈 곳을 끌면 창이 움직이며 두 번 누르면 최대화됩니다.

## 도구 모음

![도구 모음](images/toolbar.png)

*왼쪽부터 파일, 실행 취소, 토픽 추가, 토픽 내용, 레이아웃과 스타일, 펼치기/접기, 확대/축소, 보기 전환, 창 표시.*

| 묶음 | 버튼 |
| --- | --- |
| 파일 | 새 맵, 열기, 저장, 내보내기, 인쇄 |
| 토픽 | 하위 · 형제 · 상위 토픽, 설명선, 플로팅 토픽, 관계선, 경계 |
| 내용 | 아이콘, 메모, 링크, 작업 — 작업 창의 해당 탭을 엽니다 (서식은 작업 창의 첫 탭) |
| 맵 | 레이아웃 고르기, 맵 스타일 고르기 |
| 보기 | 모두 펼치기 · 접기, 가지만 보기, 확대 · 축소 · 맵 전체, 맵 · 개요 · 간트, 프레젠테이션 |

오른쪽 끝에는 테마(누르면 다음 테마, ▾ 는 목록), 언어 전환(국기), 설정, 정보가 있습니다.

## 탭

맵마다 탭이 하나입니다. 저장하지 않은 맵은 탭 이름이 기울어지고 ● 가 붙습니다. 탭을 끌어 순서를 바꾸고, 가운데 버튼으로 닫고, 오른쪽 버튼으로 탭 메뉴를 엽니다.

## 사이드바

- **개요** — 맵 전체가 나무 구조로 보입니다. 항목을 누르면 그 토픽이 선택되고 화면 가운데로 옵니다.
- **찾기** — 토픽과 메모에서 글자를 찾고 바꿉니다. → [찾기와 필터](10-find-filter.md)
- **필터** — 우선순위·아이콘·태그·진행 상태·마감일로 토픽을 거릅니다.

## 작업 창

선택한 토픽의 **서식 · 아이콘 · 메모 · 작업 · 링크**, 그리고 맵 전체의 **맵** 탭이 있습니다. 사이드바와 작업 창은 가장자리를 끌어 너비를 바꿀 수 있고, 도구 모음의 두 버튼이나 보기 메뉴로 숨깁니다.

## 맵 캔버스

맵이 그려지는 곳입니다. 빈 곳을 끌면 화면이 움직이고, 휠은 스크롤, \`Ctrl+휠\`은 확대/축소입니다. 오른쪽 아래의 **전체 보기**는 맵 전체를 작게 보여 주고, 누르거나 끌면 그곳으로 이동합니다.

## 상태 표시줄

왼쪽에 최근 메시지, 오른쪽에 선택한 토픽의 수준, 토픽 수, 필터 상태, 레이아웃, 맵 스타일, 확대 비율이 있습니다. 레이아웃과 스타일은 눌러서 바로 바꿀 수 있습니다.
`,J=`# 토픽 만들기와 편집

## 토픽의 종류

- **중심 토픽** — 맵의 주제. 맵마다 하나이며 지울 수 없습니다.
- **주 토픽** — 중심 토픽에 바로 붙은 토픽. 가지마다 색이 다릅니다.
- **하위 토픽** — 그 아래의 모든 토픽.
- **플로팅 토픽**, **설명선** — [관계선·경계·설명선](08-relationships.md)에서 설명합니다.

## 키보드로 만들기

| 키 | 하는 일 |
| --- | --- |
| \`Enter\` | 형제 토픽 (아래) — 중심 토픽에서는 주 토픽 |
| \`Shift+Enter\` | 형제 토픽 (위) |
| \`Tab\` / \`Insert\` | 하위 토픽 |
| \`Ctrl+Shift+Insert\` | 상위 토픽 — 선택한 토픽을 새 토픽으로 감쌉니다 |
| \`Ctrl+Shift+Enter\` | 설명선 |
| \`Delete\` | 토픽과 그 하위 토픽 삭제 |
| \`Ctrl+Delete\` | 토픽만 삭제 — 하위 토픽은 그 자리에 남습니다 |

새로 만든 토픽은 바로 입력 상태가 됩니다. 아무것도 입력하지 않고 \`Esc\` 를 누르면 만든 토픽이 없어집니다.

## 글자 편집

![토픽 편집](images/editing.png)

*편집 중인 토픽. 상자가 글자에 맞춰 바로 커집니다.*

- 토픽을 선택하고 **그냥 입력**하면 내용이 새 글자로 바뀝니다. 한글 입력기도 그대로 동작합니다.
- \`F2\` 나 토픽을 **두 번 누르면** 지금 내용을 고칩니다.
- 편집 중: \`Enter\` 확정 · \`Shift+Enter\` 줄 바꿈 · \`Esc\` 취소 · \`Tab\` 확정하고 하위 토픽 추가.

## 선택과 이동

- 누르면 선택, \`Ctrl\` 또는 \`Shift\` 를 누른 채 누르면 여러 개를 선택합니다.
- \`Shift\` 나 \`Ctrl\` 을 누른 채 빈 곳을 끌면 사각형 안의 토픽이 선택됩니다.
- 화살표 키로 화면에서 가까운 토픽으로 옮겨 갑니다. 가지가 자라는 방향의 화살표는 하위 토픽으로, 반대 방향은 상위 토픽으로 갑니다. \`Home\` 은 중심 토픽.
- \`Alt+↑\` / \`Alt+↓\` 는 형제들 사이에서 순서를 바꿉니다.

## 끌어서 옮기기

![끌어서 옮기기](images/drag.png)

*토픽을 끌면 놓일 자리가 표시됩니다.*

- 다른 토픽 **가운데**에 놓으면 그 토픽의 하위 토픽이 됩니다 (상자가 점선으로 강조).
- 토픽의 **위·아래 가장자리**(조직도에서는 왼쪽·오른쪽)에 놓으면 그 앞이나 뒤의 형제 토픽이 됩니다 (선으로 표시).
- **빈 곳**에 놓으면 플로팅 토픽이 됩니다. 플로팅 토픽은 끌어서 아무 데나 옮길 수 있습니다.
- 자기 하위 토픽 안으로는 옮길 수 없습니다.

## 접고 펼치기

하위 토픽이 있는 토픽에 마우스를 올리면 가장자리에 **−** 단추가 보입니다. 누르면 접히고 하위 토픽 수가 표시되며, 다시 누르면 펼쳐집니다. 키보드는 \`Space\`. 보기 메뉴에서 **모두 펼치기**, **모두 접기**, **n단계까지 펼치기**를 고릅니다.

## 잘라내기 · 복사 · 붙여넣기

\`Ctrl+X\` · \`Ctrl+C\` · \`Ctrl+V\` 는 선택한 토픽과 그 하위 토픽 전체에 적용됩니다. 복사한 토픽은 다른 프로그램에는 들여쓴 텍스트로 붙고, 다른 프로그램에서 복사한 여러 줄 텍스트는 줄마다 토픽이 됩니다 (들여쓰기는 수준). 그림을 복사해 붙이면 선택한 토픽의 그림이 됩니다.

## 빠른 입력

**삽입 › 빠른 입력**(\`Ctrl+Shift+Q\`)은 여러 토픽을 한 번에 넣습니다. 한 줄에 하나씩 쓰고, \`Tab\` 으로 들여쓰면 위 줄의 하위 토픽이 됩니다.

![빠른 입력](images/quick-entry.png)

## 실행 취소

모든 변경은 \`Ctrl+Z\` 로 되돌리고 \`Ctrl+Y\` 로 다시 실행합니다. 맵마다 따로 기록되며, 슬라이더처럼 연속된 변경은 한 단계로 묶입니다.
`,nn=`# 레이아웃과 맵 스타일

## 레이아웃

맵 전체의 모양은 **도구 › 레이아웃**, 도구 모음의 레이아웃 단추, 또는 작업 창 **맵** 탭에서 고릅니다.

| 레이아웃 | 모양 |
| --- | --- |
| 맵 (양쪽) | 중심 토픽 양쪽으로 가지가 퍼집니다 — 기본값 |
| 오른쪽 맵 · 왼쪽 맵 | 한쪽으로만 퍼집니다 |
| 조직도 (아래 · 위) | 위에서 아래로 (또는 아래에서 위로). 셋째 수준부터는 목록 |
| 트리 (오른쪽 · 왼쪽) | 들여쓴 목록처럼 아래로 |
| 타임라인 | 주 토픽이 가로 축 위에 차례로, 하위 토픽은 그 아래 목록 |
| 피시본 | 오른쪽 머리에서 왼쪽으로 등뼈, 주 토픽은 위아래 뼈, 하위 토픽은 원인 |

![조직도](images/layout-org.png)

*조직도 레이아웃.*

![피시본](images/layout-fishbone.png)

*피시본 레이아웃 — 문제의 원인 분석에 씁니다.*

![타임라인](images/layout-timeline.png)

*타임라인 레이아웃 — 일정이나 로드맵에 좋습니다.*

## 가지마다 다른 배치

토픽 하나를 선택하고 작업 창 **서식 › 하위 토픽 배치**에서 오른쪽 · 왼쪽 · 아래로 · 위로 · 목록을 고르면 그 토픽의 하위 토픽만 다르게 배치됩니다. 예를 들어 맵 레이아웃 안의 한 가지를 조직도처럼 펼칠 수 있습니다. **자동**은 맵 레이아웃을 따릅니다.

## 양쪽 균형

맵 레이아웃에서 새 주 토픽은 덜 찬 쪽에 들어갑니다. 주 토픽을 반대쪽으로 끌어 옮길 수 있고, **도구 › 양쪽 균형 맞추기**는 주 토픽을 오른쪽·왼쪽 번갈아 다시 놓습니다.

## 맵 스타일

![맵 스타일](images/map-pane.png)

*작업 창의 맵 탭: 레이아웃, 맵 스타일, 선, 간격, 번호 매기기.*

맵 스타일은 배경, 토픽 상자, 선, 가지 색을 한꺼번에 정합니다. **앱 테마 따라가기**(기본값)는 지금 쓰는 앱 테마의 색을 씁니다. 나머지 — 클래식, 무지개, 파스텔, 미드나이트, 네온, 청사진, 종이, 흑백, 숲, 노을, 바다, 비즈니스, 캔디, 그래파이트, 스케치 — 는 앱 테마와 상관없이 늘 같은 색이라 내보낸 그림도 똑같습니다.

스타일 위에 다음을 맵마다 바꿀 수 있습니다.

- **선 모양**: 곡선 · 직선 · 꺾은선 · 둥근 꺾은선
- **가지 색**: 주 토픽마다 다른 색을 쓸지
- **배경**: 맵 배경색
- **간격**: 가로 · 세로 간격 (50%~250%)
- **번호 매기기**: 주 토픽부터 \`1.\` \`1.1.\` 또는 \`I.\` \`I.A.\` 로 번호를 붙입니다

## 가지만 보기

큰 맵에서 한 가지에 집중하려면 그 토픽을 고르고 \`F4\` (보기 › 이 가지만 보기)를 누릅니다. 그 토픽이 가운데에 오고 나머지는 숨겨집니다. 다시 \`F4\` 나 \`Esc\`, 또는 아래쪽 안내를 누르면 전체 맵으로 돌아옵니다.
`,en=`# 토픽 서식

토픽 하나하나의 모양은 작업 창의 **서식** 탭에서 바꿉니다. 여러 토픽을 선택하면 한 번에 바뀝니다. 서식을 정하지 않은 부분은 [맵 스타일](04-layouts-styles.md)을 따릅니다.

![서식 탭](images/format-pane.png)

*서식 탭: 모양, 색, 글자, 하위 토픽 배치.*

## 모양

둥근 사각형, 사각형, 캡슐, 타원, 밑줄, 육각형, 마름모, 원, 테두리 없음 가운데 고릅니다. 점선 테두리 단추는 지금 스타일이 쓰는 모양이고, 같은 단추를 다시 누르면 스타일 모양으로 돌아갑니다.

## 색

- **채우기** — 상자 안 색. **없음**은 투명.
- **글자색** — 정하지 않으면 채우기 색에 맞춰 읽기 쉬운 색이 자동으로 쓰입니다.
- **테두리** — 색과 두께 (없음 · 1 ~ 6px).
- **연결선** — 이 토픽으로 들어오는 선과 그 아래 가지의 색, 두께.

색 단추를 누르면 팔레트가 열립니다. **자동**은 스타일 색으로 되돌리고, 오른쪽의 색상 상자로 아무 색이나 고릅니다.

## 글자

글꼴, 크기, **굵게**(\`Ctrl+B\`), *기울임*(\`Ctrl+I\`), 밑줄(\`Ctrl+U\`), 취소선, 맞춤(왼쪽 · 가운데 · 오른쪽)을 정합니다. **최대 너비**를 넘는 글은 줄이 바뀝니다. 서식 › 글자 크게 / 작게 는 2px 씩 바꿉니다.

## 서식 복사

**서식 복사**로 한 토픽의 서식을 기억했다가 다른 토픽들을 선택하고 **서식 붙이기**를 누르면 같은 모양이 됩니다. **서식 지우기**는 그 토픽을 스타일 기본으로 되돌립니다.
`,tn=`# 아이콘 · 태그 · 작업 정보

## 아이콘

![아이콘 탭](images/markers-pane.png)

*아이콘 탭: 우선순위, 진행률, 깃발, 표정, 화살표, 기호, 태그.*

토픽 글자 앞에 붙는 그림입니다. 작업 창 **아이콘** 탭에서 누르면 붙고, 다시 누르면 떨어집니다.

- **우선순위 1~9** — \`Ctrl+Shift+1\` ~ \`9\`, 없애기 \`Ctrl+Shift+0\`.
- **진행률** 0 · 25 · 50 · 75 · 100%.
- **깃발 · 표정 · 화살표** — 묶음마다 하나만 붙습니다.
- **기호** — 별, 질문, 중요, 아이디어, 확인, 정보, 주의, 비용, 일정, 사람 … 여러 개를 함께 붙일 수 있습니다.

## 태그

태그는 토픽 아래에 작은 이름표로 보이는 글자입니다. 입력란에 쓰고 \`Enter\` 로 붙이고, 이름표의 × 로 뗍니다. 맵이나 이전에 쓴 태그는 아래에 추천으로 나옵니다. 태그는 [필터](10-find-filter.md)로 모아 볼 수 있습니다.

## 작업 정보

![작업 탭](images/task-pane.png)

*작업 탭: 시작일, 마감일, 기간, 마일스톤, 우선순위, 진행률, 작업량, 담당.*

토픽을 할 일로 다룰 때 씁니다.

- **시작일 · 마감일** — 날짜를 고르면 토픽 아래에 \`10/20 → 10/27\` 처럼 표시됩니다. 달력 단추는 오늘, + 단추는 시작일부터 1주.
- **기간** — 일수를 넣으면 마감일이 계산됩니다.
- **마일스톤** — 한 시점의 일. 간트 차트에서 마름모로 보입니다.
- **진행률** — 5% 단위. 아이콘은 가장 가까운 단계로 그려집니다.
- **작업량** (시간), **담당** (사람이나 팀).

날짜가 있는 토픽은 [간트 차트](09-outline-gantt.md)에 막대로 나옵니다. CSV 로 내보내면 작업 목록이 Excel 표가 됩니다.
`,on=`# 메모 · 링크 · 첨부 · 그림

## 메모

![메모 탭](images/notes-pane.png)

*메모 탭: Markdown 으로 쓰고 미리보기로 확인합니다.*

토픽에 긴 설명을 붙입니다. \`Ctrl+T\` 나 도구 모음의 메모 단추로 작업 창의 **메모** 탭을 엽니다. \`**굵게**\`, \`- 목록\`, \`[링크](https://…)\` 같은 Markdown 이 됩니다. 메모가 있는 토픽에는 종이 모양 표시가 붙고, 그 표시를 누르면 메모가 열립니다. 메모는 찾기와 내보내기(Word · HTML · Markdown · OPML …)에도 들어갑니다.

## 하이퍼링크

\`Ctrl+K\` 로 웹 주소나 파일 경로를 붙입니다. 토픽의 사슬 표시를 누르면 웹 주소는 브라우저에서, 파일은 기본 프로그램으로 열립니다. 작업 창 **링크** 탭에서는

- **파일 연결…** — 파일을 골라 경로를 넣습니다.
- **토픽 연결** — 같은 맵의 다른 토픽을 고르면, 링크를 눌렀을 때 그 토픽으로 이동합니다.

## 첨부 파일

![링크 탭](images/links-pane.png)

*링크 탭: 하이퍼링크, 첨부 파일, 그림.*

**첨부 파일 추가…**로 파일 여러 개를 토픽에 연결합니다. 맵에는 파일 경로가 저장되고, 목록에서 열기 · 폴더에서 보기 · 제거를 합니다. 데스크톱에서는 파일을 맵의 토픽 위로 끌어 놓아도 첨부됩니다.

## 그림

토픽 글자 위에 그림을 넣습니다. **그림 넣기…**로 파일을 고르거나, 그림을 복사한 뒤 토픽을 선택하고 \`Ctrl+V\` 또는 **클립보드에서**를 누릅니다. 그림 파일을 토픽 위로 끌어 놓아도 됩니다. 너비 슬라이더로 크기를 바꿉니다. 그림은 맵 파일 안에 함께 저장되므로 원본 파일이 없어도 보입니다.
`,an=`# 관계선 · 경계 · 설명선 · 플로팅 토픽

![관계선과 경계](images/relationship.png)

*관계선(점선 화살표)과 이름이 있는 경계, 설명선.*

## 관계선

가지와 상관없이 두 토픽을 잇는 곡선 화살표입니다.

- 두 토픽을 선택하고 \`Ctrl+Shift+R\` (또는 도구 모음의 관계선 단추)을 누르면 바로 이어집니다.
- 하나만 선택했거나 아무것도 선택하지 않았으면 이을 토픽을 누르라는 안내가 나옵니다. \`Esc\` 는 취소.
- 토픽의 오른쪽 버튼 메뉴 **여기서 관계선 긋기**도 같습니다.

관계선을 누르면 선택되고 두 개의 **손잡이**가 나옵니다. 손잡이를 끌어 곡선 모양을 바꿉니다. 관계선의 오른쪽 버튼 메뉴에서 이름, 점선, 양쪽 화살표, 방향 바꾸기, 곡선 초기화, 색, 삭제를 고릅니다. 선택한 관계선은 \`Delete\` 로 지웁니다.

## 경계

토픽과 그 하위 토픽 전체를 감싸는 테두리입니다. 토픽을 고르고 \`Ctrl+Shift+B\` 를 누르면 생기고, 다시 누르면 없어집니다. **삽입 › 경계 (구름)**은 구름 모양입니다. 오른쪽 버튼 메뉴의 **경계 이름…**으로 경계 위에 이름을 붙입니다.

## 설명선

토픽 위에 말풍선처럼 붙는 토픽입니다 (\`Ctrl+Shift+Enter\`). 보충 설명이나 주의 사항에 씁니다. 설명선에도 하위 토픽을 붙일 수 있습니다.

## 플로팅 토픽

어떤 가지에도 속하지 않고 맵 어디에나 놓이는 토픽입니다.

- 캔버스의 **빈 곳을 두 번 누르면** 그 자리에 생깁니다.
- 가지의 토픽을 **빈 곳으로 끌어** 놓으면 플로팅 토픽이 됩니다.
- 플로팅 토픽을 끌어 다른 토픽 위에 놓으면 다시 그 토픽의 하위 토픽이 됩니다.
- 플로팅 토픽에도 하위 토픽, 관계선, 서식을 그대로 쓸 수 있습니다.
`,sn=`# 개요 보기와 간트 차트

같은 맵을 세 가지로 볼 수 있습니다: **맵**, **개요**, **간트 차트**. 도구 모음의 세 단추나 보기 메뉴로 바꿉니다. 어느 보기에서 고쳐도 같은 맵이 바뀝니다.

## 개요 보기

![개요 보기](images/outline-view.png)

*개요 보기: 들여쓴 목록과 작업 열.*

맵을 문서의 목차처럼 위에서 아래로 봅니다. 긴 글을 정리하거나 순서를 잡을 때 편합니다.

| 키 | 하는 일 |
| --- | --- |
| \`Enter\` | 아래에 새 토픽 |
| \`Tab\` / \`Shift+Tab\` | 들여쓰기 (위 토픽의 하위로) / 내어쓰기 |
| \`Alt+↑\` / \`Alt+↓\` | 순서 바꾸기 |
| \`↑\` / \`↓\` | 위 / 아래 줄로 |
| \`Ctrl+Space\` | 접기 / 펼치기 |
| 빈 토픽에서 \`Backspace\` | 그 토픽 삭제 |

오른쪽 열에서 우선순위, 진행률, 시작일, 마감일, 담당을 바로 고칩니다.

## 간트 차트

![간트 차트](images/gantt-view.png)

*간트 차트: 왼쪽은 작업 목록, 오른쪽은 달력 위의 막대.*

시작일이나 마감일이 있는 토픽이 달력 위의 막대로 보입니다. 그 위의 가지는 회색 **요약 막대**로 하위 작업 전체 기간을 보여 줍니다.

- 막대를 **끌면** 일정이 통째로 옮겨집니다. 막대의 **왼쪽·오른쪽 끝**을 끌면 시작일·마감일이 바뀝니다.
- 막대 안의 진한 부분은 진행률, 초록 막대는 완료된 작업, 마름모는 마일스톤입니다.
- 빨간 세로선은 오늘. **오늘** 단추는 오늘이 보이게 옮깁니다.
- 눈금은 **일 · 주 · 월**로 바꿉니다. **날짜 없는 토픽도 보기**를 켜면 모든 토픽이 줄로 나옵니다.
- 막대를 두 번 누르면 작업 창의 작업 탭이 열립니다.
`,rn=`# 찾기와 필터

## 찾기 · 바꾸기

![찾기](images/find.png)

*사이드바의 찾기 탭: 찾은 토픽 목록과 바꾸기.*

\`Ctrl+F\` 는 사이드바의 **찾기** 탭을 엽니다. 입력하는 동안 찾은 토픽이 목록에 나오고, 누르면 그 토픽이 선택되어 화면 가운데로 옵니다.

- **Aa** 대/소문자 구분, **ab** 단어 단위, **.\\*** 정규식.
- **메모에서도 찾기**를 켜면 메모 내용도 찾습니다 (메모에서 찾은 토픽은 메모 표시가 붙습니다).
- **모두 선택**은 찾은 토픽을 모두 선택합니다 — 서식이나 아이콘을 한꺼번에 바꿀 때 좋습니다.
- **모두 바꾸기**는 찾은 토픽에서 찾은 글자를 바꿀 내용으로 바꿉니다. \`Ctrl+Z\` 로 되돌릴 수 있습니다.

## 필터와 맵 인덱스

![필터](images/filter.png)

*필터 탭: 맵에 쓰인 우선순위, 상태, 아이콘, 태그와 그 개수.*

사이드바의 **필터** 탭은 맵에 쓰인 우선순위, 아이콘, 태그를 개수와 함께 보여 줍니다(맵 인덱스). 항목을 누르면 필터에 들어가고, 다시 누르면 빠집니다.

- 같은 묶음 안의 항목은 "또는", 묶음끼리는 "그리고"로 걸러집니다.
- **상태**: 진행 중, 완료, 마감 지남, 이번 주 마감.
- 맨 위 입력란은 글자로 거릅니다.
- **나머지 흐리게**는 맞지 않는 토픽을 흐리게, **나머지 숨기기**는 아예 숨깁니다 (맞는 토픽까지 가는 길은 남습니다).
- **선택**은 걸러진 토픽을 모두 선택하고, **필터 끄기**는 원래대로 돌립니다. 필터가 켜져 있으면 상태 표시줄에 표시됩니다.
`,ln="# 프레젠테이션\n\n![프레젠테이션](images/presentation.png)\n\n*프레젠테이션: 지금 가지만 또렷하고 나머지는 흐려집니다.*\n\n`F5` (보기 › 프레젠테이션)는 맵을 전체 화면으로 보여 주며 발표합니다.\n\n- 첫 장은 맵 전체, 이어서 **주 토픽마다 한 장**, 그다음 플로팅 토픽, 마지막에 다시 전체입니다.\n- 장이 바뀌면 화면이 그 가지로 부드럽게 이동하고 나머지 토픽은 흐려집니다.\n- `→` `Space` `PageDown` `Enter` 또는 화면 누르기: 다음 · `←` `PageUp`: 이전 · `Home` / `End`: 처음 / 끝 · `Esc`: 끝내기.\n- 아래 막대에 지금 장의 제목과 번호가 있습니다.\n\n발표 순서는 주 토픽의 순서입니다. 순서를 바꾸려면 맵에서 `Alt+↑` / `Alt+↓` 나 끌기로 주 토픽을 옮깁니다. 접힌 가지는 접힌 채로 보입니다.\n",pn=`# 저장 · 가져오기 · 내보내기 · 인쇄

## 저장과 열기

맵은 **.tmap** 파일(JSON)로 저장됩니다. 그림, 메모, 서식이 모두 한 파일에 들어갑니다.

- \`Ctrl+S\` 저장, \`Ctrl+Shift+S\` 다른 이름으로 저장, 파일 › 모두 저장.
- \`Ctrl+O\` 는 .tmap 과 아래의 다른 형식을 모두 엽니다. 최근 파일은 파일 메뉴와 시작 화면에 있습니다.
- 데스크톱에서는 파일을 창으로 끌어 놓거나, .tmap 파일을 두 번 눌러 엽니다.
- 다른 프로그램이 파일을 바꾸면, 창으로 돌아올 때 다시 읽습니다 (수정 중이면 물어봅니다).

## 가져오기

**파일 › 가져오기**(또는 열기)로 다른 마인드맵 프로그램의 파일을 엽니다.

| 형식 | 가져오는 것 |
| --- | --- |
| FreeMind / Freeplane \`.mm\` | 토픽, 메모, 아이콘, 접힘, 색, 링크, 구름, 화살표 |
| XMind \`.xmind\` (2020 이상 · XMind 8) | 토픽, 메모, 마커, 라벨, 링크, 그림, 플로팅 토픽, 관계선 |
| MindManager \`.mmap\` | 토픽, 메모, 우선순위·진행률·날짜·담당, 아이콘, 태그, 링크, 플로팅, 관계선 |
| OPML | 개요와 메모 |
| Markdown \`.md\` | 제목과 목록은 토픽, 나머지 글은 메모 |
| 텍스트 \`.txt\` | 한 줄에 토픽 하나, 들여쓰기는 수준 |

가져온 맵은 원본을 바꾸지 않습니다. 저장하면 새 .tmap 파일로 저장됩니다.

## 내보내기

![내보내기](images/export.png)

*내보내기 대화상자: 형식을 고르고 옵션을 정합니다.*

\`Ctrl+E\` (파일 › 내보내기)에서 형식을 고르고 **내보내기…**를 누르면 저장할 곳을 묻습니다.

- **PNG · JPEG** — 배율(1×~4×), 여백, PNG 는 투명 배경.
- **SVG** — 크기와 상관없이 선명한 벡터 그림.
- **PDF** — 용지(A4 · A3 · A5 · Letter · Legal 또는 맵 크기)와 방향.
- **Word** — 첫 쪽에 맵 그림, 이어서 제목 개요와 메모.
- **HTML** — 맵 그림과 접히는 개요가 든 웹 페이지 한 장.
- **Markdown · OPML · 텍스트 · FreeMind · XMind · CSV**.

**파일 › 맵을 그림으로 복사**(\`Ctrl+Shift+C\`)는 맵 그림을 클립보드에 넣어 문서나 메신저에 바로 붙이게 합니다.

## 인쇄

![인쇄 미리보기](images/print-preview.png)

*인쇄 미리보기: 쪽 모양을 보며 용지, 방향, 쪽 나누기를 정합니다.*

\`Ctrl+P\` 는 인쇄 미리보기를 엽니다. 용지, 방향, 여백, **한 쪽에 맞추기** 또는 **2 · 4 · 6 · 9쪽으로 나누기**(큰 맵을 여러 장에 나눠 이어 붙이기), 머리글(제목), 바닥글(날짜와 쪽 번호), 컬러를 정합니다. 데스크톱은 프린터와 매수를 고르고 바로 인쇄하며, 웹 버전은 브라우저의 인쇄 창이 열립니다.
`,hn=`# 템플릿과 예제

![템플릿](images/templates.png)

*템플릿에서 새 맵: 템플릿마다 실제 맵 그림이 보입니다.*

**파일 › 템플릿에서 새 맵**이나 시작 화면의 템플릿 카드로 내용이 들어 있는 맵을 만듭니다.

| 템플릿 | 내용 |
| --- | --- |
| 기능 둘러보기 | 이 프로그램의 기능이 모두 들어 있는 예제 |
| 빈 맵 | 중심 토픽 하나 |
| 브레인스토밍 | 문제 정의, 아이디어, 장단점, 다음 단계 |
| 프로젝트 계획 | 단계별 작업과 일정·담당 — 간트 차트로 보기 좋습니다 |
| 회의록 | 참석자, 안건, 결정 사항, 실행 항목 |
| SWOT 분석 | 강점 · 약점 · 기회 · 위협 |
| 의사결정 | 선택지별 장단점과 판단 기준 |
| 주간 계획 | 요일별 할 일 (타임라인) |
| 피시본 | 문제의 원인을 범주별로 |
| 조직도 | 팀과 사람 (아래로) |
| 로드맵 | 분기별 목표 (타임라인) |
| 독서 노트 · 목표 (OKR) · 학습 계획 · 여행 계획 | 자주 쓰는 정리 틀 |

템플릿은 화면 언어(한국어 / 영어)로 만들어집니다. 날짜가 있는 템플릿은 오늘을 기준으로 일정이 잡힙니다. 빈 맵의 레이아웃과 맵 스타일은 [설정 › 맵](14-settings.md)에서 정합니다.

## 예제 맵

**도움말 › 예제 맵…**, **파일 › 예제 맵…** 또는 시작 화면의 **예제 맵**은 실제 주제로 완성된 맵 16가지를 그림과 함께 보여 줍니다. 고른 예제는 새 탭으로 열리고, 원본은 바뀌지 않습니다.

| 예제 | 보여 주는 것 |
| --- | --- |
| 모바일 앱 출시 계획 | 작업 일정 · 담당 · 마일스톤, 관계선 — 간트 차트 |
| 마케팅 전략 (4P) | 맵 양쪽 배치, 무지개 스타일, 메모 |
| 고객 이탈 원인 분석 | 피시본, 우선순위 |
| 회사 조직도 | 3단계 조직도, 이름표가 있는 경계 |
| 제품 로드맵 2027 | 타임라인, 진행률 |
| 기말고사 공부 계획 | 트리, 마감일과 진행률 |
| 도쿄 4박 5일 여행 | 하이퍼링크, 설명선, 아이콘 |
| 웹사이트 사이트맵 | 조직도, 청사진 스타일 |
| 블로그 글 기획 | 메모가 많은 개요, 종이 스타일 |
| 나의 2027 목표 | 영역별 목표와 진행률 |
| 행사 준비 체크리스트 | D-day 별 할 일, 담당 |
| 서비스 아키텍처 | 관계선 3개, 사각 경계 |
| 책 요약 | 독서 토론용 정리, 스케치 스타일 |
| 창업 아이디어 (린 캔버스) | 9칸, 네온 스타일 |
| 프로젝트 위험 관리 | 우선순위 · 깃발 · 대응책 |
| 카페 이름 브레인스토밍 | 플로팅 토픽과 관계선 |

## 예제 파일

프로젝트 폴더의 \`samples/ko\`, \`samples/en\` 에는 예제 맵 16개, 템플릿으로 만든 맵 14개가 \`.tmap\` 으로 들어 있고, \`import/\` 에는 같은 맵을 FreeMind · XMind · OPML · Markdown 으로 저장한 가져오기 연습용 파일이 있습니다 (\`npm run samples\` 로 다시 만듭니다).
`,cn=`# 설정과 테마

\`Ctrl+,\` 또는 도구 모음 오른쪽의 톱니바퀴로 설정을 엽니다. 데스크톱에서는 별도 창으로 열리며, 바꾼 내용은 바로 적용되고 저장됩니다. **기본값으로 되돌리기**는 언어와 창 배치를 뺀 설정을 처음으로 돌립니다.

![설정](images/settings.png)

*설정 › 일반.*

## 일반

- **언어** — 한국어 / English. 도구 모음의 국기 단추로도 바꿉니다.
- **보이기** — 도구 모음, 상태 표시줄, 사이드바, 작업 창. 사이드바와 작업 창의 너비.
- **편집** — 맞춤법 검사, 새 주 토픽을 덜 찬 쪽에 넣기.
- **파일과 세션** — 열었던 맵 다시 열기, 닫을 때 저장 묻기, 바깥에서 바뀐 맵 다시 읽기, 자동 저장(창을 떠날 때 / 마지막 수정 뒤 몇 초).

## 맵

- **새 맵** — 빈 맵의 레이아웃, 맵 스타일, 토픽 글꼴, 기본 글자 크기.
- **맵 화면** — 부드러운 화면 이동, 마우스 휠로 확대/축소, 점 격자, 전체 보기.

## 테마

![테마](images/settings-theme.png)

*어두운 테마 20개, 밝은 테마 20개, 사용자 테마.*

카드를 누르면 바로 바뀝니다. 도구 모음의 테마 단추는 다음 테마로, ▾ 는 목록으로 바꿉니다. **사용자 테마**는 지금 테마를 복사해 15가지 색을 직접 고칩니다. 맵 스타일이 **앱 테마 따라가기**이면 맵 색도 테마를 따라갑니다.

## 시작 화면

시작할 때 항상 시작 화면을 볼지, 시작 화면 뒤에 움직이는 배경의 장면 · 투명도 · 속도를 정합니다.

## 내보내기 · 인쇄

내보내기의 배율 · 여백 · 투명 배경, 인쇄의 용지 · 방향 · 여백 · 쪽 나누기 · 머리글 · 바닥글 · 컬러의 기본값입니다.

## 설정이 저장되는 곳

| 운영체제 | 폴더 |
| --- | --- |
| Windows | \`%APPDATA%\\My ThinkMap\` |
| macOS | \`~/Library/Application Support/My ThinkMap\` |
| Linux | \`~/.config/My ThinkMap\` |

폴더의 \`session.json\` 에 설정, 열린 맵, 저장하지 않은 맵, 최근 파일이 들어 있습니다.
`,mn="# 단축키\n\n도움말 › 단축키 에서도 볼 수 있습니다. macOS 에서는 `Ctrl` 대신 `⌘` 입니다.\n\n## 파일\n\n| 키 | 하는 일 |\n| --- | --- |\n| `Ctrl+N` | 새 맵 |\n| `Ctrl+O` | 열기 |\n| `Ctrl+S` / `Ctrl+Shift+S` | 저장 / 다른 이름으로 저장 |\n| `Ctrl+E` | 내보내기 |\n| `Ctrl+Shift+C` | 맵을 그림으로 복사 |\n| `Ctrl+P` | 인쇄 |\n| `Ctrl+W` | 탭 닫기 |\n| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 다음 / 이전 탭 |\n\n## 토픽\n\n| 키 | 하는 일 |\n| --- | --- |\n| `Enter` / `Shift+Enter` | 형제 토픽 (아래 / 위) |\n| `Tab` / `Insert` | 하위 토픽 |\n| `Ctrl+Shift+Insert` | 상위 토픽 |\n| `Ctrl+Shift+Enter` | 설명선 |\n| `Ctrl+Shift+Q` | 빠른 입력 |\n| `F2`, 두 번 누르기, 또는 그냥 입력 | 편집 |\n| `Delete` / `Ctrl+Delete` | 삭제 / 토픽만 삭제 |\n| `Ctrl+X` `Ctrl+C` `Ctrl+V` | 잘라내기 · 복사 · 붙여넣기 |\n| `Ctrl+Z` / `Ctrl+Y` | 실행 취소 / 다시 실행 |\n| `Ctrl+A` | 모두 선택 |\n\n## 이동과 보기\n\n| 키 | 하는 일 |\n| --- | --- |\n| `← ↑ → ↓` | 토픽 사이 이동 (`Shift`: 선택 추가) |\n| `Alt+↑` / `Alt+↓` | 순서 바꾸기 |\n| `Home` | 중심 토픽 |\n| `Space` | 접기 / 펼치기 |\n| `F4` | 이 가지만 보기 |\n| `F5` | 프레젠테이션 |\n| `F11` | 전체 화면 |\n| `Ctrl+=` / `Ctrl+-` / `Ctrl+휠` | 확대 / 축소 |\n| `Ctrl+0` / `Ctrl+1` | 맵 전체 / 실제 크기 |\n\n## 내용과 서식\n\n| 키 | 하는 일 |\n| --- | --- |\n| `Ctrl+B` `Ctrl+I` `Ctrl+U` | 굵게 · 기울임 · 밑줄 |\n| `Ctrl+Shift+1` … `9` / `0` | 우선순위 / 없애기 |\n| `Ctrl+T` | 메모 |\n| `Ctrl+K` | 하이퍼링크 |\n| `Ctrl+Shift+R` | 관계선 |\n| `Ctrl+Shift+B` | 경계 |\n| `Ctrl+F` / `F3` | 찾기 / 다음 찾기 |\n| `Ctrl+,` | 설정 |\n| `F1` | 도움말 |\n\n## 마우스\n\n| 동작 | 하는 일 |\n| --- | --- |\n| 빈 곳 끌기 · 가운데 단추 끌기 | 화면 이동 |\n| `Shift` / `Ctrl` + 빈 곳 끌기 | 사각형 선택 |\n| 토픽 끌기 | 옮기기 (토픽 위: 하위 · 가장자리: 형제 · 빈 곳: 플로팅) |\n| 빈 곳 두 번 누르기 | 플로팅 토픽 |\n| 오른쪽 단추 | 토픽 · 관계선 · 캔버스 메뉴 |\n",gn=`# 웹 버전과 문제 해결

## 웹 버전

같은 프로그램을 브라우저에서 쓸 수 있습니다. 프로젝트 폴더에서

\`\`\`
npm run web
\`\`\`

을 실행하면 화면을 만들고 \`http://127.0.0.1:5202\` 에 서버를 띄운 뒤 브라우저를 엽니다. 웹 버전은 **서버가 도는 컴퓨터의 파일**을 열고 저장합니다. 그래서 파일 대화상자도 브라우저 것이 아니라 앱 안의 대화상자입니다.

다른 컴퓨터에서 접속하게 하려면 토큰과 함께 띄웁니다.

\`\`\`
node server/server.js --host 0.0.0.0 --port 8080 --token 비밀번호
\`\`\`

그리고 \`http://서버주소:8080/?token=비밀번호\` 로 엽니다. 토큰 없이 바깥에 열면 누구나 서버의 파일을 읽고 쓸 수 있으니 주의하세요.

웹 버전의 차이:

- 설정 · 정보 · 단축키는 별도 창이 아니라 화면 안의 대화상자로, 도움말은 브라우저 팝업으로 열립니다.
- 인쇄는 브라우저의 인쇄 창을 씁니다.
- 파일을 브라우저 창으로 끌어 놓으면 그 내용을 읽어 새 맵으로 엽니다 (경로가 없으므로 저장할 때 이름을 묻습니다).

## 문제 해결

**맵이 화면에서 안 보여요.** \`Ctrl+0\` (맵 전체 보기)을 누릅니다. 필터의 **나머지 숨기기**나 **가지만 보기**가 켜져 있지 않은지 상태 표시줄을 보세요.

**글자가 잘려 보여요.** 토픽의 **최대 너비**를 늘리거나 글자를 줄 바꿈(\`Shift+Enter\`) 하세요.

**저장하지 않고 닫았어요.** 세션 복원이 켜져 있으면 다음 실행 때 저장하지 않은 맵이 그대로 돌아옵니다.

**다른 프로그램의 파일이 이상하게 열려요.** 가져오기는 그 프로그램의 기능 중 이 앱에 같은 것이 있는 부분만 옮깁니다(예: XMind 의 요약, 부분 경계는 빠집니다). 원본 파일은 바뀌지 않습니다.

**인쇄가 안 돼요 (데스크톱).** 인쇄에는 Edge 또는 Chrome 이 필요합니다. 없으면 PDF 로 내보내 인쇄하세요.

**오류 창이 떴어요.** **자세한 내용 복사**로 내용을 복사해 알려 주세요. 화면이 깨졌다면 **다시 열기**를 누르면 열린 맵이 세션에서 돌아옵니다.
`,dn=""+new URL("drag-czls0EWT.png",import.meta.url).href,un=""+new URL("editing-BKwxBE6J.png",import.meta.url).href,fn=""+new URL("export-YqnmU1c8.png",import.meta.url).href,bn=""+new URL("filter-DYbj8f6g.png",import.meta.url).href,_n=""+new URL("find-BEgCT0Kp.png",import.meta.url).href,wn=""+new URL("format-pane-DONkvFWU.png",import.meta.url).href,kn=""+new URL("gantt-view-_-JyRAyl.png",import.meta.url).href,yn=""+new URL("layout-fishbone-Dgb8jdmc.png",import.meta.url).href,vn=""+new URL("layout-org-CrB4_efO.png",import.meta.url).href,Cn=""+new URL("layout-timeline-BAlRGIrX.png",import.meta.url).href,Sn=""+new URL("links-pane-B56n1ucp.png",import.meta.url).href,Tn=""+new URL("main-window-DWpbg3gG.png",import.meta.url).href,xn=""+new URL("map-pane-BHuv1j0m.png",import.meta.url).href,Fn=""+new URL("markers-pane-Dy-G_QCT.png",import.meta.url).href,Ln=""+new URL("notes-pane-B8TOZnKQ.png",import.meta.url).href,Mn=""+new URL("outline-view-C6v5dPF_.png",import.meta.url).href,En=""+new URL("presentation-CVFfjwXX.png",import.meta.url).href,An=""+new URL("print-preview-DkXNIaXi.png",import.meta.url).href,Rn=""+new URL("quick-entry-DinTb03B.png",import.meta.url).href,Dn=""+new URL("relationship-CdIbSI2Q.png",import.meta.url).href,Pn=""+new URL("settings-theme-B4LuXN_F.png",import.meta.url).href,Un=""+new URL("settings-C4IrqgVb.png",import.meta.url).href,On=""+new URL("start-page-DVTQJhjq.png",import.meta.url).href,Nn=""+new URL("task-pane-B9s7MQ0L.png",import.meta.url).href,Bn=""+new URL("templates-NjlLBonC.png",import.meta.url).href,In=""+new URL("toolbar-DrZYdiUV.png",import.meta.url).href,jn=""+new URL("drag-DH2pAPAF.png",import.meta.url).href,Wn=""+new URL("editing-DrZHflFh.png",import.meta.url).href,Hn=""+new URL("export-Dfxv47Vl.png",import.meta.url).href,Gn=""+new URL("filter-D9sOfAnh.png",import.meta.url).href,Kn=""+new URL("find-DABD71i6.png",import.meta.url).href,Vn=""+new URL("format-pane-CXjmo_7g.png",import.meta.url).href,Xn=""+new URL("gantt-view-aNnX4ggP.png",import.meta.url).href,zn=""+new URL("layout-fishbone-CQ-ASSUU.png",import.meta.url).href,qn=""+new URL("layout-org-BfMhTxN9.png",import.meta.url).href,Qn=""+new URL("layout-timeline-BCKhN0YJ.png",import.meta.url).href,Zn=""+new URL("links-pane-CAzF87QA.png",import.meta.url).href,Yn=""+new URL("main-window-Dfx_v2R7.png",import.meta.url).href,$n=""+new URL("map-pane-Dz_TfmeK.png",import.meta.url).href,Jn=""+new URL("markers-pane-BqRTavdv.png",import.meta.url).href,ne=""+new URL("notes-pane-BEA2S2DP.png",import.meta.url).href,ee=""+new URL("outline-view-LK3eA19L.png",import.meta.url).href,te=""+new URL("presentation-B5aQ01zZ.png",import.meta.url).href,oe=""+new URL("print-preview-CvyFHfPQ.png",import.meta.url).href,ae=""+new URL("quick-entry-fiCU-aTi.png",import.meta.url).href,se=""+new URL("relationship-Hw8aoid0.png",import.meta.url).href,ie=""+new URL("settings-theme-Ca_LDgmt.png",import.meta.url).href,re=""+new URL("settings-__lu-js0.png",import.meta.url).href,le=""+new URL("start-page-Do6uykc_.png",import.meta.url).href,pe=""+new URL("task-pane-ZhAzt3EP.png",import.meta.url).href,he=""+new URL("templates-BXXniZXq.png",import.meta.url).href,ce=""+new URL("toolbar-BEBNv3KS.png",import.meta.url).href,F=Object.assign({"./en/01-getting-started.md":U,"./en/02-screen-layout.md":O,"./en/03-topics.md":N,"./en/04-layouts-styles.md":B,"./en/05-format.md":I,"./en/06-markers-tasks.md":j,"./en/07-notes-links.md":W,"./en/08-relationships.md":H,"./en/09-outline-gantt.md":G,"./en/10-find-filter.md":K,"./en/11-presentation.md":V,"./en/12-files.md":X,"./en/13-templates.md":z,"./en/14-settings.md":q,"./en/15-shortcuts.md":Q,"./en/16-web-troubleshooting.md":Z,"./ko/01-getting-started.md":Y,"./ko/02-screen-layout.md":$,"./ko/03-topics.md":J,"./ko/04-layouts-styles.md":nn,"./ko/05-format.md":en,"./ko/06-markers-tasks.md":tn,"./ko/07-notes-links.md":on,"./ko/08-relationships.md":an,"./ko/09-outline-gantt.md":sn,"./ko/10-find-filter.md":rn,"./ko/11-presentation.md":ln,"./ko/12-files.md":pn,"./ko/13-templates.md":hn,"./ko/14-settings.md":cn,"./ko/15-shortcuts.md":mn,"./ko/16-web-troubleshooting.md":gn}),L=Object.assign({"./images/en/drag.png":dn,"./images/en/editing.png":un,"./images/en/export.png":fn,"./images/en/filter.png":bn,"./images/en/find.png":_n,"./images/en/format-pane.png":wn,"./images/en/gantt-view.png":kn,"./images/en/layout-fishbone.png":yn,"./images/en/layout-org.png":vn,"./images/en/layout-timeline.png":Cn,"./images/en/links-pane.png":Sn,"./images/en/main-window.png":Tn,"./images/en/map-pane.png":xn,"./images/en/markers-pane.png":Fn,"./images/en/notes-pane.png":Ln,"./images/en/outline-view.png":Mn,"./images/en/presentation.png":En,"./images/en/print-preview.png":An,"./images/en/quick-entry.png":Rn,"./images/en/relationship.png":Dn,"./images/en/settings-theme.png":Pn,"./images/en/settings.png":Un,"./images/en/start-page.png":On,"./images/en/task-pane.png":Nn,"./images/en/templates.png":Bn,"./images/en/toolbar.png":In,"./images/ko/drag.png":jn,"./images/ko/editing.png":Wn,"./images/ko/export.png":Hn,"./images/ko/filter.png":Gn,"./images/ko/find.png":Kn,"./images/ko/format-pane.png":Vn,"./images/ko/gantt-view.png":Xn,"./images/ko/layout-fishbone.png":zn,"./images/ko/layout-org.png":qn,"./images/ko/layout-timeline.png":Qn,"./images/ko/links-pane.png":Zn,"./images/ko/main-window.png":Yn,"./images/ko/map-pane.png":$n,"./images/ko/markers-pane.png":Jn,"./images/ko/notes-pane.png":ne,"./images/ko/outline-view.png":ee,"./images/ko/presentation.png":te,"./images/ko/print-preview.png":oe,"./images/ko/quick-entry.png":ae,"./images/ko/relationship.png":se,"./images/ko/settings-theme.png":ie,"./images/ko/settings.png":re,"./images/ko/start-page.png":le,"./images/ko/task-pane.png":pe,"./images/ko/templates.png":he,"./images/ko/toolbar.png":ce}),y={};for(const o of Object.keys(F).sort()){const[,a,t]=/^\.\/([a-z]+)\/(.+)$/.exec(o),n=F[o],l=((/^#\s+(.+)$/m.exec(n)||[])[1]||t).trim(),p=[...n.matchAll(/^##\s+(.+)$/gm)].map(c=>c[1].trim());(y[a]=y[a]||[]).push({id:t.slice(0,2),lang:a,file:t,title:l,text:n,sections:p})}function C(o){return y[o]||y.ko||[]}function k(o,a=""){const t=C(o),n=String(a||"").slice(0,2);return t.find(l=>l.id===n)||t[0]}function me(o,a){return L[`./images/${o}/${a}`]||L[`./images/ko/${a}`]||""}function ge(o){let a=0;return E(o.text).replace(/src="(?:\.\/)?images\/([^"]+)"/g,(t,n)=>`src="${me(o.lang,decodeURIComponent(n))}" loading="lazy"`).replace(/<h2>/g,()=>`<h2 id="help-s${a++}">`)}function de(o,a){const t=String(a||"").toLowerCase().split(/\s+/).filter(Boolean);if(!t.length)return null;const n=new Map;for(const l of C(o)){const p=l.text.toLowerCase();t.every(c=>p.includes(c))&&n.set(l.id,p.split(t[0]).length-1)}return n}function ue(o,a){if(!o||!a)return;const t=document.createTreeWalker(o,NodeFilter.SHOW_TEXT),n=[];for(let l=t.nextNode();l;l=t.nextNode())l.nodeValue.toLowerCase().includes(a)&&n.push(l);for(const l of n){const p=l.nodeValue,c=p.toLowerCase(),f=document.createDocumentFragment();let g=0;for(let h=c.indexOf(a);h>=0;h=c.indexOf(a,g)){f.append(p.slice(g,h));const r=document.createElement("mark");r.textContent=p.slice(h,h+a.length),f.append(r),g=h+a.length}f.append(p.slice(g)),l.replaceWith(f)}}function be({initialId:o="",onClose:a}){const t=A(),n=C(t),[l,p]=d.useState(()=>k(t,o).id);d.useEffect(()=>{o&&p(k(t,o).id)},[o]);const[c,f]=d.useState(""),g=d.useRef(null),h=k(t,l),r=n.indexOf(h),S=d.useMemo(()=>ge(h),[h]),b=d.useMemo(()=>de(t,c),[t,c]),v=c.trim().toLowerCase().split(/\s+/)[0]||"";d.useLayoutEffect(()=>{const e=g.current;if(!e)return;e.innerHTML=S,ue(e,v);const i=v&&e.querySelector("mark");i&&i.scrollIntoView({block:"center"})},[S,v]);const u=(e,i=-1)=>{p(e),requestAnimationFrame(()=>{const m=g.current;if(!m)return;const _=i>=0?m.querySelector(`#help-s${i}`):null;_?_.scrollIntoView({block:"start"}):m.scrollTop=0})},M=e=>{const i=e.target.closest("a");if(!i)return;const m=i.getAttribute("href")||"";if(e.preventDefault(),/^https?:/i.test(m)){P(m);return}const _=m.split("#")[0].replace(/^\.\//,"");if(_.endsWith(".md")){u(k(t,_).id);return}if(m.startsWith("#")){const x=g.current&&g.current.querySelector(m);x&&x.scrollIntoView({block:"start"})}};d.useEffect(()=>{const e=i=>{i.altKey&&i.key==="ArrowLeft"&&r>0?(i.preventDefault(),u(n[r-1].id)):i.altKey&&i.key==="ArrowRight"&&r<n.length-1&&(i.preventDefault(),u(n[r+1].id))};return window.addEventListener("keydown",e),()=>window.removeEventListener("keydown",e)},[r,t]);const T=b?n.filter(e=>b.has(e.id)):n;return s.jsx(R,{embedded:!0,modal:!1,kind:"help",className:"help-window",icon:"help",title:w("help_menu"),onClose:a,children:s.jsxs("div",{className:"help-layout",children:[s.jsxs("nav",{className:"help-nav","aria-label":w("help_menu"),children:[s.jsxs("label",{className:"help-search",children:[s.jsx(D,{name:"search",size:14}),s.jsx("input",{type:"search",value:c,placeholder:w("help_search"),"aria-label":w("help_search"),onChange:e=>f(e.target.value)})]}),b&&s.jsx("div",{className:"help-found",children:w("help_found",{n:T.length})}),s.jsx("ol",{className:"help-chapters",children:T.map(e=>s.jsxs("li",{className:e.id===h.id?"on":"",children:[s.jsxs("button",{type:"button",className:"help-chapter","data-chapter":e.id,onClick:()=>u(e.id),children:[s.jsx("span",{children:e.title}),b&&s.jsx("small",{children:b.get(e.id)})]}),e.id===h.id&&e.sections.length>0&&s.jsx("ul",{className:"help-sections",children:e.sections.map((i,m)=>s.jsx("li",{children:s.jsx("button",{type:"button",onClick:()=>u(e.id,m),children:i})},i))})]},e.id))})]}),s.jsxs("div",{className:"help-main",children:[s.jsx("article",{className:"help-article",ref:g,onClick:M}),s.jsxs("div",{className:"help-pager",children:[s.jsxs("button",{type:"button",className:"btn",disabled:r<=0,onClick:()=>u(n[r-1].id),children:["← ",r>0?n[r-1].title:""]}),s.jsxs("span",{className:"help-page-no",children:[r+1," / ",n.length]}),s.jsxs("button",{type:"button",className:"btn",disabled:r>=n.length-1,onClick:()=>u(n[r+1].id),children:[r<n.length-1?n[r+1].title:""," →"]})]})]})]})})}export{be as HelpWindow,be as default};
