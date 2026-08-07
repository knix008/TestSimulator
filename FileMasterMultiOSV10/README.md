# Command Center

Command Center is a cross-platform Electron file manager built with React, TypeScript, and Vite. It provides a dual-pane desktop file-management workflow for Windows, Linux, and macOS, plus a limited browser preview mode for UI-only development.

Current app version: `1.0.0`.

## Requirements

- Node.js 24 or later
- npm 12 or later
- Platform-specific packaging tools when building installers for each OS

## Install

```powershell
npm install
```

## Run

Run the standalone Electron application from the built production files:

```powershell
npm start
```

Run the Electron development app with Vite hot reload:

```powershell
npm run dev
```

Run the browser-only limited web mode:

```powershell
npm run dev:web
```

The web mode cannot access the full local file system because browsers intentionally restrict arbitrary disk access. Full file operations are available in the Electron desktop app.

## Build

Compile TypeScript, Electron main/preload code, and the Vite renderer:

```powershell
npm run build
```

## Package Desktop Apps

Build the current platform default package:

```powershell
npm run build:desktop
```

Build unpacked app output for quick inspection:

```powershell
npm run package:dir
```

Build Windows packages:

```powershell
npm run build:win
```

Windows output includes an NSIS installer and a portable executable. The NSIS setup executable is also copied to the project root as `Command Center Setup 1.0.0.exe`.

Build Linux packages:

```powershell
npm run build:linux
```

Outputs include AppImage, deb, and rpm targets.

Build macOS packages:

```powershell
npm run build:mac
```

Outputs include dmg and zip targets. macOS packages should be built on macOS for reliable code signing, notarization, and DMG generation.

Build all configured targets:

```powershell
npm run build:all
```

Cross-platform packaging has host OS limitations. Windows can package Windows targets reliably. Linux targets are best built on Linux or CI with Linux packaging dependencies. macOS targets should be built on macOS.

The older `package:*` script names and `dist:*` aliases are kept for compatibility.

## Project Structure

```text
electron/
  main.ts          Electron app bootstrap, BrowserWindow lifetime, IPC registration
  preload.ts       Secure renderer bridge, dropped-file path lookup, native drag bridge
  fileSystem.ts    File browsing, operations, search, preview, watching
  archive.ts       ZIP compression/extraction
  searchIndex.ts   Background file-name index
src/
  App.tsx          Main dual-pane file-manager UI and interaction state
  App.css          App layout, dialogs, overlays, drag/drop states
  index.css        Theme tokens and global styles
  shared.ts        Shared IPC types
build/
  app_icon.ico     Windows app icon
scripts/
  copy-win-installer.mjs
```

## Main Features

- Dual-pane file browsing with active-panel keyboard and toolbar actions
- Parent navigation, root-location tree, and current-directory dropdowns
- Copy, move, delete, rename, new file, and new folder
- Internal copy/cut/paste with Ctrl+C, Ctrl+X, and Ctrl+V
- External drag and drop into either panel to copy files/folders into the current directory
- Native drag-out from selected panel rows to the operating system shell
- Keyboard shortcuts: F2, F5, F6, F8/Delete, Esc, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V
- ZIP compression and extraction, including split ZIP extraction support
- Search by file name, wildcard, optional content search, and index-backed search
- Folder change watching and auto-refresh
- Delayed loading popup for slow directory navigation without shifting the layout
- Operation progress popup for copy/move/delete work
- Detailed error dialog with copyable diagnostic information
- Korean/English language toggle and light/dark theme
- Context menu actions for common file operations

## Validation

```powershell
npm run build
npm run lint
```

`npm run build` is the primary release gate. `npm run lint` is available for static checks when lint cleanup is part of the change.
