# MyGit V1.0.0

Windows desktop Git viewer built with WinForms (.NET 8). Browse commit history with a branch graph, inspect diffs, manage branches, and explore GitHub Releases.

![MyGit icon](Assets/MyGit.ico)

## Features

- Open local repositories or clone from a remote URL
- Commit history with lane-based branch/merge graph
- Commit metadata, changed files list, and unified diff view
- Repository tree: local branches, remotes, tags, and GitHub Releases
- Checkout local branches from the tree
- Resizable commit-history columns
- Remembers the last opened repository

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

The installer publishes the app (`win-x64`, framework-dependent) and packages it with WiX Toolset v6. A Release publish automatically triggers the installer build via the `BuildInstallerOnRelease` MSBuild target unless `-p:SkipInstaller=true` is passed.

```powershell
dotnet publish MyGitWinV10.App -c Release -r win-x64 --self-contained false
```

Or build the installer project directly (after a Release publish already exists):

```powershell
dotnet build installer/MyGitWinV10.Installer.wixproj -c Release
```

The resulting `MyGitWinV10Setup.msi` is written to `installer/bin/Release/`.

## User Documentation

See [UsersGuide.md](UsersGuide.md) for a full walkthrough of the user interface and workflows.

## Project Layout

| Path | Description |
|------|-------------|
| `MyGitWinV10.App/` | Main WinForms application |
| `MyGitWinV10.App/Controls/` | Custom UI controls (`CommitGraphView`, icons, section titles) |
| `MyGitWinV10.App/Services/` | Git operations, graph builder, diff rendering, GitHub integration |
| `MyGitWinV10.App/Dialogs/` | Clone, credentials, about, and error dialogs |
| `Assets/` | Application icon (`MyGit.ico`) and icon generator |
| `installer/` | WiX Toolset v6 MSI installer project |

## Key Source Files

- `MyGitWinV10.App/MainForm.cs` — main window layout and event handling
- `MyGitWinV10.App/Controls/CommitGraphView.cs` — owner-drawn commit graph
- `MyGitWinV10.App/Services/GitRepositoryService.cs` — LibGit2Sharp repository open/clone
- `MyGitWinV10.App/Services/CommitGraphBuilder.cs` — lane assignment for the commit graph
- `MyGitWinV10.App/Services/CommitDetailService.cs` — commit metadata and patch retrieval
- `MyGitWinV10.App/Services/DiffTextRenderer.cs` — colored unified diff rendering
- `MyGitWinV10.App/Services/BranchTagTreePopulator.cs` — branches, tags, and releases tree
- `MyGitWinV10.App/Services/GitHubReleaseService.cs` — GitHub remote parsing and release list

## Regenerating the Application Icon

```powershell
dotnet run --project Assets/GenerateIcon.csproj -- Assets/MyGit.ico
```

## Settings

User settings (last repository path) are stored at:

`%AppData%\MyGitWinV10\settings.json`

Credentials entered for HTTPS clone are kept in memory only and are not written to disk.

## License

See repository license terms (if applicable).
