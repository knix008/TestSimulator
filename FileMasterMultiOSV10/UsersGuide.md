# User Guide

## Starting the App

From the project folder:

```powershell
npm start
```

This builds the app and starts the standalone Electron desktop application.

For development with hot reload:

```powershell
npm run dev
```

For browser-only limited mode:

```powershell
npm run dev:web
```

## Main Window

Command Center uses two file panels. One panel is active at a time. The active panel has a highlighted border and receives toolbar, search, and keyboard shortcut actions.

Each panel shows:

- File or folder name
- Size
- Type
- Modified date

Click a column header to sort by that column. Click the same header again to reverse the sort direction.

## Navigation

- Double-click a folder to enter it.
- Use the up button to go to the parent folder.
- Click the left or right panel title to open the root-location tree.
- Click the current path text in a panel header to open a dropdown of the current directory contents.
- In the current-directory dropdown, click a folder to navigate into it or click a file to open it.
- Use the refresh button to reload the active panel.

Slow directory changes show a centered loading popup. The popup does not push or resize the file list.

## Selecting Files

- Click an item to select it.
- Ctrl-click or Cmd-click to add or remove an item from the selection.
- Use `Ctrl+A` to select all items in the active panel.
- Use `Esc` to clear the selection in the active panel.

## File Operations

Toolbar and context menu operations act on the selected items in the active panel.

Available operations:

- New folder
- New file
- Copy to the opposite panel
- Move to the opposite panel
- Internal copy/cut/paste
- Rename
- Delete
- Compress to ZIP
- Extract ZIP
- Open file
- Reveal file location
- Show selected path information in the status bar

Copy, move, and delete operations show progress in a popup near the bottom of the window.

## Drag and Drop

You can copy files or folders from outside the app into either panel:

1. Drag files or folders from Windows Explorer or the OS file manager.
2. Drop them onto the left or right panel.
3. The dropped items are copied into that panel's current directory.

You can also drag selected rows out of Command Center to the operating system shell. When multiple rows are selected, dragging one selected row starts a native drag for the selection.

The final copy or move behavior outside the app is controlled by the operating system drop target.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `F2` | Rename selected item |
| `F5` | Copy selected items to the opposite panel |
| `F6` | Move selected items to the opposite panel |
| `F8` or `Delete` | Delete selected items |
| `Esc` | Clear active-panel selection |
| `Ctrl+A` | Select all items in the active panel |
| `Ctrl+C` | Copy selected items to the internal clipboard |
| `Ctrl+X` | Cut selected items to the internal clipboard |
| `Ctrl+V` | Paste internal clipboard items into the active panel |
| `Enter` in search box | Search |

## Context Menu

Right-click a file or folder to open the context menu.

Context menu actions include:

- Open
- Reveal
- Copy to opposite panel
- Move to opposite panel
- Rename
- Delete
- Compress
- Extract
- Properties

## Search

Use the search bar to search from the active panel path.

Supported name search:

- Plain text search
- Wildcard search with `*` and `?`
- Optional folder inclusion

Content search can be enabled with the content checkbox. Content search reads matching files up to the preview size limit.

Search results open in a dropdown. Click a folder result to navigate to it. Click a file result to open its containing directory and select the file.

## Search Index

Use the reindex button to build a file-name index across detected roots. When the index is ready, enable the index checkbox for faster file-name searches.

Index states:

- Not built: no index is available
- Building: scan is in progress
- Ready: indexed search is available

The current index is in memory and is rebuilt when requested.

## Errors and Diagnostics

When an operation fails, Command Center shows an error dialog with a specific message and detailed diagnostic text.

Use the copy details button to copy:

- Error title and message
- Time of the error
- App version and build number
- Platform and OS
- Active panel and current paths
- Stack trace or raw error data when available

## Theme and Language

The toolbar includes controls for:

- Light/dark theme
- Korean/English language toggle

Preferences are saved locally by Electron.
The last open left and right paths are also saved locally.

## Packaging for Distribution

Build Windows packages:

```powershell
npm run package:win
```

Build Linux packages:

```powershell
npm run package:linux
```

Build macOS packages:

```powershell
npm run package:mac
```

Build all configured packages:

```powershell
npm run package:all
```

For reliable results, build each platform on its native OS or in a matching CI environment. macOS signing and notarization require macOS.

## Web Mode Limitations

The browser-only web mode is intentionally limited. It cannot browse arbitrary local disks, watch folders, run OS shell actions, use native drag-out, or perform unrestricted file operations. Use the Electron desktop app for full functionality.
