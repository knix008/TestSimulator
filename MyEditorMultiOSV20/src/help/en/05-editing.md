# Editing

This chapter covers every command that changes text. Most are in the **Edit** menu, and some are also in the editing area's right-click menu and on the toolbar. Items that turn editing behaviour on and off (Auto indentation, Autocomplete and so on) are gathered in the **Editor** menu.

![Edit menu](images/menu-edit.png)
*Figure: The Edit menu*

## Basic editing

| Command | Shortcut | Description |
|---|---|---|
| Undo | Ctrl+Z | Reverts the last edit. Each document keeps its own history |
| Redo | Ctrl+Y | Redoes an undone edit |
| Cut | Ctrl+X | Moves the selection to the clipboard |
| Copy | Ctrl+C | Copies the selection. With multiple selections, they are joined with line breaks |
| Paste | Ctrl+V | Inserts the clipboard text at the cursor |
| Delete | Del | Deletes the selection |
| Select all | Ctrl+A | Selects the whole document |

The toolbar's Undo · Redo · Cut · Copy · Paste buttons and the editing area's right-click menu do the same.

## Line editing

| Command | Shortcut | Description |
|---|---|---|
| Duplicate line | Ctrl+D | Copies the cursor's line (or the selected lines) right below |
| Delete line | Ctrl+L | Deletes the whole line with the cursor |
| Move line up | Alt+↑ | Moves the line (or the selected lines) up one line |
| Move line down | Alt+↓ | Moves it down one line |
| Toggle comment | Ctrl+/ | Adds or removes the language's comment marks (// , # , <!-- --> …) |
| Indent | Tab | Indents the selected lines one level |
| Outdent | Shift+Tab | Outdents them one level |

Pressing Tab without a selection inserts one level of indentation (spaces or a tab character) at the cursor. For the size and character of one level, see the "Auto indentation" section below.

## Case and tidying lines

The following Edit menu commands apply **only to the selection if there is one (line commands apply to every line the selection touches), or to the whole document if nothing is selected**.

| Command | Shortcut | Description |
|---|---|---|
| UPPERCASE | Ctrl+Shift+U | All letters to upper case |
| lowercase | Ctrl+U | All letters to lower case |
| Sort lines ascending | | Sorts lines alphabetically (Korean ㄱㄴㄷ · ABC order). Numbers sort by value (2 before 10), and case is ignored |
| Sort lines descending | | The reverse order |
| Trim trailing whitespace | | Removes spaces · tabs at the end of each line |
| Remove empty lines | | Removes lines that are empty or contain only whitespace |
| Remove duplicate lines | | Removes lines identical to an earlier one (the first is kept) |

> Tip: Pressing Ctrl+U with nothing selected turns the whole document lower case. If that was a mistake, undo it with Ctrl+Z.

## Inserting and formatting the document

- **Insert date / time**: inserts the current date and time at the cursor in the operating system's regional format.
- **Insert file path**: inserts the current document's full path (only for saved files).
- **Format document** (Shift+Alt+F): tidies the whole document with the language's formatter. It is disabled when there is nothing to format or the document is already formatted. See [Format and lint](12-format-and-lint.md) for details.

## Multiple cursors and rectangular selection

- **Alt+click**: adds another cursor where you click. You can type the same text in several places at once. The status bar shows the number of cursors after the cursor position, like ×3.
- **Alt+drag**: selects a rectangle (vertical block). The same column range is selected on each line, so you can delete or type column by column.
- **≡ (Select all matches)** in the find bar, or Search › Select all matches, puts a cursor at every match ([Find and replace](06-find-and-replace.md)).
- Esc returns to a single cursor.

## Auto indentation

With auto indentation on (default), pressing Enter for a new line keeps the previous line's indentation, indents one more level after an opening bracket, and re-aligns the line when you type a closing bracket. When off, Enter just breaks the line without indentation.

Where to turn it on and off: the Auto indentation button on the toolbar, **Editor › Auto indentation**, the top of the status bar's indentation menu, and Settings › General › Indentation.

One level of indentation is set by two settings:

- **Indent with**: Spaces (default) or Tab characters. The Tab key inserts spaces or a tab character accordingly.
- **Tab size**: one tab = n spaces (1 – 16, default 4). It is also the number of spaces the Tab key inserts when indenting with spaces.

Clicking `Spaces: 4` (or `Tab: 4`) in the status bar lets you pick spaces 2 · 3 · 4 · 8 or tab 2 · 4 · 8 directly. This setting is shared by all documents.

## Brackets and quotes

- **Auto-close brackets and quotes** (on by default): typing `(`, `[`, `{`, `"` or `'` also inserts the closing partner and places the cursor between them. Typing the closing partner yourself steps over it instead of doubling it.
- **Highlight matching brackets** (on by default): when the cursor is next to a bracket, its partner is highlighted too.

Both are turned on and off under Settings › General › Editing aids.

## Code folding

You can fold away functions, blocks or the content under a heading (when code folding is on, which is the default).

- Clicking the **▾** to the right of the line numbers folds that block and turns it into **▸**. Click again to unfold.
- **Editor › Fold all / Unfold all** folds or unfolds the whole document at once.
- The fold marks themselves are hidden with **Editor › Code folding** or **Code folding** under Settings › General › Display.

## Autocomplete

While you type, a suggestion list appears below the cursor (on by default). Suggestions include the language's keywords · tags · properties · names along with **words already in the document**.

![Autocomplete](images/autocomplete.png)
*Figure: The autocomplete list that appears while typing*

- Choose with ↑ ↓ and insert with **Enter**. **Esc** closes the list.
- When the list is closed, **Ctrl+Space** opens it directly.
- **Dockerfiles** (Dockerfile · Containerfile · *.dockerfile) get suggestions for instructions · image names · flags, and **Kubernetes manifests** (YAML) for keys · kind · apiVersion · values.
- Where to turn it on and off: the Autocomplete button on the toolbar, **Editor › Autocomplete**, and **Complete while typing** under Settings › General › Editing aids.

## Zooming in and out

Zooming changes the size of the editor text. Zoom in / out changes the font size setting 1px at a time (8 – 40px), and 100% is the default size of 12px.

| Method | Action |
|---|---|
| Ctrl+= (Ctrl++) / Ctrl+− | Zoom in / out |
| Ctrl+mouse wheel (over the editing area) | Zoom in / out |
| Ctrl+0 | Default size (100%) |
| Zoom in · Zoom out buttons on the toolbar | Zoom in / out. Clicking the zoom level between them (e.g. 117%) resets to the default size |
| Zoom level in the status bar | Default size |
| − size + on the toolbar | Set the font size directly |

While viewing a picture, Ctrl+wheel zooms the picture instead of the text.
