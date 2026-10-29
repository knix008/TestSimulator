# The Desktop

When you close the Start Page, the **desktop** appears. At the top are the title bar (ribbon tabs) and the ribbon, in the middle is the work area, and at the bottom is the status bar.

![Parts of the desktop](images/en/desktop.png)

## Title Bar

Instead of the operating system's title bar, the program's top row serves as both title bar and toolbar.

- Drag an empty spot to move the window; double-click to maximize/restore.
- Left: icon, program name (prefixed with ● when there are unsaved changes), **ribbon tabs**.
- Right: running indicator, **Theme** button (click for the next theme, ⌄ for the theme list), **Language** button (flag, Korean ↔ English), **User manual** (book), **Tutorial** (graduation cap), **Settings** (gear), **About**, window buttons (minimize, maximize, close).
- When the window gets narrow, the text of the tabs and the theme name is hidden first, leaving only the icons.

## Ribbon

Choosing a ribbon tab changes the buttons in the row below. Every button has both an icon and a label, and hovering shows a description and the shortcut. When the window is narrow, the labels are hidden and only the icons remain.

![Home ribbon](images/en/ribbon.png)

| Tab | Buttons |
| --- | --- |
| **Home** | Start Page, New Script, New Model, Open, Save, Find Files, Import Data, Clear Workspace, Clear Command Window, Undo / Redo, show/hide Current Folder, Workspace and Command History, Layout, Preferences |
| **Plots** | Plot the variables selected in the Workspace: plot, area, bar, barh, stairs, stem, scatter, histogram, pie, polarplot, semilogy, surf, mesh, contour, imagesc, figure area |
| **Apps** | Import Data, Variable Editor, plot gallery, figure area, Block library, Find Files, Restart Engine |
| **Editor** | New Script, Open, Save, Save As, Run, Run Section, debug (Continue, Step, Step In, Step Out, Stop), Breakpoint, clear all breakpoints, find, comment, uncomment, indent, outdent |
| **Simulation** | New Model, open model, Save, Library, Run, Stop |
| **Help** | User Manual ({{F1}}), Run Tutorial, Tutorial Document, Command Help, Find Functions, Shortcuts, Samples, Preferences, About |

> Note: The buttons on the Plots tab show the command they run in the Command Window before running it, so you can immediately see how to recreate the same figure in code.

## Windows in the Work Area

| Window | Position | Contents |
| --- | --- | --- |
| Current Folder | Left | Files and folders of the working folder |
| Document tabs | Top center | Editor, Variable Editor, figures, model editor |
| Command Window | Bottom center (the whole center when no document is open) | `>>` prompt |
| Workspace | Top right | List of variables |
| Command History | Bottom right | Commands that were run |

- Drag the boundary (splitter) between windows to resize them. With the keyboard, focus a splitter and use the arrow keys.
- Close a window with the ✕ on the right of its header, and reopen it with the show/hide buttons on the ribbon's **Home** tab or the **Layout** menu.
- **Layout › Default layout** restores the initial arrangement, and **Command Window only** closes all the side windows.

## Document Tabs

Opening a file creates a tab at the top center. Drag tabs to reorder them, and close them with a middle-button click or the ✕. Unsaved tabs are marked with ●, and closing one asks whether to save (Save · Don't Save · Cancel). When there are many tabs, scroll the tab row with the `<` `>` buttons at the right end (hold to keep scrolling). Right-clicking a tab shows a menu with Close this tab · Close other tabs · Close tabs to the right · Close all.

## Status Bar

| Item | Contents |
| --- | --- |
| Path | Current folder |
| Engine status | Ready · Running · Paused (debug) · Starting |
| Line · column | Editor cursor position and number of selected characters |
| Encoding · language | UTF-8, M / Text / Model / Variable / Figure |
| Resize grip | Drag the dotted pattern at the far right to resize the window |

## Undo

**Undo** ({{Ctrl+Z}}) / **Redo** ({{Ctrl+Y}}) on the ribbon act on the editor's text when the editor has focus; otherwise they undo app actions such as clearing the workspace, editing variables, and renaming or deleting files. Hover over the button to see what will be undone.

## Theme and Language

There are 40 themes (20 dark · 20 light) plus custom themes. Each click on the theme button in the title bar switches to the next theme; open the list with ⌄ to preview and choose. The language button switches between Korean and English. The user manual window follows the same theme.
