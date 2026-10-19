# Find and replace

This chapter covers the **find bar** for finding and replacing text in the current document, the **search area** that looks through a whole folder or all open documents, and **Go to line** for jumping straight to a line. The commands are gathered in the **Search** menu.

![Search menu](images/menu-find.png)
*Figure: The Search menu*

| Menu item | Shortcut | Description |
|---|---|---|
| Find… | Ctrl+F | Opens the find bar |
| Find next | F3 | To the next match |
| Find previous | Shift+F3 | To the previous match |
| Replace… | Ctrl+H | Opens the find bar with the replace field |
| Select all matches | | Puts a cursor at every match (while the find bar is open) |
| Find in folder… | Ctrl+Shift+F | Searches every file of the folder open in the folder tree |
| Find in open documents… | Ctrl+Alt+F | Searches all open documents |
| Go to line… | Ctrl+G | Goes to a line number (and column) |

## The find bar

Open it with **Ctrl+F**, the Find button on the toolbar, or the editing area's right-click menu. The find bar appears right below the tab bar, above the editor, with the cursor in its input field. If you open it while text within one line is selected in the document, that text becomes the search text.

![Find bar](images/find.png)
*Figure: The find bar — matches are highlighted in the document, with the current / total count shown*

- As you type, every match is highlighted, and the right side shows **current of total** (e.g. 2 of 6) or "n matches". With none, it shows "No matches" and the input field turns red.
- **Enter** or **F3** = next, **Shift+Enter** or **Shift+F3** = previous. Reaching the end wraps around to the start. The **↑ ↓** buttons on the right do the same.
- **≡ (Select all matches)**: selects every match, creating multiple cursors. Typing then changes all of them at once.
- **×** or **Esc** closes it (when the cursor is in the editing area or the find bar).
- Pressing F3 / Shift+F3 while the find bar is closed opens it.

Three buttons inside the right end of the input field change how searching works. Buttons that are on are highlighted.

| Button | Name | Description |
|---|---|---|
| Aa | Match case | When on, `Apple` and `apple` are treated as different |
| ab (underlined) | Whole word | When on, finds only whole-word matches (`cat` is not found in `category`) |
| .* | Regex | Treats the search text as a regular expression. If the expression is invalid, the input field turns red and nothing is found |

The find bar does not open for hex view · picture · audio · video documents.

## Replace

Open it with **Ctrl+H** or the Replace button on the toolbar. A **Replace with** field appears as one more row below the find bar. The **▸ / ▾** button at the left end of the find bar also switches between find only ↔ replace.

![Replace](images/replace.png)
*Figure: The find bar with the replace field open*

- The **Replace** button, or **Enter** in the Replace with field: replaces the current match and moves to the next.
- The **Replace all** button, or **Ctrl+Enter** in the Replace with field: replaces every match in the document at once.
- With regex on, the replacement can refer to parenthesized groups as `$1`, `$2`. For example, find `(\w+)@(\w+)`, replace with `$2 at $1`.
- Every replacement can be undone with Ctrl+Z. Replace all is undone in a single undo, too.

## Find in folder

Searches every file in the folder open in the folder tree. Open it with **Ctrl+Shift+F**, Search › Find in folder…, or the **🔍** button in the folder tree header (the folder tree is shown too if it was hidden). If text within one line was selected in the editor, it becomes the search text.

![Find in folder](images/find-in-files.png)
*Figure: The search area in the lower half of the folder tree, with results per file*

The search area opens in the **lower half** of the folder panel. Drag the divider between the folder tree and the search area to change the proportion, and close it with the **×** in the search area header (or by pressing 🔍 again).

1. Choose the scope with the **Open documents / Folder** buttons at the top. If no folder is open, the Folder button is disabled.
2. Type into the **Search text (Enter)** field. The **Aa · ab · .*** next to it mean the same as in the find bar.
3. When the scope is Folder, the two fields below take file name patterns separated by commas.
   - **include**: e.g. `*.js, src/**` — only files matching these patterns are searched.
   - **exclude**: e.g. `*.min.js, test/**` — files and folders matching these patterns are skipped.
4. Start with the **Find** button or Enter. A folder search runs in the background with a progress window, and **Cancel** stops it.

Results appear like this:

- A summary next to the button: "n matches in m files". If there are too many results, "(too many — only the first ones shown)" is added (at most 2,000).
- Results are **grouped by file**, showing the file name, the path relative to the folder, and the number of matches; clicking a file name row folds and unfolds that group.
- Below it, each match is listed with its **line number** and the line's text (with the match highlighted). Clicking one opens the file and puts the cursor at that position.

Folder search skips the following: the `.git` · `.svn` · `.hg` · `node_modules` · `dist` · `release` · `build` · `out` · `target` · `.next` · `.cache` · `__pycache__` · `.venv` · `venv` · `.idea` · `.vscode` · `bower_components` · `coverage` folders, files over 2 MB, and binary files. Up to 50,000 files are scanned per search.

## Find in open documents

**Ctrl+Alt+F** or Search › Find in open documents… opens the same search area with the scope set to "Open documents". It searches every document open in a tab, **including unsaved changes**. Clicking a result switches to that tab and goes to the position. It works even when no folder is open.

> Tip: Replace works only in the current document. To change several files, use Find in folder to locate the spots, then click each result and replace with Ctrl+H.

## Go to line

Open it with **Ctrl+G**, Search › Go to line…, or the right-click menu. The small window is pre-filled with the current line number, and its hint shows the document's line count ("Line number (1 – n), or line:column").

![Go to line](images/goto-line.png)
*Figure: The Go to line window*

- Entering just a line number such as `120` goes to the start of that line.
- Entering `120:15` or `120,15` goes to column 15 of line 120.
- **Enter** or **Go** moves there and brings the line to the middle of the screen. **Esc** or **Cancel** closes the window.
- A number larger than the document goes to the last line.
