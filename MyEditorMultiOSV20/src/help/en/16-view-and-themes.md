# View and themes

This chapter explains how to choose what is shown on screen, how text is drawn and which colours to use. How the editor draws text is in the **Editor** menu, and the window layout is in the **View** menu. Every item takes effect and is saved the moment you change it.

## The Editor menu

![Editor menu](images/menu-editor.png)
*Figure: The Editor menu — items that are on show a check mark*

| Item | Shortcut | Description | Default |
|---|---|---|---|
| Auto indentation | | Keep the indentation on Enter ([Editing](05-editing.md)) | On |
| Autocomplete | | Suggestion list while typing ([Editing](05-editing.md)) | On |
| Word wrap | | Show long lines folded at the window width | Off |
| Line numbers | | Line numbers in the left gutter | On |
| Minimap | | A miniature of the document at the editor's right | On |
| Show whitespace | | Spaces as dots, tabs as arrows | Off |
| Highlight current line | | A light background on the cursor's line | On |
| Code folding | | Fold marks next to the line numbers | On |
| Fold all / Unfold all | | Fold and unfold every block in the document | |
| Spell check (English) | F7 | [Spell check](13-spell-check.md) | On |
| Check every word in code files too | | Check spelling outside comments · strings too | Off |
| Code check (lint) | | [Format and lint](12-format-and-lint.md) | On |
| Next problem | F8 | Move to the next check problem | |
| Problems | | Open the Problems panel | |

### Word wrap

When on, lines longer than the window width are shown folded onto the next line. No line break characters are added to the file; only the display changes. The Word wrap button on the toolbar turns it on and off too.

### Show whitespace

When on, spaces show as middle dots and tabs as arrows, and whitespace left at line ends is highlighted separately. The **¶** button on the toolbar turns it on and off too.

### Minimap

A picture at the right edge of the editor of code documents that draws the whole document small (a small coloured block per character, in the theme's syntax colours). The part currently visible on screen is marked with a band.

- **Clicking** scrolls to that position and moves the cursor to that line.
- **Dragging** scrolls the editor along with the mouse (it keeps following even outside the minimap).
- For documents longer than the editor, the minimap itself scrolls along with the editor.
- It does not appear for Markdown · picture · audio · video documents. View › **Structure** turns the minimap on and off in code documents, and the Structure (heading tree) in Markdown documents.

## The View menu

![View menu](images/menu-view.png)
*Figure: The View menu*

| Item | Shortcut | Description |
|---|---|---|
| Start page | | Open / close the start page ([Getting started](01-getting-started.md)) |
| Folder tree | Ctrl+B | Show / hide the folder tree on the left |
| Toolbar | | Show / hide the toolbar |
| Status bar | | Show / hide the status bar |
| Indent guides | | Vertical guide lines at every tab stop of the indentation (on by default) |
| Single editor / Split left / right / Split top / bottom / Split into four | Ctrl+Alt+1 – 4 | [Split panes](11-split-panes.md) |
| Next editor pane | F6 | Move between split panes |
| Preview | Ctrl+Shift+M | Markdown · HTML · SVG preview |
| Run | | Open HTML in the browser |
| Structure | | The heading tree for Markdown, the minimap for code |
| WYSIWYG | Ctrl+Shift+W | The Markdown WYSIWYG column |
| Terminal | Ctrl+\` | The Terminal tab of the bottom panel |
| Log / Problems | | The Log / Problems tab of the bottom panel |
| New terminal | Ctrl+Shift+\` | Open a new shell |
| Zoom in / Zoom out / Reset zoom | Ctrl++ / Ctrl+- / Ctrl+0 | Text size ([Editing](05-editing.md)) |
| Full screen | F11 | Toggle full screen |
| Hexa | | Hex view beside a picture file |

Items that do not apply to the current document (for example WYSIWYG for a code file) are greyed out.

**Indent guides** draw thin vertical lines at every tab size within the indentation, making the depth of blocks easy to see. The toolbar has a dedicated button for them too.

In **Full screen** (F11), the window covers the whole screen. Press F11 again to return.

Showing the toolbar · status bar · folder tree can also be changed in the Appearance group of Settings › General.

## Themes

There are 40 built-in themes (20 dark · 20 light), and each theme changes not just the window colours but also **the editor's syntax highlighting colours**. The default theme is Midnight.

Change it with the **theme button** at the right end of the toolbar (at the right of the menu bar when the toolbar is hidden).

- Each press of the button's **front part** (the palette icon and the current theme name) switches to the **next theme**. Hovering shows the name of the theme that comes next. The **Next theme** card on the start page does the same.
- **▾** shows the list of all themes. **The 20 dark themes form one column, and the 20 light themes another column beside it**; each theme has a sample of its main colours in front, and the current theme has a check mark. Themes you made yourself appear with a ★ at the end of their mode's column.

![Theme list](images/theme-list.png)
*Figure: The theme list — dark and light themes side by side*

| Dark themes | Light themes |
|---|---|
| Midnight · Graphite · Ocean · Forest · High Contrast | Daylight · Sunset · Rose · Lavender · Mint |
| Nord · Dracula · Monokai · Coffee · Cherry | Arctic · Sand · Solarized Light · GitHub Light · Gruvbox Light |
| Cyber · Catppuccin Mocha · Slate · Abyss · Matrix | One Light · Catppuccin Latte · Paper · Sky · Meadow |
| Solarized Dark · Gruvbox Dark · One Dark · Tokyo Night · GitHub Dark | Apricot · Ash · Contrast Light · Cocoa · Lemon |

![Light theme](images/theme-light.png)
*Figure: The editor with a light theme applied*

On the Settings › **Theme** tab, every theme is shown as a mini sample card (in Dark themes · Light themes · Custom themes groups). Clicking a card applies it immediately. The start page's background picture follows the theme colours too.

![Theme settings](images/settings-theme.png)
*Figure: Settings › Theme — theme cards and custom theme editing*

## Custom themes

Make your own theme in the **Custom themes** part at the bottom of the Settings › Theme tab.

1. First choose the theme to base it on.
2. Pressing **+ New theme based on 'theme name'** creates a new theme copied from the current one ("… (custom)") and applies it right away.
3. Change the **Name**, and choose whether it is a **Dark theme / Light theme** (this decides which column of the theme list it goes into).
4. Set the 15 colours below with the colour picker or a `#rrggbb` value. Changes show on screen immediately.
   - Editor background · Panel background · Menu / toolbar background · Hover · Inactive selection
   - Border · Strong border · Text · Muted text
   - Accent · Strong accent · Text on accent
   - Folder icon · File icon · Danger / error
5. Choosing another custom theme from the drop-down applies that theme and makes it the one being edited. **Delete this theme** deletes the current custom theme and returns to Midnight.

Themes you make appear with a ★ in the toolbar's theme list and among the cards in Settings.

## Fonts

Choose the editor font in the **font box** on the toolbar (next to the T icon) or with **Font** under Settings › General › Appearance.

![Choosing a font](images/font-picker.png)
*Figure: The system font list — each name drawn in its own font*

- Clicking the box shows **all fonts installed on the system** as a scrolling list (read on the first click). Each item is drawn in its own font, so you can see what it looks like before choosing.
- Typing filters the list; move with ↑ ↓ and choose with Enter. Esc closes the list. You can also type a name that is not in the list.
- Leaving it empty uses the default monospace font.
- The **− size +** next to it changes the font size (8 – 40px). It is the same value as zooming in / out (Ctrl+= / Ctrl+−, Ctrl+wheel).
- **Line height** (1 – 3 times the font size, default 1.55) is set under Settings › General › Appearance.

The font · size · line height apply to both the source editor and the WYSIWYG column, and the hex view follows the font size too.

## UI language

The screen is available in two languages, **한국어** (Korean) and **English**.

- The **flag button** at the right of the toolbar (or of the menu bar) switches immediately. The flag is that of **the language you would switch to** (the British flag on the Korean screen, the Korean flag on the English screen).
- You can also choose it with **UI language** under Settings › General › Appearance.
- Menus · dialogs · settings · separate windows (Settings, About, Keyboard shortcuts) all change together. The menu titles stay evenly spaced when the language changes.

**Reset to defaults** in the Settings window does not change the UI language.
