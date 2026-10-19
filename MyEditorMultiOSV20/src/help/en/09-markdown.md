# Markdown

Opening a `.md` document turns on the Markdown features: the **Markdown toolbar** for adding formatting, the **WYSIWYG** column for editing with the marks rendered, the **Preview** column that shows the resulting page, and the **Structure** column that shows the headings as a tree. All four open side by side inside the editor pane that holds the document.

## Column layout

The editor pane of a Markdown document is divided into up to four columns. From the left:

| Column | Header title | Turning it on and off | Default |
|---|---|---|---|
| Structure | Structure | The Structure button at the right of the Markdown toolbar, View › Structure, the × in the column header | Off |
| Source editor | Edit | Always shown | |
| WYSIWYG | WYSIWYG | The WYSIWYG button at the right of the Markdown toolbar, Ctrl+Shift+W, View › WYSIWYG, the × in the column header | On |
| Preview | Preview | The Preview button on the toolbar, Ctrl+Shift+M, View › Preview, the × in the column header | Off |

- **Dragging a divider** between columns changes only the widths of the two columns on either side of it. Changed widths are remembered.
- Opening or closing any of Edit · WYSIWYG · Preview evens out the three content columns again. The Structure column opens narrower than them.
- With split panes, these columns appear **only inside the pane that holds the document** and never attach to other panes. Their on/off settings are shared by all Markdown documents.
- Markdown documents have no minimap (the Structure column takes that role).

## The Markdown toolbar

While a Markdown document is active, a row of formatting buttons appears below the tab bar. The buttons apply to whichever of the source editor and WYSIWYG has the cursor. Hovering shows the name and shortcut.

| Button | Shortcut | Action |
|---|---|---|
| H1 – H6 | Ctrl+1 – Ctrl+6 | Turns the cursor's line (or the selected lines) into a heading of that level. Pressing the same level again removes the heading |
| **B** | Ctrl+B | Bold — wraps in `**…**` |
| *I* | Ctrl+I | Italic — `*…*` |
| ~~S~~ | Ctrl+Shift+X | Strikethrough — `~~…~~` |
| <> | Ctrl+\` | Inline code — wraps in backticks |
| Quote | Ctrl+Shift+Q | `>` at the start of the line (press again to remove) |
| Bullet list | Ctrl+Shift+8 | `-` at the start of the line |
| Numbered list | Ctrl+Shift+7 | `1.` `2.` … at the start of the line |
| Task list | Ctrl+Shift+9 | `- [ ]` at the start of the line |
| Code block | Ctrl+Shift+C | Wraps the selection in three backticks (a code fence). Without a selection, inserts an empty code block |
| Link | Ctrl+K | Inserts `[text](url)` with the `url` part selected. If text was selected, it becomes the link text |
| Image | Ctrl+Shift+I | Opens the Insert image window (see the section below) |
| Table | | Inserts a table skeleton with 3 header cells and 2 body rows, with the first header selected |
| Horizontal rule | | Inserts a `---` line |

Bold · Italic · Strikethrough · Inline code wrap the selected text, and unwrap it if it is already wrapped. Line-start marks (Quote · lists · Task list) are removed by pressing again, too.

At the **right end** of the toolbar are the **Structure** button and the **WYSIWYG** button. They are highlighted while on.

> Tip: In Markdown documents Ctrl+B is Bold, Ctrl+1 – 6 are headings and Ctrl+\` is inline code, so use **Ctrl+Shift+B** for the folder tree, Ctrl+Tab to switch tabs, and the toolbar button or View menu for the terminal.

## WYSIWYG editing

The WYSIWYG column is a second editor that **edits the same document as it looks when rendered**. Changes made here are reflected in the source right away (with a single undo history), and changes in the source appear here right away too.

![WYSIWYG editing](images/md-wysiwyg.png)
*Figure: The source editor (left) and the WYSIWYG column (right)*

- Headings are shown larger by level, bold · italic · strikethrough in their own style, and the marks are hidden.
- List marks show as **•**, task lists as **real check boxes** (clicking toggles `[ ]` ↔ `[x]`), quotes as a bar on the left, code blocks as boxes, and horizontal rules as lines.
- The marks (`#`, `**`, `-` …) reappear **only on the line with the cursor**, so you can always edit them directly.
- When you move the cursor, the two editors follow each other so they show the same position at the same height.
- The source editor always shows the original marks as they are, in a monospace font, regardless of WYSIWYG.

### Pictures

In WYSIWYG, `![description](path)` and `<img src=… width=…>` are shown as **actual pictures**. The path can be relative to the document's folder, absolute, an http(s) address or a data URL.

- Unlike other marks, a picture always shows as the picture, not the syntax, even when the cursor is on its line. The cursor skips over the picture as if it were one character, and Backspace / Delete remove the whole picture. To edit the syntax, edit it in the source editor.
- **Dragging the handle at the picture's bottom right corner resizes** it. The size is written into the document as `<img src="…" alt="…" width="N">`, which every Markdown renderer understands.

## Inserting images

The Image button on the Markdown toolbar (Ctrl+Shift+I) opens the **Insert image** window.

- **File / URL**: pick a picture file with Browse…, or type a path or http(s) address. Once chosen, it is previewed inside the window.
- **Alt text**: text describing the picture (alt).
- **Insert as**
  - **Link**: refers to it by a path relative to the document's folder (when possible). The document and picture must be moved together.
  - **Embedded**: converts the picture to Base64 and puts it inside the document. The added size is shown. The picture shows anywhere with just the one document.
- **Width**: in px. Empty means the original size. When a width is given, it is inserted as `<img … width="N">`.
- **Insert** puts it at the cursor.

Alternatively, **dragging** PNG · JPEG · GIF · WebP · SVG · BMP · AVIF · ICO · HEIC · HEIF · DCM files onto a Markdown document (inserted where dropped) or **pasting** a picture from the clipboard (Ctrl+V) **embeds it in the document as a Base64 data URL** rather than a file reference. Dragging a file that is not a picture opens that file.

## Preview

The **Preview** button on the toolbar (eye icon, Ctrl+Shift+M) opens the rendered page in a column to the right of the source.

![Markdown preview](images/md-preview.png)
*Figure: The preview column beside the source*

- It updates shortly after you edit. Local pictures relative to the document's folder are shown too.
- The editor and preview **follow each other in both directions**. Moving the cursor in the editor scrolls the preview so the paragraph · heading · list with the cursor is at the same height as the editor's cursor line, and scrolling the editor follows the block shown at the top. Scrolling the preview moves the editor to the line of the content shown at the top of the preview.
- Clicking an http(s) link in the preview opens it in the system browser.
- You can select and copy text in the preview.

**Right-clicking** in the preview opens a menu.

| Item | Description |
|---|---|
| Copy image | (Over a picture) copies the picture to the clipboard so you can paste it into other programs |
| Save image as… | (Over a picture) exports the picture to a file |
| Copy | Copies the selected text |
| Select all | Selects the whole preview |
| Print… | Opens the print preview — Markdown is printed as rendered |

The **Save image** window lets you choose:

- **File format**: PNG · JPEG · WebP · BMP, or the original file.
- The **Quality** for JPEG · WebP.
- If the picture has transparent parts, **Keep the transparent background** (PNG · WebP) or fill it with a **Background** colour. JPEG · BMP do not support transparency and are always filled with the background colour, which you can choose. The checkerboard in the preview shows the transparent parts.
- The **File name** and save location.

## Structure (heading tree)

The **Structure** column shows the document's headings (`#` – `######`, plus headings underlined with `===` / `---`) as a **tree** with connecting lines, like the folder tree. Deeper headings go under the shallower heading right before them. A `#` inside a code block does not count as a heading.

![Structure](images/md-outline.png)
*Figure: The Structure column to the left of the editor*

- The header shows "Structure" and the number of headings, with **Unfold all · Fold all · × (close)** buttons.
- The ⊞ / ⊟ in front of a branch folds and unfolds just that branch.
- Clicking a heading moves the cursor to it, and both the source editor and the WYSIWYG column scroll so that heading is at the top.
- **The heading containing the cursor** is highlighted, so you can see where you are editing.
- Hovering over a heading shows its level and line number.
- With no headings, it says "No headings (# Heading …)".
- It is rebuilt as you edit.

In code documents, View › Structure turns the **minimap** in the same place on and off ([View and themes](16-view-and-themes.md)).
