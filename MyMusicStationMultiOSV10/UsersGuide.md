# Users Guide

## Run the App

Use `npm start` to launch the already-built desktop app. If the executable does not exist yet, run the build command for your OS once.

- Windows: `npm run build:win`
- macOS: `npm run build:mac`
- Linux: `npm run build:linux`
- Web: `npm run build:web`

## Toolbar

The toolbar contains music folder actions, file actions, playlist actions, and window controls. Hover over a toolbar button to see its tooltip.

- Open folder: choose a music folder.
- Reopen: open the last remembered music folder again.
- Add files: add one or more audio files.
- Save: save the current playlist as `.mmspl`.
- Open: load a `.mmspl` playlist.
- Minimize: minimize the window.
- Fixed size: restore the 960x560 fixed window size.
- Close: hide the window. Use the system tray menu to quit the app.

## Music Folder Memory

When you open a music folder, the app remembers that folder locally. The next time you use Reopen, it loads that directory directly.

## Themes

Use the theme dropdown to select Dark, Modern, Classic, Fancy, or a custom theme. Enter a theme name, pick an accent color, and press the add theme button to create a custom theme. Built-in themes cannot be deleted; custom themes can be deleted.

## Languages

Use the language dropdown to switch between Korean and English.

## Playlists

Playlists use the `.mmspl` extension. Remote tracks are saved with their URLs. Local tracks from browser file selection cannot be persisted as direct paths by the web runtime, so use music folders when you want repeatable local-folder loading.
