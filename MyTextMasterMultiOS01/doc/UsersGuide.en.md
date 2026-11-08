# MyTextMaster User's Guide

MyTextMaster is an editor for **Markdown**, **HTML** and **plain text** documents. It has the editing features of Notepad++ and TextMate (tabs, syntax highlighting, find and replace, find in files, bookmarks, macros, multiple cursors, snippets, encoding conversion) plus a Markdown preview and **WYSIWYG** editing, viewers for pictures, video, audio and PDF, a **hex editor**, and English and Korean **spell checking**. It runs as a desktop program (Tauri) on Windows, macOS and Linux and in a web browser, with the same screen everywhere.

## 1. Install and run

| Platform | Installer | Built with |
| --- | --- | --- |
| Windows | `MyTextMaster-Setup-<version>.exe` | `npm run build:win` |
| macOS | `MyTextMaster-<version>-<arch>.dmg` | `npm run build:mac` |
| Linux | `.deb` / `.rpm` / `.AppImage` | `npm run build:linux` |
| Web | `MyTextMaster-Web-<version>.zip` | `npm run build:webapp` |

- `npm run build:all` builds this operating system's installers plus the web app. The files are copied to `release/` and to the project root.
- While developing, `npm start` opens the desktop window and `npm run dev` the browser version (<http://localhost:1472>).
- Unzip the web app onto any (static) web server. Features that work on the disk directly, such as the explorer and find in files, are in the desktop version only.
- Several copies of the program may run at once. The Windows installer registers MyTextMaster for opening `.md` files.

## 2. The window

The window has no system title bar: the top row is the title bar.

| Part | What it does |
| --- | --- |
| **Menu bar** | The program icon, name, version and current document, Home, the File · Edit · Format · Insert · Tools · Macro · View · Help menus, and minimize · maximize · close at the right end. Drag an empty spot to move the window; double-click to maximize. `Alt` alone opens the File menu. |
| **Toolbar** | Buttons for frequent commands; hovering shows the name and shortcut at once. The window has a minimum width so no button is ever cut off. |
| **Left panel** | Explorer · Outline · Open documents |
| **Document tabs** | One tab per open document; `●` marks unsaved ones. |
| **Editing area** | Editor and preview side by side, or WYSIWYG, or a viewer (pictures, video, PDF, hex, the user's guide) |
| **Right panel** | Information (line counter, statistics, file details, hashes) · Bookmarks · Find in files |
| **Bottom panel** | Problems (document checks and spelling) · Log |
| **Status bar** | Document kind and syntax, line counter (line/lines, column), words and characters, problems, save state, spelling dictionaries, indentation, line endings, encoding |
| **Resize marker** | The dots at the bottom right: drag to resize the window. |

### Collapsing and expanding the panels

- The **Left panel** · **Bottom panel** · **Right panel** buttons on the toolbar turn them on and off (`Ctrl+Shift+B` · `Ctrl+Shift+J` · `Ctrl+Alt+B`).
- Each panel has a title bar with its icon, name, tab buttons and a **collapse** button (`‹` `›` `⌄`). A collapsed left or right panel becomes a narrow bar of icons; clicking one opens the panel at that tab.
- Drag the panel edges to resize them. Sizes and open states are remembered.

## 3. The start page

The start page appears when the program starts (Settings can turn that off). **Home** in the menu bar brings it back; press it again to return to your document.

- **Quick actions**: open, new Markdown / HTML / text, new from clipboard, open folder (explorer), user's guide, theme settings, language, settings, about, exit.
- **Recent**: recent files and folders. A folder opens in the explorer; `×` only removes the entry.
- **New**: 10 templates (blank Markdown / HTML / text, README, meeting notes, blog post, to-do list, changelog, web page, letter).
- **Sample documents**: 10 Markdown, 10 HTML and 10 text / code samples (Python, SQL, YAML, INI, CSS, TSV, JSON, logs…). Save an edited sample to keep your own copy.
- **Theme**: 20 light and 20 dark themes.
- **Moving background**: 20 backgrounds, shuffle, pause, speed, card opacity and an automatic change interval.

Drag a card by its `≡` handle; resize it from the bottom-right corner. Double-click the corner to fit the content; **Auto arrange** puts every card back.

## 4. The explorer (left panel)

- At the top are the **system drives** (Windows `C:` `D:` …; macOS and Linux `/` and mounted volumes) and **Home · Desktop · Documents · Downloads**, each with its icon. Click one to make it the explorer's root folder.
- Below is the **tree** of the chosen folder: click a folder to expand it and see its folders and files (with sizes); click a file to open it.
- Tool row: parent folder, choose a folder (`Ctrl+Shift+F2`), the current document's folder, refresh, show hidden files, collapse all.
- Right-click a file: open, open in the hex editor, open with the default program, copy path, find in this folder.
- A tab's right-click menu › **Show in the explorer** expands the folder that holds the document.
- The **Outline** tab of the same panel lists the headings (table of contents), the **Open documents** tab the open documents.

## 5. Documents

### New and open

- **New document** (`Ctrl+N`): the "New document kind" setting (Markdown by default). The `+` beside the tabs and a double-click on the empty tab bar do the same.
- **New from template**, **New from clipboard** (the clipboard text; its kind is guessed).
- **Open…** (`Ctrl+O`): one or more files. **Dropping** files from the file manager onto the window opens them too.
- The kind comes from the extension: Markdown (`.md`…), HTML (`.html`…), text (`.txt` and code / configuration files), **pictures**, **video**, **audio** and **PDF** (viewers), binary files (hex editor). Files that are not text open in the hex editor by themselves.

### Save

- **Save** (`Ctrl+S`), **Save as…** (`Ctrl+Shift+S`), **Save all** (`Ctrl+Alt+S`).
- A document keeps its **encoding** (UTF-8, UTF-8 BOM, UTF-16 LE/BE, EUC-KR) and **line endings** (LF, CRLF); change them on the status bar.
- Saving writes a temporary file first and then replaces the old one, so your file is never damaged.
- When another program changes a file, you are told as you return to the window. There is **auto save** (Settings › Files) and **reopen the last documents** (unsaved text included).

### Tabs

- `×`, a middle click, or **Close tab** (`Ctrl+W`). Unsaved documents ask **Save / Don't save / Cancel**.
- Right-click menu: close others, close tabs to the right, close all, save, rename, open in the hex editor, copy path or file name, open containing folder, show in the explorer.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` move between tabs.

## 6. Editing

| Feature | How |
| --- | --- |
| Find / replace | `Ctrl+F` / `Ctrl+H`: match case, by word, regexp, replace all |
| Find in files | `Ctrl+Shift+F`: right panel. Choose the folder, extensions, case and whole word; click a result to go to the line (desktop) |
| Go to line | `Ctrl+G` or the line counter on the status bar |
| Multiple cursors | `Alt+click`, select the next match `Ctrl+D`, box selection `Alt+drag` |
| Move / duplicate lines | `Alt+↑/↓`, `Shift+Alt+↓` |
| Indent · comment | `Tab` / `Shift+Tab`, `Ctrl+]` / `Ctrl+[`, `Ctrl+/` |
| Folding | `⌄` beside the line numbers, **Fold all** `Alt+0`, **Unfold all** `Alt+Shift+0` |
| Bookmarks | `Ctrl+F2` toggles (or click left of the line numbers), `F2` next, `Shift+F2` previous; the right panel's **Bookmarks** tab lists them |
| Completion · snippets | Words of the document complete as you type. Markdown has `h1` `link` `img` `table` `code` `task` `details` `front` …, HTML `html5` `a` `img` `div` `ul` `table` `form` …: pick one from the list to insert a template with fields; `Tab` moves to the next field |
| Read-only | **Edit › Read-only** |

The right-click menu has spelling suggestions, undo, cut / copy / paste, find, bookmark, bold, link, case and encoding tools.

### Macros (as in Notepad++)

1. **Macro › Start recording** (`Ctrl+Shift+R`). A red **REC** blinks in the menu bar.
2. Type and press keys (Enter, arrows, delete, `Ctrl+…` commands).
3. **Stop recording** (`Ctrl+Shift+T`).
4. **Play back** (`Ctrl+Shift+P`) runs it once; **Run a macro multiple times…** repeats it.

## 7. Format and insert

Format commands put **Markdown marks into Markdown documents and HTML tags into HTML documents**; applying one again removes it. In WYSIWYG they apply to the text as shown.

| Command | Key | Markdown | HTML |
| --- | --- | --- | --- |
| Bold / italic / strikethrough | `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+X` | `**` / `*` / `~~` | `<strong>` / `<em>` / `<del>` |
| Inline code | ``Ctrl+` `` | `` ` `` | `<code>` |
| Heading 1–4, body text | `Ctrl+1`…`Ctrl+4`, `Ctrl+0` | `#`…`####` | `<h1>`…`<h4>`, `<p>` |
| Bulleted / numbered / task list | `Ctrl+Shift+8` / `7` / `9` | `-` / `1.` / `- [ ]` | `<ul>` / `<ol>` |
| Quote | `Ctrl+Shift+Q` | `>` | `<blockquote>` |
| Link / picture / code block | `Ctrl+K` / `Ctrl+Shift+I` / `Ctrl+Shift+C` | `[text](url)` / `![alt](path)` / ```` ``` ```` | `<a>` / `<img>` / `<pre><code>` |

The **Insert** menu also has tables (columns and rows), rules, footnotes and the date and time (`F5`).

## 8. Pictures like characters

- After every `![alt](path)` or `<img>` in a Markdown or HTML document the **picture itself appears small in the line** (View › Show pictures in the editor). Deleting the text deletes the picture.
- **Drop picture files** from the file manager onto the document to insert them where they fall; **pasting** a screenshot (`Ctrl+V`) works too.
  - Saved documents: the picture is copied into an `images/` folder next to the document and `![name](images/name.png)` is inserted (names that exist get `-2`, `-3`).
  - Unsaved documents and the web version: the picture is embedded in the document (a data URL).
- In WYSIWYG, pictures are selected, deleted, dropped and pasted like one character.

## 9. Preview and WYSIWYG

- **View › Editor only / Side by side / Preview only / WYSIWYG**, or `Ctrl+\` to cycle (WYSIWYG is for Markdown). Drag the divider to share the width.
- **Sync scrolling**: side by side, scrolling one side shows the same place on the other. The paragraph with the cursor gets an orange mark in the preview.
- **WYSIWYG** (`Ctrl+Shift+W`): edit the document as it looks in the preview. The toolbar and shortcuts (bold, headings, lists, links, tables, pictures…) work on the text as shown, and each change becomes Markdown in the source at once. Task boxes can be ticked; links open with `Ctrl+click`. The first edit may tidy the source into standard Markdown (`-` bullets, `#` headings, …) once.
- **Markdown element bar**: in WYSIWYG, every element Markdown can write is a button right under the document tabs. Each button shows its icon and the Markdown it writes (`#`, `**B**`, `- [ ]` …); pressing it applies the element to the selection or at the caret. The formatting at the caret (bold, heading level, list …) shows as pressed buttons; pressing a pressed button removes it.
  - **Headings**: heading 1–6, body paragraph
  - **Text**: bold, italic, bold + italic, strikethrough, inline code, link, picture, line break (inside a paragraph), clear formatting
  - **Blocks**: bulleted list, numbered list, task list, quote, code block, table, horizontal rule
  - **HTML** (tags Markdown allows): `<kbd>` keyboard key, `<mark>` highlight, `<u>` underline, `<sup>` superscript, `<sub>` subscript
- **Preview style**: GitHub, Document, Academic, Plain.
- **Safety**: the Markdown preview and WYSIWYG run no scripts and remove dangerous attributes. HTML documents run no scripts by default (Settings › Preview turns them on — the preview is then cut off from the program).

## 10. Viewers and the hex editor

Many kinds of files are shown **in a tab of the main window**, not in pop-up windows.

| File | View |
| --- | --- |
| Pictures (png, jpg, gif, webp, bmp, ico, avif) | Fit (`0`) / actual size (`1`), zoom (`+` `−`, `Ctrl+wheel`, 5 %–3200 %), drag to pan, double-click fit ⇄ actual, rotate (`R` / `Shift+R`), copy the picture, save as PNG · JPEG · WebP · BMP, print |
| Video (mp4, webm, mkv, mov …) · audio (mp3, wav, flac, ogg …) | A player (play, seek, volume, full screen); `←` `→` 5 seconds, `M` mute; resolution, length and size shown |
| PDF | The built-in PDF viewer |
| Binary files | The **hex editor** |

### The hex editor

- Offset · 16 bytes (8 + 8) · ASCII. Files of tens of MB scroll smoothly.
- Click a byte or character and type hex digits (hex column) or text (ASCII column). `Tab` switches columns.
- `Insert` switches overwrite (OVR) and insert (INS); `Delete` / `Backspace` remove bytes; `Shift`+arrows or dragging selects; `Ctrl+Z` / `Ctrl+Y` undo and redo.
- `Ctrl+G` goes to an offset (`0x1F` or `31`), `Ctrl+F` finds bytes (`DE AD BE EF`) or text, `Ctrl+C` copies the selection as hex.
- The status bar shows the value at the cursor (decimal, hex, binary, 16/32-bit integers and float, LE/BE).
- Any text document can be shown as bytes with **File › Open in the hex editor**.

## 11. Spell checking and the user dictionary

- **English** (Hunspell en_US) and **Korean** (Hunspell ko) dictionaries. Misspelled words get a red wavy underline and are listed under **Problems**. Code, addresses, tags and `CamelCase` names are not checked.
- `F7` or the **ABC** toolbar button turns it on and off; **Tools › Spelling dictionaries** chooses English + Korean, English or Korean.
- **Right-click** a marked word for suggestions and **Add to dictionary**.
- **Tools › User dictionary…** adds, finds and removes words, imports and exports them as a text file (one word per line), and clears the dictionary.

## 12. Tools

- **Case**, **Lines** (sort ascending / descending / by length, reverse, remove duplicates, trim leading / trailing / both, remove empty lines, join `Ctrl+J`, number the lines), **Tabs and spaces**.
- **Encode / decode**: Base64, URL, HTML characters, **hashes** (SHA-1/256/512).
- **Format HTML** (`Shift+Alt+F`), **Document statistics**.
- **Syntax highlighting (language)**: choose from more than 100 languages (automatic uses the extension); also from the document kind on the status bar.
- **Document kind**, **Encoding**, **Line endings**.

## 13. Information, Problems and Log

- **Information** (right): the **line counter** (current line, lines, column, selected lines), location, kind, syntax, encoding, words, characters, paragraphs, reading time, bookmarks, the file's size, created / modified / accessed dates and attributes, **hashes** (MD5, SHA-1, SHA-256; unsaved documents get SHA), copy all.
- **Problems** (bottom): Markdown (skipped heading levels, empty headings, links to missing `#headings`, pictures without alt text, open code blocks…), HTML (unclosed tags, stray closing tags, duplicate ids, `<title>` and `<!doctype>`…), JSON syntax errors, trailing spaces, mixed indentation and spelling. Click a row to go there.
- **Log** (bottom): what happened — opened, saved, auto saved, searched, errors — with **Clear the log**.

## 14. Export and print

- **Export as HTML…** (`Ctrl+Shift+E`), **Copy as HTML**, **Open with the default program** (HTML, PDF, pictures and video in the system's programs).
- **Print…** (`Ctrl+P`): Markdown and HTML as in the preview, text in a fixed-width font, a picture on its own. Choose "Save as PDF" for a PDF.

## 15. View and settings

- **Word wrap** (`Alt+Z`), **Line numbers**, **Highlight current line**, **Show whitespace**, text size (`Ctrl+=` / `Ctrl+-` / `Ctrl+Alt+0`), **Focus mode** (`F11`), **Always on top**.
- **Themes**: the palette button picks a random theme, `▾` opens the theme menu with the system setting, **20 light themes**, **20 dark themes**, **Custom** and **Theme settings**.
- **Language**: the flag button. Open documents stay.
- **Settings…** (`Ctrl+,`): General (language, new document kind, panels, always on top, hidden files), Appearance (40 theme tiles, the **custom theme**'s 12 colours, interface font), Editor, Spelling, Preview, Files, Start page. **Changes apply at once**; **Reset to defaults** puts every setting back (recent files and open documents stay).

## 16. Reading this guide

**Help › User's guide** (`F1`) opens this guide in **a window of its own** (a new browser window in the web version), so it can stay open beside your work; pressing it again brings that window to the front. The contents are on the left; the bar above sets the **text size** (− / + / 100%) and the **language** (한국어 / English). Size and language are remembered, and the guide window follows the program's theme.

## 17. Keyboard shortcuts

Help › **Keyboard shortcuts** lists them all. The most used:

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New / open / save | `Ctrl+F` / `Ctrl+H` | Find / replace |
| `Ctrl+W` | Close tab | `Ctrl+Shift+F` | Find in files |
| `Ctrl+P` | Print | `Ctrl+G` | Go to line |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Bold / italic / link | `Ctrl+\` | Switch view |
| `Ctrl+F2` / `F2` | Bookmark / next bookmark | `Ctrl+Shift+W` | WYSIWYG |
| `Ctrl+Shift+R` / `T` / `P` | Record / stop / play a macro | `F7` | Spell check |
| `Ctrl+Shift+B` / `J`, `Ctrl+Alt+B` | Left / bottom / right panel | `F1` | User's guide |

On macOS use `⌘` for `Ctrl`.

## 18. Troubleshooting

| Problem | What to do |
| --- | --- |
| Korean text looks garbled | The file may be neither UTF-8 nor EUC-KR. Save it as UTF-8 in another editor and open it again. |
| "Characters EUC-KR cannot store" | Change the encoding to UTF-8 on the status bar and save. |
| Pictures do not show | Save the document first: relative paths are found from the saved document's folder. |
| Spelling marks appear late | The Korean dictionary (about 14 MB) takes a few seconds to load the first time. |
| A video does not play | The operating system may lack its codec (some mkv and avi files). |
| A big file does not open | Files over 64 MB are not opened. |

## 19. About

- Author: SHKWON (<knix008@naver.com>)
- Libraries: CodeMirror 6, marked, DOMPurify, Turndown, nspell (Hunspell dictionaries en_US and ko), Tauri 2, Vite
- Version and build: Help › **About MyTextMaster**
