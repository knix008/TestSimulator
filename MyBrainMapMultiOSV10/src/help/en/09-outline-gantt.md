# Outline view, Gantt chart and Kanban board

The same map has four views: **map**, **outline**, **Gantt chart** and **Kanban board**. Switch with the four toolbar buttons or the View menu. A change in any view changes the same map.

## Outline view

![Outline view](images/outline-view.png)

*The outline view: an indented list with task columns.*

The map from top to bottom like a document's table of contents — handy for long texts and for putting things in order.

| Key | Does |
| --- | --- |
| `Enter` | New topic below |
| `Tab` / `Shift+Tab` | Indent (under the topic above) / outdent |
| `Alt+↑` / `Alt+↓` | Reorder |
| `↑` / `↓` | Row above / below |
| `Ctrl+Space` | Fold / unfold |
| `Backspace` on an empty topic | Delete it |

The columns at the right edit priority, progress, start, due and resources directly.

## Kanban board

![Kanban board](images/kanban-view.png)

*The Kanban board: main topics are columns, their subtopics are cards.*

**View › Kanban board** (the Kanban button on the toolbar) shows the main topics as columns and their subtopics as cards. A card shows the priority, progress, due date, resources and how many subtopics, notes and comments it has.

- Drag a card to another column to make it that main topic's subtopic, or between two cards to put it there. The map changes the same way, and `Ctrl+Z` undoes it.
- **Add card** under a column adds a subtopic; **Add column** at the right end adds a main topic.
- Click a card or a column header to select that topic and edit it in the task pane.

## Gantt chart

![Gantt chart](images/gantt-view.png)

*The Gantt chart: the task list at the left, bars on a calendar at the right.*

Topics with a start or due date are bars on a calendar. The branches above them are grey **summary bars** spanning all their tasks.

- **Drag** a bar to move it; drag its **left or right end** to change the start or due date.
- The darker part of a bar is the progress; green bars are done; a diamond is a milestone.
- The red line is today; **Today** scrolls it into view.
- The scale is **day · week · month**. **Show topics without dates** lists every topic.
- Double-click a bar to open the Task tab.
