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

### 3. Creating a project

Start from a blank project or a template: software development, construction, event, marketing, product launch, research or office move. Templates come with phases, tasks, links, milestones and resources.

![Creating a project](images/03-templates.jpg)

### 4. Recent files and folders

The last 10 files and 10 folders are remembered. ✕ removes one entry, "Clear all" removes them all. The File menu manages them too.

![Recent files and folders](images/04-recent.jpg)

### 5. Moving background

The start page background keeps moving. Pick one of 8 animations (aurora, waves, constellation, Gantt bars…), shuffle with "Change moving background", and set the speed. Every start picks a different background at random, and while the start page is open it changes by itself after a set time (30 s by default). An image can be the background too.

![Moving background](images/05-background.jpg)

## 2. Building a plan

### 6. The sample project

The Website Redesign sample is open. The task table is on the left, the Gantt chart on the right. Summary tasks are black brackets, milestones diamonds, red bars critical tasks.

![The sample project](images/06-sample.jpg)

### 7. The window

From the top: menus, the toolbar (one line) and project tabs; then the tool panel on the left, the view in the middle, the properties panel on the right and the status bar. Drag the separators to resize the panels.

![The window](images/07-layout.jpg)

### 8. Adding tasks

"Insert task" (Insert key) puts a new task above the selected row. You can also type a name straight into the empty row at the bottom of the table.

![Adding tasks](images/08-insertTask.jpg)

### 9. Durations

Type durations like 5d (days), 3w (weeks), 4h (hours) or 2ed (elapsed days). Double-click a cell or press F2 / Enter to edit; dates follow the calendar automatically.

![Durations](images/09-duration.jpg)

### 10. Milestones

A task with a duration of 0 is a milestone (a diamond). Use milestones for the end of a phase or an important date.

![Milestones](images/10-milestone.jpg)

### 11. Outline (summary tasks)

Indent (Alt+Shift+→) makes a task a subtask of the one above; that one becomes a summary task that adds up duration, cost and % complete. Outdent (Alt+Shift+←) undoes it.

![Outline (summary tasks)](images/11-outline.jpg)

### 12. Collapse and expand

The triangle before a summary task collapses and expands its subtasks. The View menu collapses or expands all of them.

![Collapse and expand](images/12-collapse.jpg)

### 13. Linking tasks

Select two or more tasks and press "Link tasks" (Ctrl+F2) to chain them finish-to-start. When a predecessor slips, its successors move automatically.

![Linking tasks](images/13-link.jpg)

### 14. Dragging bars

Drag a Gantt bar to change its start, its right end to change the duration, and the progress handle for % complete. Drag a bar up or down onto another bar to link them.

![Dragging bars](images/14-dragBar.jpg)

### 15. Undo and redo

Every edit can be undone with Ctrl+Z and redone with Ctrl+Y. The toolbar tooltips say what will be undone.

![Undo and redo](images/15-undo.jpg)

### 16. Copy and paste

Ctrl+C, Ctrl+X and Ctrl+V copy and move tasks. Lists copied from Excel or a text editor (indentation = level, a tab then a duration) paste as tasks too.

![Copy and paste](images/16-clipboard.jpg)

## 3. Scheduling

### 17. Task information

Double-click a task (Shift+F2) for the Task Information window: General, Predecessors, Resources, Advanced, Notes and Custom fields tabs. It can be moved outside the main window.

![Task information](images/17-taskInfo.jpg)

### 18. Constraints and deadlines

The Advanced tab sets constraints such as "Start no earlier than", deadlines, the task type (fixed units, duration or work), effort driven and the task calendar. A missed deadline shows a warning indicator.

![Constraints and deadlines](images/18-constraints.jpg)

### 19. Critical path and slack

Red bars are critical tasks: they have no slack, so any delay delays the whole project. Thin lines show free slack — how far a task can slip without delaying others.

![Critical path and slack](images/19-critical.jpg)

### 20. Find critical path (toggle)

The Find critical path toolbar button (Ctrl+Shift+P, also in the Project menu) calculates the schedule front to back (earliest dates) and back to front (latest dates), finds the tasks without slack and shows the critical path from start to finish. Critical tasks and links turn red, the rest fades, and the status bar gives the count and the chain. Press it again to turn it off.

![Find critical path (toggle)](images/20-criticalPath.jpg)

### 21. Link types and lag

Double-click a link line to change its type (FS, SS, FF, SF) and lag: 2d for a lag, -1d for a lead, 50% for a share of the predecessor. Right-click a link for a quick menu.

![Link types and lag](images/21-linkInfo.jpg)

### 22. Change working time

Set the working days and hours of the project calendar and exceptions such as holidays or extra working days. There are Standard, 24 Hours and Night Shift calendars, and new calendars can be made for tasks and resources.

![Change working time](images/22-calendar.jpg)

### 23. Recurring tasks

Create repeating tasks such as weekly meetings at once: daily, weekly, monthly or yearly, a number of times or up to a date.

![Recurring tasks](images/23-recurring.jpg)

### 24. Project information

The start date (or scheduling from the finish date), project calendar, currency, status date, statistics (current, baseline, actual, remaining) and properties.

![Project information](images/24-projectInfo.jpg)

## 4. Resources and costs

### 25. Resource Sheet

Enter people and equipment (work resources), materials and cost resources with their max. units, rates, cost per use and calendar. Overallocated resources show in red.

![Resource Sheet](images/25-resourceSheet.jpg)

### 26. Assigning resources

Select tasks and open Assign Resources (Alt+F10). Tick resources and set their units (50% = half time); work and cost are calculated. New resources can be added right there.

![Assigning resources](images/26-assign.jpg)

### 27. Resource Usage

Each resource with its assignments and its hours per day. Periods with more work than the resource can do are red.

![Resource Usage](images/27-resourceUsage.jpg)

### 28. Resource Graph

One resource's work per day as columns against its availability as a line; red above the line is overallocation.

![Resource Graph](images/28-resourceGraph.jpg)

### 29. Resource leveling

Leveling removes overallocations by delaying lower-priority tasks until nothing overlaps. Clear leveling puts them back.

![Resource leveling](images/29-leveling.jpg)

### 30. Team Planner

One lane per person with their tasks. Drag a task block to someone else's lane to reassign it. The bottom lane holds unassigned tasks.

![Team Planner](images/30-teamPlanner.jpg)

## 5. Tracking

### 31. Baselines

When the plan is agreed, save a baseline (up to 11). Later compare the real schedule with it to see the variances.

![Baselines](images/31-baseline.jpg)

### 32. Entering progress

Pick tasks and press 0%, 25%, 50%, 75% or 100%; actual start and finish are recorded automatically. The dark part inside a bar is the progress.

![Entering progress](images/32-progress.jpg)

### 33. Update project

Mark everything complete as scheduled up to the status date, or move the remaining work of late tasks after it.

![Update project](images/33-updateProject.jpg)

### 34. Tracking Gantt

The upper bar is the current schedule, the gray bar below the baseline. The progress line connects how far each task got at the status date.

![Tracking Gantt](images/34-trackingGantt.jpg)

## 6. Views

### 35. Switching views

The view button on the toolbar and the tool panel switch between 12 views: Gantt, Tracking Gantt, Task Sheet, Task Usage, Network Diagram, Calendar, Timeline, Resource Sheet / Usage / Graph, Team Planner and Reports.

![Switching views](images/35-viewMenu.jpg)

### 36. Long menus are grouped

Menus with many items are grouped into submenus by topic. Click an item with › on the right, or press →, and its submenu opens next to it (for example View › Switch view › Network diagram).

![Long menus are grouped](images/36-submenus.jpg)

### 37. Network Diagram

Tasks as boxes, links as arrows. Drag to move around, Ctrl+wheel to zoom. Red boxes are critical.

![Network Diagram](images/37-network.jpg)

### 38. Calendar

A month calendar with bars over the days each task runs. Arrows or the mouse wheel turn the months.

![Calendar](images/38-calendarView.jpg)

### 39. Timeline

The whole project on one line: phases, milestones and tasks added to the timeline — good for reporting.

![Timeline](images/39-timeline.jpg)

### 40. Task Usage

Each task with its resources and hours per day. Zooming the timescale switches between days, weeks and months.

![Task Usage](images/40-taskUsage.jpg)

### 41. Tables

Switch the column set: Entry, Schedule, Cost, Work, Tracking, Variance, Baseline, Summary, Constraint dates. Right-click a column header to hide or add columns; drag its border to resize it.

![Tables](images/41-tables.jpg)

### 42. Filter, group and sort

Filters such as critical, late or milestones; groups by resource or status; sorting. With "Highlight" on, all tasks stay visible and the matches are colored.

![Filter, group and sort](images/42-filter.jpg)

### 43. Find, replace, go to

Ctrl+F finds, Ctrl+H replaces and Ctrl+G goes to a task ID or a date. The date range filter is here too.

![Find, replace, go to](images/43-find.jpg)

### 44. Zoom and timescale

Ctrl+mouse wheel zooms; over the chart it changes the timescale (days, weeks, months, quarters). Drag (or Ctrl+drag) the chart to move it. The status bar slider changes the timescale too.

![Zoom and timescale](images/44-zoom.jpg)

### 45. Right-click menus

Task rows, bars, links, resources, column headers, empty chart areas, tabs and text fields each have their own menu. Menus can extend outside the window and every item has an icon.

![Right-click menus](images/45-contextMenu.jpg)

## 7. Reports

### 46. Reports

Project overview (% complete, progress by phase, upcoming milestones) plus cost, work, burndown, critical, late, upcoming, milestone and resource reports.

![Reports](images/46-reports.jpg)

### 47. Cost report

Cumulative cost of the baseline, the current schedule and the actuals, and cost by phase and resource. "Copy report" pastes it into other programs.

![Cost report](images/47-reportCost.jpg)

### 48. Exporting a report

The Export report button in the report header (or the Report menu) saves the current report as HTML, Markdown, Word (.docx) or PDF. Charts go in as pictures and the numbers as tables.

![Exporting a report](images/48-reportExport.jpg)

### 49. Burndown

How the remaining work goes down, as scheduled and actually.

![Burndown](images/49-reportBurndown.jpg)

## 8. Files and printing

### 50. The File menu

Save (.mwp), save as template (.mwpt), import and export MS Project XML and CSV, export the Gantt chart as a picture (PNG), manage recent files and folders, print.

![The File menu](images/50-fileMenu.jpg)

### 51. Printing and preview

Print the entire project, the current view, or a custom part (ID range, date range, selected tasks). Change paper, orientation, margins, scale, header and footer while previewing, then print right away.

![Printing and preview](images/51-print.jpg)

### 52. The Gantt chart as an image

File › Import and export › Export as image: pick PNG, JPEG, WebP, BMP, TIFF or SVG, choose a transparent or white background, the table, the chart or both, and the scale and quality. A transparent image sits straight on top of documents and slides.

![The Gantt chart as an image](images/52-imageExport.jpg)

### 53. Keeping plans in a database

In Settings › Database pick SQLite3, MariaDB, MySQL or PostgreSQL, enter the file or the server, port, database name and user, and press Test connection. From then on Save (Ctrl+S) writes both the file and the database, and File › Open from database brings plans back. The password is kept only if you turn on saving it.

![Keeping plans in a database](images/53-database.jpg)

### 54. Managing recent files

Recent files and recent folders on two tabs: open one, remove one, or clear them all. Files that no longer exist are marked "Missing".

![Managing recent files](images/54-recentFiles.jpg)

### 55. Drag and drop

Drag .mwp, .mwpt, XML or CSV files from the file manager onto the window to open them; an image becomes the background and text becomes a task list.

![Drag and drop](images/55-dragDrop.jpg)

## 9. Customizing

### 56. Themes

The theme button picks a different theme at random on every press. The ▾ next to it lists 20 dark and 20 light themes in two columns; the custom theme is edited color by color in Settings › Theme.

![Themes](images/56-theme.jpg)

### 57. Language

The flag button switches between Korean and English: the UK flag shows while the UI is Korean, the Korean flag while it is English.

![Language](images/57-language.jpg)

### 58. Collapsing panels

Collapsed, the tool and properties panels leave a narrow rail with icons and a title; the expand button is at the top. Drag the separators to change their width.

![Collapsing panels](images/58-panels.jpg)

### 59. Settings

General, Theme, Font (every font installed on the system, size, weight, italic), Background, Schedule, Gantt chart, Recent and Shortcuts tabs. Settings are kept for the next start.

![Settings](images/59-settings.jpg)

### 60. Status bar

Command results, the mode of new tasks, save state, task count, selection, finish date, % complete, conflicts, theme, language, timescale, zoom and a clock. Drag the bottom-right corner to resize the window.

![Status bar](images/60-statusBar.jpg)

## 10. Help

### 61. Keyboard shortcuts

Settings › Shortcuts lists them all; the menus show them next to each command.

![Keyboard shortcuts](images/61-shortcuts.jpg)

### 62. About

The ⓘ toolbar button shows the version, build information and the author (SHKWON, knix008@naver.com). Errors open a popup with every detail, ready to copy.

![About](images/62-about.jpg)

### 63. Reading the tutorial document

A document with every step of this tutorial and its screen can be read inside the program: open it from Help › Tutorial document on the home screen or in the Help menu. The bar on top jumps to a chapter, switches 한국어/English, starts the tutorial or opens the document in a browser. Home takes you back.

![Reading the tutorial document](images/63-tutorialDoc.jpg)

### 64. That's the tour

Watch it again any time with Help › Tutorial or the graduation-cap toolbar button (F11). See Help › User's guide for the details.

![That's the tour](images/64-finish.jpg)

