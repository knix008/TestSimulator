# Diff & Merge Win V10

Windows WinForms tool for resolving Git merge conflicts via 3-way diff/merge (Base / Local / Remote → merged). Can be registered as a `git mergetool`.

## Features

### Merge workflows

- **3-way merge** — Base (common ancestor), Local (ours), and Remote (theirs) panes with line-level diff via LCS-based 3-way merge (only conflicting hunks are flagged; non-overlapping changes from both sides are merged automatically)
- **Conflict marker parsing** — open a file that already contains `<<<<<<<` / `|||||||` / `=======` / `>>>>>>>` markers (typical after `git merge` leaves a conflict) without separate base/local/remote files
- Per-conflict resolution: **Take Base / Take Local / Take Remote / Take Both**, or edit the **Result** pane directly
- **Synchronized scrolling** across the three source panes
- **Conflict list** with resolved/unresolved status and Previous/Next navigation
- Standalone mode (open files via dialogs) and **`git mergetool`** mode (CLI args)

### User interface

- **Line numbers** in every source/result pane, with row backgrounds synced to the text
- **List-style row backgrounds** — alternating zebra stripes on clean lines; yellow for unresolved conflicts, green for resolved hunks (matching the conflict list)
- **Resizable panes** — drag splitters between the top three-way view and bottom conflict/result area, and between the conflict list and result editor
- **Toolbar font size** — adjust pane font size without opening Preferences
- **Word wrap** toggle for source and result panes

### Preferences

- **File → Preferences...**
- Pane font size, word wrap, and **language** (Korean default, English)
- **Forget last session** — clear the remembered working files
- **Restore last session** on startup (three-file merge or conflicted-file mode)

## Requirements

- Windows 10 or later
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (for framework-dependent builds)

## Build

```powershell
dotnet build DiffMergeWinV10.slnx
```

### Release build (with MSI)

```powershell
dotnet build DiffMergeWinV10.App/DiffMergeWinV10.App.csproj -c Release
```

MSI output: `installer/bin/Release/DiffMergeWinV10Setup.msi`

> Close any running Diff & Merge instance before a Release build — a locked executable can block the publish step.

## Run

```powershell
dotnet run --project DiffMergeWinV10.App
```

### Command-line usage

```
DiffMergeWinV10.App.exe                              # standalone — pick files via dialogs
DiffMergeWinV10.App.exe <conflicted-file>             # parse <<<<<<< markers in that file
DiffMergeWinV10.App.exe <BASE> <LOCAL> <REMOTE> <MERGED>   # git mergetool convention
```

The exe exits with code `0` when the merge was saved, and non-zero if the window was closed without saving — required for `git mergetool` (with `mergetool.<name>.trustExitCode=true`) to track resolved vs. unresolved files.

## Registering as a git mergetool

```powershell
git config --global mergetool.diffmerge.cmd '"C:\\Program Files\\DiffMergeWinV10\\DiffMergeWinV10.App.exe" "$BASE" "$LOCAL" "$REMOTE" "$MERGED"'
git config --global mergetool.diffmerge.trustExitCode true
```

Then, during a conflicted merge:

```powershell
git mergetool -t diffmerge
```

## User documentation

See [UsersGuide.md](UsersGuide.md) for a full walkthrough of the user interface and workflows (Korean).

## Project layout

| Path | Description |
|------|-------------|
| `DiffMergeWinV10.App/` | Main WinForms application |
| `DiffMergeWinV10.App/Core/` | Merge model, 3-way diff, conflict marker parser, session I/O |
| `DiffMergeWinV10.App/Controls/` | `SyncRichTextBox`, `LineNumberGutter`, icons, pane theme |
| `DiffMergeWinV10.App/Services/` | Settings persistence, Korean/English string table |
| `DiffMergeWinV10.App/Dialogs/` | Preferences dialog |
| `Assets/` | Application icon generator |
| `installer/` | WiX MSI installer project |

## Key source files

| File | Role |
|------|------|
| `MergeForm.cs` | Main window layout, rendering, conflict resolution UI |
| `Core/ConflictMarkerParser.cs` | Parses `<<<<<<<`/`|||||||`/`=======`/`>>>>>>>` markers |
| `Core/ThreeWayDiff.cs` | LCS-anchor diff3-style 3-way merge from separate files |
| `Core/MergeDocument.cs` | In-memory model — clean/conflict regions, resolution state |
| `Core/MergeSession.cs` | File I/O, line-ending preservation |
| `Controls/SyncRichTextBox.cs` | Scroll-synchronized read-only panes |
| `Controls/LineNumberGutter.cs` | Line numbers and per-row gutter backgrounds |
| `Controls/PaneTheme.cs` | Shared row/conflict colors |
| `Controls/IconFactory.cs` | Runtime-drawn menu/toolbar glyphs |
| `Services/Strings.cs` | Korean/English UI strings |
| `Services/AppSettingsStore.cs` | User settings persistence |
| `Dialogs/PreferencesDialog.cs` | Font size, word wrap, language, forget session |

## Regenerating the application icon

```powershell
dotnet run --project Assets/GenerateIcon.csproj -- DiffMergeWinV10.App/DiffMergeWinV10.ico
```

## Settings and runtime data

| Item | Location |
|------|----------|
| User settings | `%AppData%\DiffMergeWinV10\settings.json` |

Settings include window bounds, pane font size, word wrap, UI language (Korean by default), and the last working session (three-file paths or conflicted file path).
