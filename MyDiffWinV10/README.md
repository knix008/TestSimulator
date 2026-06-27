# MyDiff Win V10

Windows desktop 2-way line diff viewer built with WinForms (.NET 8). Designed to be launched
*by* your existing Git tooling rather than to talk to Git itself — register it as a
`git difftool`, or point [MyGitWinV10](../MyGitWinV10)'s External Diff Tool preference at it.

## Features

- Side-by-side Left/Right panes with line-level diff highlighting (added / removed / modified)
- Synchronized scrolling between the two panes, with line numbers
- Previous/Next difference navigation (toolbar, menu, or **F3** / **Shift+F3**)
- Word wrap toggle, adjustable pane font size
- Status bar with added/removed/modified counts
- Korean/English UI language, switchable without restart (**File → Preferences...**)
- Restores the last-opened Left/Right pair on standalone startup

This is a **read-only diff viewer**, not a merge tool. For resolving 3-way merge conflicts,
use the sibling app [DiffMergeWinV10](../DIff&MergeWinV10), which already covers that role —
`MyDiffWinV10` intentionally only registers as a `difftool`, not a `mergetool`.

## Requirements

- Windows 10 or later
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (for framework-dependent builds)

## Build & Run

```powershell
dotnet build MyDiffWinV10.slnx
dotnet run --project MyDiffWinV10.App
```

### Building the installer (MSI)

Building the **App project in Release** (in Visual Studio or via `dotnet build`) also produces
an MSI — no separate "build the installer" step needed, and the installer project doesn't need
to be added to a solution:

```powershell
dotnet build MyDiffWinV10.App/MyDiffWinV10.App.csproj -c Release
```

Output: `installer\bin\Release\MyDiffWinV10Setup.msi`

The installer publishes the app (`win-x64`, framework-dependent) and lets the user choose
during setup whether to create a **Start Menu shortcut** and/or **Desktop shortcut** (both
checked by default, both optional) — both shortcuts use the application's icon.

> Close any running `MyDiffWinV10.App.exe` before a Release build — a locked exe can block
> the publish step that feeds the installer.

To build only the installer (e.g. after the app is already published):

```powershell
dotnet build installer/MyDiffWinV10.Installer.wixproj -c Release -p:Platform=x64 -p:BuildMsiPackage=true
```

### Command-line usage

```
MyDiffWinV10.App.exe                 # standalone — pick Left/Right via Open dialogs
MyDiffWinV10.App.exe <LEFT> <RIGHT>  # diff the two files directly
```

## Registering with your Git tooling

### As a `git difftool`

```powershell
git config --global difftool.mydiff.cmd '"C:\\Path\\To\\MyDiffWinV10.App.exe" "$LOCAL" "$REMOTE"'
git difftool -t mydiff
```

### As MyGitWinV10's external diff tool

In MyGitWinV10: **File → Preferences... → External diff tool**

- Path: the built `MyDiffWinV10.App.exe`
- Arguments: `"{left}" "{right}"`

Double-clicking a changed file in MyGitWinV10's Commit Details will then open it here instead
of MyGitWinV10's built-in diff panel.

## Project layout

| Path | Description |
|------|--------------|
| `MyDiffWinV10.App/` | Main WinForms application |
| `MyDiffWinV10.App/Core/` | `LineDiff` (2-way LCS line diff), `DiffDocument`, `DiffSession` (file I/O) |
| `MyDiffWinV10.App/Controls/` | `SyncLineListBox`, `LineNumberGutter`, pane theme, runtime-drawn icons |
| `MyDiffWinV10.App/Services/` | Settings persistence, Korean/English string table |
| `MyDiffWinV10.App/Dialogs/` | Preferences, error dialog |
| `Assets/` | Application icon generator (`GenerateIcon.csproj`) |
| `installer/` | WiX Toolset v6 MSI installer project |

## Key source files

| File | Role |
|------|------|
| `DiffForm.cs` | Main window layout, toolbar/menu, diff rendering |
| `Core/LineDiff.cs` | LCS-anchor 2-way line diff (added/removed/modified classification) |
| `Core/DiffDocument.cs` | Row list + summary counts |
| `Core/DiffSession.cs` | Loads Left/Right files from disk |
| `Controls/SyncLineListBox.cs` | Scroll-synchronized owner-draw list pane |
| `Controls/PaneTheme.cs` | Row/diff colors and header tints |
| `Services/Strings.cs` | Korean/English UI strings |
| `Services/AppSettingsStore.cs` | User settings persistence |
| `Dialogs/PreferencesDialog.cs` | Font size, word wrap, language |

## Settings and runtime data

| Item | Location |
|------|----------|
| User settings | `%AppData%\MyDiffWinV10\settings.json` |

Settings include window size, pane font size, word wrap, UI language (Korean by default), and
the last-opened Left/Right file pair (restored on standalone startup).
