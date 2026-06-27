# Diff & Merge Win V10

Windows WinForms tool for resolving git merge conflicts via 3-way diff/merge (base / local / remote → merged). Registers as a `git mergetool`.

## Main Features

- **3-way merge**: Base (common ancestor), Local (ours), and Remote (theirs) panes, with line-level diff computed via LCS-based 3-way merge (only conflicting hunks are flagged; non-overlapping changes from both sides are merged automatically)
- **Conflict marker parsing**: open a file already containing `<<<<<<< / ||||||| / ======= / >>>>>>>` markers (the usual state of a file after `git merge` leaves a conflict) — no separate base/local/remote files needed
- Per-conflict resolution: **Take Base / Take Local / Take Remote / Take Both**, or edit the Result pane freely
- Synchronized scrolling across the three source panes
- Conflict list with resolved/unresolved status, Previous/Next navigation
- Standalone mode (open files via dialogs) and `git mergetool` mode (CLI args)

## Build

```powershell
dotnet build DiffMergeWinV10.slnx
```

### Release Build (with MSI)

```powershell
dotnet build DiffMergeWinV10.App/DiffMergeWinV10.App.csproj -c Release
```

MSI output: `installer/bin/Release/DiffMergeWinV10Setup.msi`

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

The exe exits with code `0` when the merge was saved, and non-zero if the window was closed without saving — required for `git mergetool` to correctly track resolved vs. unresolved files.

## Registering as a git mergetool

```powershell
git config --global mergetool.diffmerge.cmd '"C:\\Program Files\\DiffMergeWinV10\\DiffMergeWinV10.App.exe" "$BASE" "$LOCAL" "$REMOTE" "$MERGED"'
git config --global mergetool.diffmerge.trustExitCode true
```

Then, during a conflicted merge:

```powershell
git mergetool -t diffmerge
```

## Project Files

- `DiffMergeWinV10.App/Core/ConflictMarkerParser.cs`: parses `<<<<<<<`/`|||||||`/`=======`/`>>>>>>>` markers into a `MergeDocument`
- `DiffMergeWinV10.App/Core/ThreeWayDiff.cs`: LCS-anchor diff3-style 3-way merge from separate base/local/remote files
- `DiffMergeWinV10.App/Core/MergeDocument.cs`: in-memory model — ordered clean/conflict regions, per-conflict resolution state
- `DiffMergeWinV10.App/Core/MergeSession.cs`: file I/O, line-ending preservation
- `DiffMergeWinV10.App/MergeForm.cs`: main UI
- `DiffMergeWinV10.App/Controls/SyncRichTextBox.cs`: scroll-synchronized read-only pane
- `DiffMergeWinV10.App/Controls/IconFactory.cs`: runtime-drawn glyph icons for menu/toolbar items
- `installer/DiffMergeWinV10.Installer.wixproj`: WiX installer project
- `Assets/GenerateIcon.cs`: regenerates the application `.ico` (`dotnet run --project Assets/GenerateIcon.csproj -- <output-path>`)
