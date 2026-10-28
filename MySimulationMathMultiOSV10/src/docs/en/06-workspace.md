# Workspace and Variable Editor

## Workspace

The Workspace window lists the variables currently in memory with their name, value, size and class. It refreshes immediately when the Command Window or a script changes a variable.

![Workspace window](images/en/workspace.png)

- Click a header (Name, Value, Size, Class) to sort; click again to reverse the order.
- Type in the field at the top to filter by name.
- Click a variable once to select it; the buttons on the ribbon's **Plots** tab then plot that variable.
- Double-click to open a **Variable Editor** tab.

Right-click menu:

| Item | Action |
| --- | --- |
| Open | Variable Editor |
| Plot | `plot(name)` |
| Copy name | Copies the name to the clipboard |
| Rename | Asks for a new name and renames (can be undone) |
| Duplicate | Copies to `name_copy` |
| Save as MAT file | Choose the file to save with `save` |
| Clear | `clear name` (can be undone) |

The **Clear Workspace** button in the header and the ribbon's **Home › Clear Workspace** clear all variables after asking for confirmation, and this too can be reverted with Undo ({{Ctrl+Z}}).

## Variable Editor

![Variable Editor: viewing and editing a matrix as a table](images/en/variable-editor.png)

The Variable Editor shows one workspace variable as a table. Real numeric matrices and logical matrices can be edited.

- Edit a numeric matrix cell by double-clicking it or pressing {{Enter}}. You can enter `3.5`, `-2e-3`, `1+2i`, `Inf` and `NaN`.
- Typing in the empty row or column right after the data grows the matrix (empty cells become 0).
- Move between cells with the arrow keys; {{Esc}} cancels editing.
- Revert edits with Undo ({{Ctrl+Z}}).
- Cell arrays, structs and strings are shown read-only.
- The numeric format (short / long) follows the numeric format in Settings › Command Window.

## Command History

The Command History window collects the commands you have run, grouped by session (the date and time of the run). They remain after you reopen the program (up to 2000 entries).

| Action | How |
| --- | --- |
| Run again | Double-click |
| Copy / bring to the prompt | Right-click › Copy, To prompt |
| Delete one line | Right-click › Delete |
| Delete all | Right-click › Delete all (asks for confirmation) |

Pressing {{↑}} in the Command Window uses the same history.
