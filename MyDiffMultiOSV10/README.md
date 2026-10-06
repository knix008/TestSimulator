# MyDiff (Multi-OS V10)

Cross-platform 2-way diff viewer for files, directories and git repositories — a
JavaScript/Electron rewrite of the WinForms [MyDiffWinV10](../MyDiffWinV10). The same code
runs as a desktop app on **Windows, macOS and Linux**, and as a **web app** in a browser.

Designed to be launched *by* your existing Git tooling as much as on its own — register it
as a `git difftool` and it opens the pair it is handed.

## Features

- Side-by-side Left/Right panes with line-level diff highlighting (added / removed / modified)
  and word-level highlighting inside modified lines
- Synchronized scrolling, line numbers, virtualized rendering for very large files
- **Diff overview bar** next to each pane — a minimap of where every difference sits,
  with a viewport indicator and click-to-jump
- Previous/Next difference navigation
- **Directory comparison** with configurable exclude list (`.git`, `node_modules`, …)
- **Git panel** — working tree, staged, commit and range views, commit log, unified diff
- **Binary comparison** — files that are not text fall back to a side-by-side hex dump
- Korean/English UI and light/dark themes, switchable without restart
- Errors are reported in a copyable dialog, not silently swallowed

This is a **read-only diff viewer**, not a merge tool.

## Requirements

- Node.js 20.19+ (24 recommended) to build or run from source
- `git` on `PATH` for the git features (everything else works without it)

## Running from source

```bash
npm install
npm start          # Electron desktop app
npm run dev:web    # same UI in a browser at http://127.0.0.1:5174
```

Both modes run straight from source, so a restart always picks up the latest edit.

```bash
npm run typecheck  # tsc --noEmit
npm run build      # icons + UI (dist/) + bundled server (dist-server/)
npm run preview    # run the production build without packaging
npm run serve      # production web server only
```

## Building installers

```bash
npm run build:win     # NSIS installer (x64, arm64) + portable exe
npm run build:mac     # dmg + zip (x64, arm64)
npm run build:linux   # AppImage, deb, rpm, tar.gz
npm run build:all     # all three
```

Output lands in `release/`. Each command runs the full build first, so the installer always
contains the current sources. The usual Electron cross-build rules apply — build macOS
targets on macOS, and deb/rpm on Linux (or in Docker).

### Windows install behaviour

Carried over from the WinForms MSI, implemented in [build/installer.nsh](build/installer.nsh):

- **An existing MyDiff is removed completely before reinstalling** — the old uninstaller
  runs first, then its leftover program folder is deleted.
- **User data is never deleted silently.** If settings are present, the installer asks once
  whether to wipe them, and the uninstaller asks again. A silent run (`/S`, e.g. an
  automated upgrade) never prompts and never deletes.

Settings live in `%APPDATA%\MyDiffJS` on Windows, `~/Library/Application Support/MyDiffJS`
on macOS and `~/.config/MyDiffJS` on Linux.

> **Note:** if `ELECTRON_RUN_AS_NODE` is set in your environment, the Electron binary starts
> as plain Node and the app window never appears. Unset it before launching an installed
> MyDiff; the npm scripts already strip it.

## Using it as a git difftool

```
mydiff LEFT RIGHT
```

is what `git difftool` passes, and MyDiff opens that pair directly. Registration and
removal are both buttons in the app's git panel; they write
`git config --global difftool.mydiff.cmd`.

## Documentation

- [Architecture.md](Architecture.md) — how the code is organised and how the build works
- [UsersGuide.md](UsersGuide.md) — 사용자 가이드 (Korean)
