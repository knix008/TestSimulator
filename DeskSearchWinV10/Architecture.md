# DeskSearch Architecture

## Overview

DeskSearch is a .NET 8 WPF desktop application that keeps a lightweight search widget visible on Windows and searches files and folders through a background-maintained index. The main window stays out of the taskbar, integrates with the system tray, and coordinates a separate results window.

## High-Level Components

### App bootstrap

- `DeskSearch/App.xaml.cs` creates the application and exposes a shared `SettingsService` instance.
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
5. Search box input is debounced, then queries the active index.
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

- `DeskSearch.Installer` contains WiX authoring for MSI output.
- The installer project builds localized MSI packages and can install optional shortcuts while app data remains under the user profile.
