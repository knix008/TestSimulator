# Installer (MSI)

WiX Toolset 6 packages a self-contained `win-x64` publish of the WPF app into an MSI.

## Output

Release build produces:

`artifacts/msi/RTSPClientWinV10.msi`

## Build

Visual Studio 2022/2026:

1. Open `RTSPClientWinV10.sln`
2. Configuration = **Release**, Platform = **x64** (or Any CPU — Setup maps to x64)
3. Build Solution  
   - Debug does **not** build the Setup project (by design)
   - Release builds app + MSI

Command line:

```powershell
dotnet restore RTSPClientWinV10.sln
dotnet build RTSPClientWinV10.sln -c Release -p:Platform=x64
```

The app project must declare `<RuntimeIdentifiers>win-x64</RuntimeIdentifiers>` so WiX publish can produce a self-contained package (avoids NETSDK1047).

## Visual Studio notes

- App UI: edit `src/RTSPClientWinV10/MainWindow.xaml` in the XAML Designer (LibVLC surface is a designer placeholder; video binds at runtime).
- Optional: install [HeatWave for VS](https://www.firegiant.com/heatwave/) for richer WiX project editing. The SDK-style `.wixproj` also builds with `dotnet build` alone.
- Prerequisite on target PCs: **FFmpeg on PATH** (not bundled in the MSI).
