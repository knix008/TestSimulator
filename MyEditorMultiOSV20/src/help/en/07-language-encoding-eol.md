# Language · encoding · line endings

Every document has three properties. The **language** decides syntax highlighting · comment marks · autocomplete · formatting · code checking, the **encoding** is how characters are turned into the file's bytes, and the **line ending** is the character that separates lines. All three are shown in the status bar and can be changed right there by clicking.

## Automatic language detection

When a file opens, its language is set from the **extension and file name** (.js → JavaScript, .py → Python, Dockerfile → Dockerfile …). If there is no extension or it is unknown, the language is guessed from the beginning of the content, and if that fails too, the file opens as plain text. New documents follow the **New document language** setting; with the default "Auto", the language is guessed from what you type, then determined again from the extension you give when saving.

Syntax highlighting supports more than 150 languages, and each language's grammar is loaded the first time it is used (so a language you open for the first time may be coloured a moment later).

## The Language menu and choosing a language

The **Language** menu lets you choose a document's language yourself. The choice applies only to that document and is remembered in the session.

![Language menu](images/menu-language.png)
*Figure: The Language menu — each language has an icon with its own colour and abbreviation*

- **Auto (by extension)**: clears the language you chose and returns to automatic detection.
- **Plain text**: opens without syntax highlighting.
- 25 frequently used languages: JavaScript, TypeScript, JSX, TSX, HTML, CSS, JSON, Markdown, Python, C, C++, C#, Java, Go, Rust, PHP, Ruby, Shell, PowerShell, SQL, XML, YAML, TOML, Dockerfile, diff.
- **Language…**: opens a searchable list of every language.

Each language in the menu has an icon in that language's own colour with its abbreviation (JS · TS · Py · C++ …), and the current choice is marked with a check. During automatic detection, "Auto" is shown next to the detected language.

In the **Language…** window (or Language… in the status bar's language menu), typing in the field keeps only the languages whose name or extension matches. Choose with ↑ ↓ and Enter, or click an item. Each item shows its typical extension on the right, and the current language has a check mark.

![Choosing a language](images/language-picker.png)
*Figure: The language picker — filtered by name or extension*

Clicking the **language name** in the status bar opens a short menu with Auto · Plain text · 12 frequently used languages · Language….

## Automatic encoding detection

When a file opens, its encoding is determined in this order:

1. A **BOM** at the start of the file (UTF-8 BOM, UTF-16 LE / BE BOM)
2. **UTF-16** without a BOM (recognized by the pattern of zeros between bytes)
3. A check for valid **UTF-8**
4. Otherwise the operating system's legacy code page — **한국어 (EUC-KR / CP949)** on Korean Windows, Western (Windows-1252) elsewhere

The detected encoding is shown in the status bar. 11 encodings are supported:

| Encoding | Notes |
|---|---|
| UTF-8 | Default |
| UTF-8 (BOM) | Saved with a BOM at the start of the file |
| UTF-16 LE / UTF-16 BE | Saved with a BOM |
| 한국어 (EUC-KR / CP949) | |
| 日本語 (Shift_JIS) | |
| 中文 (GB18030) / 中文 (Big5) | |
| Western (Windows-1252) | |
| Latin-1 (ISO-8859-1) | |
| Русский (KOI8-R) | |

## Changing the encoding and reopening

The **Encoding** menu has two parts.

![Encoding menu](images/menu-encoding.png)
*Figure: The Encoding menu — current encoding, reopen, line ending*

- The **Current encoding** list: choosing another encoding here writes the file in that encoding **when saving**. The text on screen does not change, and the document is marked as modified (●). For example, to convert a CP949 file to UTF-8, choose UTF-8 and save.
- **Reopen with encoding…**: use it when a file was read with the wrong encoding and its characters look garbled. It reads the file from disk again in the encoding you pick from the list. If there are unsaved changes, it first asks "… discards your current changes. Continue?" It is disabled for new documents that have never been saved.

![Reopen with another encoding](images/encoding-reopen.png)
*Figure: Choosing the encoding to reopen with*

If, when saving, there are characters the chosen encoding cannot represent (for example Korean text saved as Windows-1252), an **Encoding warning** says they will become "?" and asks whether to save anyway.

Clicking the **encoding name** in the status bar shows the same list and reopen option. The encoding for new documents is set with **Encoding for new documents** under Settings › General › Files.

## Line endings

There are three line endings.

| Menu name | Status bar | Characters | Mainly used on |
|---|---|---|---|
| Windows (CR LF) | CRLF | \r\n | Windows |
| Unix (LF) | LF | \n | Linux · macOS · most development tools |
| Macintosh (CR) | CR | \r | Classic Mac OS |

- When a file opens, its line ending is detected. If several kinds are mixed, the most common one is taken as the file's line ending. Inside the editor they are all treated as the same line break, and on saving the document's line ending is written (mixed line endings are unified into one).
- To change it, use the **Line ending** list at the bottom of the **Encoding** menu, or click **CRLF / LF / CR** in the status bar. The document is then marked as modified, and the change is applied when you save.
- **Line ending for new documents** (default Unix (LF)) and **Line ending on save** are set under Settings › General › Files. With Line ending on save set to "Always Unix (LF)" or "Always Windows (CR LF)", files are saved with that ending regardless of the document's own. With "Keep the file's own" (default), each document's displayed line ending is used.

> Tip: If a Git repository shows a whole file as changed because of line endings, switch back to the original line ending (usually LF) in the status bar and save.
