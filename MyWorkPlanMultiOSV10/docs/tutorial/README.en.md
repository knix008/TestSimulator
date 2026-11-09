# MyWorkPlan tutorial

This document follows the in-app **Tutorial** step by step, with a screenshot of each step taken from the real app (`npm run tutorial:docs` makes them again).

## Running the tutorial

- **Start page › Start tutorial**, the **Tutorial** toolbar button, **Help › Tutorial** or **F11**.
- In the card: **Next / Previous** one step at a time, **Auto play** to the end, the chapter list to jump to a chapter, **✕** or **Esc** to stop at any time.
- The tutorial works only in its own sample tab. Your open plans are not changed, and the theme, language and view settings it changes are put back when it ends.
- A recording of the whole tour: `MyWorkPlan-Tutorial.mp4` in the project root.

## Contents

1. [Start page](#1-start-page)
2. [Building a plan](#2-building-a-plan)
3. [Scheduling](#3-scheduling)
4. [Resources and costs](#4-resources-and-costs)
5. [Tracking](#5-tracking)
6. [Views](#6-views)
7. [Reports](#7-reports)
8. [Files and printing](#8-files-and-printing)
9. [Customizing](#9-customizing)
10. [Help](#10-help)

## 1. Start page

### 1. Welcome to MyWorkPlan

This tutorial shows every feature of MyWorkPlan on a sample project. Press Next (or Auto play). Your files are not changed, and the settings it changes are put back at the end.

![Welcome to MyWorkPlan](images/01-welcome.jpg)

### 2. The Home button

The Home button at the start of the menu bar (or Ctrl+Shift+H) brings you back to this start page at any time; your open plans stay in their tabs. The side panels sit right under the toolbar, with the document tabs in the middle between them.

![The Home button](images/02-home.jpg)

### 3. Quick actions

The everyday jobs in one click: open a file, import MS Project XML or CSV, print, the tutorial, shortcuts, switch language, settings, start page settings, about and exit. Drag a card by the handle in its header to move it and by its bottom-right corner to resize it; Auto arrange above puts everything back.

![Quick actions](images/03-actions.jpg)

### 4. Creating a project

Start from a blank project or a template: software development, construction, event, marketing, product launch, research or office move. Templates come with phases, tasks, links, milestones and resources.

![Creating a project](images/04-templates.jpg)

### 5. 40 sample projects

Five sample plans in each of eight fields — IT, construction, manufacturing, marketing, events, business, research and personal life — 40 in all. Click one to open it in a new tab. Some are already under way, with a baseline, progress and a status date, so the tracking views have something to show.

![40 sample projects](images/05-samples.jpg)

### 6. Recent files and folders

The last 10 files and 10 folders are remembered. ✕ removes one entry, "Clear all" removes them all. The File menu manages them too.

![Recent files and folders](images/06-recent.jpg)

### 7. Moving background

The start page background keeps moving. Pick one of 21 animations (aurora, waves, constellation, Gantt bars, fireflies, spiral galaxy…), shuffle with "Change moving background", and set the speed. Every start picks a different background at random, and while the start page is open it changes by itself after a set time (30 s by default). An image can be the background too.

![Moving background](images/07-background.jpg)

## 2. Building a plan

### 8. The sample project

The Website Redesign sample is open. The task table is on the left, the Gantt chart on the right. Summary tasks are black brackets, milestones diamonds, red bars critical tasks.

![The sample project](images/08-sample.jpg)

### 9. The window

From the top: menus, the toolbar (one line) and project tabs; then the tool panel on the left, the view in the middle, the properties panel on the right and the status bar. Drag the separators to resize the panels.

![The window](images/09-layout.jpg)

### 10. Adding tasks

"Insert task" (Insert key) puts a new task above the selected row. You can also type a name straight into the empty row at the bottom of the table.

![Adding tasks](images/10-insertTask.jpg)

### 11. Durations

Type durations like 5d (days), 3w (weeks), 4h (hours) or 2ed (elapsed days). Double-click a cell or press F2 / Enter to edit; dates follow the calendar automatically.

![Durations](images/11-duration.jpg)

### 12. Milestones

A task with a duration of 0 is a milestone (a diamond). Use milestones for the end of a phase or an important date.

![Milestones](images/12-milestone.jpg)

### 13. Outline (summary tasks)

Indent (Alt+Shift+→) makes a task a subtask of the one above; that one becomes a summary task that adds up duration, cost and % complete. Outdent (Alt+Shift+←) undoes it.

![Outline (summary tasks)](images/13-outline.jpg)

### 14. Collapse and expand

The triangle before a summary task collapses and expands its subtasks. The View menu collapses or expands all of them.

![Collapse and expand](images/14-collapse.jpg)

### 15. Linking tasks

Select two or more tasks and press "Link tasks" (Ctrl+F2) to chain them finish-to-start. When a predecessor slips, its successors move automatically.

![Linking tasks](images/15-link.jpg)

### 16. Dragging bars

Drag a Gantt bar to change its start, its right end to change the duration, and the progress handle for % complete. Drag a bar up or down onto another bar to link them.

![Dragging bars](images/16-dragBar.jpg)

### 17. Undo and redo

Every edit can be undone with Ctrl+Z and redone with Ctrl+Y. The toolbar tooltips say what will be undone.

![Undo and redo](images/17-undo.jpg)

### 18. Copy and paste

Ctrl+C, Ctrl+X and Ctrl+V copy and move tasks. Lists copied from Excel or a text editor (indentation = level, a tab then a duration) paste as tasks too.

![Copy and paste](images/18-clipboard.jpg)

## 3. Scheduling

### 19. Task information

Double-click a task (Shift+F2) for the Task Information window: General, Predecessors, Resources, Advanced, Notes and Custom fields tabs. It can be moved outside the main window.

![Task information](images/19-taskInfo.jpg)

### 20. Constraints and deadlines

The Advanced tab sets constraints such as "Start no earlier than", deadlines, the task type (fixed units, duration or work), effort driven and the task calendar. A missed deadline shows a warning indicator.

![Constraints and deadlines](images/20-constraints.jpg)

### 21. Critical path and slack

Red bars are critical tasks: they have no slack, so any delay delays the whole project. Thin lines show free slack — how far a task can slip without delaying others.

![Critical path and slack](images/21-critical.jpg)

### 22. Find critical path (toggle)

The Find critical path toolbar button (Ctrl+Shift+P, also in the Project menu) calculates the schedule front to back (earliest dates) and back to front (latest dates), finds the tasks without slack and shows the critical path from start to finish. Critical tasks and links turn red, the rest fades, and the status bar gives the count and the chain. Press it again to turn it off.

![Find critical path (toggle)](images/22-criticalPath.jpg)

### 23. Link types and lag

Double-click a link line to change its type (FS, SS, FF, SF) and lag: 2d for a lag, -1d for a lead, 50% for a share of the predecessor. Right-click a link for a quick menu.

![Link types and lag](images/23-linkInfo.jpg)

### 24. Change working time

Set the working days and hours of the project calendar and exceptions such as holidays or extra working days. There are Standard, 24 Hours and Night Shift calendars, and new calendars can be made for tasks and resources.

![Change working time](images/24-calendar.jpg)

### 25. Recurring tasks

Create repeating tasks such as weekly meetings at once: daily, weekly, monthly or yearly, a number of times or up to a date.

![Recurring tasks](images/25-recurring.jpg)

### 26. Project information

The start date (or scheduling from the finish date), project calendar, currency, status date, statistics (current, baseline, actual, remaining) and properties.

![Project information](images/26-projectInfo.jpg)

## 4. Resources and costs

### 27. Resource Sheet

Enter people and equipment (work resources), materials and cost resources with their max. units, rates, cost per use and calendar. Overallocated resources show in red.

![Resource Sheet](images/27-resourceSheet.jpg)

### 28. Assigning resources

Select tasks and open Assign Resources (Alt+F10). Tick resources and set their units (50% = half time); work and cost are calculated. New resources can be added right there.

![Assigning resources](images/28-assign.jpg)

### 29. Resource Usage

Each resource with its assignments and its hours per day. Periods with more work than the resource can do are red.

![Resource Usage](images/29-resourceUsage.jpg)

### 30. Resource Graph

One resource's work per day as columns against its availability as a line; red above the line is overallocation.

![Resource Graph](images/30-resourceGraph.jpg)

### 31. Resource leveling

Leveling removes overallocations by delaying lower-priority tasks until nothing overlaps. Clear leveling puts them back.

![Resource leveling](images/31-leveling.jpg)

### 32. Team Planner

One lane per person with their tasks. Drag a task block to someone else's lane to reassign it. The bottom lane holds unassigned tasks.

![Team Planner](images/32-teamPlanner.jpg)

### 33. Wages and labor cost

In Resource Information › Costs, pay each person by the hour, day, week, month or year; the wage becomes an hourly rate the schedule costs with. Report › Labor cost shows the labor cost and its share of the total, materials, cost resources and fixed costs, and labor by phase and by person.

![Wages and labor cost](images/33-labor.jpg)

## 5. Tracking

### 34. Baselines

When the plan is agreed, save a baseline (up to 11). Later compare the real schedule with it to see the variances.

![Baselines](images/34-baseline.jpg)

### 35. Entering progress

Pick tasks and press 0%, 25%, 50%, 75% or 100%; actual start and finish are recorded automatically. The dark part inside a bar is the progress.

![Entering progress](images/35-progress.jpg)

### 36. Update project

Mark everything complete as scheduled up to the status date, or move the remaining work of late tasks after it.

![Update project](images/36-updateProject.jpg)

### 37. Tracking Gantt

The upper bar is the current schedule, the gray bar below the baseline. The progress line connects how far each task got at the status date.

![Tracking Gantt](images/37-trackingGantt.jpg)

## 6. Views

### 38. Switching views

The view button on the toolbar and the tool panel switch between 12 views: Gantt, Tracking Gantt, Task Sheet, Task Usage, Network Diagram, Calendar, Timeline, Resource Sheet / Usage / Graph, Team Planner and Reports.

![Switching views](images/38-viewMenu.jpg)

### 39. Long menus are grouped

Menus with many items are grouped into submenus by topic. Click an item with › on the right, or press →, and its submenu opens next to it (for example View › Switch view › Network diagram).

![Long menus are grouped](images/39-submenus.jpg)

### 40. Network Diagram

Tasks as boxes, links as arrows. Drag to move around, Ctrl+wheel to zoom. Red boxes are critical.

![Network Diagram](images/40-network.jpg)

### 41. Calendar

A month calendar with bars over the days each task runs. Arrows or the mouse wheel turn the months.

![Calendar](images/41-calendarView.jpg)

### 42. Timeline

The whole project on one line: phases, milestones and tasks added to the timeline — good for reporting.

![Timeline](images/42-timeline.jpg)

### 43. Task Usage

Each task with its resources and hours per day. Zooming the timescale switches between days, weeks and months.

![Task Usage](images/43-taskUsage.jpg)

### 44. Tables

Switch the column set: Entry, Schedule, Cost, Work, Tracking, Variance, Baseline, Summary, Constraint dates. Right-click a column header to hide or add columns; drag its border to resize it.

![Tables](images/44-tables.jpg)

### 45. Filter, group and sort

Filters such as critical, late or milestones; groups by resource or status; sorting. With "Highlight" on, all tasks stay visible and the matches are colored.

![Filter, group and sort](images/45-filter.jpg)

### 46. Find, replace, go to

Ctrl+F finds, Ctrl+H replaces and Ctrl+G goes to a task ID or a date. The date range filter is here too.

![Find, replace, go to](images/46-find.jpg)

### 47. Zoom and timescale

Ctrl+mouse wheel zooms; over the chart it changes the timescale (days, weeks, months, quarters). Drag (or Ctrl+drag) the chart to move it. The status bar slider changes the timescale too.

![Zoom and timescale](images/47-zoom.jpg)

### 48. Right-click menus

Task rows, bars, links, resources, column headers, empty chart areas, tabs and text fields each have their own menu. Menus can extend outside the window and every item has an icon.

![Right-click menus](images/48-contextMenu.jpg)

## 7. Reports

### 49. Reports

Project overview (% complete, progress by phase, upcoming milestones) plus cost, work, burndown, critical, late, upcoming, milestone and resource reports.

![Reports](images/49-reports.jpg)

### 50. Cost report

Cumulative cost of the baseline, the current schedule and the actuals, and cost by phase and resource. "Copy report" pastes it into other programs.

![Cost report](images/50-reportCost.jpg)

### 51. Exporting a report

The Export report button in the report header (or the Report menu) saves the current report as HTML, Markdown, Word (.docx) or PDF. Charts go in as pictures and the numbers as tables.

![Exporting a report](images/51-reportExport.jpg)

### 52. Burndown

How the remaining work goes down, as scheduled and actually.

![Burndown](images/52-reportBurndown.jpg)

## 8. Files and printing

### 53. The File menu

Save (.mwp), save as template (.mwpt), import and export MS Project XML and CSV, export the Gantt chart as a picture (PNG), manage recent files and folders, print.

![The File menu](images/53-fileMenu.jpg)

### 54. Printing and preview

Print the entire project, the current view, or a custom part (ID range, date range, selected tasks). Change paper, orientation, margins, scale, header and footer while previewing, then print right away.

![Printing and preview](images/54-print.jpg)

### 55. The Gantt chart as an image

File › Import and export › Export as image: pick PNG, JPEG, WebP, BMP, TIFF or SVG, choose a transparent or white background, the table, the chart or both, and the scale and quality. A transparent image sits straight on top of documents and slides.

![The Gantt chart as an image](images/55-imageExport.jpg)

### 56. Keeping plans in a database

In Settings › Database pick SQLite3, MariaDB, MySQL or PostgreSQL, enter the file or the server, port, database name and user, and press Test connection. From then on Save (Ctrl+S) writes both the file and the database, and File › Open from database brings plans back. The password is kept only if you turn on saving it.

![Keeping plans in a database](images/56-database.jpg)

### 57. Managing recent files

Recent files and recent folders on two tabs: open one, remove one, or clear them all. Files that no longer exist are marked "Missing".

![Managing recent files](images/57-recentFiles.jpg)

### 58. Drag and drop

Drag .mwp, .mwpt, XML or CSV files from the file manager onto the window to open them; an image becomes the background and text becomes a task list.

![Drag and drop](images/58-dragDrop.jpg)

## 9. Customizing

### 59. Themes

The theme button picks a different theme at random on every press. The ▾ next to it lists 20 dark and 20 light themes in two columns; the custom theme is edited color by color in Settings › Theme.

![Themes](images/59-theme.jpg)

### 60. Language

The flag button switches between Korean and English: the UK flag shows while the UI is Korean, the Korean flag while it is English.

![Language](images/60-language.jpg)

### 61. Collapsing panels

Collapsed, the tool and properties panels leave a narrow rail with icons and a title; the expand button is at the top. Drag the separators to change their width.

![Collapsing panels](images/61-panels.jpg)

### 62. Bottom panel: schedule check

The schedule check at the bottom lists the schedule's problems (link loops, constraint conflicts, missed deadlines, overallocation, late work, unlinked tasks), the critical path, overallocated people, delays and milestones, each tab with its count. Click a row to go to its task or resource. Fold and unfold it with the button in its header (folded, its icon, title and counts stay visible); turn it on and off with the Bottom panel toolbar button (Ctrl+Shift+3). Drag its top edge to change the height.

![Bottom panel: schedule check](images/62-bottomPanel.jpg)

### 63. Settings

General, Theme, Font (every font installed on the system, size, weight, italic), Background, Schedule, Gantt chart, Recent and Shortcuts tabs. Settings are kept for the next start.

![Settings](images/63-settings.jpg)

### 64. Status bar

Command results, the mode of new tasks, save state, task count, selection, finish date, % complete, conflicts, theme, language, timescale, zoom and a clock. Drag the bottom-right corner to resize the window.

![Status bar](images/64-statusBar.jpg)

## 10. Help

### 65. Keyboard shortcuts

Settings › Shortcuts lists them all; the menus show them next to each command.

![Keyboard shortcuts](images/65-shortcuts.jpg)

### 66. About

The ⓘ toolbar button shows the version, build information and the author (SHKWON, knix008@naver.com). Errors open a popup with every detail, ready to copy.

![About](images/66-about.jpg)

### 67. Reading the tutorial document

A document with every step of this tutorial and its screen can be read inside the program: open it from Help › Tutorial document on the home screen or in the Help menu. The bar on top jumps to a chapter, switches 한국어/English, starts the tutorial or opens the document in a browser. Home takes you back.

![Reading the tutorial document](images/67-tutorialDoc.jpg)

### 68. That's the tour

Watch it again any time with Help › Tutorial or the graduation-cap toolbar button (F11). See Help › User's guide for the details.

![That's the tour](images/68-finish.jpg)

