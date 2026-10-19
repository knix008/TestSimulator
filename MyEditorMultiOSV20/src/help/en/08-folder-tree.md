# Folder tree

The **Folder** panel on the left of the window shows one folder as a tree with connecting lines. You can pick files in your project, create new files · folders, and rename or delete them.

![Folder tree](images/folder-tree.png)
*Figure: The folder tree — header buttons, the filter field, and the tree with connecting lines*

## Showing and hiding

- Show and hide it with **Ctrl+B**, the Folder tree button on the toolbar, **View › Folder tree**, or the Folder tree check box under Settings › General › Appearance.
- While editing a **Markdown document**, Ctrl+B is used for Bold, so use **Ctrl+Shift+B** to open and close it. Ctrl+Shift+B works the same in other documents too.
- **Dragging the border** between the folder tree and the editing area changes its width. It cannot become narrower than the width that shows the whole header title and buttons, and can be widened up to 600px. The width is remembered.

## Opening and closing a folder

- Choose a folder with **File › Open folder…** (Ctrl+Shift+O), the Open folder button on the toolbar, or the **Open folder…** button in the panel header. The **Open folder…** button shown in the middle of the panel when no folder is open does the same.
- Only one folder is open at a time. Opening another folder replaces it.
- Close it with the **×** (Close folder) in the header or **File › Close folder**.
- The open folder opens again on the next launch (if the folder has disappeared in the meantime, the program starts without one).

## Working with the tree

- At first only the folder's **top-level items** are shown. Clicking a folder (⊞) expands just that folder (⊟), and clicking again collapses it. Opening or closing other folders leaves folders you already expanded as they are.
- Folders come first, then files, in name order. The icon in front of a file shows its kind (code, markup · config, picture, audio, video, archive, executable · document, plain text).
- **Clicking a file** opens it in a tab. If it is already open, its tab is brought forward.
- **Open files** are shown in accent-coloured text, and the **file being edited** with the selection background colour.
- Hovering over an item shows its full path. Folders that could not be read get a ⚠ mark.

## Header buttons

Buttons sit to the right of the "Folder" title in the panel header.

| Button | Name | What it does |
|---|---|---|
| 🔍 | Search | Opens and closes the Find in folder area in the lower half of the panel ([Find and replace](06-find-and-replace.md)) |
| Folder | Open folder… | Choose another folder |
| ↻ | Refresh | Reads the disk again. Expanded folders stay expanded |
| ⌄ | Expand all | Expands every subfolder |
| ⌃ | Collapse all | Collapses every folder |
| Eye | Show hidden files | Shows or hides files · folders whose names start with . |
| × | Close folder | Closes the folder |

**Expand all** leaves folders with very many files collapsed, such as `node_modules` · `.git` · `dist` · `build` · `out` · `target` · `bin` · `obj` · `vendor` · `coverage` · `__pycache__` · `.venv`, and stops once it goes 12 levels deep or past 5,000 items.

**Show hidden files** is the same setting as **Show hidden (dot) files** under Settings › General › Folder tree (off by default).

## Filter

Typing in the **Filter…** field below the header keeps only the items whose names contain that text (and the folders that contain them). Case is ignored. The filter only looks inside folders that have already been read (expanded at least once), so to filter deep down, press **Expand all** first. Clearing the field brings back the full tree.

## Right-click menu

Right-clicking an item opens a menu. It differs slightly between folders and files.

| Item | Folder | File | Description |
|---|---|---|---|
| New file… | ○ | | Creates an empty file in this folder and opens it right away |
| New folder… | ○ | | Creates a folder inside this folder |
| Open | | ○ | Opens the file in a tab |
| Rename… | ○ | ○ | Changes the name. If the file is open, its tab name changes too |
| Delete | ○ | ○ | Deletes it (cannot be undone) |
| Show in file manager | ○ | ○ | Shows it in the operating system's file manager (desktop) |
| Copy path | ○ | ○ | Full path to the clipboard |
| Refresh | ○ | ○ | Reads that folder (for a file, the folder containing it) again |

- New file · New folder · Rename show a small window asking for the name. If the name contains characters not allowed in file names, such as `\ / : * ? " < > |`, the **Create** button is disabled. The Rename window opens with the part before the extension selected.
- New files are created with the encoding · line ending for new documents from Settings.
- **Delete** asks for confirmation ("This cannot be undone.") before deleting. If the deleted file was open in a tab, the tab stays and is marked as modified, so saving can recreate it.
- The top folder itself (the root) cannot be renamed or deleted.

> Tip: With a folder open, the terminal starts in that folder, and the document picker of an editor pane lists that folder's files too.
