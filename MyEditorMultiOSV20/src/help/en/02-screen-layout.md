# Screen layout

This chapter explains each part of the My Editor window — from the menu bar at the top to the status bar at the bottom — what it is and how to use it.

![The whole editor window](images/main-window.png)
*Figure: The editor window with the folder tree, tabs and code open*

From top to bottom, the parts are:

1. **Menu bar** (doubles as the title bar)
2. **Toolbar**
3. **Folder tree** on the left + **tab bar · editing area** on the right
4. **Bottom panel** (Terminal · Log · Problems, only when open)
5. **Status bar**

## Title bar and menu bar

The My Editor window has no separate operating-system title bar. The top row serves as both the title bar and the menu bar.

- Dragging the **logo and name** (My Editor V1.1) at the far left, or the empty space to the right of the menus, moves the window. **Double-clicking** the empty space toggles between maximized and restored size.
- The **Start** button (house icon) right after the name opens and closes the start page. While the start page is open, the button looks pressed.
- Next come eight menus, evenly spaced, each with an icon: **File · Edit · Search · Editor · View · Language · Encoding · Help**.
- At the far right are the **Minimize · Maximize (Restore) · Close** window buttons (desktop app).

In the desktop app, a menu opens as a native operating-system menu, so long menus can extend beyond the window. In the web version, menus open inside the page; with one menu open, moving the mouse onto another menu title switches to that menu.

| Menu | Contains | Details |
|---|---|---|
| File | New, Open, Open/Close folder, Save, Print, Close, Show in file manager, Recent files, Exit | [Files](03-files.md) |
| Edit | Undo, Cut · Copy · Paste, line editing, case, sorting lines, Format document, inserting | [Editing](05-editing.md) |
| Search | Find, Replace, find in folder / open documents, Go to line | [Find and replace](06-find-and-replace.md) |
| Editor | Toggles for auto indentation · autocomplete · word wrap · line numbers · minimap and more, spell check, code check | [View and themes](16-view-and-themes.md) |
| View | Start page, showing screen elements, split panes, preview · structure, bottom panel, zoom, full screen | [View and themes](16-view-and-themes.md) |
| Language | Choosing the syntax highlighting language | [Language · encoding · line endings](07-language-encoding-eol.md) |
| Encoding | Encoding for saving, reopening with another encoding, line endings | [Language · encoding · line endings](07-language-encoding-eol.md) |
| Help | Help (F1), Tutorial, Keyboard shortcuts, Settings, About | Below in this chapter |

![Help menu](images/menu-help.png)
*Figure: The Help menu*

The **Help** menu has these items:

- **Help** (F1): opens this Help window.
- **Tutorial**: starts the tour that points out features on the screen ([Getting started](01-getting-started.md)).
- **Keyboard shortcuts**: opens the shortcut list window ([Keyboard shortcuts](18-shortcuts.md)).
- **Settings** (Ctrl+,): opens the Settings window ([Settings](17-settings.md)).
- **About**: shows the program name, version, author, where it is running (desktop · web browser and operating system), the build time and more.

![About window](images/about.png)
*Figure: The About window*

In the desktop app, Settings · About · Keyboard shortcuts · Help open as **separate windows**. They can be moved outside the main window, stay on top of it, and are minimized or closed along with it. In the web version they open as windows inside the page that you can move by dragging the title. Windows that need an answer, such as the one asking whether to save, dim what is behind them and wait for your answer.

## Toolbar

The row of icons below the menu bar. Hovering shows the name and shortcut in a tooltip. View › Toolbar hides it; when hidden, the theme · language · settings · about buttons at its right end move to the right of the menu bar.

![Toolbar](images/toolbar.png)
*Figure: The toolbar*

From the left, the buttons are (separators divide them into groups):

| Group | Button | What it does |
|---|---|---|
| File | New document | Empty document in a new tab (Ctrl+N) |
| | Open file | File picker dialog (Ctrl+O) |
| | Open folder | Choose a folder to show in the folder tree (Ctrl+Shift+O) |
| | Save | Save the current document (Ctrl+S) — enabled only when there are changes |
| | Save all | Save all changed documents (Ctrl+Shift+S) — enabled only when some document has changed |
| | Close tab | Close the current tab (Ctrl+W) |
| | Print | Print preview (Ctrl+P) |
| Undo | Undo / Redo | Ctrl+Z / Ctrl+Y |
| Clipboard | Cut / Copy / Paste | Ctrl+X / Ctrl+C / Ctrl+V |
| Find | Find / Replace | Ctrl+F / Ctrl+H |
| Format | Format document | Tidy the whole document with the language's formatter (Shift+Alt+F) |
| | Formatter name ▾ | The name of the formatter used for this document. Click it for a list to choose this language's formatter |
| View | ¶ Show whitespace | Shows spaces and tabs as dots and arrows |
| | Zoom in / zoom level / Zoom out | Make text larger or smaller. Clicking the zoom level in the middle (e.g. 100%) resets to the default size (Ctrl+0) |
| | Split the editor | One more editor pane per press (up to 9) |
| | Folder tree | Show / hide the folder tree on the left (Ctrl+B) |
| Preview | Preview | Turn the preview of a Markdown · HTML · SVG document on or off (Ctrl+Shift+M). A picture icon for SVG |
| | Run | Save an HTML document, then open it in an external browser |
| Guides | Indent guides | Vertical guide lines at every tab stop of the indentation |
| Editing aids | Word wrap | Fold long lines at the window width |
| | Auto indentation | Keep the indentation on Enter |
| | Spell check | English spell check (F7) |
| | Autocomplete | Suggestion list while typing |
| | Terminal | The Terminal tab of the bottom panel (Ctrl+\`) |
| | Log | The Log tab of the bottom panel |
| | Problems | The Problems (code check results) tab of the bottom panel |
| Font | Font box | Choose the editor font (list of system fonts) |
| | − size + | Font size (px, 8 – 40) |
| Far right | Theme ▾ | The front part switches to the next theme; ▾ lists all themes |
| | Flag | Switch the screen between Korean ↔ English (shows the flag of the language you would switch to) |
| | Settings (gear) | Settings window (Ctrl+,) |
| | About (i) | About window |

Toggle buttons (Show whitespace, Folder tree, Preview, Indent guides, Word wrap, Auto indentation, Spell check, Autocomplete, Terminal · Log · Problems) are shown in the accent colour while on. Buttons that do not fit the kind of document (for example Preview · Run on a code file) are greyed out and disabled.

The window cannot be made narrower than the width needed to show the whole menu bar and toolbar.

## Tab bar

Open documents line up as tabs right above the editing area.

![Tab bar](images/tabbar.png)
*Figure: The tab bar — + and the scroll buttons at the right end*

- A tab shows the file type icon and name; hovering shows the full path.
- An unsaved document shows a **●** dot instead of × (clicking the dot also closes it). Read-only files get an eye mark.
- The **+** at the right end creates a new document; **<** **>**, which appear only when the tabs are wider than the window, scroll the tab bar.

The [Tabs](04-tabs.md) chapter explains how to work with tabs in detail. For Markdown · SVG · picture documents, one more toolbar row specific to that kind (the Markdown toolbar and so on) appears below the tab bar.

## Folder tree

The **Folder tree** panel is on the left of the window (show / hide with Ctrl+B or the toolbar button; Ctrl+Shift+B in a Markdown document). When a folder is open, its files are shown as a tree with connecting lines, and the 🔍 button in its header opens a **Find in folder** area in the lower half of the panel. Drag the border between the folder tree and the editing area to change its width. See [Folder tree](08-folder-tree.md) for details.

## Editing area

Below the tab bar is where you actually write (the editing engine is CodeMirror 6).

- The left margin (gutter) holds **line numbers**, **▾ marks** that fold and unfold code, and **coloured dots** reporting code check results (red error · yellow warning · blue info).
- In code documents, a **minimap** at the right edge shows the whole document small. Dragging or clicking it moves there.
- The line with the cursor is lightly highlighted, and matching brackets are highlighted too.
- For Markdown · HTML · SVG documents, turning on the preview and similar views adds columns beside the editor within the same window.
- A picture file shows the picture instead of the editor, a binary file shows the hex view, and audio · video show a player in this place ([HTML · SVG · images · binary](10-html-svg-images-binary.md)).
- Right-clicking opens a menu with Undo, Cut · Copy · Paste, Toggle comment, case conversion, Format document, Find · Replace · Go to line. Over a misspelled word, suggested words appear at the top too.

You can also split the editing area into several panes ([Split panes](11-split-panes.md)).

## Bottom panel

The three tabs **Terminal · Log · Problems** share one panel, which when open spans **from the left edge of the window to the right edge**, including below the folder tree. Open it with the Terminal · Log · Problems buttons on the toolbar or from the View menu. Pressing the button of the tab already in front again closes the panel. Drag the panel's top border to change its height. See [Terminal and log](14-terminal-and-log.md) for details, and [Format and lint](12-format-and-lint.md) for Problems.

## Status bar

The bottom row of the window. On the left, a message reports what just happened (Saved, Opened …, normally "Ready"), and it flashes briefly when a new message arrives. The same messages are collected on the **Log** tab of the bottom panel. View › Status bar hides it.

![Status bar](images/statusbar.png)
*Figure: The status bar — most items on the right are clickable buttons*

The items on the right, from the left, are:

| Item | Example | Clicking it |
|---|---|---|
| Cursor position | Ln 4, Col 33 | — (with multiple cursors, the count follows, like ×3) |
| Selection | 12 selected, 40 chars (3 lines) selected | — (shown only when something is selected) |
| Document size | 567 chars · 21 lines | — |
| Code check | ✕ 2 ⚠ 1 / ✓ / — | Opens the Problems panel. Hovering shows the name of the checker used |
| Indentation | Spaces: 4 / Tab: 4 | Turn auto indentation on/off, choose spaces 2 · 3 · 4 · 8 or tab 2 · 4 · 8 |
| Line ending | CRLF / LF / CR | Change the line ending |
| Encoding | UTF-8 | Choose the encoding for saving, Reopen with encoding… |
| Language | JavaScript | Auto, Plain text, 12 frequently used languages, Language… (full list) |
| Zoom | 100% | Reset to the default size |
| ⋱ resize grip | | Drag to resize the window (desktop) |

The code check item appears only when code checking is on and a document is open. It turns red when there are errors, yellow when there are only warnings, and is dimmed while checking.

## Resizing the window

- Dragging the **⋱ grip** at the right end of the status bar resizes the window (desktop app). Dragging the window edges works too.
- Double-clicking the empty part of the menu bar or pressing the maximize button toggles between maximized and restored size.
- **F11** (View › Full screen) switches to full screen.
- The window position and size are restored on the next launch.
- The folder tree width, bottom panel height, preview width and the sizes of split editor panes are also changed by dragging their borders, and all are remembered.
