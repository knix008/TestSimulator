# Making and editing topics

## Kinds of topics

- **Central topic** — the subject of the map. One per map; it cannot be deleted.
- **Main topics** — the topics on the central topic. Each branch has its own colour.
- **Subtopics** — everything below them.
- **Floating topics** and **callouts** — see [Relationships, boundaries, callouts](08-relationships.md).

## With the keyboard

| Key | Does |
| --- | --- |
| `Enter` | Sibling below — on the central topic, a main topic |
| `Shift+Enter` | Sibling above |
| `Tab` / `Insert` | Subtopic |
| `Ctrl+Shift+Insert` | Parent topic — wraps the selected topic in a new one |
| `Ctrl+Shift+Enter` | Callout |
| `Delete` | Delete the topic and its subtopics |
| `Ctrl+Delete` | Delete the topic only — its subtopics stay in its place |

A new topic is ready to type into. Press `Esc` without typing and it goes away again.

## Editing the text

![Editing a topic](images/editing.png)

*A topic being edited. The box grows with the text as you type.*

- With a topic selected, **just start typing**: the text is replaced by what you type. Korean input methods work the same way.
- `F2` or a **double-click** edits the current text.
- While editing: `Enter` confirms · `Shift+Enter` breaks the line · `Esc` cancels · `Tab` confirms and adds a subtopic.

## Selecting and moving around

- Click to select; `Ctrl`- or `Shift`-click to select several.
- `Shift`- or `Ctrl`-drag on empty space selects the topics in the rectangle.
- The arrow keys move to the nearest topic on screen; the arrow toward a branch's growth goes to its subtopics, the opposite one to the parent. `Home` goes to the central topic.
- `Alt+↑` / `Alt+↓` reorder a topic among its siblings.

## Dragging

![Dragging](images/drag.png)

*While dragging, the drop place is shown.*

- Drop on the **middle** of a topic: it becomes its subtopic (dashed outline).
- Drop on its **upper or lower edge** (left / right in an org chart): sibling before or after (a line shows where).
- Drop on **empty space**: the topic moves there **and stays connected** — its subtopics, its line and its relationships come along. **Reset position** in its right-click menu, or **Auto arrange** on the toolbar, puts it back.
- Hold `Alt` while dropping on empty space (or use **Detach as a floating topic**) to take it off its branch as a floating topic. Floating topics can be dragged anywhere.
- A topic cannot go into its own branch.

## The right-click menu

![Context menu](images/context-menu.png)

*A topic's right-click menu. Every item has an icon and its shortcut.*

Right-click a topic, empty space, a relationship, a tab or an item in the left pane (Outline, Find) for the commands that fit there. The menu of empty space has auto arrange, redraw in a direction, and the grid, rulers and overview window switches.

## Folding

Hover a topic with subtopics to see a **−** button where its branch leaves. Click it to fold — the button then shows how many subtopics are hidden — and again to unfold. On the keyboard: `Space`. The View menu has **Expand all**, **Collapse all** and **Expand to level n**.

## Cut, copy, paste

`Ctrl+X` · `Ctrl+C` · `Ctrl+V` work on the selected topics with their branches. Copied topics paste into other programs as indented text, and lines of text copied elsewhere paste as topics (indentation gives the levels). A copied picture pastes as the selected topic's picture.

## Quick entry

**Insert › Quick entry** (`Ctrl+Shift+Q`) adds many topics at once: one per line, `Tab`-indented lines become subtopics of the line above.

![Quick entry](images/quick-entry.png)

## Undo

Every change is undone with `Ctrl+Z` and redone with `Ctrl+Y`. Each map keeps its own history; a run of changes such as dragging a slider counts as one step.
