# Layouts and map styles

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

## Redraw in a direction, auto arrange

![Redrawn top to bottom](images/redraw-down.png)

*A map redrawn top to bottom.*

The four redraw buttons on the toolbar redraw the map **top to bottom** (`Ctrl+Alt+↓`), **left to right** (`Ctrl+Alt+→`), **right to left** (`Ctrl+Alt+←`) or on **both sides** (`Ctrl+Alt+M`). Redrawing also puts topics moved by hand back in place.

![A topic moved by hand](images/moved-topic.png)

*A main topic dragged to empty space: its subtopics and its line came along.*

**Auto arrange** (`Ctrl+Shift+L`, Tools › Auto arrange) keeps the direction, puts every topic moved by hand back in place and balances the sides again.

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
  - With elbow lines all the lines from a topic to its subtopics branch off **one trunk** (a vertical one beside it in the map, right and left layouts, a horizontal bus in org charts) — topics in a boundary, moved by hand or just added join the same trunk.
  - **Bend position**: select a topic and a ◆ handle appears on its trunk; drag it to move where the lines turn, from next to the parent (5 %) to next to the subtopics (95 %). Task pane › Format › Bend position has a slider and a **Back to the middle** button. The bend is saved with each topic in the map file.
- **Branch colours**: a colour per main topic or not
- **Background**: the map's background colour
- **Spacing**: across and down (50% – 250%)
- **Numbering**: `1.` `1.1.` or `I.` `I.A.` from the main topics

## Showing one branch

To concentrate on one branch of a big map, select its topic and press `F4` (View › Show this branch only). It moves to the centre and the rest is hidden. `F4` again, `Esc` or the note at the bottom brings the whole map back.
