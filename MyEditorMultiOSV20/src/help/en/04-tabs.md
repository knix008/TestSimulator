# Tabs

Each open document sits as a tab in the **tab bar** above the editing area. This chapter explains how to choose, move and close tabs, and the tab's right-click menu.

![Tab bar](images/tabbar.png)
*Figure: The tab bar*

## What a tab shows

- **Icon**: shows the kind of file — code, plain text, picture, audio, video, binary (hex) files and never-saved new documents each have their own icon.
- **Name**: the file name. New documents show as "new 1" and so on. Long names are shortened with an ellipsis.
- **Tooltip**: hovering shows the full path along with "(modified)" and "(read-only)" marks.
- **●** (in place of the close button): the document has unsaved changes. After saving it turns back into ×.
- **Eye mark**: a read-only file. You can only view its contents, not change them.
- The **active tab** you are editing is shown in the accent colour.

## Choosing and moving between tabs

| Method | Action |
|---|---|
| Click a tab | Switch to that document |
| Ctrl+Tab / Ctrl+PgDn | Next tab (from the last, back to the first) |
| Ctrl+Shift+Tab / Ctrl+PgUp | Previous tab |
| Ctrl+1 … Ctrl+9 | 1st … 9th tab |
| Mouse wheel over the tab bar | Scroll the tab bar left and right |

While editing a Markdown document, Ctrl+1 – Ctrl+6 are used for heading (H1 – H6) formatting, so they do not switch tabs (see [Markdown](09-markdown.md)). With split panes, clicking a tab shows that document in the active pane; if the document is already shown in another pane, that pane becomes active ([Split panes](11-split-panes.md)).

## When there are many tabs

When the tabs are wider than the window, **<** **>** buttons appear at the right end of the tab bar, next to the **+** button. Pressing them scrolls the tab bar smoothly, and a button is dimmed when there is nowhere further to go. There is no scroll bar; the mouse wheel scrolls too. The active tab always scrolls into view by itself.

## Reordering

Drag a tab and drop it on another tab to move it there. The drop position is shown while you drag. The new order is saved in the session and kept on the next launch.

## New tabs and closing

- The **+** (New tab) at the right of the tab bar creates an empty new document (same as Ctrl+N).
- Pressing a tab's **×**, or the **middle mouse button** on a tab, closes that tab.
- **Ctrl+W** closes the current tab, and **Ctrl+Shift+W** closes all tabs.
- An unsaved document asks Save / Don't save / Cancel before closing. When closing several tabs at once, choosing Cancel stops there and the remaining tabs stay open.

## The tab right-click menu

Right-clicking a tab makes it the active tab and opens the following menu. Its commands apply to the tab you right-clicked.

![Tab right-click menu](images/tab-context.png)
*Figure: The tab's right-click menu*

| Item | Description |
|---|---|
| Save | Save this document |
| Save as… | Save under a new location · name |
| Reload from disk | Read the document again from disk (disabled for new documents) |
| Format document | Tidy with the language's formatter (Shift+Alt+F) |
| Close | Close this tab |
| Close other tabs | Close all but this tab (disabled when there is only one tab) |
| Close tabs to the right | Close the tabs to the right of this one (disabled on the rightmost tab) |
| Close all | Close all tabs |
| Hexa | Picture files only: show / hide the bytes as hex beside the picture |
| Show in file manager | Open the folder containing the file with the file selected (desktop) |
| Open with default app | Open with the operating system's default program (desktop) |
| Copy path | Full path to the clipboard |
| Copy file name | Just the file name to the clipboard |

After copying, the status bar shows "Copied to the clipboard." Show in file manager and Open with default app are not available in the web version.

> Tip: To clean up and keep only a few documents you are working on, drag the tabs to keep to the left, then use **Close tabs to the right** on the last of them.
