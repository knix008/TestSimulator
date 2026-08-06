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
- Use the location buttons near the top to jump to detected root locations.
- Use the refresh button to reload the active panel.

## Selecting Files

- Click an item to select it.
- Ctrl-click or Cmd-click to add or remove an item from the selection.
- Use `Ctrl+A` to select all items in the active panel.

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
- Show properties/preview

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `F2` | Rename selected item |
| `F5` | Copy selected items to the opposite panel |
| `F6` | Move selected items to the opposite panel |
| `F8` or `Delete` | Delete selected items |
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

## Preview Panel

Selecting a file updates the preview panel.

Preview support:

- Images: JPG, PNG, BMP, GIF, ICO, TIFF, WEBP
- Text/code files up to 2 MB
- Basic file information for unsupported file types

Folders show basic folder information.

## Search

Use the search bar to search from the active panel path.

Supported name search:

- Plain text search
- Wildcard search with `*` and `?`
- Optional folder inclusion

Content search can be enabled with the content checkbox. Content search reads matching files up to the preview size limit.

## Search Index

Use the reindex button to build a file-name index across detected roots. When the index is ready, enable the index checkbox for faster file-name searches.

Index states:

- Not built: no index is available
- Building: scan is in progress
- Ready: indexed search is available

The current index is in memory and is rebuilt when requested.

## Bookmarks

Use the bookmark button to save the current active path. Saved bookmarks appear in the location strip and can be clicked to navigate quickly.

## Theme and Language

The toolbar includes controls for:

- Light/dark theme
- Korean/English language toggle

Preferences are saved locally by Electron.

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

The browser-only web mode is intentionally limited. It cannot browse arbitrary local disks, watch folders, run OS shell actions, or perform unrestricted file operations. Use the Electron desktop app for full functionality.
