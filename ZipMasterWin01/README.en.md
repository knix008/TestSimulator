# ZipMasterWin01

A Windows archive utility for compressing and extracting files.  
It supports ZIP, TAR.GZ, split archives (`.part001...`), and progress display.

## Features

- Compress a single file or a directory
- Archive format selection: `zip`, `tar.gz`
- Enable/disable split archive and set split size (MB)
- Auto-merge split files before extraction
- Compression/extraction progress with percentage
- Completion/failure notifications
- Automatic MSI generation on Release build

## Tech Stack

- .NET 8 (`net8.0-windows`)
- Windows Forms
- WiX Toolset v6 (MSI packaging)

## Run

```bash
dotnet build
dotnet run --project ZipMasterWin01.csproj
```

## Release + MSI Build

```bash
dotnet build ZipMasterWin01.csproj -c Release
```

MSI output:

- `bin/Release/installer/ZipMasterWin01_Setup.msi`

## Installer Icon

The MSI and shortcut icon use:

- `daemon_hammer.ico` (project root)
