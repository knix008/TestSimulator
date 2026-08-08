# Architecture

My Music Station is a compact cross-platform music player built with React, Vite, TypeScript, and Tauri.

## Layers

- React UI: compact fixed-size player, custom toolbar, transport controls, spectrum view, playlist controls, language switcher, and theme management.
- Web Audio API: media element playback and frequency spectrum visualization.
- Tauri shell: Windows/macOS/Linux desktop packaging, tray icon, frameless fixed-size window, file associations, and installer generation.
- Tauri plugins: dialog and fs plugins are used to open music folders and remember the last selected folder.

## Runtime Flow

1. The user opens files, a music folder, a playlist, or a remote URL.
2. Tracks are added to the in-memory playlist.
3. Local files selected through the browser file input use object URLs.
4. Music folders selected through Tauri are remembered in localStorage and reopened through the same folder path.
5. Playback runs through an HTML audio element connected to an analyser node for the spectrum.
6. Closing the window hides it; the tray menu is responsible for final application exit.

## Packaging

- `npm run build:web` creates the web bundle in `dist`.
- `npm run build:win` creates Windows NSIS/MSI installers.
- `npm run build:mac` creates macOS bundles on macOS.
- `npm run build:linux` creates Linux bundles on Linux.

The Tauri window is fixed at 960x560, frameless, and non-resizable. The custom toolbar provides minimize, fixed-size restore, and close-to-tray actions.
