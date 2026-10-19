# Split panes

You can split the editing area into several **editor panes** to view and edit several documents at the same time. Layouts are left / right · top / bottom · 2×2, plus a grid that grows up to 9 panes.

![Editor split left and right](images/split-cols.png)
*Figure: Two editor panes split left and right — each pane has the document name in its header*

## How to split

| Method | Result |
|---|---|
| The **Split the editor** button on the toolbar | One more pane per press (2 → 3 → … → up to 9) |
| Ctrl+\\ | Toggles between one pane ↔ split left / right |
| View › Single editor (Ctrl+Alt+1) | No split |
| View › Split left / right (Ctrl+Alt+2) | Two panes, left · right |
| View › Split top / bottom (Ctrl+Alt+3) | Two panes, top · bottom |
| View › Split into four (Ctrl+Alt+4) | Four panes, 2 × 2 |
| The Split left / right card on the start page | Same as the toolbar button |

Only one of the four layouts in the View menu can be chosen, and the current one is marked.

Panes added with the toolbar button are arranged in a **balanced grid**. The number of columns is the square root of the pane count rounded up (4 → 2 columns, 5 – 9 → 3 columns), and if the last row is not full, the last pane stretches across the remaining space.

![Editor split into four](images/split-grid.png)
*Figure: Four editor panes split 2 × 2*

## Which document goes into a new pane

A newly created pane gets a **document not shown in any other pane**, in tab order. The same document is never shown in two panes. If no tabs are left, the pane stays **empty** ("(empty — pick a document)"), and documents you open or create afterwards fill the empty panes in turn.

An empty pane has **Pick a document…** and **Close this pane** buttons in the middle. Right-clicking an empty pane also shows the document picker list.

## Pane header

With two or more panes, each pane gets a header row on top.

- **Document name ▾**: the name of that pane's document (with a ● if unsaved). Clicking it shows a list for choosing the document to put in that pane.
- **Hexa**: picture files only — opens and closes the hex view beside the picture.
- **×**: **closes the pane's document and removes the pane**. If there are unsaved changes, it asks first. The × of an empty pane just closes the pane.

When panes are removed, the layout is rearranged: with one left, it becomes unsplit; with two, left / right (top / bottom if it was split that way); with three, the last pane takes a whole row of the grid.

## Choosing a document for a pane

Clicking the name ▾ in a pane header (Pick a document… in an empty pane) shows this list:

- **Open documents**: every document open in a tab. The pane's current document is marked, and documents shown in other panes say which pane, such as "pane 2". Choosing a document from another pane **moves it** into this pane, leaving the original pane empty.
- **Files in …**: files of the folder open in the folder tree (or, if none, the current document's folder) that are not open yet. Choosing one opens it in that pane.
- **Open…**: opens another file in that pane through the file open dialog.

## The active pane

- **The pane you click is the active pane**. It is marked with an outline.
- The tab bar · find bar · Markdown toolbar · Preview button · status bar all follow the active pane's document.
- Clicking a tab shows that document in the active pane. Clicking the tab of a document already shown in another pane makes that pane active.
- **F6** (View › Next editor pane) moves focus to the next pane.

## Resizing and restoring

- **Dragging the borders** between panes changes their width · height (↔ / ↕ cursor). The proportions are saved in the session.
- Going back to a single pane keeps the documents and their editing state (cursor, undo history) as they were. The documents are not closed from the tabs.
- The split layout, each pane's document and the active pane are restored on the next launch.
- Each pane opens Markdown's Structure · WYSIWYG · Preview and the HTML · SVG preview **inside itself** ([Markdown](09-markdown.md)).

> Tip: To see two parts of one file at once, move quickly between them with the Structure column or the minimap instead of showing the same document in two panes. My Editor shows a document in only one pane.
