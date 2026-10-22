# DeskSearch Architecture

## Overview

DeskSearch is a .NET 8 WPF desktop application that keeps a lightweight search widget visible on Windows and searches files and folders through a background-maintained index. The main window stays out of the taskbar, integrates with the system tray, and coordinates a separate results window.

## High-Level Components

### App bootstrap

- `DeskSearch/App.xaml.cs` creates the application and exposes a shared `SettingsService` instance. When started with `--autostart` it creates the main window only after `StartupService.WaitForInteractiveDesktop` sees the shell (`Shell_TrayWnd`) and the text input service (`ctfmon`) in the session, plus a short grace delay.
- `DeskSearch/Services/StartupService.cs` owns the HKCU `Run` entry (`"<exe>" --autostart`). An entry whose value differs (older versions without the flag, another path) is rewritten on the next launch.
- `DeskSearch/MainWindow.xaml.cs` is the runtime composition root for UI, indexing, watcher startup, tray setup, and search behavior.

### Main search UI

- `DeskSearch/MainWindow.xaml` defines the compact search bar UI.
- Split partials such as `MainWindow.Search.cs`, `MainWindow.Results.cs`, `MainWindow.Settings.cs`, `MainWindow.Localization.cs`, `MainWindow.Resize.cs`, and `MainWindow.Tray.cs` keep concerns separated.
- `DeskSearch/ResultsWindow.xaml` renders the result list and shares visual styling with the main window.

### Settings and dialogs

- `DeskSearch/SettingsWindow.xaml` edits persisted user settings and now supports live preview of appearance-related changes.
- Dialogs like `AboutDialog`, `ErrorDialog`, `MigrationConfirmDialog`, `MigrationProgressDialog`, and `ResetChoiceDialog` isolate focused workflows.

### Models

- `DeskSearch/Models/AppSettings.cs` stores persisted appearance, search, indexing scope, startup, and window layout settings.
- `DeskSearch/Models/FileEntry.cs` is the primary search result model.
- Other models describe progress snapshots, query parsing, search sessions, and reset/indexing state.

### Services

- `DeskSearch/Services/SettingsService.cs` loads, normalizes, migrates, and saves `%AppData%\DeskSearch\settings.json`.
- `DeskSearch/Services/SystemIndexService.cs` controls full indexing, live search availability, migration, and update promotion.
- `DeskSearch/Services/SystemWatcherService.cs` manages `FileSystemWatcher` instances for indexed roots.
- `DeskSearch/Services/IndexStore.cs` and `IndexStore.Search.cs` encapsulate SQLite-backed search storage.
- `DeskSearch/Services/FileSearchService.cs` handles matching logic for file and folder names.
- `DeskSearch/Services/LocalizationService.cs` serves localized strings from resx resources.
- `DeskSearch/Services/TrayIconService.cs` owns the notify icon and tray menu.

## Runtime Flow

1. App startup creates `MainWindow` with the shared `SettingsService`.
2. `MainWindow` loads persisted settings and applies visual state.
3. `SystemIndexService` opens or builds the active search store.
4. `SystemWatcherService` starts watching configured roots for live file changes.
5. Search box input is debounced, then queries the active index. The search box is always enabled and focused on load; until a stable `index.db` exists (`IsSearchEnabled`), a search shows the `Search_IndexBuilding` message, and the `SearchEnabled` event re-runs the pending query.
6. `ResultsWindow` shows matching items and follows the main window position and theme.

## Indexing Design

- Full rebuilds are written to `index.building.db` first.
- After a successful pass, the building database replaces the live `index.db`.
- Search remains available against the stable live store during rebuilds.
- Watcher-driven changes are tracked separately so live updates do not interfere with full rebuild promotion.

## Settings and Live Preview

- `SettingsWindow` works on a clone of `AppSettings` instead of mutating persisted settings directly.
- Appearance-related changes are pushed back to `MainWindow` through a preview callback so background, border, icon, opacity, and topmost changes appear immediately.
- Saving persists the edited settings and triggers saved side effects such as startup registration and index-scope refresh.
- Cancelling or closing without save restores the original settings snapshot so temporary preview changes are reverted.

## Packaging

- `DeskSearch.Installer` contains WiX authoring for culture-specific MSI output (ko-KR, en-US). The shipped root artifact is a single `DeskSearchSetup.msi` with `LanguageDlg` (한국어 / English) that writes `HKCU\Software\DeskSearch\InstallLanguage` for first-run app UI.
- `DeskSearch.Setup` remains an optional WinForms bootstrapper that can launch culture-specific embedded MSIs; it is not copied to the repository root.
- The installer project builds localized MSI packages and can install optional shortcuts while app data remains under the user profile.
- Upgrades are major upgrades scheduled `afterInstallValidate`, so the old product is fully removed before files are installed. Custom actions in `Package.wxs`:
  - `KillDeskSearch` (immediate, before `InstallValidate`) closes a running copy so the old version's files are not in use when it is removed.
  - `PurgeInstallFolder` deletes anything left in the install folder; it is only scheduled when `INSTALLFOLDER` ends with `\DeskSearch\`.
  - `RemoveUserData` deletes `%AppData%\DeskSearch` only when `UserDataDlg` was shown (`USERDATAPROMPTSHOWN=1`) and the user ticked the box (`REMOVEUSERDATA=1`). Nested uninstall during MajorUpgrade (`UPGRADINGPRODUCTCODE`) never deletes profile data.
  - `RemoveAutostartEntry` deletes the HKCU `Run` value on uninstall, or when user data is deleted.
- `UserDataDlg` appears on upgrade, on uninstall, and on a fresh install when AppSearch finds `%AppData%\DeskSearch\settings.json` or `index.db`. Install-path transitions in `WixUI_FeatureTree_Custom.wxs` are guarded with `NOT Installed`, because leftover profile data is usually also present during uninstall.

## Build Scripts

- `build.cmd` / `build.ps1` builds `DeskSearch.csproj` in Release by default; its `BuildInstallerOnRelease` target builds both culture MSIs (and Setup.exe internally), and the script copies only `DeskSearchSetup.msi` to the repository root. Building the `.slnx` in Release is avoided because it builds the WiX project twice in parallel (`#cab1.cab` in use).
- The script restores the solution first (the nested WiX build does not restore) and refuses to build while a DeskSearch built from the repository is running (`-Stop` closes it).
- `clean.cmd` / `clean.ps1` removes `bin/`, `obj/` of both projects and root installer copies, retrying briefly on locked files; user data is never touched.
