# Screen layout

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
| Arrange | Redraw top→bottom, left→right, right→left, both sides; auto arrange |
| View | Expand / collapse all, branch only, zoom, fit, map · outline · Gantt · Kanban, presentation |
| Screen | Grid, rulers, overview window on/off; fold / unfold the left and right panes |

In a narrow window the toolbar wraps onto a second row, a whole group at a time. Hover a button for its name and shortcut.

At the right end: theme (click for the next one, ▾ for the list), language (the flag), settings and about.

## Tabs

One tab per map. An unsaved map has an italic name and a ●. Drag tabs to reorder, middle-click to close, right-click for the tab menu.

## Sidebar

- **Outline** — the whole map as a tree. Click an entry to select that topic and bring it to the centre.
- **Find** — find and replace in topics and notes. → [Find and filter](10-find-filter.md)
- **Filter** — filter topics by priority, icon, tag, status or due date.

## Task pane

The **Format · Icons · Notes (with comments and custom properties) · Task · Links** of the selected topics, and the **Map** tab for the whole map.

## Folding the panes

Drag the edge of the sidebar or the task pane to resize it. The small arrow in the middle of the border (or a double-click on the border, or `Ctrl+Alt+S` / `Ctrl+Alt+P`) folds the pane away; the small tab at the edge of the map brings it back. The arrow button in a pane's header does the same.

## Map canvas

Where the map is drawn. Drag empty space to move around, the wheel scrolls, `Ctrl+wheel` zooms.

- **Grid** — thin lines every 24 units and strong ones every 120; the cells grow when you zoom far out. `Ctrl+Alt+G`.
- **Rulers** — along the top and left edge. 0 is the centre of the central topic; the spacing follows the zoom. `Ctrl+Alt+R`.
- **Overview window** — at the bottom right, the whole map with a frame around the part on screen. While it is on it always shows; click or drag in it to go there. `Ctrl+Alt+O`.

All three are switched with the toolbar buttons, the View menu, the right-click menu of empty space and Settings › Map.

## Status bar

The latest message at the left; at the right the level of the selected topic, the number of topics, the filter state, the layout, the map style and the zoom. Click the layout or the style to change them.
