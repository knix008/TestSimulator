# Files

This chapter explains how to create, open, save and close documents, and how the program looks after your files (detecting outside changes, restoring the session and so on). Most commands are in the **File** menu.

![File menu](images/menu-file.png)
*Figure: The File menu*

| Menu item | Shortcut | Description |
|---|---|---|
| New | Ctrl+N | Opens an untitled empty document ("new 1" …) in a new tab |
| Open… | Ctrl+O | Choose files to open (several can be selected) |
| Open folder… | Ctrl+Shift+O | Choose a folder to show in the folder tree on the left |
| Close folder | | Closes the folder in the folder tree (shown only while a folder is open) |
| Save | Ctrl+S | Saves the current document |
| Save as… | Ctrl+Alt+S | Saves under a new location · name |
| Save all | Ctrl+Shift+S | Saves all changed documents |
| Reload from disk | | Reads the document again from disk |
| Print… | Ctrl+P | Opens the print preview ([Print](15-print.md)) |
| Close | Ctrl+W | Closes the current tab |
| Close all | Ctrl+Shift+W | Closes all tabs |
| Close other tabs | | Keeps only the current tab |
| Show in file manager | | Opens the folder containing the file with the file selected (desktop) |
| Open with default app | | Opens the file with the program the operating system associates with its extension (desktop) |
| Copy path | | Copies the file's full path to the clipboard |
| Recent files | | Up to 10 recently opened files |
| Clear recent files | | Clears the whole recent-file history |
| Exit | Alt+F4 (macOS ⌘Q) | Quits the program |

A new document that has never been saved has no path, so Reload from disk · Show in file manager · Open with default app · Copy path are greyed out.

## New documents

Create one with any of **Ctrl+N**, the first toolbar button, the **+** at the right of the tab bar, or the New card on the start page. New documents are named "new 1", "new 2" … and you choose the location and name when you first save.

The encoding · line ending · language of new documents are set in the Files group of Settings › General: **Encoding for new documents** (default UTF-8), **Line ending for new documents** (default Unix (LF)) and **New document language** (default "Auto (by extension)"). With the language on auto, the language is guessed from what you type, then determined again from the extension you give when saving.

## Opening files

All of these give the same result:

- **Ctrl+O**, the second toolbar button, or File › Open… — the dialog lets you pick several files at once. It starts in the current document's folder (or, if there is none, the folder in the folder tree).
- Click a file in the **folder tree**.
- **Drag files onto the window** (see the section below).
- **Double-click** an associated file in the file manager (Finder), or run the program with a file path on the command line.
- Click an entry in **Recent files** on the start page or in the File menu.

Opening a file that is already open does not create a new tab; it switches to that tab. When a file opens, the status bar shows "Opened: name" and the file moves to the top of the recent files. Choosing a recent file that has since been deleted reports an error and removes it from the list.

How a file opens depends on its kind:

| File | Opens as |
|---|---|
| Text · source code | Editor (the highlighting language is detected from the extension) |
| SVG | Source editor + picture preview beside it |
| PNG · JPEG · GIF · WebP · BMP · ICO · AVIF · HEIC · HEIF · DICOM | The picture fills the pane |
| Audio · video (mp3 · wav · mp4 · webm …) | Player |
| Other binary files | Hex (Hexa) view |

See the [HTML · SVG · images · binary](10-html-svg-images-binary.md) chapter for details.

## Opening a folder

Open a folder with **Ctrl+Shift+O**, the third toolbar button, File › Open folder…, or the folder button in the folder tree header. If the folder tree was hidden, it is shown as well. Only one folder is open at a time, and the same folder opens again on the next launch. Close it with **File › Close folder** or the × in the tree header. See [Folder tree](08-folder-tree.md) for details.

## Saving

- **Save (Ctrl+S)**: writes the current document to its file. For a new document, it asks for the location and name. After saving, the status bar shows "Saved: name" and the ● on the tab disappears.
- **Save as… (Ctrl+Alt+S)**: always asks for the location and name. Afterwards the tab points to the new file.
- **Save all (Ctrl+Shift+S)**: saves all changed documents. If nothing has changed, it reports "Nothing to save." Untitled new documents ask for a location one after another; cancelling there stops the process.

These settings are applied when saving (Settings › General › Files):

- **Line ending on save**: Keep the file's own (default) / Always Unix (LF) / Always Windows (CR LF).
- **Trim trailing whitespace on save**, **Add a final newline on save** (off by default).
- **Format on save** (Settings › Formatting, off by default) — runs Format document just before saving.
- If the document contains characters its encoding cannot represent, an **Encoding warning** asks before saving ("Some characters cannot be represented in … and will become "?"").

The hex view, pictures, audio and video cannot be edited or saved here.

### Auto save

Choose under **Auto save** in the Session group of Settings › General.

- **Off** (default)
- **When the window loses focus**: saves all changed files the moment you switch to another program.
- **n seconds after the last edit**: saves once you stop typing for n seconds (1 – 600, default 5).

Auto save only saves files that are on disk. Untitled new documents and read-only files are not saved.

## Reloading and closing

**File › Reload from disk** reads the document again from disk. If there are unsaved changes, it first asks "… discards your current changes. Continue?"

There are several ways to close a document: **Ctrl+W**, the × (or ●) on the tab, a **middle click** on the tab, Close tab on the toolbar, and the tab's right-click menu.

Closing an unsaved document asks **Save / Don't save / Cancel**. Save saves and then closes, Don't save discards the changes and closes, and Cancel does nothing.

![Unsaved changes](images/dirty-close.png)
*Figure: The window asking whether to save before closing*

When you quit the program with several unsaved documents, it asks once: "n documents have unsaved changes. Save them?" (Save all / Don't save / Cancel). This confirmation can be turned off with **Ask before closing unsaved documents** under Settings › General › Session (when off, the program closes without asking).

## Recent files

A file you have opened stays in the recent files list.

- At the bottom of the **File menu**, up to 10 are listed with their name and folder path. The × at the right of an entry (Remove from the list) removes one at a time, and **Clear recent files** removes them all.
- The Recent files group on the **start page** shows up to 8.

## Drag and drop

Dragging files from the file manager or desktop onto the My Editor window opens them. You can drop several at once.

As an exception, if you drop only **picture files** (PNG · JPEG · GIF · WebP · SVG · BMP · AVIF · ICO · HEIC · HEIF · DCM) while editing a **Markdown document**, the pictures are inserted into the document at the drop position instead of being opened (see [Markdown](09-markdown.md)). In the web version the browser does not reveal file paths, so a dropped file's contents are read and opened as a new document (you choose the location when saving).

## Detecting outside changes

When another program changes an open file, My Editor notices when you return to its window or switch to that document's tab.

- **Documents you have not edited** are reloaded automatically. If you turn off **Reload files changed outside (when unmodified)** under Settings › General › Session, it asks each time.
- For **documents you are editing**, it asks "… was changed by another program. Reload it?" **Yes** replaces the text with the disk contents, and **No** keeps your version (the document is then marked as modified, and saving overwrites the file).
- If the file is **deleted from disk**, it reports "The tab is kept — saving recreates the file."
- If the file's **read-only** attribute changes, the tab's mark and whether it can be edited change with it.

## Session restore

When you close the program and open it again, things come back as they were (**Restore the previous session on start** under Settings › General › Session, on by default):

- The open **tabs and their order, the active tab, cursor positions**
- The **contents of unsaved new documents**, and **unsaved edits** left in open files
- The language · line ending you chose for each document
- The open **folder**, recent files, **window position and size**
- The split-pane layout and the document in each pane, panel widths · heights

Tabs of files that were deleted or moved in the meantime are not restored (if they had unsaved changes, that text comes back as a new document). If the folder that was open no longer exists, the program starts without a folder. If there is no document to restore, it starts on the [start page](01-getting-started.md).

## Large files and binary files

- **Text files over 64 MB** are not opened; you are told "File too large".
- **Binary files** that are not text (executables, archives, PDFs and so on) open in the **hex view** instead of the editor. Only the needed part is read, so even large files open quickly.
- Opening or saving that takes a while shows a small window with a progress bar.

## Running several windows

The installed program can be run several times, and each run opens a **new window** of its own. Double-clicking an associated file in the file manager also opens a new window. The installer associates text · source extensions such as txt · md · json · js · html with this app.
