# Settings

The Settings window changes every option for the screen · editing · files · start page · themes · terminal · formatting · checks · printing. **Changes take effect and are saved immediately**, so there is no separate save button.

## Opening the Settings window

- **Ctrl+,**
- **Help › Settings**
- The **gear** button at the right end of the toolbar (at the right of the menu bar when the toolbar is hidden)
- The **Settings** card on the start page
- The ⚙ in the terminal panel header (opens on the Terminal tab), the ⚙ in the Problems panel header (opens on the Checks tab)

In the desktop app, Settings opens in a **separate window** (fixed size). It can be moved outside the main window, and it follows the main window when that is minimized or closed. Values changed in the Settings window apply to the main window immediately (theme · language included), and the theme · language changed in the main window are reflected in the Settings window too. The Settings window is prepared in advance after the editor starts, so it appears without waiting whenever you open it. In the web version it opens as a movable window inside the page.

The top of the window has the tabs **General · Start page · Theme · Terminal · Formatting · Checks · Print**, and the bottom has the **Reset to defaults** and **OK** buttons. OK · Enter · Esc · the × at the top right close the window.

## General

The General tab lays out groups, divided by framed boxes, in two columns. The − / + buttons on either side of a number field also change its value.

![Settings › General](images/settings-general.png)
*Figure: Settings › General*

### Appearance

| Item | Description | Default |
|---|---|---|
| UI language | 한국어 / English | 한국어 |
| Font | The editor font (click for the system font list). Empty means the default monospace font | Empty |
| Font size | 8 – 40 px | 12 px |
| Line height | 1 – 3 times the font size (in steps of 0.05) | 1.55 |
| Show | Show the Folder tree · Toolbar · Status bar | All on |

### Session

| Item | Description | Default |
|---|---|---|
| Restore the previous session on start | Brings back tabs · cursors · unsaved content · folder · window layout on the next launch | On |
| Ask before closing unsaved documents | Ask when closing documents that are not saved | On |
| Reload files changed outside (when unmodified) | Reload files changed by another program without asking | On |
| Auto save | Off / When the window loses focus / n seconds after the last edit (1 – 600 seconds) | Off |

Auto save only saves files that are on disk. A new document needs a name and must be saved by you.

### Files

| Item | Description | Default |
|---|---|---|
| Encoding for new documents | One of 11 encodings | UTF-8 |
| New document language | Auto (by extension) / Plain text / 25 frequently used languages | Auto |
| Line ending for new documents | Windows (CR LF) / Unix (LF) / Macintosh (CR) | Unix (LF) |
| Line ending on save | Keep the file's own / Always Unix (LF) / Always Windows (CR LF) | Keep |
| Trim trailing whitespace on save | | Off |
| Add a final newline on save | Adds an empty line at the end of the file if there is none | Off |

### Folder tree

| Item | Default |
|---|---|
| Show hidden (dot) files | Off |

### Indentation

| Item | Description | Default |
|---|---|---|
| Indent with | Spaces / Tab characters | Spaces |
| Tab size | one tab = n spaces (1 – 16) | 4 |
| Auto indentation | Enter keeps the previous line's indent, closing brackets re-align | On |

### Display

| Item | Default |
|---|---|
| Word wrap | Off |
| Line numbers | On |
| Minimap (the whole document drawn small at the editor's right edge — drag or click to go there) | On |
| Show whitespace | Off |
| Highlight current line | On |
| Code folding | On |

### Editing aids

| Item | Default |
|---|---|
| Complete while typing (the language's keywords, tags, properties, names + the words of the document; Ctrl+Space opens it) | On |
| Auto-close brackets and quotes | On |
| Highlight matching brackets | On |
| English spell check (bundled en_US dictionary; comments and strings only in code) | On |
| Check every word in code files too (off: comments and strings only) | Off |
| Code check — run the language's linter in the background and mark its findings next to the line numbers | On |

## Start page

![Settings › Start page](images/settings-start.png)
*Figure: Settings › Start page*

### On launch

- **Always show the start page on launch** (off by default): when on, the start page appears first on every launch, even when documents from the previous session were restored. When off, the start page is skipped if documents were restored. With no document open, the start page is always shown regardless of this setting. It is the same setting as the check box at the bottom of the start page's left column.

### Background

The same sliders as the Background group on the start page (see [Getting started](01-getting-started.md)).

- 21 scenes (Terminal by default)
- Background transparency (%) 0 – 100, default 80
- Overall speed (%) 0 – 100, default 20
- Camera · Objects · Sky and light (%) 0 – 300, default 100
- **Reset speeds**: returns the four speed values to their defaults

## Theme

The 20 dark themes · 20 light themes · custom themes appear as mini sample cards, and clicking one applies it immediately. At the bottom you create · edit · delete custom themes. See [View and themes](16-view-and-themes.md) for details.

## Terminal

| Item | Description | Default |
|---|---|---|
| Default shell | The shell new terminals use. Only shells installed on this computer are listed; after installing a new shell, reopen this tab to see it | Default (the first shell in the list) |
| Colour the output | The programs' ANSI colours + error (red) · warning (yellow) · success (green) lines and links · file:line highlighted. When off, plain text | On |
| Start directory | Where a new terminal starts. Empty means the folder open in the folder tree, or if there is none, the current document's folder. The desktop app has a **Browse…** button | Empty |
| Prompt | Prompt theme editing (presets · quick options · git state colours · advanced · custom prompts) | Default (My Editor) |

For prompt editing, see [Terminal and log](14-terminal-and-log.md).

## Formatting

- **Format on save** (off by default)
- A formatter for each language: Auto / each tool / Editor indentation only / Off
- The ⬇ install · ↻ reinstall buttons next to each language, and the **Look again** button at the top

See [Format and lint](12-format-and-lint.md) for details.

## Checks

- The **Code check** check box at the top (the same as the item on the General tab)
- A checker for each language: Auto / each tool / Off
- The ⬇ install button for tools that are not installed, and the **Look again** button

See [Format and lint](12-format-and-lint.md) for details.

## Print

Paper (size · orientation · margins), Contents (File name / path · Line numbers · Page border · Page numbers · Print date), Type (size · line height · wrapping long lines), Look (syntax highlighting · colour · stripes · line-number gutter shading), and a two-page preview sample. For each item's description and default, see [Print](15-print.md).

## Reset to defaults

Pressing **Reset to defaults** at the bottom left of the window asks "Reset all settings to their defaults?"; pressing **Reset** then returns everything to its initial state.

- Reset: theme, font · font size · line height, auto save, new document language · encoding · line ending, line ending · whitespace · final newline on save, hidden files, indentation · tab size, display items (word wrap · line numbers · minimap · show whitespace · indent guides · current line · folding), auto-close brackets · matching brackets, session restore · always show the start page · reloading outside changes · asking before closing, Markdown WYSIWYG, spell check, auto indentation, code check, autocomplete, the formatter · checker for each language, format on save, terminal (shell · start directory · colours · prompt), and all print settings.
- Kept: the **UI language**, the **window layout** set from the View menu (showing the folder tree · toolbar · status bar, split panes, the bottom panel, panel sizes and so on), the start page background (scene · transparency · speeds), the lists of custom themes and custom prompts, and words added to the dictionary.

## Where settings are stored

Settings and the session are stored in a single file, `session.json`. For its location, see the table in the [Web version and troubleshooting](19-web-version-and-troubleshooting.md) chapter. Deleting this file starts every setting from its default.
