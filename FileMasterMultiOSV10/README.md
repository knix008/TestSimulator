# Command Center

Command Center is a cross-platform Electron file manager built with React, TypeScript, and Vite. It replaces the previous Windows-only WinForms implementation with a desktop app for Windows, Linux, and macOS, plus a limited browser preview mode.

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
npm run package:win
```

Outputs include NSIS installer and portable executable targets.

Build Linux packages:

```powershell
npm run package:linux
```

Outputs include AppImage, deb, and rpm targets.

Build macOS packages:

```powershell
npm run package:mac
```

Outputs include dmg and zip targets. macOS packages should be built on macOS for reliable code signing, notarization, and DMG generation.

Build all configured targets:

```powershell
npm run package:all
```

Cross-platform packaging has host OS limitations. Windows can package Windows targets reliably. Linux targets are best built on Linux or CI with Linux packaging dependencies. macOS targets should be built on macOS.

## Project Structure

```text
electron/
  main.ts          Electron app bootstrap and IPC registration
  preload.ts       Secure renderer bridge
  fileSystem.ts    File browsing, operations, search, preview, watching
  archive.ts       ZIP compression/extraction
  searchIndex.ts   Background file-name index
src/
  App.tsx          Main dual-pane file-manager UI
  App.css          App layout and component styles
  index.css        Theme tokens and global styles
  shared.ts        Shared IPC types
build/
  app_icon.ico     Windows app icon
```

## Main Features

- Dual-pane file browsing
- Copy, move, delete, rename, new file, and new folder
- Keyboard shortcuts: F2, F5, F6, F8/Delete, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V
- Text/image preview and file information preview
- ZIP compression and extraction, including split ZIP extraction support
- Search by file name, wildcard, optional content search, and index-backed search
- Folder change watching and auto-refresh
- Bookmarks, Korean/English language toggle, and light/dark theme
- Context menu actions for common file operations

## Validation

```powershell
npm run build
npm run lint
```

`npm run lint` may report React hook dependency warnings if effects are intentionally tied to Electron IPC subscriptions. Build success is the primary release gate.
