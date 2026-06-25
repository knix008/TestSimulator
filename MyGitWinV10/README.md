# MyGit V1.0.0

Windows desktop Git client built with WinForms (.NET 8). Browse commit history with a branch graph, inspect diffs, manage branches, work with local repositories, browse remotes without a full clone, and export repository summary reports.

![MyGit icon](Assets/MyGit.ico)

## Features

### Repository access

- **Open** local repositories
- **Clone** from a remote URL (HTTPS with optional credentials)
- **Browse Remote** — read-only history view from a bare cache (no permanent working copy)
- Recent Clone/Browse URLs appear as soon as the URL field is focused — press **Delete** on a highlighted entry to remove it
- **Recent repositories** in the File menu
- **Restore last session** on startup (local open, clone, or remote browse)

### History and diff

- Commit history with lane-based branch/merge graph
- Commit metadata, changed files list, and colored unified diff view
- **Files** panel — tree-structured list (Directory/File + Status columns) for the working tree / HEAD tree, with a path-filtered commit log
- Status column shows a bold colored badge per file/folder; click a directory to expand/collapse it
- **Real-time refresh** — the Files panel and Git status badges update after Git operations and when files change on disk (debounced file-system watcher)
- Resizable commit-history columns
- Diff view defaults to word wrap; right-click for Copy / Word Wrap
- Double-click a **changed file** in Commit Details to open it in an external diff tool (if configured in Preferences)
- Double-click a **working-tree file** in the Files panel to open it with the system default application
- Export a single commit snapshot to a folder

### Repository tree

- Local branches, remotes, tags, and GitHub Releases
- Checkout local branches from the tree (local repos only)

### Git workflow (local clone only)

- **Git Add / Reset (Unstage) / Discard Changes** — on the selected file, folder, or whole repository
- **Git Add** shows a confirmation dialog listing staged paths before completing
- **Git Commit** — category-based commit message dialog (`[category] subject`)
- **Git Fetch / Pull / Push** — sync with `origin` (HTTPS credentials prompted when needed)
- **Git Stash / Stash Pop**, **Git Status** dialog
- Editable commit categories with a manage dialog; categories persist in settings
- HTTPS username + PAT are remembered after a successful fetch/pull/push (encrypted at rest — see [Settings](#settings-and-runtime-data)) so you aren't asked again until an attempt fails

### Files panel (local clone only)

- **New File...** / **New Folder...** — create items under the selected directory (or repository root)
- **Delete** — remove a file or folder from disk (with confirmation)
- **Add to .gitignore** / **Remove from .gitignore** — manage ignore rules for the selected path

### Reports

- **Export Summary** to PDF, Word (.docx), or Markdown
- Preview before export (stats, charts, recent commits)
- Charts: commit activity, top contributors, repository overview, commit graph

### Preferences

- **File → Preferences...**
- **External diff tool** — path + argument template (`{left}`/`{right}` placeholders); double-clicking a changed file opens it there instead of the built-in Diff panel
- **Language** — Korean (default) or English for menus, toolbars, dialogs, status bar, operation messages, and Git operation detail labels. **Git command names** (Git Add, Git Commit, Git Fetch, etc.) stay in English in both languages. Switches immediately — no restart needed

## Requirements

- Windows 10 or later
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (for framework-dependent builds)

## Quick Start

### Build

```powershell
dotnet build MyGitWinV10.slnx
```

### Run

```powershell
dotnet run --project MyGitWinV10.App
```

### Build the installer (MSI)

The installer publishes the app (`win-x64`, framework-dependent) to `publish/installer/` and packages it with WiX Toolset v6.

**Recommended — build the whole solution in Release:**

```powershell
dotnet build MyGitWinV10.slnx -c Release
```

Or build only the installer project:

```powershell
dotnet build installer/MyGitWinV10.Installer.wixproj -c Release -p:Platform=x64
```

Building the **app project alone** in Release (outside Visual Studio, with no solution open) also creates the MSI via the `BuildInstallerOnRelease` target:

```powershell
dotnet build MyGitWinV10.App/MyGitWinV10.App.csproj -c Release
```

In Visual Studio, use **Build Solution** (not Build on the app project only) so the installer project runs, or build `MyGitWinV10.Installer.wixproj` directly.

The resulting `MyGitWinV10Setup.msi` is written to `installer/bin/Release/` (~14 MB when the publish output is included correctly).

> Close any running MyGit instance before building Release — a locked `MyGitWinV10.App.exe` can block the build.

> The app and installer projects guard against circular MSI builds (`SkipInstaller`) when the solution or installer project drives the publish step.

## User Documentation

See [UsersGuide.md](UsersGuide.md) for a full walkthrough of the user interface and workflows (Korean).

## Project Layout

| Path | Description |
|------|-------------|
| `MyGitWinV10.App/` | Main WinForms application |
| `MyGitWinV10.App/Controls/` | Custom UI controls (`CommitGraphView`, `RepositoryFileListView`, icons, section titles) |
| `MyGitWinV10.App/Services/` | Git operations, graph builder, diff rendering, export, GitHub integration, localization |
| `MyGitWinV10.App/Dialogs/` | Clone, browse remote, commit, export preview, credentials, preferences, about dialogs |
| `Assets/` | Application icon (`MyGit.ico`), Files-panel status icons (`FileStatusIcons/`), and the icon generator |
| `installer/` | WiX Toolset v6 MSI installer project |
| `Test/` | Local development probes (not part of the shipped product) |

## Key Source Files

| File | Role |
|------|------|
| `MainForm.cs` | Main window layout and event handling |
| `Controls/CommitGraphView.cs` | Owner-drawn commit graph |
| `Controls/RepositoryFileListView.cs` | Owner-drawn Files panel tree-list (fixed header + independently-scrolling body, explicit `VScrollBar`; same split-panel architecture as `CommitGraphView`) |
| `Services/GitRepositoryService.cs` | LibGit2Sharp repository open/clone |
| `Services/RemoteRepositoryService.cs` | Bare remote cache for Browse Remote |
| `Services/GitWorkflowService.cs` | Stage, commit, push |
| `Services/RepositoryFileTreeService.cs` | Files panel tree (in-memory `TreeNode` data model rendered by `RepositoryFileListView`) |
| `Services/RepositoryWorkingTreeWatcher.cs` | Debounced `FileSystemWatcher` for live Files-panel / status refresh |
| `Services/RepositoryPathStatusService.cs` | Git status index, tooltips, and badge application for the Files panel |
| `Services/PathGitStatus.cs` | Per-path status badges (U/D/R/P/±/X/! etc.) |
| `Services/WorkingTreeFileService.cs` | Create/delete files and folders; open with the system default app |
| `Services/PathCommitHistoryService.cs` | Path-filtered commit history (tree-entry-id diff, not libgit2's path-limited walk — see inline comment for why) |
| `Services/CommitGraphBuilder.cs` | Lane assignment for the full commit graph; `BuildFlat` for path-filtered history |
| `Controls/GitFileTreeImageList.cs` | Loads Files-panel status icons from `Assets/FileStatusIcons/` |
| `Services/CredentialsPrompt.cs` | HTTPS credentials dialog with silent reuse after success |
| `Services/RepositorySummaryBuilder.cs` | Summary report data and charts |
| `Services/GitHubReleaseService.cs` | GitHub remote parsing and release list |
| `Services/ExternalDiffToolService.cs` | Launches the configured external diff tool with the old/new blob content written to temp files |
| `Services/Localization.cs` | Korean/English string table (`T` / `Tf`) for UI text; Git command labels remain English |
| `Services/AppSettingsStore.cs` | User settings persistence |
| `Dialogs/PreferencesDialog.cs` | External diff tool + language settings |

## Regenerating the Application Icon

Also regenerates the Files-panel status icons (`Assets/FileStatusIcons/*.png`) alongside `MyGit.ico`.

```powershell
dotnet run --project Assets/GenerateIcon.csproj -- Assets/MyGit.ico
```

## Settings and runtime data

| Item | Location |
|------|----------|
| User settings | `%AppData%\MyGitWinV10\settings.json` |
| Remote browse cache | `%LocalAppData%\MyGitWinV10\remote-cache\` |

Settings include recent repositories, last successful session (local or remote browse), recent clone URLs, commit categories, the last HTTPS username/PAT used for fetch/pull/push, the external diff tool path/arguments, and the UI language (Korean by default).

The PAT is encrypted with Windows DPAPI (current user scope) before it's written to `settings.json` — it's never stored in plain text. A failed fetch/pull/push clears only the "skip the dialog next time" flag, not the stored value, so the credentials dialog reappears pre-filled instead of blank.

## License

See repository license terms (if applicable).
